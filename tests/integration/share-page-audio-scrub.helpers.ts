import { PrismaClient } from "@prisma/client";
import { generateShareToken } from "@/lib/security";
import { seedTestAdmin } from "../visual/helpers";

const { assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

function uniq(prefix = "pw-share-audio") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type ShareAudioDenyFixture = {
  shareToken: string;
  revokedShareToken: string;
  recordingId: string;
  sessionId: string;
  studentId: string;
  foreignRecordingId: string;
};

/**
 * Minimal ended-session + share-link fixture for access-scope deny oracles.
 * Blob URLs are placeholders — deny tests assert HTTP status, not playback.
 */
export async function seedShareAudioDenyFixture(): Promise<ShareAudioDenyFixture> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();

  try {
    const adminUserId = await seedTestAdmin();
    const student = await prisma.student.create({
      data: {
        name: `Share Audio Deny ${uniq()}`,
        adminUserId,
        parentEmail: `${uniq("parent")}@test.local`,
      },
      select: { id: true },
    });

    const shareToken = generateShareToken();
    const revokedShareToken = generateShareToken();
    await prisma.shareLink.createMany({
      data: [
        { studentId: student.id, token: shareToken },
        {
          studentId: student.id,
          token: revokedShareToken,
          revokedAt: new Date("2026-06-01T12:00:00Z"),
        },
      ],
    });

    const session = await prisma.whiteboardSession.create({
      data: {
        adminUserId,
        studentId: student.id,
        consentAcknowledged: true,
        eventsBlobUrl: "http://127.0.0.1:3101/api/setup-required",
        snapshotBlobUrl: "http://127.0.0.1:3101/api/setup-required",
        eventsSchemaVersion: 1,
        endedAt: new Date("2026-06-01T18:00:00Z"),
      },
      select: { id: true },
    });

    const note = await prisma.sessionNote.create({
      data: {
        studentId: student.id,
        date: new Date("2026-06-01T00:00:00Z"),
        topics: "Share audio deny oracle",
        homework: "",
        assessment: "",
        nextSteps: "",
        linksJson: "[]",
        status: "READY",
        shareRecordingInEmail: true,
      },
      select: { id: true },
    });

    const recording = await prisma.sessionRecording.create({
      data: {
        adminUserId,
        studentId: student.id,
        noteId: note.id,
        whiteboardSessionId: session.id,
        blobUrl: "http://127.0.0.1:3101/api/setup-required",
        mimeType: "audio/webm",
        sizeBytes: 1024,
        durationSeconds: 8,
      },
      select: { id: true },
    });

    const foreignStudent = await prisma.student.create({
      data: {
        name: `Foreign Share Audio ${uniq()}`,
        adminUserId,
      },
      select: { id: true },
    });

    const foreignRecording = await prisma.sessionRecording.create({
      data: {
        adminUserId,
        studentId: foreignStudent.id,
        blobUrl: "http://127.0.0.1:3101/api/setup-required",
        mimeType: "audio/webm",
        sizeBytes: 512,
      },
      select: { id: true },
    });

    return {
      shareToken,
      revokedShareToken,
      recordingId: recording.id,
      sessionId: session.id,
      studentId: student.id,
      foreignRecordingId: foreignRecording.id,
    };
  } finally {
    await prisma.$disconnect();
  }
}

export async function resolveShareTokenForStudent(
  studentId: string
): Promise<string> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const link = await prisma.shareLink.findFirst({
      where: { studentId, revokedAt: null },
      orderBy: { createdAt: "asc" },
      select: { token: true },
    });
    if (!link) {
      throw new Error(`No active share link for student ${studentId}`);
    }
    return link.token;
  } finally {
    await prisma.$disconnect();
  }
}
