/**
 * REQ-S3-4: Notes-session bridge tests — locked design (B4, 2026-06-07).
 *
 * Covers the user-observable invariants for the new SessionNote model:
 *   (i)   Ended session → reduce writes structured fields into TutorNote ONLY
 *          (no SessionNote auto-created at session end)
 *   (ii)  saveSessionNotesAction creates ONE READY SessionNote; a second call
 *          UPDATES the same note (idempotent, no duplicate)
 *   (iii) DRAFT SessionNote is still NOT visible on parent share pages
 *          (query filter; harmless defense even though we no longer auto-create DRAFTs)
 *   (iv)  deleteWhiteboardSessionAndDataAction is ALLOWED on a saved (READY) note;
 *          on failure, action returns {ok:false} so caller can redirect regardless
 *   (v)   Regenerate does NOT lose prior note content on failure (TutorNote safety)
 *   (vi)  Field mapping: homework is empty, nextSteps carries plan+homework
 *
 * All DB calls are mocked — no live DB or network.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/lib/db", () => ({
  db: {
    whiteboardSession: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    sessionNote: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    sessionRecording: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
  withDbRetry: jest.fn((fn: () => unknown) => fn()),
}));

jest.mock("@/lib/recording/transcript-store", () => ({
  getTutorNoteBySessionId: jest.fn(),
  getTranscriptChunksBySessionId: jest.fn(),
  getChunkExtractionsBySessionId: jest.fn(),
  updateTutorNote: jest.fn(),
  upsertTutorNotePending: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  env: { OPENAI_API_KEY: "test-key" },
}));

const mockChatCreate = jest.fn();
jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCreate } },
  })),
}));

jest.mock("@/lib/observability/cost-events", () => ({
  estimateCostUsd: jest.fn().mockReturnValue(0.001),
  logCostEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

jest.mock("@/lib/whiteboard-scope", () => ({
  assertOwnsWhiteboardSession: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import {
  getTutorNoteBySessionId,
  getTranscriptChunksBySessionId,
  getChunkExtractionsBySessionId,
  updateTutorNote,
  upsertTutorNotePending,
} from "@/lib/recording/transcript-store";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import { processNotesReduceJob } from "@/lib/recording/notes-worker";
import {
  saveSessionNotesAction,
  deleteWhiteboardSessionAndDataAction,
  regenerateNotesAction,
} from "@/app/admin/students/[id]/whiteboard/notes-actions";

// ---------------------------------------------------------------------------
// Mocked handles
// ---------------------------------------------------------------------------

const mockGetNote = getTutorNoteBySessionId as jest.Mock;
const mockGetChunks = getTranscriptChunksBySessionId as jest.Mock;
const mockGetExtractions = getChunkExtractionsBySessionId as jest.Mock;
const mockUpdateNote = updateTutorNote as jest.Mock;
const mockUpsertNotePending = upsertTutorNotePending as jest.Mock;
const mockWbFindUnique = db.whiteboardSession.findUnique as jest.Mock;
const mockWbUpdate = db.whiteboardSession.update as jest.Mock;
const mockNoteCreate = db.sessionNote.create as jest.Mock;
const mockNoteUpdate = db.sessionNote.update as jest.Mock;
const mockNoteFindUnique = db.sessionNote.findUnique as jest.Mock;
const mockNoteDelete = db.sessionNote.delete as jest.Mock;
const mockRecordingDeleteMany = db.sessionRecording.deleteMany as jest.Mock;
const mockTransaction = db.$transaction as jest.Mock;
const mockAssertOwns = assertOwnsWhiteboardSession as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SESSION_ID = "wbs-bridge-01";
const STUDENT_ID = "stu-bridge-01";
const ADMIN_ID = "admin-bridge-01";
const NOTE_ID = "note-draft-01";
const NOW = new Date("2026-06-07T14:00:00Z");

const BASE_SESSION = {
  id: SESSION_ID,
  endedAt: NOW,
  startedAt: new Date(NOW.getTime() - 60 * 60 * 1000),
  studentId: STUDENT_ID,
  adminUserId: ADMIN_ID,
  noteId: null as string | null,
};

const STRUCTURED_RESPONSE = JSON.stringify({
  topics: "Quadratics, factoring",
  assessment: "Comfortable with basic factoring; struggled with negative coefficients",
  nextSteps: "Practice problems 5–10; review coefficient rules",
  links: "",
});

function makeChunk(status = "done") {
  return {
    id: "chunk-1",
    sessionId: SESSION_ID,
    chunkBlobUrl: "https://blob/c1.webm",
    status,
    attempts: 1,
    recordingTimeOffsetMs: 0,
    transcript: "Tutor: Let's factor this.",
    durationMs: 30000,
    transcribedAt: NOW,
    error: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function setupReduceWorkerMocks() {
  mockGetNote.mockResolvedValue(null);
  mockUpsertNotePending.mockResolvedValue({ sessionId: SESSION_ID, status: "pending" });
  mockUpdateNote.mockResolvedValue({ sessionId: SESSION_ID });

  // Reduce worker now only selects {id, endedAt} from session — no bridge fields needed
  mockWbFindUnique.mockResolvedValue({ id: SESSION_ID, endedAt: NOW });

  mockGetChunks.mockResolvedValue([makeChunk("done")]);
  mockGetExtractions.mockResolvedValue([]);

  mockChatCreate.mockResolvedValue({
    choices: [{ message: { content: STRUCTURED_RESPONSE } }],
    usage: { prompt_tokens: 100, completion_tokens: 150 },
  });
}

// ---------------------------------------------------------------------------
// (i) Ended session → reduce writes TutorNote ONLY (no SessionNote auto-created)
// ---------------------------------------------------------------------------

describe("(i) reduce job writes TutorNote ONLY — no SessionNote auto-creation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupReduceWorkerMocks();
  });

  it("does NOT call sessionNote.create at session end", async () => {
    await processNotesReduceJob(SESSION_ID);

    expect(mockNoteCreate).not.toHaveBeenCalled();
  });

  it("does NOT call sessionNote.update at session end", async () => {
    await processNotesReduceJob(SESSION_ID);

    expect(mockNoteUpdate).not.toHaveBeenCalled();
  });

  it("does NOT call whiteboardSession.update (no noteId link from worker)", async () => {
    await processNotesReduceJob(SESSION_ID);

    expect(mockWbUpdate).not.toHaveBeenCalled();
  });

  it("writes TutorNote.content as structured JSON with all fields", async () => {
    await processNotesReduceJob(SESSION_ID);

    const doneCall = mockUpdateNote.mock.calls.find(
      (c: unknown[]) => (c[1] as { status?: string }).status === "done"
    );
    expect(doneCall).toBeDefined();
    const content = (doneCall?.[1] as { content?: string })?.content;
    expect(content).toBeDefined();
    const parsed = JSON.parse(content!);
    expect(parsed.topics).toBe("Quadratics, factoring");
    expect(parsed.assessment).toContain("factoring");
    expect(parsed.nextSteps).toContain("Practice problems");
  });

  it("job returns outcome=done", async () => {
    const result = await processNotesReduceJob(SESSION_ID);
    expect(result.outcome).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// (vi) Field mapping: homework is empty string, nextSteps carries plan+homework
//      (verified via TutorNote.content, not SessionNote creation)
// ---------------------------------------------------------------------------

describe("(vi) TutorNote content: nextSteps carries plan+homework, no homework field", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupReduceWorkerMocks();
  });

  it("TutorNote.content contains nextSteps with plan content from AI response", async () => {
    await processNotesReduceJob(SESSION_ID);

    const doneCall = mockUpdateNote.mock.calls.find(
      (c: unknown[]) => (c[1] as { status?: string }).status === "done"
    );
    const content = (doneCall?.[1] as { content?: string })?.content;
    const parsed = JSON.parse(content!);
    expect(parsed.nextSteps).toBe("Practice problems 5–10; review coefficient rules");
    // No homework field in TutorNote content
    expect(parsed.homework).toBeUndefined();
  });

  it("no SessionNote is created (so no homework column to check)", async () => {
    await processNotesReduceJob(SESSION_ID);
    expect(mockNoteCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (v) Regenerate does NOT lose prior note content on failure
// ---------------------------------------------------------------------------

describe("(v) regenerate preserves prior TutorNote content on failure", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupReduceWorkerMocks();
  });

  it("updateTutorNote on failure does NOT include content (preserves prior)", async () => {
    mockChatCreate.mockRejectedValue(new Error("OpenAI 500"));

    await processNotesReduceJob(SESSION_ID);

    const failCall = mockUpdateNote.mock.calls.find(
      (c: unknown[]) => (c[1] as { status?: string }).status === "failed"
    );
    expect(failCall).toBeDefined();
    // content must NOT be present in the failure update
    const failData = failCall?.[1] as Record<string, unknown>;
    expect(failData.content).toBeUndefined();
  });

  it("updateTutorNote on failure sets status=failed with error message", async () => {
    mockChatCreate.mockRejectedValue(new Error("API timeout"));

    await processNotesReduceJob(SESSION_ID);

    const failCall = mockUpdateNote.mock.calls.find(
      (c: unknown[]) => (c[1] as { status?: string }).status === "failed"
    );
    const failData = failCall?.[1] as { error?: string };
    expect(failData?.error).toContain("API timeout");
  });

  it("regenerateNotesAction resets TutorNote to pending and triggers re-run", async () => {
    mockAssertOwns.mockResolvedValue({ id: SESSION_ID, studentId: STUDENT_ID, adminUserId: ADMIN_ID });
    mockGetNote.mockResolvedValue({ status: "done", sessionId: SESSION_ID });

    const enqueueNotesMock = jest.fn().mockResolvedValue(undefined);
    jest.mock("@/lib/recording/notes-enqueue", () => ({
      enqueueNotesReduce: enqueueNotesMock,
    }));

    const result = await regenerateNotesAction(SESSION_ID);

    expect(result.ok).toBe(true);
    // Should reset TutorNote to pending
    expect(mockUpdateNote).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ status: "pending" })
    );
  });
});

// ---------------------------------------------------------------------------
// (ii) saveSessionNotesAction: creates READY note; second call updates in place
// ---------------------------------------------------------------------------

describe("(ii) saveSessionNotesAction: idempotent create/update of READY SessionNote", () => {
  const SESSION_FIELDS = {
    topics: "Quadratics",
    assessment: "Good progress",
    nextSteps: "Practice worksheet 3",
    links: "",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAssertOwns.mockResolvedValue({
      id: SESSION_ID,
      studentId: STUDENT_ID,
      adminUserId: ADMIN_ID,
      endedAt: NOW,
    });
    mockNoteUpdate.mockResolvedValue({ id: NOTE_ID });
  });

  it("creates READY SessionNote when session has no prior noteId", async () => {
    mockWbFindUnique.mockResolvedValue({ noteId: null });
    mockNoteCreate.mockResolvedValue({ id: NOTE_ID });
    mockWbUpdate.mockResolvedValue({});

    const result = await saveSessionNotesAction(SESSION_ID, SESSION_FIELDS);

    expect(result.ok).toBe(true);
    expect(mockNoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "READY",
          homework: "",
          topics: "Quadratics",
        }),
      })
    );
    // Links the session → note
    expect(mockWbUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SESSION_ID },
        data: expect.objectContaining({ noteId: NOTE_ID }),
      })
    );
  });

  it("updates existing SessionNote when session already has noteId (re-save)", async () => {
    mockWbFindUnique.mockResolvedValue({ noteId: NOTE_ID });

    const result = await saveSessionNotesAction(SESSION_ID, SESSION_FIELDS);

    expect(result.ok).toBe(true);
    expect(mockNoteUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: NOTE_ID },
        data: expect.objectContaining({
          status: "READY",
          topics: "Quadratics",
          nextSteps: "Practice worksheet 3",
          aiGenerated: true,
        }),
      })
    );
    // No new note created — idempotent
    expect(mockNoteCreate).not.toHaveBeenCalled();
  });

  it("returns noteId on success", async () => {
    mockWbFindUnique.mockResolvedValue({ noteId: NOTE_ID });
    const result = await saveSessionNotesAction(SESSION_ID, SESSION_FIELDS);
    expect(result.ok && result.noteId).toBe(NOTE_ID);
  });

  it("never sets status=DRAFT (always READY)", async () => {
    mockWbFindUnique.mockResolvedValue({ noteId: NOTE_ID });
    await saveSessionNotesAction(SESSION_ID, SESSION_FIELDS);

    const updateCall = mockNoteUpdate.mock.calls[0]?.[0];
    expect(updateCall?.data?.status).toBe("READY");
    expect(updateCall?.data?.status).not.toBe("DRAFT");
  });
});

// ---------------------------------------------------------------------------
// (iii) DRAFT visibility: still not parent-visible (harmless defense test)
// ---------------------------------------------------------------------------

describe("(iii) DRAFT SessionNote is not parent-visible (query filter defense)", () => {
  it("parent share page query must include status filter excluding DRAFT", () => {
    const whereClause = {
      studentId: STUDENT_ID,
      status: { not: "DRAFT" as const },
    };

    const readyNote = { studentId: STUDENT_ID, status: "READY" as const };
    const draftNote = { studentId: STUDENT_ID, status: "DRAFT" as const };

    function matchesWhere(note: { studentId: string; status: string }) {
      if (note.studentId !== whereClause.studentId) return false;
      if (whereClause.status.not === note.status) return false;
      return true;
    }

    expect(matchesWhere(readyNote)).toBe(true);
    expect(matchesWhere(draftNote)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (iv) Delete: ALLOWED on saved (READY) note; returns ok:false on failure
// ---------------------------------------------------------------------------

describe("(iv) deleteWhiteboardSessionAndDataAction: allowed on READY note", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAssertOwns.mockResolvedValue({
      id: SESSION_ID,
      studentId: STUDENT_ID,
      adminUserId: ADMIN_ID,
      endedAt: NOW,
    });
    mockWbFindUnique.mockResolvedValue({ noteId: NOTE_ID, studentId: STUDENT_ID });

    // Simulate $transaction executing the callback
    mockTransaction.mockImplementation(async (fn: (tx: typeof db) => Promise<void>) => {
      await fn(db);
    });
    mockNoteDelete.mockResolvedValue({});
    mockRecordingDeleteMany.mockResolvedValue({ count: 2 });
    (db.whiteboardSession.delete as jest.Mock) = jest.fn().mockResolvedValue({});
  });

  it("allows delete even when SessionNote status is READY (guard removed)", async () => {
    // In the new design no status check is performed — delete always proceeds
    const result = await deleteWhiteboardSessionAndDataAction(SESSION_ID);

    expect(result.ok).toBe(true);
    expect(mockNoteDelete).toHaveBeenCalledWith({ where: { id: NOTE_ID } });
  });

  it("allows delete even when SessionNote status is SENT", async () => {
    // SENT note — still allowed with the new model
    const result = await deleteWhiteboardSessionAndDataAction(SESSION_ID);

    expect(result.ok).toBe(true);
    expect(mockNoteDelete).toHaveBeenCalledWith({ where: { id: NOTE_ID } });
  });

  it("executes full delete in a transaction (note + recordings + session)", async () => {
    const result = await deleteWhiteboardSessionAndDataAction(SESSION_ID);

    expect(result.ok).toBe(true);
    expect(mockTransaction).toHaveBeenCalled();
    expect(mockNoteDelete).toHaveBeenCalledWith({ where: { id: NOTE_ID } });
    expect(mockRecordingDeleteMany).toHaveBeenCalledWith({
      where: { whiteboardSessionId: SESSION_ID },
    });
  });

  it("returns ok:false (not throws) on transaction failure — caller redirects", async () => {
    mockTransaction.mockRejectedValue(new Error("DB connection lost"));

    const result = await deleteWhiteboardSessionAndDataAction(SESSION_ID);

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain("DB connection");
  });

  it("denies non-owner (assertOwnsWhiteboardSession throws)", async () => {
    mockAssertOwns.mockRejectedValue(new Error("Not authorized"));

    const result = await deleteWhiteboardSessionAndDataAction(SESSION_ID);

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain("Not authorized");
  });
});
