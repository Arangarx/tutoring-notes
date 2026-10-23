/**
 * @jest-environment node
 *
 * Parent share-token replay is visible only for an ended session whose
 * linked note has left DRAFT. Oracle is the note status row, not the
 * gate's own branch. READY and SENT stay visible. By default a still-live
 * session and a session owned by another student are not this gate's denial.
 * denyLiveSession is the audio proxy, which has no separate not-ended response.
 */

import { db } from "@/lib/db";
import { isReplayVisibleNoteStatus } from "@/lib/share/loadWhiteboardReplayIdsForNotes";
import { parentShareReplayNoteIsHidden } from "@/lib/share/parent-share-replay-access";
import { generateShareToken } from "@/lib/security";
import { uniq } from "../helpers/unique-test-token";

afterAll(async () => {
  await db.$disconnect();
});

async function seed(opts: {
  noteStatus?: "DRAFT" | "READY" | "SENT" | null;
  ended?: boolean;
}) {
  const tutor = await db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
  const student = await db.student.create({
    data: { name: "Share replay child", adminUserId: tutor.id },
  });
  const note =
    opts.noteStatus === null
      ? null
      : await db.sessionNote.create({
          data: {
            studentId: student.id,
            date: new Date("2026-06-01T00:00:00Z"),
            topics: "Share replay",
            homework: "",
            assessment: "",
            nextSteps: "",
            linksJson: "[]",
            status: opts.noteStatus ?? "READY",
          },
        });
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      ...(note ? { noteId: note.id } : {}),
      endedAt: opts.ended === false ? null : new Date("2026-06-01T01:00:00Z"),
      eventsBlobUrl: "https://example.invalid/share-replay-events.json",
    },
  });
  return {
    studentId: student.id,
    sessionId: session.id,
    token: generateShareToken(),
  };
}

describe("isReplayVisibleNoteStatus", () => {
  it("accepts READY and SENT and rejects DRAFT and a missing note", () => {
    expect(isReplayVisibleNoteStatus("READY")).toBe(true);
    expect(isReplayVisibleNoteStatus("SENT")).toBe(true);
    expect(isReplayVisibleNoteStatus("DRAFT")).toBe(false);
    expect(isReplayVisibleNoteStatus(null)).toBe(false);
    expect(isReplayVisibleNoteStatus(undefined)).toBe(false);
  });
});

describe("parentShareReplayNoteIsHidden", () => {
  it("hides an ended DRAFT note and logs a truncated share token", async () => {
    const row = await seed({ noteStatus: "DRAFT" });
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      parentShareReplayNoteIsHidden({
        shareToken: row.token,
        studentId: row.studentId,
        whiteboardSessionId: row.sessionId,
      })
    ).resolves.toBe(true);
    const line = spy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(line).toContain(
      `[sal] sal=${row.token.slice(0, 8)} wbsid=${row.sessionId} action=access_denied studentId=${row.studentId} reason=note_not_visible`
    );
    expect(line).not.toContain(row.token);
    spy.mockRestore();
  });

  it("hides an ended session with no linked note", async () => {
    const row = await seed({ noteStatus: null });
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      parentShareReplayNoteIsHidden({
        shareToken: row.token,
        studentId: row.studentId,
        whiteboardSessionId: row.sessionId,
      })
    ).resolves.toBe(true);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("reason=note_not_visible")
    );
    spy.mockRestore();
  });

  it("shows an ended READY note and an ended SENT note", async () => {
    const ready = await seed({ noteStatus: "READY" });
    const sent = await seed({ noteStatus: "SENT" });
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      parentShareReplayNoteIsHidden({
        shareToken: ready.token,
        studentId: ready.studentId,
        whiteboardSessionId: ready.sessionId,
      })
    ).resolves.toBe(false);
    await expect(
      parentShareReplayNoteIsHidden({
        shareToken: sent.token,
        studentId: sent.studentId,
        whiteboardSessionId: sent.sessionId,
      })
    ).resolves.toBe(false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not deny a still-live session or another student's session", async () => {
    const live = await seed({ noteStatus: "DRAFT", ended: false });
    const owned = await seed({ noteStatus: "DRAFT" });
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      parentShareReplayNoteIsHidden({
        shareToken: live.token,
        studentId: live.studentId,
        whiteboardSessionId: live.sessionId,
      })
    ).resolves.toBe(false);
    await expect(
      parentShareReplayNoteIsHidden({
        shareToken: owned.token,
        studentId: "someone-else",
        whiteboardSessionId: owned.sessionId,
      })
    ).resolves.toBe(false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("hides a still-live session when audio asks to deny it", async () => {
    const live = await seed({ noteStatus: "READY", ended: false });
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      parentShareReplayNoteIsHidden({
        shareToken: live.token,
        studentId: live.studentId,
        whiteboardSessionId: live.sessionId,
        denyLiveSession: true,
      })
    ).resolves.toBe(true);
    expect(spy.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      `wbsid=${live.sessionId} action=access_denied studentId=${live.studentId} reason=note_not_visible`
    );
    spy.mockRestore();
  });
});
