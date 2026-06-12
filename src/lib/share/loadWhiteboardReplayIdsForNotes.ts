import { db } from "@/lib/db";
import type { ShareNoteWhiteboardSessionStub } from "@/components/notes/ParentShareNoteCard";
import { orderedUnique } from "@/lib/notes/display-utils";

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
