/**
 * @jest-environment node
 *
 * P1-J5 — REPLAY-MIX safety invariant (smokebook item 9).
 *
 * Oracle: `assembleEndSessionSegments` end-session payload contains ONLY
 * `tutor:mic` mixdown rows — no `student:peer-*`, no `transcriptionOnly` lanes.
 * Chains through `selectMixdownSegmentsForConcat` for WS-G concat input contract.
 *
 * Red-before (2026-07-05): temporarily expecting peer rows in the assembly
 * output and omitting the transcriptionOnly exclusion both failed before
 * correcting oracles.
 */

import "fake-indexeddb/auto";

// assembleEndSessionSegments guards on `window` + indexedDB — mirror jsdom in node.
Object.defineProperty(globalThis, "window", {
  value: globalThis,
  writable: true,
  configurable: true,
});

import {
  selectMixdownSegmentsForConcat,
} from "@/lib/recording/concat-audio";
import { TUTOR_MIC_STREAM_ID } from "@/lib/recording/lifecycle-machine";
import {
  assembleEndSessionSegments,
  resetUploadOutboxForTests,
  setUploadOutboxForTests,
} from "@/lib/recording/upload-outbox-instance";
import { createUploadOutbox } from "@/lib/recording/upload-outbox";

const NEVER_CALLED_UPLOADER = async () => {
  throw new Error("uploader should not be invoked in these tests");
};

afterEach(() => {
  resetUploadOutboxForTests();
});

/** Behavior oracle — replay/end-session segment set is mixdown-only. */
function assertReplayMixdownOnly(
  segs: Awaited<ReturnType<typeof assembleEndSessionSegments>>
) {
  expect(segs.length).toBeGreaterThan(0);
  expect(segs.every((s) => s.streamId === TUTOR_MIC_STREAM_ID)).toBe(true);
  expect(segs.some((s) => s.streamId.startsWith("student:peer-"))).toBe(false);
}

describe("P1-J5 REPLAY-MIX — assembleEndSessionSegments mixdown-only invariant", () => {
  it("mixed outbox (tutor:mic + student:peer transcriptionOnly) → ONLY tutor:mic rows", async () => {
    const outbox = createUploadOutbox({
      upload: NEVER_CALLED_UPLOADER,
      dbName: `wsg-replay-mix-${Math.random().toString(36).slice(2)}`,
    });
    setUploadOutboxForTests(outbox);

    await outbox.enqueue({
      sessionId: "wbs-replay-mix-p1j5",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "tutor-a",
      blobLocalRef: null,
      blobRemoteUrl: "https://abc.blob.vercel-storage.com/tutor-a.webm",
      mimeType: "audio/webm",
      sizeBytes: 100,
      audioStartedAtMs: 1_000,
    });
    await outbox.enqueue({
      sessionId: "wbs-replay-mix-p1j5",
      streamId: "student:peer-abc:mic",
      segmentId: "student-tx",
      blobLocalRef: null,
      blobRemoteUrl: "https://abc.blob.vercel-storage.com/student-tx.webm",
      mimeType: "audio/webm",
      sizeBytes: 200,
      audioStartedAtMs: 1_100,
      transcriptionOnly: true,
    });
    await outbox.enqueue({
      sessionId: "wbs-replay-mix-p1j5",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "tutor-b",
      blobLocalRef: null,
      blobRemoteUrl: "https://abc.blob.vercel-storage.com/tutor-b.webm",
      mimeType: "audio/webm",
      sizeBytes: 150,
      audioStartedAtMs: 1_200,
    });

    const segs = await assembleEndSessionSegments("wbs-replay-mix-p1j5");
    assertReplayMixdownOnly(segs);
    expect(segs).toHaveLength(2);
    expect(segs.map((s) => s.segmentId)).toEqual(["tutor-a", "tutor-b"]);
  });

  it("red-before guard: transcriptionOnly peer row is excluded from replay set", async () => {
    const outbox = createUploadOutbox({
      upload: NEVER_CALLED_UPLOADER,
      dbName: `wsg-replay-tx-${Math.random().toString(36).slice(2)}`,
    });
    setUploadOutboxForTests(outbox);

    await outbox.enqueue({
      sessionId: "wbs-tx-exclude",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "tutor-only",
      blobLocalRef: null,
      blobRemoteUrl: "https://abc.blob.vercel-storage.com/tutor-only.webm",
      mimeType: "audio/webm",
      sizeBytes: 100,
      audioStartedAtMs: 1_000,
    });
    await outbox.enqueue({
      sessionId: "wbs-tx-exclude",
      streamId: "student:peer-red:mic",
      segmentId: "peer-tx-only",
      blobLocalRef: null,
      blobRemoteUrl: "https://abc.blob.vercel-storage.com/peer-tx.webm",
      mimeType: "audio/webm",
      sizeBytes: 200,
      audioStartedAtMs: 1_100,
      transcriptionOnly: true,
    });

    const segs = await assembleEndSessionSegments("wbs-tx-exclude");
    expect(segs).toHaveLength(1);
    expect(segs[0]?.streamId).toBe(TUTOR_MIC_STREAM_ID);
    expect(segs.some((s) => s.segmentId === "peer-tx-only")).toBe(false);
  });

  it("assembly output → selectMixdownSegmentsForConcat stays mixdown-only (end-to-end contract)", async () => {
    const outbox = createUploadOutbox({
      upload: NEVER_CALLED_UPLOADER,
      dbName: `wsg-replay-chain-${Math.random().toString(36).slice(2)}`,
    });
    setUploadOutboxForTests(outbox);

    await outbox.enqueue({
      sessionId: "wbs-chain",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "mix-0",
      blobLocalRef: null,
      blobRemoteUrl: "https://abc.blob.vercel-storage.com/mix-0.webm",
      mimeType: "audio/webm",
      sizeBytes: 100,
      audioStartedAtMs: 1_000,
    });
    await outbox.enqueue({
      sessionId: "wbs-chain",
      streamId: "student:peer-chain:mic",
      segmentId: "peer-tx",
      blobLocalRef: null,
      blobRemoteUrl: "https://abc.blob.vercel-storage.com/peer-tx.webm",
      mimeType: "audio/webm",
      sizeBytes: 200,
      audioStartedAtMs: 1_100,
      transcriptionOnly: true,
    });

    const assembled = await assembleEndSessionSegments("wbs-chain");
    const concatInput = selectMixdownSegmentsForConcat(
      assembled.map((s, orderIndex) => ({
        blobUrl: s.blobUrl,
        mimeType: s.mimeType,
        streamId: s.streamId,
        orderIndex,
      }))
    );
    expect(concatInput).toHaveLength(1);
    expect(concatInput[0]?.streamId).toBe(TUTOR_MIC_STREAM_ID);
    expect(concatInput[0]?.blobUrl).toBe(
      "https://abc.blob.vercel-storage.com/mix-0.webm"
    );
  });
});
