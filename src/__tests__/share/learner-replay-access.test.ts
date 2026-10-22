/**
 * @jest-environment node
 *
 * Learner replay access and the parent visible-replay rule.
 *
 * Oracle is the row the caller can see: note status, who owns the student,
 * whether the session ended, the frozen whiteboard consent snapshot, and
 * Student.erasedAt. A DRAFT note is the auto-created nsi row and is not a
 * replay, on either path.
 */

import { db } from "@/lib/db";
import {
  resolveLearnerWhiteboardReplay,
  sanitizeReplayLogId,
} from "@/lib/share/learner-replay-access";
import { loadParentVisibleWhiteboardReplayIds } from "@/lib/share/loadWhiteboardReplayIdsForNotes";
import { uniq } from "../helpers/unique-test-token";

afterAll(async () => {
  await db.$disconnect();
});

async function seedReplay(opts: {
  noteStatus?: "DRAFT" | "READY" | "SENT";
  ended?: boolean;
  /** When set, freeze this whiteboard-recording value on the session snapshot. */
  snapshotWhiteboard?: boolean;
  erased?: boolean;
}) {
  const tutor = await db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
  const account = await db.accountHolder.create({
    data: {
      email: `${uniq("ah")}@example.com`,
      emailVerifiedAt: new Date("2026-01-01"),
    },
  });
  const profile = await db.learnerProfile.create({
    data: {
      accountHolderId: account.id,
      displayName: "Replay child",
      isSelfLearner: false,
    },
  });
  const student = await db.student.create({
    data: {
      name: "Replay child",
      adminUserId: tutor.id,
      learnerProfileId: profile.id,
      ...(opts.erased ? { erasedAt: new Date("2026-10-01") } : {}),
    },
  });
  await db.consentRecord.create({
    data: {
      learnerProfileId: profile.id,
      adminUserId: tutor.id,
      version: 1,
      allowLiveSession: true,
      allowAudioRecording: true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
      setByAccountHolderId: account.id,
      captureMethod: "electronic",
    },
  });
  const note = await db.sessionNote.create({
    data: {
      studentId: student.id,
      date: new Date("2026-06-01T00:00:00Z"),
      topics: "Replay note",
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
      noteId: note.id,
      endedAt: opts.ended === false ? null : new Date("2026-06-01T01:00:00Z"),
      eventsBlobUrl: "https://example.invalid/replay-events.json",
    },
  });
  if (opts.snapshotWhiteboard !== undefined) {
    await db.sessionConsentSnapshot.create({
      data: {
        whiteboardSessionId: session.id,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: opts.snapshotWhiteboard,
        allowNoteSending: true,
      },
    });
  }
  return {
    learnerProfileId: profile.id,
    studentId: student.id,
    tutorId: tutor.id,
    noteId: note.id,
    sessionId: session.id,
  };
}

function studentsOf(row: { studentId: string; tutorId: string }) {
  return [
    {
      id: row.studentId,
      adminUserId: row.tutorId,
      organizationId: null,
    },
  ];
}

describe("resolveLearnerWhiteboardReplay", () => {
  it("allows the owning learner on an ended non-draft session", async () => {
    const row = await seedReplay({});
    const spy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const access = await resolveLearnerWhiteboardReplay(
      row.learnerProfileId,
      row.sessionId
    );
    expect(access.ok).toBe(true);
    if (access.ok) {
      expect(access.studentId).toBe(row.studentId);
      expect(access.session.id).toBe(row.sessionId);
    }
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(
        `[lpr] lpr=${row.learnerProfileId} wbsid=${row.sessionId} action=replay_granted principal=learner studentId=${row.studentId}`
      )
    );
    spy.mockRestore();
  });

  it("strips line breaks and caps log ids", () => {
    expect(sanitizeReplayLogId("ab\r\ncd")).toBe("abcd");
    expect(sanitizeReplayLogId("x".repeat(80))).toHaveLength(64);
  });

  it("denies a different learner", async () => {
    const row = await seedReplay({});
    const otherAccount = await db.accountHolder.create({
      data: { email: `${uniq("ah")}@example.com`, emailVerifiedAt: new Date() },
    });
    const other = await db.learnerProfile.create({
      data: {
        accountHolderId: otherAccount.id,
        displayName: "Other",
        isSelfLearner: false,
      },
    });
    const access = await resolveLearnerWhiteboardReplay(other.id, row.sessionId);
    expect(access).toEqual({ ok: false, reason: "not_owner" });
  });

  it("denies a DRAFT-linked session", async () => {
    const row = await seedReplay({ noteStatus: "DRAFT" });
    const access = await resolveLearnerWhiteboardReplay(
      row.learnerProfileId,
      row.sessionId
    );
    expect(access).toEqual({ ok: false, reason: "not_visible" });
  });

  it("denies a session that has not ended", async () => {
    const row = await seedReplay({ ended: false });
    const access = await resolveLearnerWhiteboardReplay(
      row.learnerProfileId,
      row.sessionId
    );
    expect(access).toEqual({ ok: false, reason: "not_visible" });
  });

  it("denies when the consent snapshot froze whiteboard recording off", async () => {
    const row = await seedReplay({ snapshotWhiteboard: false });
    const access = await resolveLearnerWhiteboardReplay(
      row.learnerProfileId,
      row.sessionId
    );
    expect(access).toEqual({ ok: false, reason: "not_visible" });
  });

  it("denies an erased student", async () => {
    const row = await seedReplay({ erased: true });
    const access = await resolveLearnerWhiteboardReplay(
      row.learnerProfileId,
      row.sessionId
    );
    expect(access).toEqual({ ok: false, reason: "not_visible" });
  });
});

describe("loadParentVisibleWhiteboardReplayIds", () => {
  it("omits a DRAFT note and returns an ended READY note", async () => {
    const draft = await seedReplay({ noteStatus: "DRAFT" });
    const ready = await seedReplay({ noteStatus: "READY" });

    const hidden = await loadParentVisibleWhiteboardReplayIds({
      noteIds: [draft.noteId],
      learnerProfileId: draft.learnerProfileId,
      students: studentsOf(draft),
    });
    expect(hidden.get(draft.noteId) ?? []).not.toContain(draft.sessionId);

    const shown = await loadParentVisibleWhiteboardReplayIds({
      noteIds: [ready.noteId],
      learnerProfileId: ready.learnerProfileId,
      students: studentsOf(ready),
    });
    expect(shown.get(ready.noteId)).toEqual([ready.sessionId]);
  });
});
