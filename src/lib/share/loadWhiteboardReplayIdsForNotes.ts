import { db } from "@/lib/db";
import type { ShareNoteWhiteboardSessionStub } from "@/components/notes/ParentShareNoteCard";
import { orderedUnique } from "@/lib/notes/display-utils";
import { replayAccessAny, resolveReplayAccess } from "@/lib/share/replay-access";

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
 *
 * This is the note → session LINK structure only. It decides nothing about what
 * may be replayed: {@link applyReplayAccessToNotes} filters it through
 * `resolveReplayAccess`.
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

/** What a note card needs to know about the sessions and recordings linked to its note. */
type ReplayCardRecording = { whiteboardSessionId?: string | null };
type ReplayCardNote<R extends ReplayCardRecording> = {
  id: string;
  whiteboardSessions: ShareNoteWhiteboardSessionStub[];
  recordings: R[];
};

export type ReplayCardInputs<R> = {
  /** Linked sessions the viewer may replay (audio or board), newest first. The only replay links a card shows. */
  replaySessionIds: string[];
  /** Stubs for those sessions only, in the shape `ParentShareNoteCard` takes. */
  whiteboardSessions: ShareNoteWhiteboardSessionStub[];
  /** The note's recordings, minus any tied to a session whose replay audio is off. Email-only recordings stay. */
  recordings: R[];
};

/**
 * Filters the replays linked to a set of notes through `resolveReplayAccess`, the one replay decision
 * (plan § 2.9). Used by every list that renders `ParentShareNoteCard`: the share pages, the parent notes page and
 * the child home. A session is listed when it ended and either half (audio or board) may be replayed; a session
 * the frozen snapshot allows neither of is not listed and its recordings are not offered inline.
 *
 * The caller has already restricted `notes` to a replay-visible note status. Notes with no linked session still
 * get an entry (empty lists) so a caller can index by note id.
 */
export async function applyReplayAccessToNotes<R extends ReplayCardRecording>(
  notes: readonly ReplayCardNote<R>[]
): Promise<Map<string, ReplayCardInputs<R>>> {
  const authoritative = await loadWhiteboardReplayIdsByNoteIds(notes.map((n) => n.id));
  const stubsByNote = new Map(
    notes.map((n) => [n.id, mergeWhiteboardStubsForShareCard(n, authoritative.get(n.id))] as const)
  );
  const access = await resolveReplayAccess(
    orderedUnique([...stubsByNote.values()].flatMap((stubs) => stubs.map((s) => s.id)))
  );

  const result = new Map<string, ReplayCardInputs<R>>();
  for (const note of notes) {
    const visible = (stubsByNote.get(note.id) ?? []).filter((s) => replayAccessAny(access.get(s.id)));
    result.set(note.id, {
      replaySessionIds: visible.map((s) => s.id),
      whiteboardSessions: visible,
      recordings: note.recordings.filter(
        (r) => !r.whiteboardSessionId || access.get(r.whiteboardSessionId)?.audio === true
      ),
    });
  }
  return result;
}
