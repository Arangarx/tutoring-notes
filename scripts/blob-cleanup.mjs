/**
 * Vercel Blob orphan scanner / deleter (dual Neon DB safety).
 *
 * @see blob-cleanup.README.md — runbook, env discipline, Neon mirror workflow.
 */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { URL as NodeURL } from "node:url";

import { list, del, BlobServiceRateLimited } from "@vercel/blob";
import { PrismaClient } from "@prisma/client";

import { isOrphanCandidate, referencedWhere } from "./blob-cleanup-logic.mjs";

const PREFIX = "[blob-cleanup]";
const LOG_KEY = "blb";

const DUAL_DB_MSG =
  "DUAL-DB CHECK REQUIRED: both PROD_DATABASE_URL and DEV_DATABASE_URL must be set; see bootstrapper safety constraint #2 (docs/handoff/housekeeping-utilities-bootstrapper.md).";

function blobHostSnippet(urlStr) {
  try {
    const normalized = /^postgres:/.test(urlStr)
      ? urlStr.replace(/^postgres:/, "postgresql:")
      : urlStr;
    return new NodeURL(normalized).hostname || "(unknown)";
  } catch {
    return "(bad-url)";
  }
}

function usage() {
  console.log(`
Blob cleanup — list/delete Vercel Blobs unreferenced in BOTH prod + dev Neon DBs.

Env (both required unless passed via CLI):
  PROD_DATABASE_URL       Neon prod branch URL
  DEV_DATABASE_URL        Neon dev branch URL (must differ from prod — shared Blob store safety)
  BLOB_READ_WRITE_TOKEN   Vercel Blob token

CLI overrides:
  --prod-db-url <url>
  --dev-db-url <url>
  --dry-run              Force simulation (also the default unless --delete is set)
  --delete               Actually delete (mutually exclusive with --dry-run)
  --min-age-days <n>     Ignore unreferenced blobs newer than N days (default 7)
  --max-deletions <n>    Abort if orphan count exceeds N (default 50)
  --no-limit             Lift --max-deletions cap before --delete
  --prefix <path>        list() pathname prefix filter
  --help / -h

Examples:
  node scripts/blob-cleanup.mjs
  node scripts/blob-cleanup.mjs --delete --max-deletions 10 --prefix audio/
`);
}

/** @returns {string[]} */
function argvList() {
  return process.argv.slice(2);
}

function argvFlag(name) {
  return argvList().includes(name);
}

function argvValue(name) {
  const argv = argvList();
  const i = argv.indexOf(name);
  if (i === -1 || i + 1 >= argv.length || argv[i + 1]?.startsWith("-")) {
    return undefined;
  }
  return argv[i + 1];
}

function parseCli() {
  if (argvFlag("--help") || argvFlag("-h")) {
    usage();
    process.exit(0);
  }

  const hasDeleteFlag = argvFlag("--delete");
  const hasExplicitDryRun = argvFlag("--dry-run");

  if (hasDeleteFlag && hasExplicitDryRun) {
    console.error(
      `${PREFIX} refusing: cannot pass both --dry-run and --delete (contradictory).`
    );
    process.exit(1);
  }

  const dryRun = !hasDeleteFlag;

  let minAgeDays = 7;
  const mad = argvValue("--min-age-days");
  if (mad !== undefined) {
    minAgeDays = Number(mad);
    if (!Number.isFinite(minAgeDays) || minAgeDays < 0) {
      console.error(`${PREFIX} invalid --min-age-days`);
      process.exit(1);
    }
  }

  let maxDeletions = 50;
  const mxd = argvValue("--max-deletions");
  if (mxd !== undefined) {
    maxDeletions = Number(mxd);
    if (!Number.isInteger(maxDeletions) || maxDeletions < 0) {
      console.error(
        `${PREFIX} invalid --max-deletions (need non-negative integer)`
      );
      process.exit(1);
    }
  }

  const noLimit = argvFlag("--no-limit");
  const prefix = argvValue("--prefix") ?? null;

  const prodUrl = argvValue("--prod-db-url") ?? process.env.PROD_DATABASE_URL;
  const devUrl = argvValue("--dev-db-url") ?? process.env.DEV_DATABASE_URL;

  return {
    dryRun,
    minAgeDays,
    maxDeletions,
    noLimit,
    prefix,
    prodUrl,
    devUrl,
  };
}

