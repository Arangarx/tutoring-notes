/**
 * WS-G — concat-audio-enqueue tests.
 */

const mockFindUnique = jest.fn();
const mockUpdateMany = jest.fn();
const mockFindMany = jest.fn();
const mockConcatMixdown = jest.fn();
const mockDeleteBlob = jest.fn();

jest.mock("@/lib/db", () => ({
  db: {
    whiteboardSession: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
    sessionRecording: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
  withDbRetry: (fn: () => unknown) => Promise.resolve(fn()),
}));

jest.mock("@/lib/recording/concat-audio", () => ({
  concatMixdownSegmentsToBlob: (...args: unknown[]) => mockConcatMixdown(...args),
}));

jest.mock("@/lib/blob", () => ({
  deleteBlob: (...args: unknown[]) => mockDeleteBlob(...args),
}));

jest.mock("next/server", () => ({
  after: jest.fn((callback: () => Promise<void>) => {
    void callback();
  }),
}));

import { enqueueReplayConcatAfterFinalize } from "@/lib/recording/concat-audio-enqueue";

const SESSION_ID = "wbs-race-loss-01";
const ORPHAN_BLOB_URL = "https://blob.vercel-storage.com/orphan-concat.webm";

const drain = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  jest.clearAllMocks();
  mockDeleteBlob.mockResolvedValue(undefined);
  mockFindUnique.mockResolvedValue({
    id: SESSION_ID,
    adminUserId: "admin-1",
    studentId: "student-1",
    endedAt: new Date("2026-07-05T00:00:00Z"),
    concatBlobUrl: null,
  });
  mockFindMany.mockResolvedValue([
    {
      blobUrl: "https://blob.example.com/a.webm",
      mimeType: "audio/webm",
      streamId: "tutor:mic",
      orderIndex: 0,
    },
    {
      blobUrl: "https://blob.example.com/b.webm",
      mimeType: "audio/webm",
      streamId: "tutor:mic",
      orderIndex: 1,
    },
  ]);
  mockConcatMixdown.mockResolvedValue({
    ok: true,
    blobUrl: ORPHAN_BLOB_URL,
    mimeType: "audio/webm",
    sizeBytes: 1024,
    durationSeconds: 60,
    segmentCount: 2,
  });
  mockUpdateMany.mockResolvedValue({ count: 0 });
});

describe("enqueueReplayConcatAfterFinalize — race-loss compensating delete", () => {
  it("deletes orphan blob when conditional updateMany loses the race", async () => {
    enqueueReplayConcatAfterFinalize(SESSION_ID);
    await drain();

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: SESSION_ID, concatBlobUrl: null },
      data: {
        concatBlobUrl: ORPHAN_BLOB_URL,
        concatDurationSeconds: 60,
      },
    });
    expect(mockDeleteBlob).toHaveBeenCalledWith(ORPHAN_BLOB_URL);
  });
});
