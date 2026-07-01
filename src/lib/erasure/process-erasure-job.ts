/**
 * E4 — resumable erasure orchestrator.
 *
 * Phase machine: requested → blobs_purging → db_scrubbing → completed
 * Grace gate: worker stays in `requested` until now() >= purgeEligibleAt.
 * Tombstone (E2) runs at request time (E5), not here.
 *
 * Log prefix: ers (opaque ids only — never email, name, transcript, or blob URLs).
 */

import { createHash } from "node:crypto";
import type { ErasureJobStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { deleteBlob } from "@/lib/blob";
import {
  enumerateLearnerFamilyBlobs,
  resolveErasureScopeStudents,
  type ErasureScope,
} from "@/lib/erasure/blob-inventory";

const DELETED_LEARNER_NAME = "[Deleted learner]";
/** eventsBlobUrl is NOT NULL in schema — empty string removes the blob reference after purge. */
const SCRUBBED_EVENTS_BLOB_URL = "";

export type ProcessErasureJobResult = { status: ErasureJobStatus };
export type CancelErasureJobResult = { status: ErasureJobStatus };

function hashBlobUrlForLog(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 12);
}

function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 500);
}

function parseBlobsDeletedJson(json: Prisma.JsonValue | null): Set<string> {
  if (!json) return new Set();
  if (!Array.isArray(json)) return new Set();
  const urls = new Set<string>();
  for (const item of json) {
    if (typeof item === "string" && item.length > 0) {
      urls.add(item);
    }
  }
  return urls;
}

function serializeBlobsDeletedJson(urls: Set<string>): Prisma.InputJsonValue {
  return [...urls];
}

function scopeFromJob(job: {
  scopeKind: ErasureScope["kind"];
  scopeId: string;
}): ErasureScope {
  return { kind: job.scopeKind, id: job.scopeId };
}

async function advancePhase(
  jobId: string,
  from: ErasureJobStatus,
  to: ErasureJobStatus,
  extra?: Prisma.ErasureJobUpdateInput
): Promise<void> {
  console.log(`[ers] action=phase_advance from=${from} to=${to} ers=${jobId}`);
  await db.erasureJob.update({
    where: { id: jobId },
    data: { status: to, lastError: null, ...extra },
  });
}

async function purgeBlobs(
  jobId: string,
  urls: Set<string>,
  alreadyDeleted: Set<string>
): Promise<{ allDone: boolean; deleted: Set<string> }> {
  const deleted = new Set(alreadyDeleted);

  for (const url of urls) {
    if (deleted.has(url)) continue;

    try {
      await deleteBlob(url);
      deleted.add(url);
      console.log(
        `[ers] action=blob_deleted ers=${jobId} urlHash=${hashBlobUrlForLog(url)}`
      );
      await db.erasureJob.update({
        where: { id: jobId },
        data: { blobsDeletedJson: serializeBlobsDeletedJson(deleted) },
      });
    } catch (err) {
      const lastError = sanitizeError(err);
      await db.erasureJob.update({
        where: { id: jobId },
        data: { lastError },
      });
      return { allDone: false, deleted };
    }
  }

  return { allDone: true, deleted };
}

async function scrubDbContent(
  studentIds: string[],
  sessionIds: string[]
): Promise<void> {
  if (studentIds.length === 0 && sessionIds.length === 0) {
    return;
  }

  await db.$transaction(async (tx) => {
    if (sessionIds.length > 0) {
      await tx.transcriptChunkExtraction.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });
      await tx.transcriptChunk.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });
      await tx.tutorNote.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });
      await tx.whiteboardJoinToken.deleteMany({
        where: { whiteboardSessionId: { in: sessionIds } },
      });
      await tx.sessionParticipant.deleteMany({
        where: { whiteboardSessionId: { in: sessionIds } },
      });
      await tx.whiteboardSession.updateMany({
        where: { id: { in: sessionIds } },
        data: {
          eventsBlobUrl: SCRUBBED_EVENTS_BLOB_URL,
          snapshotBlobUrl: null,
        },
      });
    }

    if (studentIds.length > 0) {
      await tx.sessionRecording.deleteMany({
        where: { studentId: { in: studentIds } },
      });

      await tx.sessionNote.updateMany({
        where: { studentId: { in: studentIds } },
        data: {
          topics: "",
          homework: "",
          assessment: "",
          nextSteps: "",
          linksJson: "[]",
        },
      });

      const noteIds = (
        await tx.sessionNote.findMany({
          where: { studentId: { in: studentIds } },
          select: { id: true },
        })
      ).map((n) => n.id);

      if (noteIds.length > 0) {
        await tx.noteView.deleteMany({
          where: { noteId: { in: noteIds } },
        });
      }

      await tx.shareLink.updateMany({
        where: { studentId: { in: studentIds }, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      const now = new Date();
      await tx.student.updateMany({
        where: { id: { in: studentIds } },
        data: {
          name: DELETED_LEARNER_NAME,
          parentEmail: null,
          erasedAt: now,
        },
      });
    }
  });
}

