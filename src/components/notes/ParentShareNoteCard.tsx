import Link from "next/link";
import { SeenTracker } from "@/app/s/[token]/SeenTracker";
import {
  formatNoteDurationLabel,
  formatNoteTime,
  orderedUnique,
  safeJsonArray,
} from "@/lib/notes/display-utils";

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

  return (
    <div
      className="card"
      style={{ position: "relative" }}
      data-note-id={note.id}
    >
      <SeenTracker noteId={note.id} token={token} />
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 800 }}>
            {dateLabel}
          </div>
          {(note.startTime || note.endTime) && (
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {formatNoteTime(note.startTime)}
              {note.startTime && note.endTime && " – "}
              {formatNoteTime(note.endTime)}
            </div>
          )}
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {note.template && (
            <span className="muted" style={{ fontSize: 12 }}>{note.template}</span>
          )}
          {isNew && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 12,
                background: "var(--color-primary)",
                color: "var(--slider-thumb)",
                letterSpacing: "0.04em",
              }}
            >
              NEW
            </span>
          )}
        </div>
      </div>

      <div className="divider" />

      <div style={{ display: "grid", gap: 12 }}>
        <section>
          <div className="muted" style={{ fontSize: 12 }}>Topics covered</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{note.topics || "—"}</div>
        </section>
        <section>
          <div className="muted" style={{ fontSize: 12 }}>Homework</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{note.homework || "—"}</div>
        </section>
        <section>
          <div className="muted" style={{ fontSize: 12 }}>Assessment</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{note.assessment || "—"}</div>
        </section>
        <section>
          <div className="muted" style={{ fontSize: 12 }}>Plan</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{note.nextSteps || "—"}</div>
        </section>

        {links.length > 0 && (
          <section>
            <div className="muted" style={{ fontSize: 12 }}>Links</div>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {links.map((u) => (
                <li key={u}>
                  <a href={u} target="_blank" rel="noreferrer">{u}</a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {hasLinkedWhiteboard && (
          <section data-testid="share-wb-replay-links">
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              Whiteboard
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
              {whiteboardReplayIds.map((wbId) => (
                <Link
                  key={wbId}
                  className="btn"
                  href={`/s/${token}/whiteboard/${wbId}`}
                >
                  Watch the whiteboard recording
                </Link>
              ))}
            </div>
          </section>
        )}

        {audioUrls.length > 0 && (
          <section data-testid="share-page-audio">
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              Session recording{audioUrls.length > 1 ? "s" : ""}
            </div>
            {audioUrls.map((audioUrl, idx) => {
              const rec = note.recordings[idx];
              const durationLabel = rec?.durationSeconds
                ? ` · ${formatNoteDurationLabel(rec.durationSeconds)}`
                : "";
              return (
                <div key={audioUrl} style={{ marginBottom: idx < audioUrls.length - 1 ? 10 : 0 }}>
                  {audioUrls.length > 1 && (
                    <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                      Part {idx + 1} of {audioUrls.length}{durationLabel}
                    </div>
                  )}
                  {audioUrls.length === 1 && durationLabel && (
                    <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                      {durationLabel.trim()}
                    </div>
                  )}
                  <audio
                    controls
                    src={audioUrl}
                    aria-label={
                      audioUrls.length > 1
                        ? `Session recording part ${idx + 1} of ${audioUrls.length}`
                        : "Session recording shared by your tutor"
                    }
                    style={{ width: "100%", maxWidth: 480, display: "block" }}
                  />
                </div>
              );
            })}
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--color-muted)" }}>
              Recording shared by your tutor for your review.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
