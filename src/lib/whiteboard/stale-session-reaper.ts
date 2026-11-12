import type { Prisma } from "@prisma/client";
import { db, withDbRetry } from "@/lib/db";
import { env } from "@/lib/env";
import {
  SESSION_REAPER_BATCH_LIMIT,
  SESSION_REAPER_IDLE_AFTER_MS,
} from "@/lib/session-cleanup-config";
import {
  faultPoint,
  holdPoint,
  readReaperModeOverride,
  SEAM_BEARING_TX_TIMEOUT_MS,
} from "@/lib/test-seams";
import { lockWhiteboardSessionRowTx } from "@/lib/whiteboard/session-row-lock";
import { stampStaleWhiteboardSessionEnd } from "@/lib/whiteboard/stale-session-stamp";

/**
 * The stale-session reaper (consent wave C4c, plan § 3.9, approved by Andrew 2026-10-29).
 *
 * A background job on `/api/cron/session-cleanup` that ends any open session with no activity for
 * `SESSION_REAPER_IDLE_AFTER_MS`. It is the FIFTH caller of `stampStaleWhiteboardSessionEnd`, not a second
 * implementation of End: the helper writes endedAt, the PENDING snapshot freeze, the board purge intent,
 * participant leftAt and the token revocation.
 *
 * Clock (SF-F): the reaper passes the LAST-ACTIVITY instant to the helper as `endedAt` and nothing else, so
 * `endedAt`, `durationSeconds` and participant `leftAt` are the active span. The helper keeps the snapshot
 * `frozenAt`, the intent and token `revokedAt` on real server time. Never pass those back-dated.
 *
 * Kill switch: `CONSENT_REAPER_MODE = off | dry_run | enforce`. Unset, empty or unrecognized is `dry_run`.
 * Only `enforce` writes anything.
 */

export type ReaperMode = "off" | "dry_run" | "enforce";

/**
 * Parses the raw env value. Pure. Unset, empty and anything unrecognized resolve to `dry_run`, never `enforce`,
 * so the safe state is also the default and the typo state. `invalidRaw` is the offending value when it was
 * non-empty and unrecognized (the caller logs it once per run).
 */
export function resolveReaperMode(raw: string | null | undefined): {
  mode: ReaperMode;
  invalidRaw: string | null;
} {
  const value = (raw ?? "").trim();
  if (value === "") return { mode: "dry_run", invalidRaw: null };
  if (value === "off" || value === "dry_run" || value === "enforce") {
    return { mode: value, invalidRaw: null };
  }
  return { mode: "dry_run", invalidRaw: value };
}

/**
 * The mode for this run: the test override (one-shot, gated to the Playwright harness) or `CONSENT_REAPER_MODE`.
 * A non-empty unrecognized value logs `reaper_mode_invalid` once, here.
 */
export function resolveReaperModeForRun(): ReaperMode {
  const override = readReaperModeOverride();
  const raw = override.armed ? override.raw : (env.CONSENT_REAPER_MODE ?? null);
  const { mode, invalidRaw } = resolveReaperMode(raw);
  if (invalidRaw !== null) {
    console.warn(`[slc] action=reaper_mode_invalid raw=${JSON.stringify(invalidRaw.slice(0, 64))}`);
  }
  return mode;
}

/** The client `evaluateSessionIdle` reads through: the pool at scan time, the transaction under the row lock. */
export type IdleReadClient = Prisma.TransactionClient;

export type SessionIdleVerdict =
  | { kind: "gone" }
  | { kind: "ended" }
  | { kind: "not_idle"; lastActivityAt: Date }
  | { kind: "appointment_delay"; lastActivityAt: Date; delayUntil: Date }
  | {
      kind: "idle";
      lastActivityAt: Date;
      phase: "PENDING" | "ACTIVE";
      appointment: "none" | "clear";
    };

/**
 * THE idle predicate (B2): one function, called at scan time and again under the row lock. Fresh reads on
 * whichever client it is handed.
 *
 * Last activity is the greatest of the columns that already record it (no new column, no hot-path write):
 * `createdAt`, `activatedAt`, `lastActiveAt`, the newest event batch, the newest recording and the newest
 * participant join. Idle means that instant is older than `SESSION_REAPER_IDLE_AFTER_MS` before `now`.
 *
 * Appointment rule: the appointment only ever DELAYS, never accelerates. For a session linked to one,
 * `delayUntil = endAt ?? startAt` (both are nullable columns); the session is not a candidate while
 * `now < delayUntil`. A link whose times are both null imposes no delay.
 */
