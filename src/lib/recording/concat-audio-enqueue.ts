import "server-only";

/**
 * WS-G — post-finalize replay concat transport.
 *
 * Schedules FFmpeg concat via `after()` so it runs CONCURRENTLY with the
 * WS-K notes-reduce path and does NOT delay the 2–3s notes budget.
 *
 * Log prefix: [wsg]
 */

import { after } from "next/server";
import { deleteBlob } from "@/lib/blob";
import { db, withDbRetry } from "@/lib/db";
import {
  concatMixdownSegmentsToBlob,
  type MixdownSegmentInput,
} from "@/lib/recording/concat-audio";

export function enqueueReplayConcatAfterFinalize(whiteboardSessionId: string): void {
  after(async () => {
    try {
      const session = await withDbRetry(
        () =>
          db.whiteboardSession.findUnique({
            where: { id: whiteboardSessionId },
            select: {
              id: true,
              adminUserId: true,
              studentId: true,
              endedAt: true,
              concatBlobUrl: true,
            },
          }),
        { label: "wsg.concat.session" }
      );

      if (!session?.endedAt) {
        console.log(
          `[wsg] wbsid=${whiteboardSessionId} action=concat_skip reason=not_ended`
        );
        return;
      }

      if (session.concatBlobUrl) {
        console.log(
          `[wsg] wbsid=${whiteboardSessionId} action=concat_skip reason=already_present`
        );
        return;
      }

      const recordings = await withDbRetry(
        () =>
          db.sessionRecording.findMany({
            where: { whiteboardSessionId },
            orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
            select: {
              blobUrl: true,
              mimeType: true,
              streamId: true,
              orderIndex: true,
            },
          }),
        { label: "wsg.concat.recordings" }
      );

      const segments: MixdownSegmentInput[] = recordings.map((r) => ({
        blobUrl: r.blobUrl,
        mimeType: r.mimeType,
        streamId: r.streamId,
        orderIndex: r.orderIndex,
      }));

      const result = await concatMixdownSegmentsToBlob({
        adminUserId: session.adminUserId,
        studentId: session.studentId,
        whiteboardSessionId: session.id,
        segments,
      });

      if (!result.ok) {
        console.warn(
          `[wsg] wbsid=${whiteboardSessionId} action=concat_skipped reason=${result.reason} segments=${result.segmentCount ?? 0}`
        );
        return;
      }

      const updated = await withDbRetry(
        () =>
          db.whiteboardSession.updateMany({
            where: { id: whiteboardSessionId, concatBlobUrl: null },
            data: {
              concatBlobUrl: result.blobUrl,
              concatDurationSeconds: result.durationSeconds,
            },
          }),
        { label: "wsg.concat.persist" }
      );

      if (updated.count === 0) {
        console.log(
          `[wsg] wbsid=${whiteboardSessionId} action=concat_skip reason=race_lost_deleting_orphan`
        );
        await deleteBlob(result.blobUrl).catch(() => undefined);
        return;
      }

      console.log(
        `[wsg] wbsid=${whiteboardSessionId} action=concat_done segments=${result.segmentCount} durationSeconds=${result.durationSeconds} sizeBytes=${result.sizeBytes}`
      );
    } catch (err) {
      console.warn(
        `[wsg] wbsid=${whiteboardSessionId} action=concat_failed err=${err instanceof Error ? err.message : String(err)}`
      );
    }
  });
}
