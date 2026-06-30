import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db, withDbRetry } from "@/lib/db";
import { env } from "@/lib/env";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import { requireStudentScope } from "@/lib/student-scope";
import { WhiteboardSessionShell } from "./WhiteboardSessionShell";

/**
 * Tutor-side live whiteboard workspace.
 *
 * Trust posture (re-read before changing):
 *   - `assertOwnsWhiteboardSession` re-checks the logged-in tutor
 *     owns this session. Multi-tenant gate.
 *   - Ended sessions render the in-frame notes-hero review surface
 *     (SessionReviewMode) so End Session + any RSC refresh converge.
 *   - We bounce env-only logins to the admin home with an explanation
 *     because the schema requires an FK to AdminUser.
 *
 * The encryption key for the live-sync E2E layer NEVER touches the
 * server. The client component generates it on first mount and parks
 * it in `window.location.hash` (`#k=...`) so refresh keeps the same
 * key. The "Copy student link" button reuses that key for the
 * student URL.
 */

export const dynamic = "force-dynamic";

/**
 * 300s maxDuration — required so that `after()` callbacks registered by server
 * actions called from this workspace (enqueueChunkTranscriptionAction,
 * triggerNotesGenerationAction, kickSessionChunksAction) have enough headroom to
 * complete transcription + notes generation on Vercel Preview without a cron sweep.
 * See PLATFORM-ASSUMPTIONS.md §1.8 (after() dependency).
 */
export const maxDuration = 300;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Whiteboard session",
    robots: { index: false, follow: false },
  };
}

type RouteParams = { id: string; whiteboardSessionId: string };

export default async function WhiteboardWorkspacePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { id: studentId, whiteboardSessionId } = await params;

  const scope = await requireStudentScope();
  if (scope.kind !== "admin") {
    redirect(
      `/admin?notice=${encodeURIComponent(
        "Whiteboard sessions require a registered admin account."
      )}`
    );
  }

  const session = await assertOwnsWhiteboardSession(whiteboardSessionId);

  if (session.studentId !== studentId) {
    notFound();
  }

  const detail = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: whiteboardSessionId },
        select: {
          id: true,
          startedAt: true,
          endedAt: true,
          durationSeconds: true,
          snapshotBlobUrl: true,
          bothConnectedAt: true,
          activeMs: true,
          lastActiveAt: true,
          eventsBlobUrl: true,
          sessionPhase: true,
          sessionMode: true,
          activatedAt: true,
          student: {
            select: { id: true, name: true, recordingDefaultEnabled: true },
          },
        },
      }),
    { label: "WhiteboardWorkspacePage.detail" }
  );
  if (!detail) notFound();

  const syncEnabled = Boolean(env.WHITEBOARD_SYNC_URL);

  return (
    <WhiteboardSessionShell
      role="tutor"
      whiteboardSessionId={detail.id}
      studentId={detail.student.id}
      studentName={detail.student.name}
      adminUserId={session.adminUserId}
      startedAtIso={detail.startedAt.toISOString()}
      bothConnectedAtIso={detail.bothConnectedAt?.toISOString() ?? null}
      initialActiveMs={detail.activeMs}
      initialLastActiveAtIso={detail.lastActiveAt?.toISOString() ?? null}
      syncUrl={syncEnabled ? env.WHITEBOARD_SYNC_URL! : null}
      initialUserWantsRecording={detail.student.recordingDefaultEnabled}
      initialSessionPhase={detail.sessionPhase}
      sessionMode={detail.sessionMode}
      activatedAt={detail.activatedAt?.toISOString() ?? null}
      syncEnabled={syncEnabled}
      initialMode={detail.endedAt ? "review" : "live"}
    />
  );
}
