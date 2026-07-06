/**
 * @jest-environment node
 *
 * SF-2 — checkpoint cursor GREATEST update is monotonic under descending writes.
 */

import { db } from "@/lib/db";
import { uniq } from "../helpers/unique-test-token";


async function seedSession(cursors: {
  lastPersistedBatchSeq: number;
  lastPersistedToIndex: number;
}) {
  const tutor = await db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
  const student = await db.student.create({
    data: { name: "Cursor Student", adminUserId: tutor.id },
  });
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      sessionPhase: "ACTIVE",
      sessionMode: "LIVE",
      eventsBlobUrl: "https://blob.vercel-storage.com/test-events.json",
      lastPersistedBatchSeq: cursors.lastPersistedBatchSeq,
      lastPersistedToIndex: cursors.lastPersistedToIndex,
    },
  });
  return session;
}

async function applyGreatestCursor(
  sessionId: string,
  batchSeq: number,
  toEventIndex: number
) {
  await db.$executeRaw`
    UPDATE "WhiteboardSession"
    SET "lastPersistedBatchSeq" = GREATEST("lastPersistedBatchSeq", ${batchSeq}),
        "lastPersistedToIndex" = GREATEST("lastPersistedToIndex", ${toEventIndex})
    WHERE "id" = ${sessionId}
  `;
}

afterAll(async () => {
  await db.$disconnect();
});

describe("checkpoint cursor GREATEST — SF-2", () => {
  it("never regresses when a stale lower cursor write arrives after a higher one", async () => {
    const session = await seedSession({
      lastPersistedBatchSeq: 5,
      lastPersistedToIndex: 20,
    });

    await applyGreatestCursor(session.id, 3, 12);
    await applyGreatestCursor(session.id, 7, 25);

    const row = await db.whiteboardSession.findUniqueOrThrow({
      where: { id: session.id },
      select: { lastPersistedBatchSeq: true, lastPersistedToIndex: true },
    });
    expect(row.lastPersistedBatchSeq).toBe(7);
    expect(row.lastPersistedToIndex).toBe(25);
  });

  it("concurrent-ish descending then ascending writes stay monotonic", async () => {
    const session = await seedSession({
      lastPersistedBatchSeq: 0,
      lastPersistedToIndex: -1,
    });

    await Promise.all([
      applyGreatestCursor(session.id, 2, 8),
      applyGreatestCursor(session.id, 1, 4),
    ]);
    await applyGreatestCursor(session.id, 1, 3);

    const row = await db.whiteboardSession.findUniqueOrThrow({
      where: { id: session.id },
      select: { lastPersistedBatchSeq: true, lastPersistedToIndex: true },
    });
    expect(row.lastPersistedBatchSeq).toBe(2);
    expect(row.lastPersistedToIndex).toBe(8);
  });
});
