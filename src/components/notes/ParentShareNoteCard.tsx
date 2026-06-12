import type { ReactNode } from "react";
import Link from "next/link";
import { SeenTracker } from "@/app/s/[token]/SeenTracker";
import { Badge } from "@/components/ui/badge";
import {
  formatNoteDurationLabel,
  formatNoteTime,
  orderedUnique,
  safeJsonArray,
} from "@/lib/notes/display-utils";
import { cn } from "@/lib/utils";

export type ShareNoteRecordingStub = {
  id: string;
  mimeType: string;
  durationSeconds: number | null;
  orderIndex: number;
  whiteboardSessionId?: string | null;
};

export type ShareNoteWhiteboardSessionStub = {
  id: string;
};

/** Note row fields required to render `/s/[token]` card bodies (SSR-friendly). */
export type ParentShareNoteModel = {
  id: string;
  date: Date;
  startTime: Date | null;
  endTime: Date | null;
  template: string | null;
  topics: string;
  homework: string;
  assessment: string;
  nextSteps: string;
  linksJson: string;
  shareRecordingInEmail: boolean;
  recordings: ShareNoteRecordingStub[];
  whiteboardSessions: ShareNoteWhiteboardSessionStub[];
};

function NoteSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-2.5 last:mb-0">
      <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="text-sm leading-relaxed whitespace-pre-wrap">{children}</div>
    </section>
  );
}

const chipClass =
  "inline-flex items-center rounded-[10px] border px-3 py-2 text-xs font-medium no-underline transition-colors";

/**
 * Single note card for parent `/s/[token]` pages — extracted for Jest and shared markup.
 */
export function ParentShareNoteCard(props: {
  token: string;
  /** Same display string the page used to compute from `note.date`. */
  dateLabel: string;
  note: ParentShareNoteModel;
  isNew: boolean;
}) {
  const { token, dateLabel, note, isNew } = props;
  const links = safeJsonArray(note.linksJson);

  const whiteboardReplayIds = orderedUnique([
    ...note.whiteboardSessions.map((w) => w.id),
    ...note.recordings.map((r) => r.whiteboardSessionId ?? null),
  ]);
  const hasLinkedWhiteboard = whiteboardReplayIds.length > 0;
  const exposeRecordingToParent =
    note.shareRecordingInEmail || hasLinkedWhiteboard;
  const audioUrls =
    exposeRecordingToParent && note.recordings.length > 0
      ? note.recordings.map((r) => `/api/audio/${r.id}?token=${token}`)
      : [];

  const hasActions = hasLinkedWhiteboard || audioUrls.length > 0;

  return (
    <article
      className={cn(
        "relative rounded-[16px] border border-border bg-card px-[18px] py-4",
        isNew && "border-accent shadow-[0_0_0_1px_var(--accent-soft)]"
      )}
      data-note-id={note.id}
    >
      <SeenTracker noteId={note.id} token={token} />

      {isNew ? (
        <Badge className="absolute top-3.5 right-3.5 rounded px-2 py-1 font-mono text-[10px] font-semibold tracking-wider uppercase">
          NEW
        </Badge>
      ) : null}

      <div className="heading pr-12 text-[17px] font-bold">{dateLabel}</div>
      {(note.startTime || note.endTime) && (
        <div className="mt-0.5 mb-3 font-mono text-[11px] text-muted-foreground">
          {formatNoteTime(note.startTime)}
          {note.startTime && note.endTime && " – "}
          {formatNoteTime(note.endTime)}
        </div>
      )}
      {note.template ? (
        <div className="mb-2 text-xs text-muted-foreground">{note.template}</div>
      ) : null}

      <div>
        <NoteSection title="Topics covered">{note.topics || "—"}</NoteSection>
        <NoteSection title="Homework">{note.homework || "—"}</NoteSection>
        {note.assessment ? (
          <NoteSection title="Assessment">{note.assessment}</NoteSection>
        ) : null}
        <NoteSection title="Next steps">{note.nextSteps || "—"}</NoteSection>

        {links.length > 0 && (
          <section className="mb-2.5">
            <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Links
            </h3>
            <ul className="m-0 list-disc pl-[18px] text-sm">
              {links.map((u) => (
                <li key={u}>
                  <a
                    href={u}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground underline-offset-2 hover:underline"
                  >
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {hasActions ? (
        <div className="mt-3.5 flex flex-col gap-3 border-t border-border/60 pt-3">
          <div className="flex flex-wrap gap-2">
            {hasLinkedWhiteboard ? (
              <div
                className="flex flex-wrap gap-2"
                data-testid="share-wb-replay-links"
              >
                {whiteboardReplayIds.map((wbId) => (
                  <Link
                    key={wbId}
                    href={`/s/${token}/whiteboard/${wbId}`}
                    aria-label="Watch the whiteboard recording"
                    className={cn(
                      chipClass,
                      "border-border bg-muted text-foreground hover:bg-muted/80"
                    )}
                  >
                    View whiteboard
                  </Link>
                ))}
              </div>
            ) : null}

            {audioUrls.length === 1 && note.recordings[0]?.durationSeconds ? (
              <span
                className={cn(
                  chipClass,
                  "border-accent bg-accent-soft text-accent-text"
                )}
                aria-hidden
              >
                ▶ Recording ({formatNoteDurationLabel(note.recordings[0].durationSeconds)})
              </span>
            ) : null}
          </div>

          {audioUrls.length > 0 ? (
            <div data-testid="share-page-audio" className="flex flex-col gap-2.5">
              {audioUrls.map((audioUrl, idx) => {
                const rec = note.recordings[idx];
                const durationLabel = rec?.durationSeconds
                  ? formatNoteDurationLabel(rec.durationSeconds)
                  : null;
                return (
                  <div key={audioUrl}>
                    {audioUrls.length > 1 ? (
                      <div className="mb-1 font-mono text-[11px] text-muted-foreground">
                        Part {idx + 1} of {audioUrls.length}
                        {durationLabel ? ` · ${durationLabel}` : ""}
                      </div>
                    ) : null}
                    <audio
                      controls
                      src={audioUrl}
                      aria-label={
                        audioUrls.length > 1
                          ? `Session recording part ${idx + 1} of ${audioUrls.length}`
                          : "Session recording shared by your tutor"
                      }
                      className="block w-full max-w-full"
                    />
                  </div>
                );
              })}
              <p className="m-0 text-[11px] text-muted-foreground">
                Recording shared by your tutor for your review.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