function requireDualDb(prodUrl, devUrl, log) {
  if (!prodUrl || String(prodUrl).trim() === "") {
    log(`error missing PROD_DATABASE_URL (or --prod-db-url)`);
    console.error(DUAL_DB_MSG);
    process.exit(1);
  }
  if (!devUrl || String(devUrl).trim() === "") {
    log(`error missing DEV_DATABASE_URL (or --dev-db-url)`);
    console.error(DUAL_DB_MSG);
    process.exit(1);
  }
  if (prodUrl === devUrl) {
    log(
      `error PROD_DATABASE_URL equals DEV_DATABASE_URL — dual-check would be meaningless`
    );
    process.exit(1);
  }
}

/**
 * Neon's serverless Postgres (PgBouncer pooler) aggressively closes idle
 * connections. If anything slow (e.g. the Vercel Blob LIST) runs between
 * $connect() and the first query, the next Prisma call dies with
 * "Server has closed the connection". This wrapper catches the typical
 * symptoms and reconnects + retries ONCE before giving up.
 * @template T
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} label
 * @param {() => Promise<T>} fn
 * @param {(s: string) => void} log
 * @param {number} [maxAttempts=2]
 * @returns {Promise<T>}
 */
async function withConnectionRetry(prisma, label, fn, log, maxAttempts = 2) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const code = /** @type {{ code?: string }} */ (e)?.code;
      const isConnLost =
        msg.includes("Server has closed the connection") ||
        msg.includes("Connection terminated") ||
        msg.includes("ECONNRESET") ||
        code === "P1001" ||
        code === "P1017";
      if (!isConnLost || attempt >= maxAttempts) throw e;
      log(`retry label=${label} attempt=${attempt} reason=connection-lost reconnecting`);
      try { await prisma.$disconnect(); } catch {}
      await prisma.$connect();
    }
  }
  throw lastErr;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} label
 * @param {(s: string) => void} log
 */
async function loadReferenceSet(prisma, label, log) {
  const set = new Set();
  const recs = await withConnectionRetry(
    prisma,
    `${label}.sessionRecording`,
    () => prisma.sessionRecording.findMany({ select: { blobUrl: true } }),
    log
  );
  const boards = await withConnectionRetry(
    prisma,
    `${label}.whiteboardSession`,
    () =>
      prisma.whiteboardSession.findMany({
        select: { eventsBlobUrl: true, snapshotBlobUrl: true },
      }),
    log
  );
  for (const r of recs) {
    if (r.blobUrl) set.add(r.blobUrl);
  }
  for (const b of boards) {
    if (b.eventsBlobUrl) set.add(b.eventsBlobUrl);
    if (b.snapshotBlobUrl) set.add(b.snapshotBlobUrl);
  }
  return set;
}

/**
 * @param {string} token
 * @param {string | null} prefix
 * @param {(s: string) => void} log
 */
async function listAllBlobs(token, prefix, log) {
  /** @type {import('@vercel/blob').ListBlobResultBlob[]} */
  const blobs = [];
  /** @type {string | undefined} */
  let cursor;
  for (;;) {
    const page = await list({
      token,
      prefix: prefix ?? undefined,
      limit: 1000,
      cursor,
    });
    blobs.push(...page.blobs);
    log(
      `list-page blobs=${page.blobs.length} hasMore=${page.hasMore} cumulative=${blobs.length}`
    );
    if (!page.hasMore) break;
    if (!page.cursor) break;
    cursor = page.cursor;
    await delay(50);
  }
  return blobs;
}

/**
 * @param {string} token
 * @param {string} url
 * @param {(s: string) => void} log
 */
async function deleteWithBackoff(token, url, log) {
  for (;;) {
    try {
      await del(url, { token });
      return;
    } catch (e) {
      if (e instanceof BlobServiceRateLimited) {
        const waitSec =
          typeof e.retryAfter === "number" && e.retryAfter > 0 ? e.retryAfter : 10;
        const wait = waitSec * 1000;
        log(`429-rate-limit waitMs=${wait} url=${url}`);
        await delay(wait);
        continue;
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
        return;
      }
      throw e;
    }
  }
}

function prismaClientForUrl(databaseUrl) {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
}

