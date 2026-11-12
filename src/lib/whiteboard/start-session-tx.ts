/**
 * `startSessionTx` — the one transaction body of `startWhiteboardSession`, shared by the plain path
 * (`db.$transaction`) and the org path (`withOrgRowLock`). Consent wave C3a, Start half
 * (docs/handoff/consent-wave-plan.md § 2.6, SF1).
 *
 * Inside one transaction:
 *   1. read the entry inputs through `tx` (effective record, claim state, org admission);
 *   2. decide with `sessionEntryState` (D3): a refusal on a still-PENDING session throws
 *      `StartRefusedSignal`, which the caller turns into returned data (`{ ok: false, reason }`);
 *   2a. hold seam `start:tx:between_consent_read_and_update` (no-op unless armed; sits BEFORE any write,
 *      so no row lock is held while it parks);
 *   3. the conditional PENDING -> ACTIVE `updateMany`;
 *   4. only when it changed a row: `freezeConsentSnapshotTx` (the one writer; this module never defines a
 *      second freeze), then the SAME pure rule over the frozen values. No record, or a mode the frozen values
 *      disallow, throws `StartRefusedSignal`: the whole transaction rolls back (session stays PENDING, no
 *      snapshot written or changed);
 *   5. the capabilities derived from the row as it now stands.
 *
 * Log prefix: `cns` (`refrozen_at_start`, `refreeze_skipped`), `slc` is the caller's.
 */

import type { Prisma } from "@prisma/client";

import {
  changedConsentToggleKeys,
  formatConsentToggles,
  freezeConsentSnapshotTx,
  resolveSessionCapabilities,
} from "@/lib/consent-scope";
import type { SessionCapabilities } from "@/lib/recording/session-capabilities";
import {
  loadSessionEntryInputs,
  type SessionEntrySource,
} from "@/lib/scheduling/session-entry-loader";
import {
  decisionReason,
  sessionEntryState,
  type EntryBlockReason,
} from "@/lib/scheduling/session-entry";
import { holdPoint } from "@/lib/test-seams";

export type StartSessionMode = "LIVE" | "IN_PERSON";

/**
 * Thrown inside the transaction to roll it back, caught by `startWhiteboardSession` after the transaction
 * unwinds and returned as `{ ok: false, reason }`. Never escapes the action: a thrown server-action error is
 * redacted by Next in a production build, so the tutor could not read the reason.
 */
export class StartRefusedSignal extends Error {
  constructor(public readonly reason: EntryBlockReason) {
    super(`start refused: ${reason}`);
    this.name = "StartRefusedSignal";
  }
}

/** Why a Start that changed nothing changed nothing. The org codes are the admission no-op. */
export type StartNoopReason = "not_pending" | "org_inactive" | "instructor_not_admitted";

export type StartTxOutcome = {
  /** Rows the conditional update changed: 1 for the Start that activated the session, else 0. */
  count: number;
  noopReason: StartNoopReason;
  /** The mode stored on the session row after this Start. */
  sessionMode: StartSessionMode;
  /** Derived from the snapshot row as it now stands (refrozen, or the existing frozen row on a no-op). */
  capabilities: SessionCapabilities;
};

export type StartSessionTxInput = {
  whiteboardSessionId: string;
  /** The tutor / instructor starting the session. */
  adminUserId: string;
  source: SessionEntrySource;
  requestedMode: StartSessionMode;
  /** The conditional PENDING -> ACTIVE update (its `where` carries `sessionPhase: "PENDING"` and `endedAt: null`). */
  pendingUpdate: Prisma.WhiteboardSessionUpdateManyArgs;
};

const ADMISSION_NOOPS: readonly EntryBlockReason[] = ["org_inactive", "instructor_not_admitted"];

/** The stored mode and the capabilities derived from the row as it now stands, read through `tx`. */
async function readOutcomeTx(
  tx: Prisma.TransactionClient,
  whiteboardSessionId: string
): Promise<Pick<StartTxOutcome, "sessionMode" | "capabilities">> {
  const row = await tx.whiteboardSession.findUnique({
    where: { id: whiteboardSessionId },
    select: { sessionMode: true },
  });
  return {
    sessionMode: row?.sessionMode === "IN_PERSON" ? "IN_PERSON" : "LIVE",
    capabilities: await resolveSessionCapabilities(whiteboardSessionId, tx),
  };
}

export async function startSessionTx(
  tx: Prisma.TransactionClient,
  input: StartSessionTxInput
): Promise<StartTxOutcome> {
  const { whiteboardSessionId, source, requestedMode } = input;
  const modeKey = requestedMode === "IN_PERSON" ? "inPerson" : "online";

  // Steps 1 and 2: read through tx, then one rule.
  const inputs = await loadSessionEntryInputs(source, tx);
  const decision = sessionEntryState(inputs)[modeKey];
  const refusal = decisionReason(decision);

  if (refusal && ADMISSION_NOOPS.includes(refusal)) {
    // Org inactive / instructor removed: the admission no-op (nothing written, Start still resolves).
    return {
      count: 0,
      noopReason: refusal as StartNoopReason,
      ...(await readOutcomeTx(tx, whiteboardSessionId)),
    };
  }
  if (refusal) {
    // The rule refuses a mode, but only a still-PENDING session is refused. An ACTIVE / ended session keeps
    // today's idempotent no-op (the conditional update below matches nothing).
    const phase = await tx.whiteboardSession.findUnique({
      where: { id: whiteboardSessionId },
      select: { sessionPhase: true },
    });
    if (phase?.sessionPhase === "PENDING") throw new StartRefusedSignal(refusal);
  }

  // Step 2a: after the reads, before any write.
  await holdPoint("start:tx:between_consent_read_and_update", whiteboardSessionId);

  // Step 3.
  const updated = await tx.whiteboardSession.updateMany(input.pendingUpdate);

  // Step 4: only the Start that changed a row freezes. A no-op Start never touches the snapshot.
  if (updated.count > 0) {
    const frozen = await freezeConsentSnapshotTx(tx, whiteboardSessionId, new Date());
    const post = sessionEntryState({
      ...inputs,
      claimed: inputs.claimed && frozen.outcome !== "unclaimed",
      consent:
        frozen.outcome === "frozen"
          ? { allowLiveSession: frozen.after.allowLiveSession }
          : null,
    })[modeKey];
    const postRefusal = decisionReason(post);
    if (postRefusal) {
      console.warn(
        `[cns] wbsid=${whiteboardSessionId} action=start_rolled_back reason=${postRefusal} freeze=${frozen.outcome} mode=${requestedMode}`
      );
      throw new StartRefusedSignal(postRefusal);
    }
    if (frozen.outcome === "frozen") {
      console.info(
        `[cns] wbsid=${whiteboardSessionId} action=refrozen_at_start created=${frozen.created} changed=${changedConsentToggleKeys(frozen.before, frozen.after)} before=${formatConsentToggles(frozen.before)} after=${formatConsentToggles(frozen.after)}`
      );
    }
  } else {
    console.info(
      `[cns] wbsid=${whiteboardSessionId} action=refreeze_skipped reason=already_active`
    );
  }

  // Step 5.
  return { count: updated.count, noopReason: "not_pending", ...(await readOutcomeTx(tx, whiteboardSessionId)) };
}
