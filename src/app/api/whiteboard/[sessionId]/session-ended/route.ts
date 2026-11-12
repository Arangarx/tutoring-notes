import { NextResponse } from "next/server";
import { db, withDbRetry } from "@/lib/db";
import { deriveSessionCapabilities } from "@/lib/recording/session-capabilities";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";

/**
 * Lightweight read for the tutor workspace: has this whiteboard session
 * been ended on the server, and was its board kept?
 *
 * GET /api/whiteboard/[sessionId]/session-ended
 *   → { ended: boolean, persist: boolean | null }
 *
 * Used by `useWhiteboardRecorder` to drop stale IndexedDB checkpoints
 * after the tutor ends sessions from the student page (or the
 * resume-gate action) without opening each workspace — otherwise the
 * client would still show "Found an unsaved session…" from local
 * recovery even though every `WhiteboardSession` row has `endedAt`
 * set (Apr 2026 pilot confusion).
 *
 * `persist` is the ended session's frozen whiteboard capability: `false` means the board was not kept, so the
 * device must not keep a copy either (consent Q6). `null` = not ended, or no frozen snapshot to read it from; the
 * device keeps its copy when it cannot tell.
 *
 * Auth: `assertOwnsWhiteboardSession` (same multi-tenant gate as
 * timer-anchor / active-ping).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const { sessionId } = await ctx.params;
  const session = await assertOwnsWhiteboardSession(sessionId);
  const ended = session.endedAt !== null;
  if (!ended) return NextResponse.json({ ended, persist: null });

  const frozen = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: {
          sessionMode: true,
          notesForbidden: true,
          consentSnapshot: {
            select: {
              allowAudioRecording: true,
              allowWhiteboardRecording: true,
              allowNoteSending: true,
            },
          },
        },
      }),
    { label: "sessionEnded.snapshot" }
  );
  const snapshot = frozen?.consentSnapshot;
  if (!frozen || !snapshot) return NextResponse.json({ ended, persist: null });

  const { whiteboard } = deriveSessionCapabilities({
    hasConsentSnapshot: true,
    toggles: {
      audio: snapshot.allowAudioRecording,
      whiteboard: snapshot.allowWhiteboardRecording,
      notes: snapshot.allowNoteSending,
    },
    sessionMode: frozen.sessionMode === "IN_PERSON" ? "IN_PERSON" : "LIVE",
    notesForbidden: frozen.notesForbidden,
  });
  return NextResponse.json({ ended, persist: whiteboard.persist });
}
