/**
 * The ONE blob lister.
 *
 * Every "what is under this prefix" read goes through `listBlobsByPrefix`, so the
 * Playwright blob harness (a hermetic in-memory store) is honoured in one place
 * and the real `@vercel/blob` `list` is imported in one place. Before consent
 * wave C0 two files each carried their own copy of the cursor loop
 * (`erasure/blob-inventory.ts`, `whiteboard/assemble-persisted-state.ts`).
 *
 * Under the harness gate (`isBlobHarnessActive`: PLAYWRIGHT_TEST=1 and
 * BLOB_HARNESS_LOCAL=1, never in production) the listing comes from the harness
 * store. Everywhere else this is exactly the `list` loop it replaced.
 *
 * SERVER-ONLY (uses the Blob token via @vercel/blob).
 */

import { list } from "@vercel/blob";
import {
  harnessBlobUrl,
  harnessRequestOrigin,
  harnessStoreList,
  isBlobHarnessActive,
} from "@/lib/blob-harness";

export type ListedBlob = {
  url: string;
  pathname: string;
  size: number;
};

/** Every blob whose pathname starts with `prefix` (all pages). */
export async function listBlobsByPrefix(prefix: string): Promise<ListedBlob[]> {
  if (isBlobHarnessActive()) {
    const origin = harnessRequestOrigin();
    return harnessStoreList(prefix).map(({ key, size }) => ({
      url: harnessBlobUrl(origin, key),
      pathname: key,
      size,
    }));
  }

  const out: ListedBlob[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await list({ prefix, limit: 1000, cursor });
    for (const blob of page.blobs) {
      out.push({ url: blob.url, pathname: blob.pathname, size: blob.size });
    }
    if (!page.hasMore || !page.cursor) break;
    cursor = page.cursor;
  }
  return out;
}

/** Legacy per-session checkpoint blobs (`whiteboard-checkpoints/<sessionId>/…`). */
export async function listCheckpointBlobsForSession(
  sessionId: string
): Promise<string[]> {
  const blobs = await listBlobsByPrefix(`whiteboard-checkpoints/${sessionId}/`);
  return blobs.map((b) => b.url);
}
