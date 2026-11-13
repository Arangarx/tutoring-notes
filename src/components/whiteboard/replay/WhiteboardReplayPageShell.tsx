import type { ReactNode } from "react";
import Link from "next/link";
import { ShareWhiteboardReplayPlayer } from "@/app/s/[token]/whiteboard/[whiteboardSessionId]/ShareWhiteboardReplayPlayer";
import { ReplayBoardNotSavedNotice } from "@/components/whiteboard/replay/ReplayBoardNotSavedNotice";
import {
  buildReplayAudioPayload,
  replayProxyUrl,
  type ReplayProxyAudience,
  type SessionRecordingReplayRow,
} from "@/lib/whiteboard/replay-audio-payload";

export type WhiteboardReplayPageShellProps = {
  testId: string;
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: ReactNode;
  whiteboardSessionId: string;
  studentName: string;
  durationSeconds: number | null;
  concatBlobUrl: string | null;
  concatDurationSeconds: number | null;
  audioRecordings: readonly SessionRecordingReplayRow[];
  /** Share appends the token. Learner uses the learner session on the same proxies. */
  audience: Extract<ReplayProxyAudience, "share" | "learner">;
  shareToken?: string;
  /** Which halves of the replay the one replay decision allows (`resolveReplayAccess`). */
  replay: { audio: boolean; board: boolean };
};

/**
 * Header and player shell shared by the share-token replay page and the
 * signed-in learner replay page. Back link, labels, and audience (which
 * builds the event and audio URLs) are the only differences.
 */
export function WhiteboardReplayPageShell(props: WhiteboardReplayPageShellProps) {
  // A half the replay decision denies is never requested: the proxy would 404 it.
  const eventsApiUrl = props.replay.board
    ? replayProxyUrl({
        resource: "events",
        whiteboardSessionId: props.whiteboardSessionId,
        audience: props.audience,
        shareToken: props.shareToken,
      })
    : null;
  const replayAudio = buildReplayAudioPayload({
    whiteboardSessionId: props.whiteboardSessionId,
    concatBlobUrl: props.replay.audio ? props.concatBlobUrl : null,
    concatDurationSeconds: props.replay.audio ? props.concatDurationSeconds : null,
    audioRecordings: props.replay.audio ? props.audioRecordings : [],
    audience: props.audience,
    shareToken: props.shareToken,
  });

  return (
    <main className="wb-share-replay-page" data-testid={props.testId}>
      <header className="wb-share-replay-page__header">
        <div className="wb-share-replay-page__header-inner">
          <Link
            href={props.backHref}
            className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {props.backLabel}
          </Link>
          <h1 className="heading wb-share-replay-page__title">{props.title}</h1>
          {props.subtitle ? (
            <p className="wb-share-replay-page__subtitle">{props.subtitle}</p>
          ) : null}
        </div>
      </header>
      <div className="wb-share-replay-page__player">
        {props.replay.board ? null : <ReplayBoardNotSavedNotice />}
        <ShareWhiteboardReplayPlayer
          eventsBlobUrl={eventsApiUrl}
          audioSegments={replayAudio.audioSegments}
          canonicalAudioBlobUrl={replayAudio.canonicalAudioBlobUrl}
          canonicalAudioMimeType={replayAudio.canonicalAudioMimeType}
          canonicalDurationSeconds={replayAudio.canonicalDurationSeconds}
          whiteboardSessionId={props.whiteboardSessionId}
          studentName={props.studentName}
          durationSeconds={props.durationSeconds}
        />
      </div>
    </main>
  );
}
