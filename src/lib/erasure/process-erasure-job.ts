/**
 * E4 — resumable erasure orchestrator.
 *
 * Phase machine: requested → blobs_purging → db_scrubbing → completed
 * Grace gate: worker stays in `requested` until now() >= purgeEligibleAt.
 * Tombstone (E2) runs at request time (E5), not here.
 * Identity PII hard-redaction runs in db_scrubbing (Option A — not at tombstone).
 *
 * Log prefix: ers (opaque ids only — never email, name, transcript, or blob URLs).
 */

import { createHash, randomUUID } from "node:crypto";
import type { ErasureJobStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { deleteBlob } from "@/lib/blob";
import {
  enumerateLearnerFamilyBlobs,
  resolveErasureScopeStudents,
  type ErasureScope,
} from "@/lib/erasure/blob-inventory";
import { acquireErasureScopeAdvisoryLock } from "@/lib/erasure/erasure-scope-lock";

const DELETED_LEARNER_NAME = "[Deleted learner]";
const TOMBSTONE_AH_DISPLAY_NAME = "[deleted]";
const TOMBSTONE_LP_DISPLAY_NAME = "Deleted learner";
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
  const result = await db.erasureJob.updateMany({
    where: { id: jobId, status: from },
    data: { status: to, lastError: null, ...extra },
  });
  if (result.count === 0) {
    console.log(
      `[ers] action=phase_advance_aborted from=${from} to=${to} ers=${jobId} reason=status_mismatch`
    );
    throw new Error(
      `ErasureJob phase advance aborted: job ${jobId} is no longer in status "${from}"`
    );
  }
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

async function scrubIdentityPii(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  scope: ErasureScope,
  jobId: string
): Promise<void> {
  if (scope.kind === "account_holder") {
    const tombstoneEmail = `deleted+${randomUUID()}@erased.invalid`;
    await tx.accountHolder.update({
      where: { id: scope.id },
      data: {
        email: tombstoneEmail,
        passwordHash: null,
        displayName: TOMBSTONE_AH_DISPLAY_NAME,
        familyId: null,
      },
    });

    await tx.learnerProfile.updateMany({
      where: { accountHolderId: scope.id, isTestFixture: false },
      data: { displayName: TOMBSTONE_LP_DISPLAY_NAME },
    });

    await tx.learnerCredential.deleteMany({
      where: { accountHolderId: scope.id },
    });
  } else {
    await tx.learnerProfile.update({
      where: { id: scope.id },
      data: { displayName: TOMBSTONE_LP_DISPLAY_NAME },
    });

    await tx.learnerCredential.deleteMany({
      where: { learnerProfileId: scope.id },
    });
  }

  console.log(
    `[ers] action=scrub_identity_pii scope=${scope.kind} ers=${jobId}`
  );
}

async function scrubDbContent(
  scope: ErasureScope,
  jobId: string,
  studentIds: string[],
  sessionIds: string[]
): Promise<void> {
  if (studentIds.length === 0 && sessionIds.length === 0) {
    await db.$transaction(async (tx) => {
      await scrubIdentityPii(tx, scope, jobId);
    });
    return;
  }

  await db.$transaction(async (tx) => {
    if (sessionIds.length > 0) {
      await tx.whiteboardEventBatch.deleteMany({
        where: { whiteboardSessionId: { in: sessionIds } },
      });
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

    await scrubIdentityPii(tx, scope, jobId);
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

    // H-2 second pass: re-enumerate and purge straggler blobs BEFORE scrubDbContent
    // deletes the DB rows/columns that enumerateLearnerFamilyBlobs reads. A blob from
    // an in-flight upload during blobs_purging is only discoverable while its row
    // still exists. (A residual micro-window remains if an upload lands during the
    // scrub transaction — closed separately by endWhiteboardSession erasure short-circuit.)
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

    await scrubDbContent(scope, jobId, studentIds, sessionIds);

    const completedAt = new Date();
    await advancePhase(jobId, "db_scrubbing", "completed", { completedAt });
    console.log(`[ers] action=completed ers=${jobId}`);
    return { status: "completed" };
  }

  return { status: job.status };
}

/**
 * Cancel an erasure job during the grace window (status === requested only).
 * True restore: clears tombstones and re-enables credentials in one transaction.
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

  try {
    await db.$transaction(async (tx) => {
      await acquireErasureScopeAdvisoryLock(tx, job.scopeKind, job.scopeId);

      const canceledAt = new Date();
      const statusUpdate = await tx.erasureJob.updateMany({
        where: { id: jobId, status: "requested" },
        data: { status: "canceled", canceledAt },
      });

      if (statusUpdate.count === 0) {
        throw new Error(
          `Cannot cancel erasure job in status other than "requested" — concurrent status change`
        );
      }

      if (job.scopeKind === "account_holder") {
        await tx.accountHolder.update({
          where: { id: job.scopeId },
          data: { tombstonedAt: null },
        });
        console.log(
          `[ers] action=untombstone_account_holder scopeId=${job.scopeId} ers=${jobId}`
        );

        const childProfiles = await tx.learnerProfile.findMany({
          where: { accountHolderId: job.scopeId, isTestFixture: false },
          select: { id: true },
        });

        for (const child of childProfiles) {
          await tx.learnerProfile.update({
            where: { id: child.id },
            data: { tombstonedAt: null },
          });
          console.log(
            `[ers] action=untombstone_learner_profile scopeId=${child.id} ers=${jobId}`
          );
        }

        const credResult = await tx.learnerCredential.updateMany({
          where: { accountHolderId: job.scopeId },
          data: { disabled: false },
        });
        console.log(
          `[ers] action=credential_reenabled count=${credResult.count} ers=${jobId}`
        );
      } else {
        await tx.learnerProfile.update({
          where: { id: job.scopeId },
          data: { tombstonedAt: null },
        });
        console.log(
          `[ers] action=untombstone_learner_profile scopeId=${job.scopeId} ers=${jobId}`
        );

        const credResult = await tx.learnerCredential.updateMany({
          where: { learnerProfileId: job.scopeId },
          data: { disabled: false },
        });
        console.log(
          `[ers] action=credential_reenabled count=${credResult.count} ers=${jobId}`
        );
      }

      console.log(`[ers] action=cancel_restore_completed ers=${jobId}`);
    });
  } catch (err) {
    const msg = sanitizeError(err);
    console.error(`[ers] action=cancel_restore_failed ers=${jobId} error=${msg}`);
    throw err;
  }

  return { status: "canceled" };
}
