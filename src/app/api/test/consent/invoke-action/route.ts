import { NextRequest, NextResponse } from "next/server";
import { guardPlaywrightTestRoute } from "@/lib/playwright-test-route";
import {
  enqueueChunkTranscriptionAction,
  generateNotesFromWhiteboardSessionAction,
  registerWhiteboardSessionAudioSegmentAction,
} from "@/app/admin/students/[id]/whiteboard/actions";
import {
  kickSessionChunksAction,
  regenerateNotesAction,
  triggerNotesGenerationAction,
} from "@/app/admin/students/[id]/whiteboard/notes-actions";

/**
 * Test-env-only: invoke one of the consent-gated SERVER ACTIONS over HTTP as the signed-in tutor (consent wave C2).
 *
 * Playwright cannot call a server action directly, and the plan's oracles for the tampered-client rows (A5, A6, N3) are
 * "HTTP status + DB": the action runs for real, in the same bundle production runs, and the test reads the action's
 * own return value plus the database. The route adds no logic: it picks the action by name and forwards the arguments
 * untouched, so what a tampered client could send is exactly what the test sends. The signed-in tutor comes from the
 * request cookies (the Playwright `request` fixture carries the tutor storageState), so the action's own ownership
 * assertion still runs.
 *
 * Guarded by `guardPlaywrightTestRoute` (404 in production, bearer test secret required).
 */
export async function POST(req: NextRequest) {
  const denied = guardPlaywrightTestRoute(req);
  if (denied) return denied;

  const body = (await req.json()) as {
    action?: string;
    sessionId?: string;
    args?: Record<string, unknown>;
  };
  const sessionId = body.sessionId;
  if (!body.action || !sessionId) {
    return NextResponse.json({ error: "action and sessionId are required" }, { status: 400 });
  }
  const args = body.args ?? {};

  switch (body.action) {
    case "registerSegment":
      return NextResponse.json({
        result: await registerWhiteboardSessionAudioSegmentAction(
          sessionId,
          args as Parameters<typeof registerWhiteboardSessionAudioSegmentAction>[1]
        ),
      });
    case "enqueueChunk":
      await enqueueChunkTranscriptionAction(
        sessionId,
        args as Parameters<typeof enqueueChunkTranscriptionAction>[1]
      );
      return NextResponse.json({ result: null });
    case "kick":
      return NextResponse.json({ result: await kickSessionChunksAction(sessionId) });
    case "generateNotes":
      return NextResponse.json({ result: await generateNotesFromWhiteboardSessionAction(sessionId) });
    case "triggerNotes":
      return NextResponse.json({ result: await triggerNotesGenerationAction(sessionId) });
    case "regenerateNotes":
      return NextResponse.json({ result: await regenerateNotesAction(sessionId) });
    default:
      return NextResponse.json({ error: `unknown action ${body.action}` }, { status: 400 });
  }
}
