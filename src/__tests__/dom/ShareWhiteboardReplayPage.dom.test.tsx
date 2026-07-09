/**
 * @jest-environment jsdom
 *
 * WS-U-COPY 2.10 — parent share replay page hides schema version in UI.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import ShareWhiteboardPage from "@/app/s/[token]/whiteboard/[whiteboardSessionId]/page";

const mockFindUnique = jest.fn();

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("notFound");
  }),
}));

jest.mock("@/lib/erasure/assert-student-not-erased", () => ({
  assertStudentNotErased: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/share-access-scope", () => ({
  assertCanAccessShareLink: jest.fn().mockResolvedValue({
    studentId: "stu-1",
    principal: "account_holder",
  }),
}));

jest.mock("@/components/whiteboard/replay/WhiteboardReplayInFrame", () => ({
  WhiteboardReplayInFrame: () => <div data-testid="mock-wb-replay-in-frame" />,
}));

jest.mock("@/lib/db", () => ({
  db: {
    shareLink: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    whiteboardSession: {
      findUnique: jest.fn(),
    },
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

jest.mock("@/lib/whiteboard/replay-audio-payload", () => ({
  buildReplayAudioPayload: () => ({
    audioSegments: [],
    canonicalAudioBlobUrl: null,
    canonicalAudioMimeType: null,
    canonicalDurationSeconds: null,
  }),
}));

describe("ShareWhiteboardPage (WS-U-COPY 2.10)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindUnique.mockResolvedValue({
      revokedAt: null,
      studentId: "stu-1",
      student: { name: "Alex" },
    });
    const { db } = jest.requireMock("@/lib/db") as {
      db: {
        whiteboardSession: { findUnique: jest.Mock };
      };
    };
    db.whiteboardSession.findUnique.mockResolvedValue({
      id: "wbs-share",
      studentId: "stu-1",
      startedAt: new Date("2026-05-09T10:00:00.000Z"),
      endedAt: new Date("2026-05-09T11:00:00.000Z"),
      durationSeconds: 3600,
      eventsSchemaVersion: 3,
      snapshotBlobUrl: null,
      concatBlobUrl: null,
      concatDurationSeconds: null,
      audioRecordings: [],
    });
  });

  it("does not render schema version in the page UI", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const ui = await ShareWhiteboardPage({
      params: Promise.resolve({ token: "tok-test", whiteboardSessionId: "wbs-share" }),
    });
    render(ui);

    expect(screen.getByTestId("mock-wb-replay-in-frame")).toBeInTheDocument();
    expect(screen.queryByText(/schema v/i)).not.toBeInTheDocument();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/schema v3/)
    );
    logSpy.mockRestore();
  });
});
