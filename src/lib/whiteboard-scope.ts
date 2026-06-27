/**
 * Server-side ownership checks for `WhiteboardSession` rows.
 * Mirrors `student-scope.ts` for the recorder + note flow.
 *
 * Every whiteboard server action / API route MUST call
 * `assertOwnsWhiteboardSession(sessionId)` before reading or mutating
 * the session. This is the multi-tenant guard called out in
 * `docs/learning-multi-tenant.md`: never trust the client-supplied
 * sessionId without re-checking it belongs to the logged-in tutor.
 *
 * Returns a partially-loaded session shape so callers don't need a
 * second round-trip to learn the studentId, consent state, and
 * eventsBlobUrl; full row reads still go through `db.whiteboardSession`.
 */

import { notFound } from "next/navigation";
import { db, withDbRetry } from "@/lib/db";
import { canAccessStudentRow, requireStudentScope } from "@/lib/student-scope";
import { verifyIsSessionParticipant } from "@/lib/session-participant-scope";

export type AuthorisedWhiteboardSession = {
  id: string;
  adminUserId: string;
  studentId: string;
  consentAcknowledged: boolean;
  eventsBlobUrl: string;
  endedAt: Date | null;
};

/**
 * Loads the whiteboard session and asserts the logged-in tutor owns
 * the underlying student. Calls `notFound()` on miss so callers don't
 * leak existence (same trust pattern as `assertOwnsStudent`).
 */
export async function assertOwnsWhiteboardSession(
  whiteboardSessionId: string
): Promise<AuthorisedWhiteboardSession> {
  const scope = await requireStudentScope();
  const session = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: whiteboardSessionId },
        select: {
          id: true,
          adminUserId: true,
          studentId: true,
          consentAcknowledged: true,
          eventsBlobUrl: true,
          endedAt: true,
          student: { select: { adminUserId: true } },
        },
      }),
    { label: "assertOwnsWhiteboardSession" }
  );
  if (!session) notFound();
  if (!canAccessStudentRow(scope, session.student)) notFound();
  if (scope.kind === "admin" && session.adminUserId !== scope.adminId) notFound();
  return {
    id: session.id,
    adminUserId: session.adminUserId,
    studentId: session.studentId,
    consentAcknowledged: session.consentAcknowledged,
    eventsBlobUrl: session.eventsBlobUrl,
    endedAt: session.endedAt,
  };
}

/**
 * Validates a `WhiteboardJoinToken` for *client-direct* Vercel Blob
 * `whiteboard-asset` uploads from the anonymous `/w/[joinToken]` page.
 * Pathname must be under our namespaced `whiteboard-sessions/{studentId}/{sessionId}/…`
 * pattern (same as tutor uploads) so a stolen token can’t target another tenant.
 */
export async function assertJoinTokenAllowsWhiteboardAssetUpload(
  joinToken: string,
  whiteboardSessionId: string,
  pathname: string
): Promise<{ studentId: string }> {
  const now = new Date();
  const row = await withDbRetry(
    () =>
      db.whiteboardJoinToken.findUnique({
        where: { token: joinToken },
        select: {
          whiteboardSessionId: true,
          expiresAt: true,
          revokedAt: true,
          whiteboardSession: {
            select: { id: true, studentId: true, endedAt: true },
          },
        },
      }),
    { label: "assertJoinTokenAllowsWhiteboardAssetUpload" }
  );
  if (!row?.whiteboardSession) {
    throw new Error("Invalid or expired join link.");
  }
  if (row.whiteboardSessionId !== whiteboardSessionId) {
    throw new Error("Session mismatch for this upload.");
  }
  if (row.revokedAt || row.expiresAt.getTime() <= now.getTime()) {
    throw new Error("This join link is no longer valid.");
  }
  if (row.whiteboardSession.endedAt) {
    throw new Error("This whiteboard session has ended.");
  }
  const { studentId } = row.whiteboardSession;
  const expected = `whiteboard-sessions/${studentId}/${whiteboardSessionId}/`;
  if (!pathname.startsWith(expected)) {
    throw new Error("Invalid upload path for this session.");
  }
  return { studentId: row.whiteboardSession.studentId };
}

/**
 * Validates learner-session auth for `whiteboard-asset` uploads from /join pages.
 *
 * Parallel to `assertJoinTokenAllowsWhiteboardAssetUpload` but authorized by
 * an active SessionParticipant row rather than a join token. Used by the
 * `/api/upload/blob` route when the student is on the authenticated /join path
 * and sends no joinToken in the client payload.
 *
 * Applies the same path-namespace safety check to prevent a participant from
 * uploading into another session's namespace.
 */
export async function assertLearnerSessionAllowsWhiteboardAssetUpload(
  learnerProfileId: string,
  whiteboardSessionId: string,
  pathname: string
): Promise<{ studentId: string }> {
  if (!(await verifyIsSessionParticipant(learnerProfileId, whiteboardSessionId))) {
    throw new Error("Learner is not an active participant in this session.");
  }

  const session = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: whiteboardSessionId },
        select: { id: true, studentId: true, endedAt: true },
      }),
    { label: "assertLearnerSessionAllowsWhiteboardAssetUpload" }
  );

  if (!session) throw new Error("Session not found.");
  if (session.endedAt) throw new Error("This whiteboard session has ended.");

  const expected = `whiteboard-sessions/${session.studentId}/${whiteboardSessionId}/`;
  if (!pathname.startsWith(expected)) {
    throw new Error("Invalid upload path for this session.");
  }
  return { studentId: session.studentId };
}
