import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, withDbRetry } from "@/lib/db";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import WhiteboardReplay from "@/components/whiteboard/WhiteboardReplay";
import WhiteboardNotesPanel from "@/components/whiteboard/WhiteboardNotesPanel";
import { SessionCostPanel } from "@/components/admin/SessionCostPanel";
import { getSessionCostBreakdown } from "@/lib/observability/cost-queries";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * generateNotesFromWhiteboardSessionAction (called from WhiteboardNotesPanel)
 * runs the same Whisper + LLM pipeline as the student detail page, so it
 * inherits the same multi-minute worst-case budget. See the budget
 * breakdown comment in /admin/students/[id]/page.tsx.
 */
export const maxDuration = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; whiteboardSessionId: string }>;
}): Promise<Metadata> {
  const { whiteboardSessionId } = await params;
  return {
    title: `Whiteboard review — ${whiteboardSessionId.slice(0, 8)}`,
    robots: { index: false, follow: false },
  };
}

/**
 * Admin whiteboard review page.
 *
 * Route: /admin/students/[id]/whiteboard/[whiteboardSessionId]
 *
 * Shown after a session ends (when the workspace page redirects here)
 * or when the tutor revisits a past session from the student detail
 * page. Mounts the shared `<WhiteboardReplay>` component wired to the
 * proxied event-log + snapshot URLs.
 *
 * Trust posture:
 *   - `assertOwnsWhiteboardSession` ensures the logged-in tutor owns
 *     this session. Multi-tenant guard.
 *   - studentId URL param is cross-checked against the session row to
 *     prevent path-traversal across students.
 *   - URLs handed to the replay component are the proxy routes
 *     (`/api/whiteboard/[id]/events`, `/api/whiteboard/[id]/snapshot`)
 *     so the raw Blob URLs are never surfaced in the page HTML.
 *   - Audio served via `/api/audio/admin/[recordingId]` (existing
 *     admin-scoped audio proxy).
 *
 * wbsid= logging: the page title and console.log below carry
 * wbsid= so admin-side replays appear in observability.
 */
type RouteParams = { id: string; whiteboardSessionId: string };

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export default async function WhiteboardReviewPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { id: studentId, whiteboardSessionId } = await params;

  console.log(
    `[wbReview.page] wbsid=${whiteboardSessionId} studentId=${studentId}`
  );

  // Ownership check — 404 on miss or cross-tutor.
  const session = await assertOwnsWhiteboardSession(whiteboardSessionId);

  if (session.studentId !== studentId) {
    console.warn(
      `[wbReview.page] wbsid=${whiteboardSessionId} studentId mismatch: ` +
        `url=${studentId} row=${session.studentId}`
    );
    notFound();
  }

  // Fetch display columns.
  const detail = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: whiteboardSessionId },
        select: {
          id: true,
          startedAt: true,
          endedAt: true,
          durationSeconds: true,
          noteId: true,
          eventsSchemaVersion: true,
          snapshotBlobUrl: true,
          student: { select: { id: true, name: true } },
          audioRecordings: {
            select: {
              id: true,
              mimeType: true,
              durationSeconds: true,
              orderIndex: true,
            },
            orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
          },
        },
      }),
    { label: "wbReview.page.detail" }
  );
  if (!detail) notFound();

  const eventsApiUrl = `/api/whiteboard/${whiteboardSessionId}/events`;
  const snapshotApiUrl = `/api/whiteboard/${whiteboardSessionId}/snapshot`;
  const audioSegments = detail.audioRecordings.map((rec) => ({
    url: `/api/audio/admin/${rec.id}`,
    mimeType: rec.mimeType,
    durationSeconds: rec.durationSeconds,
  }));

  const sessionLabel = `Recording of ${detail.student.name} — ${formatDate(detail.startedAt)}`;
  const recordingDurationSeconds = detail.audioRecordings.reduce(
    (sum, rec) => sum + (rec.durationSeconds ?? 0),
    0
  );
  const durationLabel =
    recordingDurationSeconds > 0
      ? formatDuration(recordingDurationSeconds)
      : detail.durationSeconds
        ? formatDuration(detail.durationSeconds)
        : null;

  const isLive = !detail.endedAt;
  const aiEnabled = Boolean(env.OPENAI_API_KEY);

  const sessionCost = !isLive
    ? await getSessionCostBreakdown(whiteboardSessionId)
    : null;

  return (
    <div className="container" style={{ maxWidth: 1280 }}>
      {/* Header */}
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <Link href={`/admin/students/${studentId}`} className="muted">
            ← Back to {detail.student.name}
          </Link>
          <h1 style={{ margin: "6px 0 0" }}>
            Whiteboard — {detail.student.name}
          </h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            {formatDate(detail.startedAt)}
            {durationLabel && ` · ${durationLabel}`}
            {isLive && (
              <span
                style={{
                  marginLeft: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  color: "var(--error)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "var(--error)",
                    display: "inline-block",
                  }}
                />
                Session still in progress
              </span>
            )}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {detail.noteId && (
            <Link
              href={`/admin/students/${studentId}/notes`}
              className="btn"
            >
              View attached note
            </Link>
          )}
          {isLive && (
            <Link
              href={`/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`}
              className="btn primary"
            >
              Return to live session
            </Link>
          )}
        </div>
      </div>

      {/* Session info card */}
      {isLive && (
        <div
          className="card"
          style={{
            padding: "10px 14px",
            background: "var(--warning-soft)",
            border: "1px solid var(--warning-border)",
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          This session is still in progress. The event log shown below
          reflects what was recorded up to the last checkpoint. End the
          session from the workspace to save the final recording.
        </div>
      )}

      {/* Replay */}
      <WhiteboardReplay
        eventsBlobUrl={eventsApiUrl}
        audioSegments={audioSegments}
        snapshotBlobUrl={detail.snapshotBlobUrl ? snapshotApiUrl : null}
        title={sessionLabel}
        whiteboardSessionId={whiteboardSessionId}
      />

      {/* AI wedge: generate notes from this whiteboard session */}
      {!isLive && (
        <div style={{ marginTop: 16 }}>
          <WhiteboardNotesPanel
            whiteboardSessionId={whiteboardSessionId}
            studentId={studentId}
            sessionDate={detail.startedAt.toISOString().slice(0, 10)}
            attachedNoteId={detail.noteId ?? null}
            aiEnabled={aiEnabled}
            hasAudio={detail.audioRecordings.length > 0}
          />
        </div>
      )}

      {sessionCost ? (
        <SessionCostPanel
          whisperMinutes={sessionCost.whisperMinutes}
          whisperUsd={sessionCost.whisperUsd}
          gptInputTokens={sessionCost.gptInputTokens}
          gptOutputTokens={sessionCost.gptOutputTokens}
          gptUsd={sessionCost.gptUsd}
          blobEgressBytes={sessionCost.blobEgressBytes}
          blobEgressUsd={sessionCost.blobEgressUsd}
          blobStorageUsd={sessionCost.blobStorageUsd}
          computeUsd={sessionCost.computeUsd}
          totalUsd={sessionCost.totalUsd}
        />
      ) : null}

      {/* Footer meta */}
      <div
        className="muted"
        style={{ fontSize: 11, textAlign: "right", marginTop: 8 }}
      >
        wbsid={whiteboardSessionId.slice(0, 8)} · schema v
        {detail.eventsSchemaVersion}
      </div>
    </div>
  );
}