/**
 * Resumable, idempotent erasure worker. Advances the job through purge phases.
 */
export async function processErasureJob(
  jobId: string
): Promise<ProcessErasureJobResult> {
  const job = await db.erasureJob.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error(`ErasureJob not found: ${jobId}`);
  }

  const terminal: ErasureJobStatus[] = ["completed", "canceled"];
  if (terminal.includes(job.status)) {
    return { status: job.status };
  }

  if (job.status === "failed") {
    return { status: job.status };
  }

  const scope = scopeFromJob(job);

  if (job.status === "requested") {
    const now = Date.now();
    const eligibleAt = job.purgeEligibleAt.getTime();
    if (now < eligibleAt) {
      const eligibleInMs = eligibleAt - now;
      console.log(
        `[ers] action=grace_gated ers=${jobId} eligibleInMs=${eligibleInMs}`
      );
      return { status: "requested" };
    }

    await advancePhase(jobId, "requested", "blobs_purging");
    return processErasureJob(jobId);
  }

  if (job.status === "blobs_purging") {
    const deleted = parseBlobsDeletedJson(job.blobsDeletedJson);
    const { urls } = await enumerateLearnerFamilyBlobs(scope);

    await db.erasureJob.update({
      where: { id: jobId },
      data: { blobInventoryJson: [...urls] },
    });

    const { allDone } = await purgeBlobs(jobId, urls, deleted);
    if (!allDone) {
      return { status: "blobs_purging" };
    }

    await advancePhase(jobId, "blobs_purging", "db_scrubbing");
    return processErasureJob(jobId);
  }

  if (job.status === "db_scrubbing") {
    const { studentIds, sessionIds } = await resolveErasureScopeStudents(scope);
    await scrubDbContent(studentIds, sessionIds);

    const { urls: stragglerUrls } = await enumerateLearnerFamilyBlobs(scope);
    for (const url of stragglerUrls) {
      try {
        await deleteBlob(url);
        console.log(
          `[ers] action=blob_deleted ers=${jobId} urlHash=${hashBlobUrlForLog(url)} phase=h2_second_pass`
        );
      } catch (err) {
        const lastError = sanitizeError(err);
        await db.erasureJob.update({
          where: { id: jobId },
          data: { lastError },
        });
        return { status: "db_scrubbing" };
      }
    }

    const completedAt = new Date();
    await advancePhase(jobId, "db_scrubbing", "completed", { completedAt });
    console.log(`[ers] action=completed ers=${jobId}`);
    return { status: "completed" };
  }

  return { status: job.status };
}

/**
 * Cancel an erasure job during the grace window (status === requested only).
 * Does not un-tombstone or restore access.
 */
export async function cancelErasureJob(
  jobId: string
): Promise<CancelErasureJobResult> {
  const job = await db.erasureJob.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error(`ErasureJob not found: ${jobId}`);
  }

  if (job.status !== "requested") {
    console.log(
      `[ers] action=cancel_rejected ers=${jobId} status=${job.status}`
    );
    throw new Error(
      `Cannot cancel erasure job in status "${job.status}" — only "requested" jobs can be canceled`
    );
  }

  const canceledAt = new Date();
  await db.erasureJob.update({
    where: { id: jobId },
    data: { status: "canceled", canceledAt },
  });

  return { status: "canceled" };
}
