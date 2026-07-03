import Link from "next/link";
import { orderedUnique, safeJsonArray } from "@/lib/notes/display-utils";

export type TutorNoteRecordingStub = {
  id: string;
  mimeType: string;
  durationSeconds: number | null;
  /** When set, this segment was captured during a WB session even if note↔WB link lagged. */
  whiteboardSessionId?: string | null;
};

export type TutorNoteWhiteboardSessionStub = {
  id: string;
};

/**
 * Topics / homework / assessment / recordings / whiteboard links for one row
 * on `/admin/students/[id]/notes`. Extracted for Jest without server-only imports.
 */
export function TutorStudentNoteExpandedBody(props: {
  studentId: string;
  topics: string;
  homework: string;
  assessment: string;
  nextSteps: string;
  linksJson: string;
  recordings: TutorNoteRecordingStub[];
  whiteboardSessions: TutorNoteWhiteboardSessionStub[];
}) {
  const {
    studentId,
    topics,
    homework,
    assessment,
    nextSteps,
    linksJson,
    recordings,
    whiteboardSessions,
  } = props;
  const links = safeJsonArray(linksJson);
  const hasRecordings = recordings.length > 0;
  const totalSegments = recordings.length;
  const whiteboardReplayIds = orderedUnique([
    ...whiteboardSessions.map((w) => w.id),
    ...recordings.map((r) => r.whiteboardSessionId ?? null),
  ]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div>
        <div className="muted" style={{ fontSize: 12 }}>Topics</div>
        <div style={{ whiteSpace: "pre-wrap" }}>
          {topics || <span className="muted">—</span>}
        </div>
      </div>
      <div>
        <div className="muted" style={{ fontSize: 12 }}>Homework</div>
        <div style={{ whiteSpace: "pre-wrap" }}>
          {homework || <span className="muted">—</span>}
        </div>
      </div>
      <div>
        <div className="muted" style={{ fontSize: 12 }}>Assessment</div>
        <div style={{ whiteSpace: "pre-wrap" }}>
          {assessment || <span className="muted">—</span>}
        </div>
      </div>
      <div>
        <div className="muted" style={{ fontSize: 12 }}>Plan</div>
        <div style={{ whiteSpace: "pre-wrap" }}>
          {nextSteps || <span className="muted">—</span>}
        </div>
      </div>
      {links.length > 0 && (
        <div>
          <div className="muted" style={{ fontSize: 12 }}>Links</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {links.map((u) => (
              <li key={u}>
                <a href={u} target="_blank" rel="noreferrer">{u}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {whiteboardReplayIds.length > 0 && (
        <div data-testid="tutor-note-wb-links">
          <div className="muted" style={{ fontSize: 12 }}>
            Whiteboard
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            {whiteboardReplayIds.map((wbId) => (
              <Link
                key={wbId}
                className="btn"
                href={`/admin/students/${studentId}/whiteboard/${wbId}/workspace`}
              >
                Watch the whiteboard recording
              </Link>
            ))}
          </div>
        </div>
      )}

      {hasRecordings && (
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            Recording{totalSegments > 1 ? `s (${totalSegments} segments)` : ""}
          </div>
          <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
            {recordings.map((rec, idx) => (
              <div key={rec.id}>
                {totalSegments > 1 && (
                  <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>
                    Part {idx + 1} of {totalSegments}
                    {rec.durationSeconds ? ` · ${Math.round(rec.durationSeconds)}s` : ""}
                  </div>
                )}
                {totalSegments === 1 && rec.durationSeconds && (
                  <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>
                    {Math.round(rec.durationSeconds)}s
                  </div>
                )}
                <audio
                  controls
                  preload="none"
                  src={`/api/audio/admin/${rec.id}`}
                  style={{ width: "100%", maxWidth: 480 }}
                  aria-label={
                    totalSegments > 1
                      ? `Recording part ${idx + 1} of ${totalSegments}`
                      : "Session recording"
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
