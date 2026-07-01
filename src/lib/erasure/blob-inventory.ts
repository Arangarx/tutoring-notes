/**
 * Erasure blob inventory enumerator (E3).
 *
 * Read-only: discovers every Vercel Blob URL in scope for learner/family erasure.
 * Purge (`deleteBlob`) is E4; this module never deletes blobs.
 *
 * H-2 (re-enumeration): safe to call multiple times — no caching. E4 must run a
 * post-quiescence re-enumeration pass before marking blob purge complete so
 * in-flight uploads after the first inventory are not orphaned.
 *
 * H-3 / M-5 (scale): per-session events.json fetch is acceptable at pilot scale.
 * If a family exceeds ~100 sessions, the per-session loop risks the Vercel 30s
 * budget; E4 should checkpoint enumeration progress per session in
 * `blobInventoryJson` (resumability is E4's job — no WhiteboardAsset /
 * ErasureJobBlob tables in E3).
 *
 * Log prefix: ers (opaque ids only — never email, name, transcript, or PII paths).
 */

import { createHash } from "node:crypto";
import { list } from "@vercel/blob";
import type { ErasureScopeKind } from "@prisma/client";
import { db } from "@/lib/db";
import { fetchPrivateBlobBytes } from "@/lib/blob";
import { collectReplayAssetUrls } from "@/lib/whiteboard/replay-helpers";
import type { WBEventLog } from "@/lib/whiteboard/event-log";

export type ErasureScope = {
  kind: ErasureScopeKind;
  id: string;
};

export type ResolvedErasureScope = {
  studentIds: string[];
  sessionIds: string[];
};

export type BlobInventoryResult = {
  urls: Set<string>;
  /** events.json fetches that failed (404, parse error, etc.) — imperfect inventory */
  eventsFetchFailures: number;
};

function hashBlobUrlForLog(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 12);
}

function addUrl(urls: Set<string>, url: string | null | undefined): void {
  if (url && url.trim().length > 0) {
    urls.add(url);
  }
}

/**
 * Resolves in-scope Student and WhiteboardSession ids for an erasure scope.
 *
 * - `learner_profile`: all Student rows linked to the profile (multi-tutor) + their sessions.
 * - `account_holder`: all LearnerProfile children → their Students → their sessions.
 */
export async function resolveErasureScopeStudents(
  scope: ErasureScope
): Promise<ResolvedErasureScope> {
  let studentIds: string[];

  if (scope.kind === "learner_profile") {
    const students = await db.student.findMany({
      where: { learnerProfileId: scope.id },
      select: { id: true },
    });
    studentIds = students.map((s) => s.id);
  } else {
    const profiles = await db.learnerProfile.findMany({
      where: { accountHolderId: scope.id },
      select: { id: true },
    });
    const profileIds = profiles.map((p) => p.id);
    if (profileIds.length === 0) {
      studentIds = [];
    } else {
      const students = await db.student.findMany({
        where: { learnerProfileId: { in: profileIds } },
        select: { id: true },
      });
      studentIds = students.map((s) => s.id);
    }
  }

  if (studentIds.length === 0) {
    return { studentIds: [], sessionIds: [] };
  }

  const sessions = await db.whiteboardSession.findMany({
    where: { studentId: { in: studentIds } },
    select: { id: true },
  });

  return {
    studentIds,
    sessionIds: sessions.map((s) => s.id),
  };
}

async function listCheckpointBlobsForSession(sessionId: string): Promise<string[]> {
  const prefix = `whiteboard-checkpoints/${sessionId}/`;
  const urls: string[] = [];
  let cursor: string | undefined;

  for (;;) {
    const page = await list({
      prefix,
      limit: 1000,
      cursor,
    });
    for (const blob of page.blobs) {
      urls.push(blob.url);
    }
    if (!page.hasMore || !page.cursor) break;
    cursor = page.cursor;
  }

  return urls;
}

async function collectEmbeddedAssetUrls(
  eventsBlobUrl: string,
  sessionId: string
): Promise<{ assetUrls: string[]; failed: boolean }> {
  try {
    const { buffer } = await fetchPrivateBlobBytes(eventsBlobUrl);
    const parsed = JSON.parse(buffer.toString("utf8")) as WBEventLog;
    return { assetUrls: collectReplayAssetUrls(parsed), failed: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[ers] action=blob_inventory_events_fetch_failed sessionId=${sessionId} urlHash=${hashBlobUrlForLog(eventsBlobUrl)} error=${msg}`
    );
    return { assetUrls: [], failed: true };
  }
}

/**
 * Enumerates every blob URL that must be purged for the given erasure scope.
 * Re-callable (H-2); returns current DB + blob-store state on each invocation.
 */
export async function enumerateLearnerFamilyBlobs(
  scope: ErasureScope
): Promise<BlobInventoryResult> {
  const urls = new Set<string>();
  let eventsFetchFailures = 0;

  const { studentIds, sessionIds } = await resolveErasureScopeStudents(scope);

  if (studentIds.length > 0) {
    const recordings = await db.sessionRecording.findMany({
      where: { studentId: { in: studentIds } },
      select: { blobUrl: true },
    });
    for (const rec of recordings) {
      addUrl(urls, rec.blobUrl);
    }
  }

  if (sessionIds.length > 0) {
    const sessions = await db.whiteboardSession.findMany({
      where: { id: { in: sessionIds } },
      select: {
        id: true,
        eventsBlobUrl: true,
        snapshotBlobUrl: true,
      },
    });

    const chunks = await db.transcriptChunk.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { chunkBlobUrl: true },
    });
    for (const chunk of chunks) {
      addUrl(urls, chunk.chunkBlobUrl);
    }

    for (const session of sessions) {
      addUrl(urls, session.eventsBlobUrl);
      addUrl(urls, session.snapshotBlobUrl);

      if (session.eventsBlobUrl) {
        const { assetUrls, failed } = await collectEmbeddedAssetUrls(
          session.eventsBlobUrl,
          session.id
        );
        if (failed) {
          eventsFetchFailures += 1;
        }
        for (const assetUrl of assetUrls) {
          urls.add(assetUrl);
        }
      }

      const checkpointUrls = await listCheckpointBlobsForSession(session.id);
      for (const checkpointUrl of checkpointUrls) {
        urls.add(checkpointUrl);
      }
    }
  }

  console.log(
    `[ers] action=blob_inventory scopeKind=${scope.kind} scopeId=${scope.id} students=${studentIds.length} sessions=${sessionIds.length} urls=${urls.size} fetch_failures=${eventsFetchFailures}`
  );

  return { urls, eventsFetchFailures };
}
