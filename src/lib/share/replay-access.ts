/**
 * Replay access: the ONE function that decides what of a session may be replayed (consent wave plan § 2.9, D4).
 *
 * Replay shows WHAT WAS RECORDED. After End, the frozen snapshot decides; the live ConsentRecord and
 * ConsentRestriction are never read for a session that has one, so a family's later change (a restriction, a
 * revoke, a grant) never hides a board or audio that was recorded and never reveals one that was not (Q8).
 *
 * Every replay decision site calls this and nothing else decides `audio` / `board`: the share and learner pages,
 * the public events / snapshot / concat-audio routes, the audio proxy, the replay-id loaders and `tutor-asset`.
 * Principal and note-visibility rules (ownership, non-DRAFT note, erasure) stay at their own sites.
 *
 * Rules, per session:
 *   - missing                      → `{ audio: false, board: false, reason: "missing" }`
 *   - not ended                    → `{ audio: false, board: false, reason: "not_ended" }`
 *   - ended, with a snapshot       → `replay.audio` / `replay.board` of the FROZEN capabilities, using the
 *                                    session's stored `sessionMode` (in person: no replay audio). `"snapshot"`.
 *   - ended, NO snapshot (LEGACY)  → audio true; board from the live record plus the child restriction, read
 *                                    through consent-scope. A missing record stays open. `"legacy"`. This is
 *                                    today's pre-wave behavior for sessions that predate snapshots; going forward
 *                                    every session has one.
 *
 * This file names no consent switch column and never calls the live resolver for a session with a snapshot
 * (guarded in `src/__tests__/consent-guards.test.ts`).
 *
 * Log prefix: `[cns]` (`action=replay_access`, written only when the caller names a `principal`).
 */

import { db, withDbRetry } from "@/lib/db";
import {
  capabilitiesFromConsentToggles,
  resolveEffectiveConsentForStudent,
  resolveFrozenSessionCapabilitiesBatch,
} from "@/lib/consent-scope";

/** Why a session got the answer it got. `not_ended` and `missing` always deny both. */
export type ReplayAccessReason = "not_ended" | "snapshot" | "legacy" | "missing";

export type ReplayAccess = { audio: boolean; board: boolean; reason: ReplayAccessReason };

/** Either half of a replay may be opened. The replay link and page need only one of them. */
export function replayAccessAny(access: ReplayAccess | undefined): boolean {
  return access != null && (access.audio || access.board);
}

/** The half of a replay a request reads: the event log, snapshot and assets are the board; concat audio is the audio. */
export type ReplayResource = "board" | "audio";

/**
 * True when an ended session's replay decision denies this resource. A missing or still-live session is not "denied"
 * here: the caller's own ownership / not-ended response already answers those, and its status code stays unchanged.
 */
export function replayResourceIsDenied(access: ReplayAccess | undefined, resource: ReplayResource): boolean {
  if (!access || access.reason === "missing" || access.reason === "not_ended") return false;
  return !access[resource];
}

const DENIED = (reason: "not_ended" | "missing"): ReplayAccess => ({ audio: false, board: false, reason });

type LegacyStudent = {
  adminUserId: string | null;
  organizationId: string | null;
  learnerProfileId: string | null;
};

/** Legacy board decision: the live record (and child restriction) for this learner and owner. No record = open. */
async function legacyBoardAllowed(student: LegacyStudent): Promise<boolean> {
  if (!student.learnerProfileId) return true;
  const live = await resolveEffectiveConsentForStudent(
    student.learnerProfileId,
    student,
    null,
    undefined,
    "resolveReplayAccess.legacy"
  );
  if (!live) return true;
  return capabilitiesFromConsentToggles(live, "LIVE", false).replay.board;
}

export async function resolveReplayAccess(
  sessionIds: readonly string[],
  opts?: { principal?: string }
): Promise<Map<string, ReplayAccess>> {
  const result = new Map<string, ReplayAccess>();
  const ids = [...new Set(sessionIds)];
  if (ids.length === 0) return result;

  const [rows, frozen] = await Promise.all([
    withDbRetry(
      () =>
        db.whiteboardSession.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            endedAt: true,
            student: { select: { adminUserId: true, organizationId: true, learnerProfileId: true } },
          },
        }),
      { label: "resolveReplayAccess.sessions" }
    ),
    resolveFrozenSessionCapabilitiesBatch(ids),
  ]);
  const byId = new Map(rows.map((row) => [row.id, row]));

  // Legacy sessions share one live read per learner and owner.
  const legacyByOwner = new Map<string, Promise<boolean>>();
  const legacyBoard = (student: LegacyStudent) => {
    const key = `${student.learnerProfileId}|${student.organizationId ?? ""}|${student.adminUserId ?? ""}`;
    let pending = legacyByOwner.get(key);
    if (!pending) {
      pending = legacyBoardAllowed(student);
      legacyByOwner.set(key, pending);
    }
    return pending;
  };

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      result.set(id, DENIED("missing"));
      continue;
    }
    if (!row.endedAt) {
      result.set(id, DENIED("not_ended"));
      continue;
    }
    const capabilities = frozen.get(id) ?? null;
    if (capabilities) {
      result.set(id, {
        audio: capabilities.replay.audio,
        board: capabilities.replay.board,
        reason: "snapshot",
      });
      continue;
    }
    result.set(id, { audio: true, board: await legacyBoard(row.student), reason: "legacy" });
  }

  if (opts?.principal) {
    for (const [id, access] of result) {
      if (access.reason === "missing") continue;
      console.log(
        `[cns] wbsid=${id} action=replay_access audio=${access.audio} board=${access.board} source=${access.reason} principal=${opts.principal}`
      );
    }
  }
  return result;
}
