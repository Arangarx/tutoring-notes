import { db } from "@/lib/db";
import type { ShareNoteWhiteboardSessionStub } from "@/components/notes/ParentShareNoteCard";
import {
  effectiveConsentToggles,
  type ConsentToggleCeiling,
} from "@/lib/consent-scope";
import { orderedUnique } from "@/lib/notes/display-utils";

/**
 * Auto-created notes stay DRAFT until Save. A replay is visible only once
 * the linked note has left DRAFT — the same rule as the child home list.
 */
export const REPLAY_VISIBLE_NOTE_STATUS = { not: "DRAFT" } as const;

/**
 * In-memory form of {@link REPLAY_VISIBLE_NOTE_STATUS}. A missing note is
 * not a replay. READY and SENT both pass; DRAFT does not.
 */
export function isReplayVisibleNoteStatus(
  status: string | null | undefined
): boolean {
  return status != null && status !== REPLAY_VISIBLE_NOTE_STATUS.not;
}

/**
 * Load whiteboard session ids for parent share cards using direct FK queries.
 * Parent `/s/...` must not rely on nested `include` alone — production showed links
 * missing while `/api/audio` gates still passed (rows exist in DB).
 */
export async function loadWhiteboardReplayIdsByNoteIds(
  noteIds: string[]
): Promise<Map<string, string[]>> {
  if (noteIds.length === 0) return new Map();

  const [sessions, recordings] = await Promise.all([
    db.whiteboardSession.findMany({
      where: { noteId: { in: noteIds } },
      select: { id: true, noteId: true, startedAt: true },
    }),
    db.sessionRecording.findMany({
      where: {
        noteId: { in: noteIds },
        whiteboardSessionId: { not: null },
      },
      select: {
        noteId: true,
        whiteboardSessionId: true,
        orderIndex: true,
      },
    }),
  ]);

  const sessionsByNote = new Map<string, typeof sessions>();
  for (const s of sessions) {
    if (!s.noteId) continue;
    const list = sessionsByNote.get(s.noteId) ?? [];
    list.push(s);
    sessionsByNote.set(s.noteId, list);
  }

  const sessionIdsByNote = new Map<string, string[]>();
  for (const [noteId, list] of sessionsByNote) {
    list.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    sessionIdsByNote.set(
      noteId,
      list.map((x) => x.id)
    );
  }

  const recGrouped = new Map<string, typeof recordings>();
  for (const r of recordings) {
    if (!r.noteId || !r.whiteboardSessionId) continue;
    const list = recGrouped.get(r.noteId) ?? [];
    list.push(r);
    recGrouped.set(r.noteId, list);
  }

  const recIdsByNote = new Map<string, string[]>();
  for (const [noteId, list] of recGrouped) {
    list.sort((a, b) => a.orderIndex - b.orderIndex);
    recIdsByNote.set(
      noteId,
      list.map((x) => x.whiteboardSessionId!)
    );
  }

  const result = new Map<string, string[]>();
  for (const noteId of noteIds) {
    const fromSessions = sessionIdsByNote.get(noteId) ?? [];
    const fromRecs = recIdsByNote.get(noteId) ?? [];
    const merged = orderedUnique([...fromSessions, ...fromRecs]);
    if (merged.length > 0) result.set(noteId, merged);
  }
  return result;
}

type ParentReplayStudent = {
  id: string;
  adminUserId: string | null;
  organizationId: string | null;
};

/**
 * A missing ConsentRecord is not a denial. Sessions can predate a record;
 * the snapshot gate below still drops a frozen denial. A present record is
 * combined with ConsentRestriction, including a self-learner's own record.
 */
const OPEN_CEILING: ConsentToggleCeiling = {
  allowLiveSession: true,
  allowAudioRecording: true,
  allowWhiteboardRecording: true,
  allowNoteSending: true,
};

type LatestConsentRow = ConsentToggleCeiling & { version: number };

function keepLatest(
  rows: Array<LatestConsentRow & { adminUserId?: string | null; organizationId?: string | null }>,
  keyOf: (row: { adminUserId?: string | null; organizationId?: string | null }) => string | null
): Map<string, ConsentToggleCeiling> {
  const map = new Map<string, LatestConsentRow>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || row.version > prev.version) map.set(key, row);
  }
  const ceilings = new Map<string, ConsentToggleCeiling>();
  for (const [key, row] of map) {
    ceilings.set(key, {
      allowLiveSession: row.allowLiveSession,
      allowAudioRecording: row.allowAudioRecording,
      allowWhiteboardRecording: row.allowWhiteboardRecording,
      allowNoteSending: row.allowNoteSending,
    });
  }
  return ceilings;
}

