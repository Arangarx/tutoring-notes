/**
 * @jest-environment node
 */

import {
  loadWhiteboardReplayIdsByNoteIds,
  mergeWhiteboardStubsForShareCard,
} from "@/lib/share/loadWhiteboardReplayIdsForNotes";

type WbMocks = {
  mockWsFindMany: jest.Mock;
  mockRecFindMany: jest.Mock;
};

jest.mock("@/lib/db", () => {
  const mockWsFindMany = jest.fn();
  const mockRecFindMany = jest.fn();
  (globalThis as unknown as { __wbReplayMocks: WbMocks }).__wbReplayMocks = {
    mockWsFindMany,
    mockRecFindMany,
  };
  return {
    db: {
      whiteboardSession: { findMany: mockWsFindMany },
      sessionRecording: { findMany: mockRecFindMany },
    },
  };
});

const { mockWsFindMany, mockRecFindMany } = (
  globalThis as unknown as { __wbReplayMocks: WbMocks }
).__wbReplayMocks;

describe("loadWhiteboardReplayIdsByNoteIds", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty map for empty noteIds without querying", async () => {
    const m = await loadWhiteboardReplayIdsByNoteIds([]);
    expect(m.size).toBe(0);
    expect(mockWsFindMany).not.toHaveBeenCalled();
    expect(mockRecFindMany).not.toHaveBeenCalled();
  });

  it("merges WhiteboardSession.noteId rows and SessionRecording.whiteboardSessionId", async () => {
    const t0 = new Date("2026-05-01T12:00:00Z");
    const t1 = new Date("2026-05-02T12:00:00Z");
    mockWsFindMany.mockResolvedValue([
      { id: "wb-old", noteId: "n1", startedAt: t0 },
      { id: "wb-new", noteId: "n1", startedAt: t1 },
    ]);
    mockRecFindMany.mockResolvedValue([
      { noteId: "n1", whiteboardSessionId: "wb-seg", orderIndex: 0 },
    ]);

    const m = await loadWhiteboardReplayIdsByNoteIds(["n1"]);
    expect(m.get("n1")).toEqual(["wb-new", "wb-old", "wb-seg"]);
  });
});

describe("mergeWhiteboardStubsForShareCard", () => {
  it("prefers authoritative ids then dedupes with relation payload", () => {
    const stubs = mergeWhiteboardStubsForShareCard(
      {
        whiteboardSessions: [{ id: "wb-a" }],
        recordings: [{ whiteboardSessionId: "wb-a" }],
      },
      ["wb-extra", "wb-a"]
    );
    expect(stubs).toEqual([{ id: "wb-extra" }, { id: "wb-a" }]);
  });
});
