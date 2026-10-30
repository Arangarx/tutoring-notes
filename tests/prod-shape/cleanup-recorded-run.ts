/**
 * Deletes exactly the blobs and local DB rows this prod-shape run created.
 *
 * The only blob the suite's product path writes is the empty events log from
 * `createWhiteboardSessionCore`:
 *   whiteboard-sessions/{adminUserId}/{studentId}/{ms}-events.json
 *   (`addRandomSuffix: true`, so the filename grows a random tail).
 * That path is keyed by the tutor and the student, not the session id.
 * The student id is one this run just inserted. Listing
 * `whiteboard-sessions/{adminUserId}/` would also match older local sessions
 * for the shared Playwright tutor, so that prefix is never used.
 *
 * Two other session-scoped namespaces exist in product code and are listed
 * only for session ids recorded this run (they are empty unless something
 * under that id wrote them):
 *   whiteboard-checkpoints/{sessionId}/          — legacy checkpoint route
 *   whiteboard-sessions/{studentId}/{sessionId}/ — end-of-session events,
 *                                                  snapshot, and assets
 *
 * Refused-start rows use a placeholder events URL and write no blob. The
 * success-path Start does. Cleanup still runs for every recorded student.
 */

import "./cleanup-env";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { deleteBlob } from "@/lib/blob";
import { listBlobsByPrefix } from "@/lib/blob-list";

const { applyWbRegressionLocalDatabaseEnv, assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Names `seedStudentWithConsent` and `seedPendingWithoutConsent` actually write. */
const STUDENT_NAME_RE =
  /^(Ready start |Refused self learner |Refused parent held |Refused unclaimed )[0-9a-z]+$/;

const HOLDER_EMAIL_RE = /^pw-(ready|refused)-[0-9a-z]+@test\.local$/;

type RecordedStudent = {
  studentId: string;
  adminUserId: string;
  whiteboardSessionIds: Set<string>;
};

const recorded = new Map<string, RecordedStudent>();

function assertUuid(id: string, label: string): void {
  if (!UUID_RE.test(id)) {
    throw new Error(`prod-shape cleanup refused a non-uuid ${label}`);
  }
}

export function recordProdShapeStudent(args: {
  studentId: string;
  adminUserId: string;
  whiteboardSessionId?: string;
}): void {
  assertUuid(args.studentId, "studentId");
  assertUuid(args.adminUserId, "adminUserId");
  if (args.whiteboardSessionId) assertUuid(args.whiteboardSessionId, "whiteboardSessionId");
  let row = recorded.get(args.studentId);
  if (!row) {
    row = {
      studentId: args.studentId,
      adminUserId: args.adminUserId,
      whiteboardSessionIds: new Set(),
    };
    recorded.set(args.studentId, row);
  } else if (row.adminUserId !== args.adminUserId) {
    throw new Error("prod-shape cleanup refused: student recorded under two tutors");
  }
  if (args.whiteboardSessionId) row.whiteboardSessionIds.add(args.whiteboardSessionId);
}

/**
 * Prefixes for one recorded student. Every prefix contains that student's id
 * or a session id recorded for them as a full path segment. Never the tutor
 * id alone.
 */
export function prefixesForRecordedStudent(
  row: RecordedStudent,
  sessionIds: readonly string[]
): string[] {
  assertUuid(row.studentId, "studentId");
  assertUuid(row.adminUserId, "adminUserId");
  const prefixes = [`whiteboard-sessions/${row.adminUserId}/${row.studentId}/`];
  for (const sessionId of sessionIds) {
    assertUuid(sessionId, "sessionId");
    prefixes.push(`whiteboard-checkpoints/${sessionId}/`);
    prefixes.push(`whiteboard-sessions/${row.studentId}/${sessionId}/`);
  }
  for (const prefix of prefixes) {
    const segments = prefix.split("/").filter(Boolean);
    const mentionsStudent = segments.includes(row.studentId);
    const mentionsSession = sessionIds.some((id) => segments.includes(id));
    if (!mentionsStudent && !mentionsSession) {
      throw new Error("prod-shape cleanup refused a prefix that is not session- or student-scoped");
    }
    if (segments.length < 2) {
      throw new Error("prod-shape cleanup refused a short prefix");
    }
  }
  return prefixes;
}

function pathnameUnderPrefix(pathname: string, prefix: string): boolean {
  const normalized = pathname.replace(/^\/+/, "");
  const expected = prefix.replace(/^\/+/, "");
  return normalized.startsWith(expected) && !normalized.includes("..");
}

type CleanupLine = {
  prefix: string;
  before: number;
  after: number;
  pathnames: string[];
};

let reportReset = false;

function rememberLine(line: CleanupLine): void {
  console.log(`[prod-shape-cleanup] ${JSON.stringify(line)}`);
  const dir = path.join(process.cwd(), "test-results");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "prod-shape-blob-cleanup.json");
  if (!reportReset) {
    reportReset = true;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  const prior: CleanupLine[] = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, "utf8")) as CleanupLine[])
    : [];
  prior.push(line);
  fs.writeFileSync(file, JSON.stringify(prior, null, 2));
}

