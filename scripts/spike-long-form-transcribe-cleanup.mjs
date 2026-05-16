/**
 * Delete all SessionRecording rows for a spike test student and remove blobs.
 * Safety: student name must include "SPIKE_TEST" (case-insensitive).
 *
 * Usage:
 *   node scripts/spike-long-form-transcribe-cleanup.mjs --student-id=<uuid>
 *
 * Env: DATABASE_URL, BLOB_READ_WRITE_TOKEN (same as the app).
 */
import { del } from "@vercel/blob";
import { PrismaClient } from "@prisma/client";

function parseStudentId(argv) {
  const raw = argv.find((a) => a.startsWith("--student-id="));
  if (!raw) {
    console.error("Required: --student-id=<uuid>");
    process.exit(1);
  }
  return raw.slice("--student-id=".length);
}

async function deleteBlobSafe(url) {
  try {
    await del(url);
    console.log("Deleted blob", url.slice(0, 72) + "…");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
      console.log("Blob already absent", url.slice(0, 64) + "…");
      return;
    }
    throw err;
  }
}

async function main() {
  const studentId = parseStudentId(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, name: true },
    });
    if (!student) {
      console.error("Student not found:", studentId);
      process.exit(1);
    }
    if (!/SPIKE_TEST/i.test(student.name)) {
      console.error(
        "Refusing cleanup: student name must contain SPIKE_TEST (got:",
        student.name,
        ")"
      );
      process.exit(1);
    }

    const recs = await prisma.sessionRecording.findMany({
      where: { studentId },
      select: { id: true, blobUrl: true },
    });
    console.log(`Found ${recs.length} recording(s) for ${student.name}`);

    for (const r of recs) {
      await deleteBlobSafe(r.blobUrl);
    }

    const { count } = await prisma.sessionRecording.deleteMany({ where: { studentId } });
    console.log("Deleted SessionRecording rows:", count);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
