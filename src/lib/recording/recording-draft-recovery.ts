/**
 * Pure helpers for W1 audio draft recovery UX (banner copy + duration).
 */

import { formatDuration } from "@/components/recording/format-duration";
import type { DraftSegmentRow } from "@/lib/recording/recording-draft-store";

/** Ratified 2026-05-30 — single headline everywhere (design doc variants reconciled). */
export function audioRecoveryBannerHeadline(durationSec: number): string {
  return `Audio recording was interrupted. We recovered ${formatDuration(
    Math.max(0, Math.floor(durationSec))
  )} of audio.`;
}

/** Shown once the recovered audio is in the upload queue (not yet necessarily uploaded). */
export const AUDIO_RECOVERY_QUEUED_COPY = "It is uploading to this session.";

/**
 * Shown when the recovered audio could NOT be handed to the upload queue. Honest about where the
 * audio is (still on this device) and what happens next (retry on reopen) — nothing more.
 */
export function audioRecoveryFailedMessage(durationSec: number): string {
  return `Audio recording was interrupted. We found ${formatDuration(
    Math.max(0, Math.floor(durationSec))
  )} of audio but could not start uploading it. It is still saved on this device, and we will try again the next time you open this session.`;
}

export function estimatedDurationSecFromDraft(row: DraftSegmentRow): number {
  return Math.max(0, Math.floor(row.estimatedDurationSec));
}

export function draftHasRecoverableAudio(row: DraftSegmentRow | null): boolean {
  return row !== null && row.chunkCount > 0 && row.chunks.length > 0;
}
