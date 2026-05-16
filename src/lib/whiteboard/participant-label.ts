/**
 * Single-student name fallback — Phase 4d Group A polish.
 *
 * Today the live-A/V participant tiles surface a peerId-derived
 * label (e.g. `Student · a3f7d2`) for every remote peer, because
 * the join token doesn't carry per-peer identity. That asymmetry
 * hurts UX in the typical pilot path: Sarah glances at the tile
 * and sees a hash where she expects "Liam".
 *
 * The trivial single-student case is the v1 fix:
 *
 *   - The tutor's workspace already knows `studentId` (URL segment)
 *     and `studentName` (page-level SSR prefetch).
 *   - The join token is scoped to that student.
 *   - If there's exactly ONE remote peer in the room AND that peer's
 *     role is `student`, we can safely label them with the session's
 *     `studentName`.
 *
 * Multi-peer cases keep the peerId-derived label — we don't know
 * which physical peer corresponds to which student until per-peer
 * identity capture lands (see BACKLOG.md "Student naming
 * paradigm").
 *
 * Pure function — no React, no DOM — so the rule lives under a unit
 * test. The host (workspace JSX) passes
 * `resolveLabel={(p) => resolveParticipantLabel(p, { studentName, totalRemotePeers })}`
 * to `AVTilesPanel`, which uses it to override `participant.label`
 * on a per-tile basis. Returning `undefined` falls through to the
 * peer's existing label / role-derived default.
 */

import type { AvParticipant } from "@/hooks/useLiveAV";

export type ResolveLabelContext = {
  /**
   * The session's student name (from `Student.name`, fetched at the
   * page-level SSR). When undefined / empty, the helper returns
   * undefined and the panel falls through to its default label
   * derivation — defensive default for non-tutor contexts that
   * don't have a single canonical student.
   */
  studentName: string | undefined;
  /**
   * Number of remote peers currently in the room. The fallback ONLY
   * applies when this is exactly 1 — multi-peer rooms keep the
   * peerId-derived labels for safety (we don't know which peer is
   * "the" student).
   */
  totalRemotePeers: number;
  /**
   * When true, also apply the fallback for tutor-role peers. False
   * today; left as a feature flag for the rare "two-device tutor"
   * case where one of the peers is the tutor's own second tab. We
   * never use this in production but exposing the seam keeps the
   * helper future-proof.
   */
  applyToTutors?: boolean;
};

/**
 * Resolve the user-facing label for one participant in the context
 * of the calling page (tutor workspace today; student page may
 * adopt later).
 *
 * Returns the resolved label (a non-empty string) OR undefined when
 * the helper has nothing to add — the caller then falls back to the
 * panel's default (`participant.label` or role-derived).
 */
export function resolveParticipantLabel(
  participant: Pick<AvParticipant, "role">,
  ctx: ResolveLabelContext
): string | undefined {
  if (!ctx.studentName || ctx.studentName.trim().length === 0) {
    return undefined;
  }
  if (ctx.totalRemotePeers !== 1) {
    return undefined;
  }
  if (participant.role === "tutor" && !ctx.applyToTutors) {
    return undefined;
  }
  return ctx.studentName.trim();
}
