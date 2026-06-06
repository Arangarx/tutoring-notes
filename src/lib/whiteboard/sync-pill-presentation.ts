/**
 * Sync-pill visibility + label derivation — Phase 4d polish.
 *
 * Before 4d the tutor workspace toolbar exposed four overlapping
 * "we're waiting for the student" indicators (recording-pill,
 * sync-pill, timer qualifier, presence banner). Real-session smoke
 * with Sarah's wife (2026-05-15) confirmed the redundancy reads
 * as noise — every glance at the toolbar told her the same fact
 * three different ways. 4d collapses to one primary indicator
 * (the banner — most contextual) + one secondary indicator (the
 * recording-pill — the FSM's source of truth).
 *
 * This helper governs the sync-pill specifically. The sync-pill
 * remains useful in two states distinct from "waiting for student":
 *
 *   - `bothPartiesInRoom` → "Student connected" (green). Positive
 *     affirmation; reading it gives the tutor confidence the live
 *     wire is working independent of the recording state.
 *
 *   - `!tutorSyncConnected` → "Sync connecting…" (grey). A genuinely
 *     different signal from "waiting for student" — the sync server
 *     itself is unreachable, which the banner copy does NOT cover.
 *
 * The `awaiting-student` case (`tutorSyncConnected && !bothPartiesInRoom`)
 * is the duplicate that 4d drops. `show=false` tells the workspace
 * to render no sync-pill at all in that state — the banner already
 * says "Waiting for your student to join…" and the recording-pill
 * already says "Waiting for student". A third copy of the same idea
 * just clutters the toolbar.
 *
 * Pure function — no React, no DOM — so the rule lives under a unit
 * test and any future copy tweak runs through one place.
 */

export type SyncPillReason =
  | "student-connected"
  | "student-connected-syncing"
  | "sync-connecting"
  | "awaiting-student";

export type SyncPillState = {
  /**
   * Whether the workspace should render the sync-pill at all. False
   * for the `awaiting-student` case (4d dedupe); true for the other
   * two states.
   */
  show: boolean;
  /** User-facing label. Stable per `reason`. */
  label: string;
  color: "green" | "amber" | "grey";
  reason: SyncPillReason;
};

export type SyncPillInputs = {
  /**
   * Tutor's own sync-client connection state. Independent of whether
   * any student has joined yet. False = the sync server transport is
   * not yet open (initial mount, transient network drop, etc.).
   */
  tutorSyncConnected: boolean;
  /**
   * True iff the tutor is sync-connected AND at least one student
   * peer has joined the room. The workspace already computes this
   * from `peerCount + tutorSyncConnected`; we just receive it as a
   * boolean so the rule stays trivially testable.
   */
  bothPartiesInRoom: boolean;
  /**
   * True for a brief window after `bothPartiesInRoom` first becomes true:
   * the welcome push has been sent but the student may not have applied the
   * tutor's scene yet. During this window we show an honest "syncing board…"
   * label rather than claiming the board is already fully synced.
   *
   * Defaults to false (behaves like the pre-fix "Student connected" pill).
   */
  boardSyncing?: boolean;
};

/**
 * Derive the sync-pill state from sync-connection inputs.
 *
 * Precedence:
 *   1. `bothPartiesInRoom && boardSyncing` → amber "Student connected — syncing board…".
 *      Honest weaker claim: relay socket is up but the welcome push may not have
 *      been applied by the student yet. Clears after the boardSyncing window.
 *   2. `bothPartiesInRoom` → positive green "Student connected".
 *   3. `!tutorSyncConnected` → grey "Sync connecting…" (sync layer
 *      itself isn't up; the banner doesn't cover this).
 *   4. otherwise (awaiting student with the sync layer up) →
 *      `show=false`. Banner + recording-pill already say it.
 */
export function deriveSyncPillState(inputs: SyncPillInputs): SyncPillState {
  if (inputs.bothPartiesInRoom) {
    if (inputs.boardSyncing) {
      return {
        show: true,
        label: "Student connected — syncing board\u2026",
        color: "amber",
        reason: "student-connected-syncing",
      };
    }
    return {
      show: true,
      label: "Student connected",
      color: "green",
      reason: "student-connected",
    };
  }
  if (!inputs.tutorSyncConnected) {
    return {
      show: true,
      label: "Sync connecting…",
      color: "grey",
      reason: "sync-connecting",
    };
  }
  // Dedupe target: the banner (`presence.bannerMessage`) and the
  // recording-pill (`presence.pillLabel`) already say "waiting for
  // student" in two different ways; a third sync-pill clutters the
  // toolbar without adding information.
  return {
    show: false,
    label: "Awaiting student",
    color: "amber",
    reason: "awaiting-student",
  };
}
