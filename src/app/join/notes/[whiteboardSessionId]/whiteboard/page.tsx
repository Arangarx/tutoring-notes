import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ShareWhiteboardReplayPlayer } from "@/app/s/[token]/whiteboard/[whiteboardSessionId]/ShareWhiteboardReplayPlayer";
import { assertStudentNotErased } from "@/lib/erasure/assert-student-not-erased";
import { resolveLearnerWhiteboardReplay } from "@/lib/share/learner-replay-access";
import { getLearnerSessionFromHeaders } from "@/lib/server-session";
import { buildReplayAudioPayload } from "@/lib/whiteboard/replay-audio-payload";

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
    console.error(
      `[lpr] lpr=unknown wbsid=${whiteboardSessionId} action=replay_denied reason=no_session`
    );
    redirect(`/students/login?returnTo=${encodeURIComponent(path)}`);
  }

  const access = await resolveLearnerWhiteboardReplay(
    learnerSession.learnerProfileId,
    whiteboardSessionId
  );
  if (!access.ok) notFound();

  await assertStudentNotErased(access.studentId);

  const eventsApiUrl = `/api/whiteboard/${whiteboardSessionId}/public-events`;
  const replayAudio = buildReplayAudioPayload({
    whiteboardSessionId,
    concatBlobUrl: access.session.concatBlobUrl,
    concatDurationSeconds: access.session.concatDurationSeconds,
    audioRecordings: access.session.audioRecordings,
    audience: "learner",
  });

  return (
    <main className="wb-share-replay-page" data-testid="learner-wb-replay-page">
      <header className="wb-share-replay-page__header">
        <div className="wb-share-replay-page__header-inner">
          <Link
            href="/join"
            className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            ← Back to your notes
          </Link>
          <h1 className="heading wb-share-replay-page__title">
            Whiteboard with {access.studentName}
          </h1>
        </div>
      </header>
      <div className="wb-share-replay-page__player">
        <ShareWhiteboardReplayPlayer
          eventsBlobUrl={eventsApiUrl}
          audioSegments={replayAudio.audioSegments}
          canonicalAudioBlobUrl={replayAudio.canonicalAudioBlobUrl}
          canonicalAudioMimeType={replayAudio.canonicalAudioMimeType}
          canonicalDurationSeconds={replayAudio.canonicalDurationSeconds}
          whiteboardSessionId={whiteboardSessionId}
          studentName={access.studentName}
          durationSeconds={access.session.durationSeconds}
        />
      </div>
    </main>
  );
}
