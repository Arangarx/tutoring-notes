/**
 * Mirrors segment-count logic in `src/lib/transcribe-ffmpeg.ts` — keep formulas in sync.
 */
import { WHISPER_TARGET_CHUNK_SECONDS } from "@/lib/transcribe-constants";

const CHUNK_TARGET_BYTES = 22 * 1024 * 1024;

function planWhisperInitialSegmentCount(bufferByteLength: number, durationSeconds: number): number {
  const byteBasedCount = Math.ceil(bufferByteLength / CHUNK_TARGET_BYTES);
  const durationBasedCount = Math.ceil(durationSeconds / WHISPER_TARGET_CHUNK_SECONDS);
  return Math.max(1, Math.max(byteBasedCount, durationBasedCount));
}

describe("planWhisperInitialSegmentCount", () => {
  test("long-but-small byte size splits by duration (30 min @ ~14 MiB)", () => {
    const thirtyMinSec = 30 * 60;
    const fourteenMb = 14 * 1024 * 1024;
    expect(planWhisperInitialSegmentCount(fourteenMb, thirtyMinSec)).toBeGreaterThanOrEqual(6);
  });

  test("short recording stays single segment when under duration target", () => {
    const twoMinSec = 2 * 60;
    const tenMb = 10 * 1024 * 1024;
    expect(planWhisperInitialSegmentCount(tenMb, twoMinSec)).toBe(1);
  });
});