async function deletePrefix(prefix: string, allowedIds: readonly string[]): Promise<void> {
  const segments = prefix.split("/").filter(Boolean);
  if (!allowedIds.some((id) => segments.includes(id))) {
    throw new Error("prod-shape cleanup refused a prefix outside the recorded ids");
  }
  const before = await listBlobsByPrefix(prefix);
  const pathnames: string[] = [];
  for (const blob of before) {
    if (!pathnameUnderPrefix(blob.pathname, prefix)) {
      throw new Error("prod-shape cleanup refused a listed blob outside the recorded prefix");
    }
    if (!allowedIds.some((id) => blob.pathname.split("/").includes(id))) {
      throw new Error("prod-shape cleanup refused a listed blob that lacks a recorded id");
    }
    pathnames.push(blob.pathname);
  }
  for (const blob of before) {
    await deleteBlob(blob.url);
  }
  const after = await listBlobsByPrefix(prefix);
  rememberLine({ prefix, before: before.length, after: after.length, pathnames });
  if (after.length !== 0) {
    throw new Error(`prod-shape cleanup left ${after.length} blob(s) under ${prefix}`);
  }
}

async function deleteDbRows(row: RecordedStudent, sessionIds: string[]): Promise<void> {
  applyWbRegressionLocalDatabaseEnv();
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const student = await prisma.student.findUnique({
      where: { id: row.studentId },
      select: {
        id: true,
        name: true,
        adminUserId: true,
        learnerProfileId: true,
        learnerProfile: {
          select: { accountHolderId: true, accountHolder: { select: { email: true } } },
        },
      },
    });
    if (!student) return;
    if (student.adminUserId !== row.adminUserId) {
      throw new Error("prod-shape cleanup refused: recorded student belongs to another tutor");
    }
    if (!STUDENT_NAME_RE.test(student.name)) {
      throw new Error("prod-shape cleanup refused: student name is not a prod-shape fixture");
    }
    const holderEmail = student.learnerProfile?.accountHolder.email ?? null;
    const holderId = student.learnerProfile?.accountHolderId ?? null;
    if (holderEmail && !HOLDER_EMAIL_RE.test(holderEmail)) {
      throw new Error("prod-shape cleanup refused: account holder email is not a prod-shape fixture");
    }
    const profileId = student.learnerProfileId;
    await prisma.$transaction(async (tx) => {
      if (sessionIds.length > 0) {
        await tx.sessionConsentSnapshot.deleteMany({
          where: { whiteboardSessionId: { in: sessionIds } },
        });
        await tx.productEvent.deleteMany({
          where: {
            OR: [{ studentId: row.studentId }, { whiteboardSessionId: { in: sessionIds } }],
          },
        });
        await tx.costEvent.deleteMany({
          where: {
            OR: [{ studentId: row.studentId }, { whiteboardSessionId: { in: sessionIds } }],
          },
        });
      } else {
        await tx.productEvent.deleteMany({ where: { studentId: row.studentId } });
        await tx.costEvent.deleteMany({ where: { studentId: row.studentId } });
      }
      await tx.student.delete({ where: { id: row.studentId } });
      if (profileId) {
        await tx.consentRecord.deleteMany({ where: { learnerProfileId: profileId } });
        await tx.learnerProfile.delete({ where: { id: profileId } });
      }
      if (holderId) {
        const left = await tx.learnerProfile.count({ where: { accountHolderId: holderId } });
        if (left === 0) await tx.accountHolder.delete({ where: { id: holderId } });
      }
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanupOne(row: RecordedStudent): Promise<void> {
  applyWbRegressionLocalDatabaseEnv();
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  let sessionIds: string[] = [];
  try {
    const sessions = await prisma.whiteboardSession.findMany({
      where: { studentId: row.studentId, adminUserId: row.adminUserId },
      select: { id: true },
    });
    for (const session of sessions) {
      assertUuid(session.id, "sessionId");
      row.whiteboardSessionIds.add(session.id);
    }
    sessionIds = [...row.whiteboardSessionIds];
  } finally {
    await prisma.$disconnect();
  }

  // The tutor id is not enough: older blobs for the shared Playwright tutor
  // live under whiteboard-sessions/{adminUserId}/. Only this student and the
  // session ids discovered for them may appear in a deleted pathname.
  const allowedIds = [row.studentId, ...sessionIds];
  for (const prefix of prefixesForRecordedStudent(row, sessionIds)) {
    await deletePrefix(prefix, allowedIds);
  }
  await deleteDbRows(row, sessionIds);
}

/** afterEach and afterAll. A failure still reaches this; an empty registry does nothing. */
export async function cleanupProdShapeRun(): Promise<void> {
  const pending = [...recorded.values()];
  for (const row of pending) {
    await cleanupOne(row);
    recorded.delete(row.studentId);
  }
}