/**
 * Ended whiteboard sessions a parent may open from the child notes page.
 * A live session is omitted (its share URL 404s). A session is omitted when
 * its note is still DRAFT, when effective whiteboard consent is off for that
 * student's owner, or when the session snapshot froze whiteboard recording
 * off. Self-learners use their own latest record.
 */
export async function loadParentVisibleWhiteboardReplayIds(args: {
  noteIds: string[];
  learnerProfileId: string;
  students: ParentReplayStudent[];
}): Promise<Map<string, string[]>> {
  if (args.noteIds.length === 0) return new Map();

  const tutorIds = [
    ...new Set(
      args.students
        .filter((student) => !student.organizationId && student.adminUserId)
        .map((student) => student.adminUserId as string)
    ),
  ];
  const orgIds = [
    ...new Set(
      args.students
        .map((student) => student.organizationId)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const [restriction, tutorRecords, orgRecords, sessions, visibleNotes] =
    await Promise.all([
    db.consentRestriction.findUnique({
      where: { learnerProfileId: args.learnerProfileId },
      select: {
        restrictAudioRecording: true,
        restrictWhiteboardRecording: true,
        restrictNoteSending: true,
      },
    }),
    tutorIds.length === 0
      ? Promise.resolve([])
      : db.consentRecord.findMany({
          where: {
            learnerProfileId: args.learnerProfileId,
            adminUserId: { in: tutorIds },
          },
          select: {
            adminUserId: true,
            version: true,
            allowLiveSession: true,
            allowAudioRecording: true,
            allowWhiteboardRecording: true,
            allowNoteSending: true,
          },
        }),
    orgIds.length === 0
      ? Promise.resolve([])
      : db.consentRecord.findMany({
          where: {
            learnerProfileId: args.learnerProfileId,
            organizationId: { in: orgIds },
            adminUserId: null,
          },
          select: {
            organizationId: true,
            version: true,
            allowLiveSession: true,
            allowAudioRecording: true,
            allowWhiteboardRecording: true,
            allowNoteSending: true,
          },
        }),
    db.whiteboardSession.findMany({
      where: {
        noteId: { in: args.noteIds },
        endedAt: { not: null },
      },
      select: {
        id: true,
        noteId: true,
        studentId: true,
        startedAt: true,
        consentSnapshot: { select: { allowWhiteboardRecording: true } },
      },
    }),
    db.sessionNote.findMany({
      where: {
        id: { in: args.noteIds },
        status: REPLAY_VISIBLE_NOTE_STATUS,
      },
      select: { id: true },
    }),
  ]);

  const visibleNoteIds = new Set(visibleNotes.map((note) => note.id));

  const byTutor = keepLatest(tutorRecords, (row) => row.adminUserId ?? null);
  const byOrg = keepLatest(orgRecords, (row) => row.organizationId ?? null);

  const blockedStudentIds = new Set<string>();
  for (const student of args.students) {
    const record = student.organizationId
      ? (byOrg.get(student.organizationId) ?? null)
      : student.adminUserId
        ? (byTutor.get(student.adminUserId) ?? null)
        : null;
    const allowed = effectiveConsentToggles(
      record ?? OPEN_CEILING,
      restriction
    ).allowWhiteboardRecording;
    if (!allowed) blockedStudentIds.add(student.id);
  }

  const byNote = new Map<string, typeof sessions>();
  for (const session of sessions) {
    if (!session.noteId || !visibleNoteIds.has(session.noteId)) continue;
    if (blockedStudentIds.has(session.studentId)) continue;
    if (session.consentSnapshot && !session.consentSnapshot.allowWhiteboardRecording) {
      continue;
    }
    const list = byNote.get(session.noteId) ?? [];
    list.push(session);
    byNote.set(session.noteId, list);
  }

  const result = new Map<string, string[]>();
  for (const noteId of args.noteIds) {
    const list = byNote.get(noteId);
    if (!list || list.length === 0) continue;
    list.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    result.set(
      noteId,
      list.map((session) => session.id)
    );
  }
  return result;
}

/** Merge authoritative DB ids with relation payload for `ParentShareNoteCard`. */
export function mergeWhiteboardStubsForShareCard(
  note: {
    whiteboardSessions: ShareNoteWhiteboardSessionStub[];
    recordings: Array<{ whiteboardSessionId?: string | null }>;
  },
  authoritativeIds: string[] | undefined
): ShareNoteWhiteboardSessionStub[] {
  const auth = authoritativeIds ?? [];
  const ids = orderedUnique([
    ...auth,
    ...note.whiteboardSessions.map((w) => w.id),
    ...note.recordings.map((r) => r.whiteboardSessionId ?? null),
  ]);
  return ids.map((id) => ({ id }));
}
