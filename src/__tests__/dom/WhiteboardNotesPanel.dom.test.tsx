/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WhiteboardNotesPanel from "@/components/whiteboard/WhiteboardNotesPanel";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
}));

const generateNotesMock = jest.fn<
  Promise<unknown>,
  [string]
>();
const attachMock = jest.fn();
const createNoteMock = jest.fn();

jest.mock("@/app/admin/students/[id]/whiteboard/actions", () => ({
  generateNotesFromWhiteboardSessionAction: (...args: [string]) =>
    generateNotesMock(...args),
  attachWhiteboardToNoteAction: (...args: unknown[]) => attachMock(...args),
}));

jest.mock("@/app/admin/students/[id]/actions", () => ({
  createNote: (...args: unknown[]) => createNoteMock(...args),
}));

function okGenerateResult() {
  return Promise.resolve({
    ok: true,
    recordingIds: ["rec-a", "rec-b"],
    transcript: "(test)",
    topics: "Topics A",
    homework: "Hw B",
    assessment: "",
    plan: "Plan C",
    links: "",
    promptVersion: "v-test",
    sessionStartedAt: "2026-05-09T14:00:00.000Z",
    sessionEndedAt: "2026-05-09T14:30:00.000Z",
  });
}

beforeEach(() => {
  generateNotesMock.mockImplementation(okGenerateResult);
  createNoteMock.mockResolvedValue({ id: "note-new" });
  attachMock.mockResolvedValue({ ok: true });
});

describe("WhiteboardNotesPanel (Phase 0e)", () => {
  it("after Generate notes, shows the same review gate as audio flow; Cancel skips save", async () => {
    const user = userEvent.setup();
    render(
      <WhiteboardNotesPanel
        whiteboardSessionId="wb-sess-1"
        studentId="stu-1"
        sessionDate="2026-05-09"
        attachedNoteId={null}
        aiEnabled
        hasAudio
      />
    );

    await user.click(screen.getByTestId("wb-generate-notes"));

    expect(
      await screen.findByTestId("ai-generated-note-review-gate")
    ).toHaveTextContent("Form filled — review and save.");

    await user.click(screen.getByTestId("ai-generated-note-review-dismiss"));

    expect(createNoteMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("new-note-form")).toBeNull();
  });

  it("Save calls createNote after review", async () => {
    const user = userEvent.setup();
    render(
      <WhiteboardNotesPanel
        whiteboardSessionId="wb-sess-1"
        studentId="stu-1"
        sessionDate="2026-05-09"
        attachedNoteId={null}
        aiEnabled
        hasAudio
      />
    );

    await user.click(screen.getByTestId("wb-generate-notes"));
    await screen.findByTestId("new-note-form");

    fireEvent.submit(screen.getByTestId("new-note-form"));

    await waitFor(() => expect(createNoteMock).toHaveBeenCalled());
    expect(attachMock).not.toHaveBeenCalled();
    const fd = createNoteMock.mock.calls[0]![1] as FormData;
    expect(fd.get("topics")).toBe("Topics A");
  });
});
