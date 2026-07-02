import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, withDbRetry } from "@/lib/db";
import WhiteboardReplay from "@/components/whiteboard/WhiteboardReplay";
import { assertCanAccessShareLink } from "@/lib/share-access-scope";
import { assertStudentNotErased } from "@/lib/erasure/assert-student-not-erased";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string; whiteboardSessionId: string }>;
}): Promise<Metadata> {
  const { token, whiteboardSessionId } = await params;
  void token; // included in params for route matching only
  return {
    title: `Whiteboard recording — ${whiteboardSessionId.slice(0, 8)}`,
    robots: { index: false, follow: false },
  };
}

/**
 * Share-token gated whiteboard replay page.
 *
 * Route: /s/[token]/whiteboard/[whiteboardSessionId]
 *
 * Accessible to anyone who holds a valid, non-revoked ShareLink
 * token (typically the student / parent — same credential as the
 * existing note-share pages at /s/[token]).
 *
 * Trust posture:
 *   - Validates ShareLink token is not revoked.
 *   - Confirms WhiteboardSession.studentId === ShareLink.studentId
 *     so a token for student A cannot access student B's sessions.
 *   - Only exposes ended sessions (`endedAt != null`). Live sessions
 *     are never shown here.
 *   - All Blob content is fetched via `/api/whiteboard/[id]/public-*`
 *     proxy routes that re-validate the token, so raw Blob URLs are
 *     never embedded in the page HTML.
 *
 * wbsid= logging: each render logs the session id for observability.
 */
type RouteParams = { token: string; whiteboardSessionId: string };

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ShareWhiteboardPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { token, whiteboardSessionId } = await params;

  console.log(
    `[wbShareReplay.page] wbsid=${whiteboardSessionId} token=${token.slice(0, 8)}…`
  );

  const access = await assertCanAccessShareLink(
    token,
    `/s/${token}/whiteboard/${whiteboardSessionId}`
  );
  await assertStudentNotErased(access.studentId, { salToken: token });

  // Validate share link.
  const link = await withDbRetry(
    () =>
      db.shareLink.findUnique({
        where: { token },
        select: { revokedAt: true, studentId: true, student: { select: { name: true } } },
      }),
    { label: "wbShareReplay.page.shareLink" }
  );
  if (!link || link.revokedAt) {
    console.warn(
      `[wbShareReplay.page] wbsid=${whiteboardSessionId} invalid/revoked token`
    );
    notFound();
  }

  // Validate session ownership + completion.
  const session = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: whiteboardSessionId },
        select: {
          id: true,
          studentId: true,
          startedAt: true,
          endedAt: true,
          durationSeconds: true,
          eventsSchemaVersion: true,
          snapshotBlobUrl: true,
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
    { label: "wbShareReplay.page.session" }
  );

  if (!session || session.studentId !== link.studentId) {
    console.warn(
      `[wbShareReplay.page] wbsid=${whiteboardSessionId} studentId mismatch or missing`
    );
    notFound();
  }

  if (!session.endedAt) {
    // Live sessions are not exposed on the public share surface.
    // This is intentional — a parent clicking a share link for a
    // whiteboard while the session is still running shouldn't see
    // a live canvas that could expose unfinished work.
    console.log(
      `[wbShareReplay.page] wbsid=${whiteboardSessionId} session still live — 404 on share`
    );
    notFound();
  }

  const studentName = link.student.name;
  const sessionLabel = `Whiteboard with ${studentName} — ${formatDate(session.startedAt)}`;

  // Build proxy URLs with the share token in the query string so the
  // client-side fetch includes the credential (same pattern as
  // `/api/audio/[id]?token=`).
  const eventsApiUrl = `/api/whiteboard/${whiteboardSessionId}/public-events?token=${token}`;
  const snapshotApiUrl = session.snapshotBlobUrl
    ? `/api/whiteboard/${whiteboardSessionId}/public-snapshot?token=${token}`
    : null;
  const audioSegments = session.audioRecordings.map((rec) => ({
    url: `/api/audio/${rec.id}?token=${token}`,
    mimeType: rec.mimeType,
    durationSeconds: rec.durationSeconds,
  }));

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-4 md:px-5 md:py-6">
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-border bg-card pb-4">
          <div className="min-w-0">
            <Link
              href={`/s/${token}`}
              className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              ← Back to {studentName}&apos;s notes
            </Link>
            <h1 className="heading mt-1.5 mb-0 text-xl font-bold tracking-tight md:text-2xl">
              {sessionLabel}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Whiteboard recording shared by your tutor
            </p>
          </div>
        </header>

        {/* Replay player — fenced; page chrome only reskinned above/below */}
        <WhiteboardReplay
          eventsBlobUrl={eventsApiUrl}
          audioSegments={audioSegments}
          snapshotBlobUrl={snapshotApiUrl}
          title={sessionLabel}
        />

        <p className="mt-2 text-right font-mono text-[11px] text-muted-foreground">
          schema v{session.eventsSchemaVersion}
        </p>
      </div>
    </main>
  );
}
