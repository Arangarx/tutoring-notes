import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { WhiteboardReplayPageShell } from "@/components/whiteboard/replay/WhiteboardReplayPageShell";
import { assertStudentNotErased } from "@/lib/erasure/assert-student-not-erased";
import {
  logLearnerReplayNoSession,
  resolveLearnerWhiteboardReplay,
} from "@/lib/share/learner-replay-access";
import { getLearnerSessionFromHeaders } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ whiteboardSessionId: string }>;
}): Promise<Metadata> {
  const { whiteboardSessionId } = await params;
  return {
    title: `Whiteboard recording — ${whiteboardSessionId.slice(0, 8)}`,
    robots: { index: false, follow: false },
  };
}

/**
 * Learner-session whiteboard replay.
 *
 * Route: /join/notes/[whiteboardSessionId]/whiteboard
 *
 * The child home links here when a saved note has a replay and no share
 * token. Access is the learner session plus the same ended / note-linked /
 * consent rules as the parent share card. Blob bytes stay on the
 * public-events and audio proxies, which accept this same principal.
 */
export default async function LearnerWhiteboardReplayPage({
  params,
}: {
  params: Promise<{ whiteboardSessionId: string }>;
}) {
  const { whiteboardSessionId } = await params;
  const path = `/join/notes/${whiteboardSessionId}/whiteboard`;

  const learnerSession = await getLearnerSessionFromHeaders();
  if (!learnerSession) {
    logLearnerReplayNoSession({ whiteboardSessionId });
    redirect(`/students/login?returnTo=${encodeURIComponent(path)}`);
  }

  const access = await resolveLearnerWhiteboardReplay(
    learnerSession.learnerProfileId,
    whiteboardSessionId
  );
  if (!access.ok) notFound();

  await assertStudentNotErased(access.studentId);

  return (
    <WhiteboardReplayPageShell
      testId="learner-wb-replay-page"
      backHref="/join"
      backLabel="← Back to your notes"
      title={`Whiteboard with ${access.studentName}`}
      whiteboardSessionId={whiteboardSessionId}
      studentName={access.studentName}
      durationSeconds={access.session.durationSeconds}
      concatBlobUrl={access.session.concatBlobUrl}
      concatDurationSeconds={access.session.concatDurationSeconds}
      audioRecordings={access.session.audioRecordings}
      audience="learner"
    />
  );
}
