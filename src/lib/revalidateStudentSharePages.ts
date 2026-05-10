import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

/**
 * Invalidate parent/student-facing share routes for every active token on this
 * student. Used when notes ↔ recordings ↔ whiteboards change shape that the
 * `/s/[token]` pages derive from SSR queries.
 */
export async function revalidateStudentSharePages(studentId: string): Promise<void> {
  const links = await db.shareLink.findMany({
    where: { studentId, revokedAt: null },
    select: { token: true },
  });
  for (const { token } of links) {
    revalidatePath(`/s/${token}`);
    revalidatePath(`/s/${token}/all`);
  }
}
