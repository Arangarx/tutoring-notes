/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import {
  ParentShareNoteCard,
  type ParentShareNoteModel,
} from "@/components/notes/ParentShareNoteCard";

jest.mock("@/app/s/[token]/SeenTracker", () => ({
  SeenTracker: () => null,
}));

const baseNote: ParentShareNoteModel = {
  id: "note-1",
  date: new Date("2026-05-09T12:00:00.000Z"),
  startTime: null,
  endTime: null,
  template: null,
  topics: "Hi",
  homework: "",
  assessment: "",
  nextSteps: "",
  linksJson: "[]",
  shareRecordingInEmail: false,
  recordings: [],
  whiteboardSessions: [],
};

describe("ParentShareNoteCard (Phase 0d)", () => {
  it("shows session audio when shareRecordingInEmail is true", () => {
    render(
      <ParentShareNoteCard
        token="tok-xyz"
        dateLabel="May 9, 2026"
        note={{
          ...baseNote,
          shareRecordingInEmail: true,
          recordings: [
            {
              id: "rec-1",
              mimeType: "audio/webm",
              durationSeconds: 45,
              orderIndex: 0,
            },
          ],
        }}
        isNew={false}
      />
    );

    const section = screen.getByTestId("share-page-audio");
    const audio = section.querySelector("audio");
    expect(audio).toBeTruthy();
    expect(audio).toHaveAttribute("src", "/api/audio/rec-1?token=tok-xyz");
  });

  it("shows whiteboard share link from recording.whiteboardSessionId when sessions relation is empty", () => {
    render(
      <ParentShareNoteCard
        token="tok-xyz"
        dateLabel="May 9, 2026"
        note={{
          ...baseNote,
          whiteboardSessions: [],
          recordings: [
            {
              id: "rec-wb-path",
              mimeType: "audio/webm",
              durationSeconds: 8,
              orderIndex: 0,
              whiteboardSessionId: "wb-from-rec-share",
            },
          ],
        }}
        isNew={false}
      />
    );

    expect(
      screen.getByRole("link", { name: /watch the whiteboard recording/i })
    ).toHaveAttribute(
      "href",
      "/s/tok-xyz/whiteboard/wb-from-rec-share"
    );
  });

  it("shows whiteboard share link when note has linked whiteboard sessions", () => {
    render(
      <ParentShareNoteCard
        token="tok-xyz"
        dateLabel="May 9, 2026"
        note={{
          ...baseNote,
          whiteboardSessions: [{ id: "wb-99" }],
        }}
        isNew={false}
      />
    );

    expect(
      screen.getByRole("link", { name: /watch the whiteboard recording/i })
    ).toHaveAttribute("href", "/s/tok-xyz/whiteboard/wb-99");
    expect(screen.getByTestId("share-wb-replay-links")).toBeInTheDocument();
  });

  it("shows audio on WB-sourced notes even when shareRecordingInEmail is false", () => {
    render(
      <ParentShareNoteCard
        token="tok-xyz"
        dateLabel="May 9, 2026"
        note={{
          ...baseNote,
          shareRecordingInEmail: false,
          whiteboardSessions: [{ id: "wb-99" }],
          recordings: [
            {
              id: "rec-wb",
              mimeType: "audio/webm",
              durationSeconds: 12,
              orderIndex: 0,
            },
          ],
        }}
        isNew={false}
      />
    );

    const section = screen.getByTestId("share-page-audio");
    expect(section.querySelector("audio")).toHaveAttribute(
      "src",
      "/api/audio/rec-wb?token=tok-xyz"
    );
  });

  it("matches server payload: only selected recording fields + explicit null whiteboardSessionId", () => {
    render(
      <ParentShareNoteCard
        token="tok-xyz"
        dateLabel="May 9, 2026"
        note={{
          ...baseNote,
          shareRecordingInEmail: true,
          recordings: [
            {
              id: "rec-1",
              mimeType: "audio/webm",
              durationSeconds: 10,
              orderIndex: 0,
              whiteboardSessionId: null,
            },
          ],
        }}
        isNew={false}
      />
    );

    expect(screen.getByTestId("share-page-audio")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /watch the whiteboard recording/i })
    ).toBeNull();
  });

  it("plain note: no audio section and no whiteboard section", () => {
    render(
      <ParentShareNoteCard
        token="tok-xyz"
        dateLabel="May 9, 2026"
        note={baseNote}
        isNew={false}
      />
    );

    expect(screen.queryByTestId("share-page-audio")).toBeNull();
    expect(screen.queryByTestId("share-wb-replay-links")).toBeNull();
  });
});