async function main() {
  const runId = randomUUID();
  const log = (line) => console.log(`${PREFIX} ${LOG_KEY}=${runId} ${line}`);

  const opts = parseCli();
  requireDualDb(opts.prodUrl, opts.devUrl, log);

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    log("error BLOB_READ_WRITE_TOKEN is required");
    process.exit(1);
  }

  const prodHost = blobHostSnippet(String(opts.prodUrl));
  const devHost = blobHostSnippet(String(opts.devUrl));
  log(
    `prod-db-host=${prodHost} dev-db-host=${devHost} blob-store-token-prefix=${token.slice(0, 8)}`
  );
  log(
    `mode=${opts.dryRun ? "dry-run" : "DELETE"} min-age-days=${opts.minAgeDays} max-deletions=${opts.noLimit ? "no-limit" : opts.maxDeletions} prefix=${opts.prefix ?? "(none)"}`
  );

  const prodPrisma = prismaClientForUrl(String(opts.prodUrl));
  const devPrisma = prismaClientForUrl(String(opts.devUrl));

  try {
    await prodPrisma.$connect();
    log("prod DB connected");
    await devPrisma.$connect();
    log("dev DB connected");

    // Load DB reference sets FIRST (right after $connect, while the Neon
    // pooled connection is warm). If we listed Blobs first, the ~510-blob
    // HTTP round-trip would idle out the Postgres connection and the next
    // Prisma call dies with "Server has closed the connection".
    /** @type {Set<string>} */
    const prodRefs = await loadReferenceSet(prodPrisma, "prod", log);
    /** @type {Set<string>} */
    const devRefs = await loadReferenceSet(devPrisma, "dev", log);

    log(`ref-count prod=${prodRefs.size} dev=${devRefs.size}`);

    const listed = await listAllBlobs(token, opts.prefix, log);

    /** @type {{ url: string; size: number; uploadedAt: Date }[]} */
    const orphans = [];

    let cntProdOnly = 0;
    let cntDevOnly = 0;
    let cntBoth = 0;
    let cntTooNew = 0;

    const minAgeMs = opts.minAgeDays * 86400 * 1000;

    for (const blob of listed) {
      const where = referencedWhere(blob.url, prodRefs, devRefs);
      if (where === "prod") {
        cntProdOnly++;
        log(`KEEP url=${blob.url} referenced-in=prod pathname=${blob.pathname}`);
      } else if (where === "dev") {
        cntDevOnly++;
        log(`KEEP url=${blob.url} referenced-in=dev pathname=${blob.pathname}`);
      } else if (where === "prod,dev") {
        cntBoth++;
        log(
          `KEEP url=${blob.url} referenced-in=prod,dev pathname=${blob.pathname}`
        );
      } else if (
        isOrphanCandidate(blob.url, prodRefs, devRefs, blob.uploadedAt, minAgeMs)
      ) {
        const ageDays = Math.floor(
          (Date.now() - blob.uploadedAt.getTime()) / 86400000
        );
        orphans.push({
          url: blob.url,
          size: blob.size,
          uploadedAt: blob.uploadedAt,
        });
        log(
          `ORPHAN url=${blob.url} size=${blob.size} ageDays=${ageDays} checked-db=prod+dev`
        );
      } else {
        cntTooNew++;
        const ageDays = Math.floor(
          (Date.now() - blob.uploadedAt.getTime()) / 86400000
        );
        log(
          `SKIP too-new-unreferenced ageDays=${ageDays} (< min-age-days=${opts.minAgeDays}) url=${blob.url}`
        );
      }
    }

    if (opts.dryRun) {
      for (const o of orphans) {
        const ageDays = Math.floor(
          (Date.now() - o.uploadedAt.getTime()) / 86400000
        );
        log(`WOULD-DELETE url=${o.url} ageDays=${ageDays} size=${o.size}`);
      }
      console.log("");
      console.log(
        `${PREFIX} ${LOG_KEY}=${runId} SUMMARY LISTED=${listed.length} REF-PROD-ONLY=${cntProdOnly} REF-DEV-ONLY=${cntDevOnly} REF-BOTH=${cntBoth} TOO_NEW_UNREF=${cntTooNew} ORPHANS=${orphans.length} DELETED=0 WOULD_DELETE=${orphans.length}`
      );
      return;
    }

    if (!opts.noLimit && orphans.length > opts.maxDeletions) {
      log(
        `REFUSE orphans=${orphans.length} exceeds max-deletions=${opts.maxDeletions} — raise cap or review list first`
      );
      process.exit(1);
    }

    let deleted = 0;
    for (const o of orphans) {
      await deleteWithBackoff(token, o.url, log);
      deleted++;
      log(`deleted url=${o.url}`);
      await delay(100);
    }

    console.log("");
    console.log(
      `${PREFIX} ${LOG_KEY}=${runId} SUMMARY LISTED=${listed.length} REF-PROD-ONLY=${cntProdOnly} REF-DEV-ONLY=${cntDevOnly} REF-BOTH=${cntBoth} TOO_NEW_UNREF=${cntTooNew} ORPHANS=${orphans.length} DELETED=${deleted}`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.stack ?? e.message : String(e);
    log(`fatal ${msg}`);
    process.exitCode = 1;
  } finally {
    await prodPrisma.$disconnect().catch(() => {});
    await devPrisma.$disconnect().catch(() => {});
  }
}

await main();
