import { PrismaClient } from "@prisma/client";

/**
 * Ended sessions have no note until Save. A share link opens the replay
 * only once that note is READY (or SENT). DRAFT and a missing note are
 * `note_not_visible`.
 */
export async function promoteSessionNoteReady(whiteboardSessionId: string): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const session = await prisma.whiteboardSession.findUnique({
      where: { id: whiteboardSessionId },
      select: { noteId: true, studentId: true },
    });
    if (!session) {
      throw new Error(`whiteboard session missing: ${whiteboardSessionId}`);
    }
    let noteId = session.noteId;
    if (!noteId) {
      const created = await prisma.sessionNote.create({
        data: {
          studentId: session.studentId,
          date: new Date("2026-10-01T00:00:00.000Z"),
          topics: "Share replay viewport",
          homework: "",
          nextSteps: "",
          status: "READY",
        },
        select: { id: true },
      });
      noteId = created.id;
      await prisma.whiteboardSession.update({
        where: { id: whiteboardSessionId },
        data: { noteId },
      });
    } else {
      await prisma.sessionNote.update({
        where: { id: noteId },
        data: { status: "READY" },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}
