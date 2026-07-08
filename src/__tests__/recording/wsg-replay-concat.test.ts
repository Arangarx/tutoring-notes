/**
 * @jest-environment node
 *
 * WS-G — seamless replay concat teeth tests.
 */

import {
  CONCAT_MAX_SEGMENT_COUNT,
  selectMixdownSegmentsForConcat,
  shouldSkipConcat,
} from "@/lib/recording/concat-audio";
import { TUTOR_MIC_STREAM_ID } from "@/lib/recording/lifecycle-machine";
import { resolveEffectiveSegments } from "@/lib/whiteboard/replay-helpers";
import { buildReplayAudioPayload } from "@/lib/whiteboard/replay-audio-payload";

describe("WS-G resolveEffectiveSegments", () => {
  it("when canonicalAudioBlobUrl is set → single effective segment", () => {
    const segments = resolveEffectiveSegments({
      eventsBlobUrl: "/events",
      canonicalAudioBlobUrl: "/api/whiteboard/wbs-1/concat-audio",
      canonicalAudioMimeType: "audio/webm",
      canonicalDurationSeconds: 120,
      audioSegments: [
        { url: "/api/audio/admin/a", mimeType: "audio/webm", durationSeconds: 30 },
        { url: "/api/audio/admin/b", mimeType: "audio/webm", durationSeconds: 30 },
      ],
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]?.url).toBe("/api/whiteboard/wbs-1/concat-audio");
    expect(segments[0]?.durationSeconds).toBe(120);
  });

  it("when canonical absent → falls back to multi-segment assembly", () => {
    const segments = resolveEffectiveSegments({
      eventsBlobUrl: "/events",
      audioSegments: [
        { url: "/api/audio/admin/a", mimeType: "audio/webm", durationSeconds: 10 },
        { url: "/api/audio/admin/b", mimeType: "audio/webm", durationSeconds: 20 },
      ],
    });
    expect(segments).toHaveLength(2);
    expect(segments.map((s) => s.url)).toEqual([
      "/api/audio/admin/a",
      "/api/audio/admin/b",
    ]);
  });

  it("multi-part drift warning input collapses when canonical is set", () => {
    const effective = resolveEffectiveSegments({
      eventsBlobUrl: "/events",
      canonicalAudioBlobUrl: "/api/whiteboard/wbs-1/concat-audio",
      canonicalDurationSeconds: 90,
      audioSegments: [
        { url: "/a", mimeType: "audio/webm" },
        { url: "/b", mimeType: "audio/webm" },
      ],
    });
    expect(effective.length > 1).toBe(false);
  });
});

describe("WS-G mixdown-only concat input", () => {
  it("excludes student:peer-* and transcription-only lanes from concat set", () => {
    const selected = selectMixdownSegmentsForConcat([
      {
        blobUrl: "https://blob.example.com/tutor.webm",
        mimeType: "audio/webm",
        streamId: TUTOR_MIC_STREAM_ID,
        orderIndex: 0,
      },
      {
        blobUrl: "https://blob.example.com/student.webm",
        mimeType: "audio/webm",
        streamId: "student:peer-abc:mic",
        orderIndex: 1,
      },
      {
        blobUrl: "https://blob.example.com/tutor2.webm",
        mimeType: "audio/webm",
        streamId: TUTOR_MIC_STREAM_ID,
        orderIndex: 2,
      },
    ]);
    expect(selected).toHaveLength(2);
    expect(selected.every((s) => s.streamId === TUTOR_MIC_STREAM_ID)).toBe(true);
    expect(selected.map((s) => s.orderIndex)).toEqual([0, 2]);
  });
});

describe("WS-G segment cap", () => {
  it("skips concat when segment count > 400", () => {
    expect(shouldSkipConcat(CONCAT_MAX_SEGMENT_COUNT + 1)).toBe(true);
    expect(shouldSkipConcat(CONCAT_MAX_SEGMENT_COUNT)).toBe(false);
  });

  it("skips concat when fewer than 2 mixdown segments", () => {
    expect(shouldSkipConcat(0)).toBe(true);
    expect(shouldSkipConcat(1)).toBe(true);
    expect(shouldSkipConcat(2)).toBe(false);
  });
});

describe("WS-G buildReplayAudioPayload", () => {
  it("uses concat proxy when concatBlobUrl is present", () => {
    const payload = buildReplayAudioPayload({
      whiteboardSessionId: "wbs-1",
      concatBlobUrl: "https://blob.example.com/concat.webm",
      concatDurationSeconds: 300,
      audioRecordings: [
        { id: "r1", mimeType: "audio/webm", durationSeconds: 100 },
        { id: "r2", mimeType: "audio/webm", durationSeconds: 200 },
      ],
      audience: "admin",
    });
    expect(payload.hasAudio).toBe(true);
    expect(payload.audioSegments).toHaveLength(1);
    expect(payload.audioSegments[0]?.url).toBe("/api/whiteboard/wbs-1/concat-audio");
    expect(payload.canonicalDurationSeconds).toBe(300);
  });

  it("falls back to per-recording proxies when concat absent", () => {
    const payload = buildReplayAudioPayload({
      whiteboardSessionId: "wbs-1",
      concatBlobUrl: null,
      concatDurationSeconds: null,
      audioRecordings: [
        { id: "r1", mimeType: "audio/webm", durationSeconds: 10 },
        { id: "r2", mimeType: "audio/webm", durationSeconds: 20 },
      ],
      audience: "admin",
    });
    expect(payload.audioSegments).toHaveLength(2);
    expect(payload.canonicalAudioBlobUrl).toBeNull();
  });
});
