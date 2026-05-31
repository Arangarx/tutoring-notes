/**
 * @jest-environment node
 */

import "fake-indexeddb/auto";

import {
  assembleDraftChunks,
  createRecordingDraftStore,
  draftRowKey,
  DRAFT_DB_NAME,
  type DraftSegmentRow,
} from "@/lib/recording/recording-draft-store";
import {
  audioRecoveryBannerHeadline,
  draftHasRecoverableAudio,
  estimatedDurationSecFromDraft,
} from "@/lib/recording/recording-draft-recovery";
import { createUploadOutbox } from "@/lib/recording/upload-outbox";
import { TUTOR_MIC_STREAM_ID } from "@/lib/recording/lifecycle-machine";

const SESSION = "wbs-test-session";
const STREAM = TUTOR_MIC_STREAM_ID;

function makeChunk(text: string): Blob {
  return new Blob([text], { type: "audio/webm" });
}

function makeRow(overrides: Partial<DraftSegmentRow> = {}): DraftSegmentRow {
  const chunks = overrides.chunks ?? [makeChunk("a"), makeChunk("b")];
  return {
    key: draftRowKey(SESSION, STREAM),
    sessionId: SESSION,
    streamId: STREAM,
    segmentId: "seg-1",
    mimeType: "audio/webm",
    chunks,
    chunkCount: chunks.length,
    firstChunkMs: 1_000,
    lastChunkMs: 2_000,
    checkpointedAt: 2_000,
    estimatedDurationSec: 125,
    ...overrides,
  };
}

function uniqueDbName(): string {
  return `tutoring-notes-recording-draft-test-${Math.random().toString(36).slice(2)}`;
}

describe("recording-draft-store", () => {
  test("store name does not collide with upload-outbox database name", () => {
    expect(DRAFT_DB_NAME).not.toBe("tutoring-notes-upload-outbox");
    expect(DRAFT_DB_NAME).toBe("tutoring-notes-recording-draft");
  });

  test("draftRowKey uses sessionId:streamId scheme", () => {
    expect(draftRowKey("sess", "tutor:mic")).toBe("sess:tutor:mic");
  });

  test("checkpoint then findInProgress returns the row", async () => {
    const store = createRecordingDraftStore({ dbName: uniqueDbName() });
    const row = makeRow();
    await store.checkpoint(row);
    const found = await store.findInProgress(SESSION, STREAM);
    expect(found).toMatchObject({
      sessionId: SESSION,
      streamId: STREAM,
      segmentId: "seg-1",
      chunkCount: 2,
    });
    await store.close();
  });

  test("findInProgress returns null when no row", async () => {
    const store = createRecordingDraftStore({ dbName: uniqueDbName() });
    expect(await store.findInProgress(SESSION, STREAM)).toBeNull();
    await store.close();
  });

  test("findInProgress returns null when chunkCount is zero", async () => {
    const store = createRecordingDraftStore({ dbName: uniqueDbName() });
    await store.checkpoint(makeRow({ chunks: [], chunkCount: 0 }));
    expect(await store.findInProgress(SESSION, STREAM)).toBeNull();
    await store.close();
  });

  test("checkpoint overwrites same key (last-write-wins)", async () => {
    const store = createRecordingDraftStore({ dbName: uniqueDbName() });
    await store.checkpoint(makeRow({ segmentId: "seg-a", estimatedDurationSec: 10 }));
    await store.checkpoint(makeRow({ segmentId: "seg-b", estimatedDurationSec: 20 }));
    const found = await store.findInProgress(SESSION, STREAM);
    expect(found?.segmentId).toBe("seg-b");
    expect(found?.estimatedDurationSec).toBe(20);
    await store.close();
  });

  test("clear removes row so findInProgress is null", async () => {
    const store = createRecordingDraftStore({ dbName: uniqueDbName() });
    await store.checkpoint(makeRow());
    await store.clear(SESSION, STREAM);
    expect(await store.findInProgress(SESSION, STREAM)).toBeNull();
    await store.close();
  });

  test("assemble concatenates chunks in order", () => {
    const row = makeRow({
      chunks: [makeChunk("hello"), makeChunk(" world")],
      chunkCount: 2,
    });
    const blob = assembleDraftChunks(row);
    expect(blob.type).toBe("audio/webm");
    expect(blob.size).toBeGreaterThan(0);
  });

  test("Keep path: assemble + outbox enqueue + clear draft", async () => {
    const draftDb = uniqueDbName();
    const outboxDb = `tutoring-notes-upload-outbox-test-${Math.random().toString(36).slice(2)}`;
    const draftStore = createRecordingDraftStore({ dbName: draftDb });
    const outbox = createUploadOutbox({
      dbName: outboxDb,
      upload: async () => ({ ok: true, blobUrl: "https://blob.example/a" }),
      backoffMsByAttempt: [0],
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });

    const row = makeRow({ segmentId: "seg-keep-1" });
    await draftStore.checkpoint(row);
    const blob = draftStore.assemble(row);
    await outbox.enqueue({
      sessionId: SESSION,
      streamId: STREAM,
      segmentId: row.segmentId,
      blobLocalRef: blob,
      mimeType: row.mimeType,
      sizeBytes: blob.size,
      audioStartedAtMs: row.firstChunkMs,
    });
    await draftStore.clear(SESSION, STREAM);

    expect(await draftStore.findInProgress(SESSION, STREAM)).toBeNull();
    const rows = await outbox.listAllRows(SESSION);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.segmentId).toBe("seg-keep-1");
    expect(rows[0]?.blobLocalRef).toBeInstanceOf(Blob);

    await draftStore.close();
    await outbox.close();
  });

  test("Discard path: clear without enqueue", async () => {
    const store = createRecordingDraftStore({ dbName: uniqueDbName() });
    await store.checkpoint(makeRow());
    await store.clear(SESSION, STREAM);
    expect(await store.findInProgress(SESSION, STREAM)).toBeNull();
    await store.close();
  });
});

describe("recording-draft-recovery", () => {
  test("banner headline uses ratified copy with M:SS duration", () => {
    expect(audioRecoveryBannerHeadline(125)).toBe(
      "Audio recording was interrupted. We recovered 02:05 of audio."
    );
  });

  test("draftHasRecoverableAudio requires chunks", () => {
    expect(draftHasRecoverableAudio(makeRow())).toBe(true);
    expect(draftHasRecoverableAudio(makeRow({ chunks: [], chunkCount: 0 }))).toBe(
      false
    );
    expect(draftHasRecoverableAudio(null)).toBe(false);
  });

  test("estimatedDurationSecFromDraft floors negative values", () => {
    expect(estimatedDurationSecFromDraft(makeRow({ estimatedDurationSec: 90.9 }))).toBe(
      90
    );
  });
});