export async function evaluateSessionIdle(
  client: IdleReadClient,
  whiteboardSessionId: string,
  now: Date
): Promise<SessionIdleVerdict> {
  const row = await client.whiteboardSession.findUnique({
    where: { id: whiteboardSessionId },
    select: {
      endedAt: true,
      createdAt: true,
      activatedAt: true,
      lastActiveAt: true,
      sessionPhase: true,
      scheduledSession: { select: { startAt: true, endAt: true } },
    },
  });
  if (!row) return { kind: "gone" };
  if (row.endedAt) return { kind: "ended" };

  const [batch, recording, participant] = await Promise.all([
    client.whiteboardEventBatch.aggregate({
      where: { whiteboardSessionId },
      _max: { createdAt: true },
    }),
    client.sessionRecording.aggregate({
      where: { whiteboardSessionId },
      _max: { createdAt: true },
    }),
    client.sessionParticipant.aggregate({
      where: { whiteboardSessionId },
      _max: { joinedAt: true },
    }),
  ]);

  const instants = [
    row.createdAt,
    row.activatedAt,
    row.lastActiveAt,
    batch._max.createdAt,
    recording._max.createdAt,
    participant._max.joinedAt,
  ].filter((d): d is Date => d instanceof Date);
  const lastActivityAt = new Date(Math.max(...instants.map((d) => d.getTime())));

  const idleBefore = now.getTime() - SESSION_REAPER_IDLE_AFTER_MS;
  if (lastActivityAt.getTime() >= idleBefore) return { kind: "not_idle", lastActivityAt };

  const appointment = row.scheduledSession;
  const delayUntil = appointment ? (appointment.endAt ?? appointment.startAt) : null;
  if (delayUntil && now.getTime() < delayUntil.getTime()) {
    return { kind: "appointment_delay", lastActivityAt, delayUntil };
  }
  return {
    kind: "idle",
    lastActivityAt,
    phase: row.sessionPhase === "PENDING" ? "PENDING" : "ACTIVE",
    appointment: delayUntil ? "clear" : "none",
  };
}

/** The `reason=` of a `reaper_skip` line for a verdict that is not "idle". */
function skipReason(verdict: Exclude<SessionIdleVerdict, { kind: "idle" }>): string {
  return verdict.kind === "gone" || verdict.kind === "ended" ? "already_ended" : verdict.kind;
}

export type ReaperSessionOutcome = {
  id: string;
  action: "reaped" | "would_reap" | "skip" | "error";
  reason?: string;
};

export type StaleSessionReaperResult = {
  mode: ReaperMode;
  candidates: number;
  reaped: number;
  wouldReap: number;
  skipped: number;
  errors: number;
  stoppedAtDeadline: boolean;
  outcomes: ReaperSessionOutcome[];
};

/**
 * One reaper run. `deadline` is an absolute time derived from the route's start (SF-G); the reaper starts no
 * clock of its own and checks it between candidates.
 */
export async function runStaleSessionReaper(opts: {
  now?: Date;
  mode: ReaperMode;
  deadline: number;
}): Promise<StaleSessionReaperResult> {
  faultPoint("cleanup:reaper");
  const now = opts.now ?? new Date();
  const result: StaleSessionReaperResult = {
    mode: opts.mode,
    candidates: 0,
    reaped: 0,
    wouldReap: 0,
    skipped: 0,
    errors: 0,
    stoppedAtDeadline: false,
    outcomes: [],
  };
  if (opts.mode === "off") return result;

  // Cheap NECESSARY pre-filter only (each column is one the idle predicate also reads); the decision is
  // `evaluateSessionIdle`. Oldest first, bounded.
  const idleBefore = new Date(now.getTime() - SESSION_REAPER_IDLE_AFTER_MS);
  const candidates = await withDbRetry(
    () =>
      db.whiteboardSession.findMany({
        where: {
          endedAt: null,
          createdAt: { lt: idleBefore },
          OR: [{ activatedAt: null }, { activatedAt: { lt: idleBefore } }],
          AND: [{ OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: idleBefore } }] }],
        },
        orderBy: { createdAt: "asc" },
        take: SESSION_REAPER_BATCH_LIMIT,
        select: { id: true },
      }),
    { label: "reaper.scan" }
  );
  result.candidates = candidates.length;

  for (const { id } of candidates) {
    if (Date.now() >= opts.deadline) {
      result.stoppedAtDeadline = true;
      break;
    }
    try {
      faultPoint("reaper:session", id);
      const verdict = await withDbRetry(() => evaluateSessionIdle(db, id, now), { label: "reaper.scan.idle" });
      if (verdict.kind !== "idle") {
        result.skipped += 1;
        result.outcomes.push({ id, action: "skip", reason: skipReason(verdict) });
        continue;
      }
      if (opts.mode === "dry_run") continue;

      await holdPoint("reaper:between_scan_and_stamp", id);
      // The scan-time verdict is a hint, not the decision. Under the row lock (first statement, the same lock
      // End and the checkpoint route order against) the row may be gone or already ended, and the predicate is
      // evaluated AGAIN on fresh reads (READ COMMITTED), so activity or a tutor End that landed between the scan
      // and here wins. The existing helper is then called unchanged with the re-read last-activity instant.
      const decision = await db.$transaction(
        async (tx): Promise<SessionIdleVerdict> => {
          const exists = await lockWhiteboardSessionRowTx(tx, id);
          if (!exists) return { kind: "gone" };
          const locked = await evaluateSessionIdle(tx, id, now);
          if (locked.kind !== "idle") return locked;
          await stampStaleWhiteboardSessionEnd(tx, id, locked.lastActivityAt, false, "reaper");
          return locked;
        },
        { timeout: SEAM_BEARING_TX_TIMEOUT_MS }
      );
      if (decision.kind !== "idle") {
        result.skipped += 1;
        result.outcomes.push({ id, action: "skip", reason: skipReason(decision) });
        continue;
      }
      result.reaped += 1;
      result.outcomes.push({ id, action: "reaped" });
    } catch (err) {
      result.errors += 1;
      result.outcomes.push({ id, action: "error" });
      console.error(
        `[slc] wbsid=${id} action=reaper_error err=${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return result;
}
