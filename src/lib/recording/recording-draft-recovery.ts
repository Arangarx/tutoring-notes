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

export function estimatedDurationSecFromDraft(row: DraftSegmentRow): number {
  return Math.max(0, Math.floor(row.estimatedDurationSec));
}

export function draftHasRecoverableAudio(row: DraftSegmentRow | null): boolean {
  return row !== null && row.chunkCount > 0 && row.chunks.length > 0;
}
