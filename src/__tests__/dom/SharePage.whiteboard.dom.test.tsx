/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import SharePage from "@/app/s/[token]/page";

const mockFindUnique = jest.fn();
const mockSessionNoteFindMany = jest.fn();
const mockNoteViewFindMany = jest.fn();
const mockCreateMany = jest.fn();
const mockAdminFindFirst = jest.fn();

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("notFound");
  }),
}));

jest.mock("@/app/s/[token]/SeenTracker", () => ({
  SeenTracker: () => null,
}));

jest.mock("@/lib/db", () => ({
  db: {
    shareLink: { findUnique: (...a: unknown[]) => mockFindUnique(...a) },
    sessionNote: { findMany: (...a: unknown[]) => mockSessionNoteFindMany(...a) },
    noteView: {
      findMany: (...a: unknown[]) => mockNoteViewFindMany(...a),
      createMany: (...a: unknown[]) => mockCreateMany(...a),
    },
    adminUser: { findFirst: (...a: unknown[]) => mockAdminFindFirst(...a) },
  },
}));

/** Shape from `sessionNote.findMany` + `parentShareNoteInclude` for ParentShareNoteCard. */
function prismaLikeNote(overrides: Partial<{
  id: string;
  shareRecordingInEmail: boolean;
  whiteboardSessions: { id: string }[];
  recordings: Array<{
    id: string;
    mimeType: string;
    durationSeconds: number | null;
    orderIndex: number;
    whiteboardSessionId: string | null;
  }>;
}>) {
  const id = overrides.id ?? "note-prisma";
  return {
    id,
    date: new Date("2026-05-09T00:00:00.000Z"),
    startTime: null as Date | null,
    endTime: null as Date | null,
    template: null as string | null,
    topics: "Topics",
    homework: "",
    assessment: "",
    nextSteps: "",
    linksJson: "[]",
    shareRecordingInEmail: overrides.shareRecordingInEmail ?? true,
    recordings: overrides.recordings ?? [
      {
        id: "rec-1",
        mimeType: "audio/webm",
        durationSeconds: 42,
        orderIndex: 0,
        whiteboardSessionId: "wb-sess-1",
      },
    ],
    whiteboardSessions: overrides.whiteboardSessions ?? [],
  };
}

describe("SharePage /s/[token] (Phase 0f)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindUnique.mockResolvedValue({
      revokedAt: null,
      student: { id: "stu-1", name: "Alex" },
    });
    mockAdminFindFirst.mockResolvedValue(null);
  });

  it("renders whiteboard replay link when Prisma returns recording.whiteboardSessionId only", async () => {
    const note = prismaLikeNote({
      whiteboardSessions: [],
      recordings: [
        {
          id: "rec-1",
          mimeType: "audio/webm",
          durationSeconds: 60,
          orderIndex: 0,
          whiteboardSessionId: "wb-from-recording-fk",
        },
      ],
    });
    mockSessionNoteFindMany.mockResolvedValue([note]);
    mockNoteViewFindMany.mockResolvedValue([{ noteId: note.id }]);

    const ui = await SharePage({ params: Promise.resolve({ token: "tok-test" }) });
    render(ui);

    const link = screen.getByRole("link", { name: /watch the whiteboard recording/i });
    expect(link).toHaveAttribute(
      "href",
      "/s/tok-test/whiteboard/wb-from-recording-fk"
    );
  });

  it("renders whiteboard link from note.whiteboardSessions when recordings omit WB (legacy attach)", async () => {
    const note = prismaLikeNote({
      recordings: [],
      whiteboardSessions: [{ id: "wb-attached-only" }],
    });
    mockSessionNoteFindMany.mockResolvedValue([note]);
    mockNoteViewFindMany.mockResolvedValue([{ noteId: note.id }]);

    const ui = await SharePage({ params: Promise.resolve({ token: "tok-b" }) });
    render(ui);

    expect(
      screen.getByRole("link", { name: /watch the whiteboard recording/i })
    ).toHaveAttribute("href", "/s/tok-b/whiteboard/wb-attached-only");
  });

  it("no whiteboard link for plain share-recording note (null FK)", async () => {
    const note = prismaLikeNote({
      recordings: [
        {
          id: "rec-plain",
          mimeType: "audio/webm",
          durationSeconds: 30,
          orderIndex: 0,
          whiteboardSessionId: null,
        },
      ],
      whiteboardSessions: [],
    });
    mockSessionNoteFindMany.mockResolvedValue([note]);
    mockNoteViewFindMany.mockResolvedValue([{ noteId: note.id }]);

    const ui = await SharePage({ params: Promise.resolve({ token: "tok-plain" }) });
    render(ui);

    expect(
      screen.queryByRole("link", { name: /watch the whiteboard recording/i })
    ).toBeNull();
    expect(screen.getByTestId("share-page-audio")).toBeInTheDocument();
  });
});
