/**
 * @jest-environment node
 *
 * Learner replay access and the parent visible-replay rule.
 *
 * Oracle is the row the caller can see: note status, who owns the student,
 * whether the session ended, the frozen consent snapshot (what was recorded:
 * whiteboard on/off, audio on/off, online or in person), and Student.erasedAt.
 * A DRAFT note is the auto-created nsi row and is not a replay, on either path.
 * The replay decision itself is `resolveReplayAccess`; the snapshot wins over
 * the live consent record after End (Q8).
 */

import { db } from "@/lib/db";
import {
  resolveLearnerWhiteboardReplay,
  sanitizeReplayLogId,
} from "@/lib/share/learner-replay-access";
import { applyReplayAccessToNotes } from "@/lib/share/loadWhiteboardReplayIdsForNotes";
import { uniq } from "../helpers/unique-test-token";

afterAll(async () => {
  await db.$disconnect();
});

async function seedReplay(opts: {
  noteStatus?: "DRAFT" | "READY" | "SENT";
  ended?: boolean;
  /** When set, freeze this whiteboard-recording value on the session snapshot. */
  snapshotWhiteboard?: boolean;
  /** Audio recording on the snapshot (default on). Off in person leaves no audio to replay. */
  snapshotAudio?: boolean;
  sessionMode?: "LIVE" | "IN_PERSON";
  /** The live consent record's whiteboard switch (default on). */
  liveWhiteboard?: boolean;
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
      allowWhiteboardRecording: opts.liveWhiteboard ?? true,
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
      sessionMode: opts.sessionMode ?? "LIVE",
    },
  });
  if (opts.snapshotWhiteboard !== undefined) {
    await db.sessionConsentSnapshot.create({
      data: {
        whiteboardSessionId: session.id,
        allowLiveSession: true,
        allowAudioRecording: opts.snapshotAudio ?? true,
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
      // No snapshot (legacy) and a live record that allows the board: both halves open.
      expect(access.replay).toEqual({ audio: true, board: true });
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

  it("opens audio only when the snapshot froze whiteboard recording off online", async () => {
    const row = await seedReplay({ snapshotWhiteboard: false });
    const access = await resolveLearnerWhiteboardReplay(
      row.learnerProfileId,
      row.sessionId
    );
    expect(access.ok).toBe(true);
    if (access.ok) expect(access.replay).toEqual({ audio: true, board: false });
  });

  it("opens the board only when the snapshot froze audio off in person", async () => {
    const row = await seedReplay({
      snapshotWhiteboard: true,
      snapshotAudio: false,
      sessionMode: "IN_PERSON",
    });
    const access = await resolveLearnerWhiteboardReplay(
      row.learnerProfileId,
      row.sessionId
    );
    expect(access.ok).toBe(true);
    if (access.ok) expect(access.replay).toEqual({ audio: false, board: true });
  });

  it("denies when the snapshot froze both halves off", async () => {
    const row = await seedReplay({
      snapshotWhiteboard: false,
      snapshotAudio: false,
      sessionMode: "IN_PERSON",
    });
    const access = await resolveLearnerWhiteboardReplay(
      row.learnerProfileId,
      row.sessionId
    );
    expect(access).toEqual({ ok: false, reason: "not_visible" });
  });

  it("ignores a live record that turned the board off after End (the snapshot decides)", async () => {
    const row = await seedReplay({ snapshotWhiteboard: true, liveWhiteboard: false });
    const access = await resolveLearnerWhiteboardReplay(
      row.learnerProfileId,
      row.sessionId
    );
    expect(access.ok).toBe(true);
    if (access.ok) expect(access.replay.board).toBe(true);
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

/** A note as the list pages pass it to `applyReplayAccessToNotes` (the relation payload is empty: ids come from the FK query). */
const cardNote = (noteId: string) => ({ id: noteId, whiteboardSessions: [], recordings: [] });

describe("applyReplayAccessToNotes", () => {
  it("lists an ended session whose snapshot allows the board", async () => {
    const ready = await seedReplay({ noteStatus: "READY", snapshotWhiteboard: true });
    const shown = await applyReplayAccessToNotes([cardNote(ready.noteId)]);
    expect(shown.get(ready.noteId)?.replaySessionIds).toEqual([ready.sessionId]);
  });

  it("lists nothing for a session the snapshot allows neither half of", async () => {
    const none = await seedReplay({
      snapshotWhiteboard: false,
      snapshotAudio: false,
      sessionMode: "IN_PERSON",
    });
    const shown = await applyReplayAccessToNotes([cardNote(none.noteId)]);
    expect(shown.get(none.noteId)?.replaySessionIds).toEqual([]);
  });

  it("keeps a session with only audio, and drops the recording of a session with no audio", async () => {
    const audioOnly = await seedReplay({ snapshotWhiteboard: false });
    const boardOnly = await seedReplay({
      snapshotWhiteboard: true,
      snapshotAudio: false,
      sessionMode: "IN_PERSON",
    });
    const recordingFor = (whiteboardSessionId: string) => ({ id: `rec-${whiteboardSessionId}`, whiteboardSessionId });
    const emailOnly = { id: "rec-email-only", whiteboardSessionId: null };
    const result = await applyReplayAccessToNotes([
      { id: audioOnly.noteId, whiteboardSessions: [], recordings: [recordingFor(audioOnly.sessionId)] },
      { id: boardOnly.noteId, whiteboardSessions: [], recordings: [recordingFor(boardOnly.sessionId), emailOnly] },
    ]);
    expect(result.get(audioOnly.noteId)?.replaySessionIds).toEqual([audioOnly.sessionId]);
    expect(result.get(audioOnly.noteId)?.recordings.map((r) => r.id)).toEqual([`rec-${audioOnly.sessionId}`]);
    expect(result.get(boardOnly.noteId)?.replaySessionIds).toEqual([boardOnly.sessionId]);
    // The no-audio session's recording is dropped; the email-only recording (no session) stays.
    expect(result.get(boardOnly.noteId)?.recordings.map((r) => r.id)).toEqual(["rec-email-only"]);
  });

  it("is not moved by a live record that changed after End (Q8)", async () => {
    const revoked = await seedReplay({ snapshotWhiteboard: true, liveWhiteboard: false });
    const shown = await applyReplayAccessToNotes([cardNote(revoked.noteId)]);
    expect(shown.get(revoked.noteId)?.replaySessionIds).toEqual([revoked.sessionId]);
  });

  it("follows the live record for a legacy session with no snapshot", async () => {
    const denied = await seedReplay({ liveWhiteboard: false });
    const allowed = await seedReplay({ liveWhiteboard: true });
    const result = await applyReplayAccessToNotes([cardNote(denied.noteId), cardNote(allowed.noteId)]);
    // Legacy audio is open, so the denied-board session is still listed (as an audio replay).
    expect(result.get(allowed.noteId)?.replaySessionIds).toEqual([allowed.sessionId]);
    expect(result.get(denied.noteId)?.replaySessionIds).toEqual([denied.sessionId]);
  });
});
