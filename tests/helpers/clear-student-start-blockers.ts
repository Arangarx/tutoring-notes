import { PrismaClient } from "@prisma/client";

/**
 * Student detail shows Resume while any whiteboard session is still open,
 * and Open room while any appointment still ends in the future.
 * Start session is the control only after both are gone.
 */
export async function clearStudentStartBlockers(studentId: string): Promise<void> {
  const prisma = new PrismaClient();
  const now = new Date();
  try {
    await prisma.whiteboardSession.updateMany({
      where: { studentId, endedAt: null },
      data: { endedAt: now },
    });
    await prisma.scheduledSession.deleteMany({
      where: { studentId, endAt: { gt: now } },
    });
  } finally {
    await prisma.$disconnect();
  }
}
