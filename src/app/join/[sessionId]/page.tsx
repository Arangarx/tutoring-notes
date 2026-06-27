/**
 * /join/[sessionId] — authenticated learner live-session entry point.
 *
 * AUTH BOUNDARY (BLOCKERs):
 *   - Learner principal ONLY (mynk_learner_session cookie). Tutor and
 *     account-holder sessions do NOT satisfy this route.
 *   - Participant gate: learnerProfileId must have an active
 *     SessionParticipant row for this session. Learner A cannot reach
 *     learner B's session → 404.
 *   - Fragment preservation: a server redirect cannot carry #k=, so the
 *     unauthenticated path renders a client component (JoinAuthGate) that
 *     saves the fragment then redirects to /students/login.
 *
 * The E2E whiteboard encryption key stays CLIENT-ONLY in the URL fragment
 * #k=<key>. The server NEVER sees it.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getLearnerSessionFromHeaders } from "@/lib/server-session";
import { assertIsSessionParticipant } from "@/lib/session-participant-scope";
import { WhiteboardSessionShell } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardSessionShell";
import { JoinAuthGate } from "./JoinAuthGate";
import { JoinHashRestorer } from "./JoinHashRestorer";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Whiteboard session",
    robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  };
}

type RouteParams = { sessionId: string };

export default async function JoinSessionPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { sessionId } = await params;

  // AUTH BOUNDARY: learner-only. getLearnerSessionFromHeaders reads
  // mynk_learner_session; tutor/parent NextAuth sessions are ignored.
  const learnerSession = await getLearnerSessionFromHeaders();
  if (!learnerSession) {
    // Cannot use redirect() — must preserve #k= fragment in the client.
    return <JoinAuthGate sessionId={sessionId} />;
  }

  // AUTH BOUNDARY: participant gate (BLOCKER).
  // assertIsSessionParticipant calls notFound() on mismatch or leftAt set.
  await assertIsSessionParticipant(learnerSession.learnerProfileId, sessionId);

  const session = await db.whiteboardSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      studentId: true,
      endedAt: true,
      sessionPhase: true,
      activeMs: true,
      lastActiveAt: true,
      adminUser: {
        select: { displayName: true, email: true },
      },
    },
  });

  if (!session) notFound();

  const tutorName =
    session.adminUser?.displayName?.trim() ||
    session.adminUser?.email?.split("@")[0] ||
    "your tutor";

  if (session.endedAt) {
    return (
      <main className="container" style={{ maxWidth: 720, padding: "2rem" }}>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Session ended</h1>
          <p>
            This whiteboard session has ended. Your tutor may have shared notes
            or a replay link with you.
          </p>
        </div>
      </main>
    );
  }

  if (!env.WHITEBOARD_SYNC_URL) {
    return (
      <main className="container" style={{ maxWidth: 720, padding: "2rem" }}>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Whiteboard not available</h1>
          <p>
            Live whiteboard collaboration is not enabled in this environment.
            Please ask {tutorName} to share a recording link instead.
          </p>
        </div>
      </main>
    );
  }

  // JoinHashRestorer runs before the student shell so the #k= fragment is
  // in place when the shell's key-read effect fires.
  return (
    <JoinHashRestorer sessionId={sessionId}>
      <WhiteboardSessionShell
        role="student"
        whiteboardSessionId={session.id}
        studentId={session.studentId}
        syncUrl={env.WHITEBOARD_SYNC_URL}
        tutorName={tutorName}
        initialActiveMs={session.activeMs ?? 0}
        initialLastActiveAtIso={session.lastActiveAt?.toISOString() ?? null}
        initialSessionPhase={
          (session.sessionPhase as "PENDING" | "ACTIVE" | undefined) ?? "ACTIVE"
        }
      />
    </JoinHashRestorer>
  );
}
