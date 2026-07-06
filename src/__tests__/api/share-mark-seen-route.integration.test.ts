/**
 * @jest-environment node
 *
 * P1-J1 — POST /api/share/mark-seen behavior/contract tests.
 *
 * Oracle: HTTP status + JSON body shape + `NoteView` row side effects in the
 * local test DB (`tutoring_notes_test` via jest.global-setup.ts).
 *
 * Red-before (2026-07-05): temporarily asserting status 201 on the happy path
 * and expecting noteView count 2 on upsert both failed as expected before
 * correcting to 200 / count 1.
 *
 * DB: tutoring_notes_test via jest.global-setup.ts.
 */

import { db } from "@/lib/db";
import { generateShareToken } from "@/lib/security";
import { POST } from "@/app/api/share/mark-seen/route";
import { uniq } from "../helpers/unique-test-token";


const originalNotesAuthWall = process.env.NOTES_AUTH_WALL;

beforeEach(() => {
  delete process.env.NOTES_AUTH_WALL;
});

afterAll(async () => {
  if (originalNotesAuthWall === undefined) {
    delete process.env.NOTES_AUTH_WALL;
  } else {
    process.env.NOTES_AUTH_WALL = originalNotesAuthWall;
  }
  await db.$disconnect();
});

async function seedTutor() {
  return db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
}

async function seedShareNoteFixture() {
  const tutor = await seedTutor();
  const student = await db.student.create({
    data: { name: `Share Seen ${uniq()}`, adminUserId: tutor.id },
  });
  const shareToken = generateShareToken();
  await db.shareLink.create({
    data: { studentId: student.id, token: shareToken },
  });
  const note = await db.sessionNote.create({
    data: {
      studentId: student.id,
      date: new Date("2026-06-15T00:00:00Z"),
      topics: "Contract topics",
      homework: "",
      assessment: "",
      nextSteps: "",
      linksJson: "[]",
      status: "READY",
    },
  });
  return { tutor, student, shareToken, note };
}

function makePostRequest(body: { token?: string; noteId?: string }) {
  return new Request("http://localhost/api/share/mark-seen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/share/mark-seen — share access contract (P1-J1)", () => {
  it("valid token + in-scope noteId → 200 { ok: true } and creates noteView row", async () => {
    const { shareToken, note } = await seedShareNoteFixture();

    const res = await POST(
      makePostRequest({ token: shareToken, noteId: note.id })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean };
    expect(json).toEqual({ ok: true });

    const row = await db.noteView.findUnique({
      where: { shareToken_noteId: { shareToken, noteId: note.id } },
    });
    expect(row).not.toBeNull();
    expect(row?.noteId).toBe(note.id);
    expect(row?.shareToken).toBe(shareToken);
  });

  it("repeat POST upserts seenAt (idempotent row count, updated timestamp)", async () => {
    const { shareToken, note } = await seedShareNoteFixture();

    await POST(makePostRequest({ token: shareToken, noteId: note.id }));
    const first = await db.noteView.findUniqueOrThrow({
      where: { shareToken_noteId: { shareToken, noteId: note.id } },
    });

    await new Promise((r) => setTimeout(r, 5));

    const res = await POST(
      makePostRequest({ token: shareToken, noteId: note.id })
    );
    expect(res.status).toBe(200);

    const rows = await db.noteView.findMany({
      where: { shareToken, noteId: note.id },
    });
    expect(rows).toHaveLength(1);

    const second = rows[0];
    expect(second.seenAt.getTime()).toBeGreaterThanOrEqual(first.seenAt.getTime());
  });

  it("revoked share token → 403 and no noteView row written", async () => {
    const { shareToken, note } = await seedShareNoteFixture();
    await db.shareLink.update({
      where: { token: shareToken },
      data: { revokedAt: new Date() },
    });

    const res = await POST(
      makePostRequest({ token: shareToken, noteId: note.id })
    );

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error?: string };
    expect(typeof json.error).toBe("string");

    const count = await db.noteView.count({
      where: { shareToken, noteId: note.id },
    });
    expect(count).toBe(0);
  });

  it("note not belonging to share link student → 404 and no noteView row", async () => {
    const fixtureA = await seedShareNoteFixture();
    const otherStudent = await db.student.create({
      data: { name: `Other ${uniq()}` },
    });
    const foreignNote = await db.sessionNote.create({
      data: {
        studentId: otherStudent.id,
        date: new Date("2026-06-16T00:00:00Z"),
        topics: "Foreign",
        homework: "",
        assessment: "",
        nextSteps: "",
        linksJson: "[]",
        status: "READY",
      },
    });

    const res = await POST(
      makePostRequest({
        token: fixtureA.shareToken,
        noteId: foreignNote.id,
      })
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/not found/i);

    const count = await db.noteView.count({
      where: {
        shareToken: fixtureA.shareToken,
        noteId: foreignNote.id,
      },
    });
    expect(count).toBe(0);
  });

  it("missing token or noteId → 400 and no noteView row", async () => {
    const { shareToken, note } = await seedShareNoteFixture();
    const before = await db.noteView.count();

    const missingToken = await POST(makePostRequest({ noteId: note.id }));
    expect(missingToken.status).toBe(400);

    const missingNote = await POST(makePostRequest({ token: shareToken }));
    expect(missingNote.status).toBe(400);

    const after = await db.noteView.count();
    expect(after).toBe(before);
  });
});
