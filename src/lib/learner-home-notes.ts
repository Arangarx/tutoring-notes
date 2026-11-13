import { db } from "@/lib/db";
import { formatDateOnlyDisplay } from "@/lib/date-only";
import type { ParentShareNoteModel } from "@/components/notes/ParentShareNoteCard";
import { parentShareNoteInclude } from "@/lib/share/parentShareNotePayload";
import {
  REPLAY_VISIBLE_NOTE_STATUS,
  applyReplayAccessToNotes,
} from "@/lib/share/loadWhiteboardReplayIdsForNotes";

export type LearnerHomeNoteCard = {
  id: string;
  dateLabel: string;
  token: string;
  replaySessionIds: string[];
  note: ParentShareNoteModel;
};

/**
 * Ended-session notes and replay ids for one learner. Parent notes and the
 * child home both render these with ParentShareNoteCard.
 */
export async function loadLearnerHomeNotes(learnerProfileId: string): Promise<{
  tutorCount: number;
  notes: LearnerHomeNoteCard[];
}> {
  const students = await db.student.findMany({
    where: { learnerProfileId },
    select: { id: true, adminUserId: true, organizationId: true },
  });
  const studentIds = students.map((student) => student.id);
  if (studentIds.length === 0) return { tutorCount: 0, notes: [] };

  const shareLinks = await db.shareLink.findMany({
    where: { studentId: { in: studentIds }, revokedAt: null },
    select: { studentId: true, token: true },
    orderBy: { createdAt: "desc" },
  });
  const shareTokenByStudentId = new Map<string, string>();
  for (const link of shareLinks) {
    if (!shareTokenByStudentId.has(link.studentId)) {
      shareTokenByStudentId.set(link.studentId, link.token);
    }
  }

  const notes = await db.sessionNote.findMany({
    where: {
      studentId: { in: studentIds },
      status: REPLAY_VISIBLE_NOTE_STATUS,
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      ...parentShareNoteInclude,
      student: { select: { id: true } },
    },
  });

  const replayByNote = await applyReplayAccessToNotes(notes);

  return {
    tutorCount: students.length,
    notes: notes.map((note) => {
      const replay = replayByNote.get(note.id);
      return {
        id: note.id,
        dateLabel: formatDateOnlyDisplay(note.date),
        token: shareTokenByStudentId.get(note.student.id) ?? "",
        replaySessionIds: replay?.replaySessionIds ?? [],
        note: {
          id: note.id,
          date: note.date,
          startTime: note.startTime,
          endTime: note.endTime,
          template: note.template,
          topics: note.topics,
          homework: note.homework,
          assessment: note.assessment,
          nextSteps: note.nextSteps,
          linksJson: note.linksJson,
          shareRecordingInEmail: note.shareRecordingInEmail,
          recordings: replay?.recordings ?? [],
          whiteboardSessions: replay?.whiteboardSessions ?? [],
        },
      };
    }),
  };
}
