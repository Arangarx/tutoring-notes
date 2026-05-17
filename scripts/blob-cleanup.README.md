# `blob-cleanup.mjs`

Operational utility that **lists** or **hard-deletes** Vercel Blobs whose URLs are absent from **both** production and development Postgres databases (`SessionRecording.blobUrl`, `WhiteboardSession.eventsBlobUrl`, `WhiteboardSession.snapshotBlobUrl`). The shared Blob store sees uploads from Preview (dev DB) and production; **checking only prod would mark dev-backed blobs as orphans** — destructive and wrong — so **both Neon URLs are mandatory**.

## Environment

| Variable | Required | Purpose |
|---------|----------|---------|
| `PROD_DATABASE_URL` | Yes* | Neon (or mirrored) prod branch connection string |
| `DEV_DATABASE_URL` | Yes* | Neon dev branch — must differ from prod URL |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob read/write token for the shared store |

\*Or pass `--prod-db-url` / `--dev-db-url` flags for one-off runs. Copy values from `.env` / Vercel — never commit real URLs.

**Never paste production credentials into screenshots or transcripts.**

## Recommended workflow before any `--delete`

1. **Mirror prod Neon → dev Neon** using Neon branch/copy or `pg_dump | psql` (see [`docs/LOCAL-DEV.md`](../docs/LOCAL-DEV.md) “Prod mirror harness”).
2. Point `DEV_DATABASE_URL` at the Neon dev branch Preview already uses **or** a disposable copy.
3. Run **dry-run (default)** with real prod + dev URLs plus `BLOB_READ_WRITE_TOKEN` so the orphan list crosses both databases.
4. Manually sanity-check orphans (grep URLs against both DBs with `SELECT`).
5. Only during **low-traffic**, with explicit approvals, run `--delete` against production URLs — still requiring **both** DB env vars.

## Commands

Dry-run only (prints `WOULD_DELETE`):

```powershell
node scripts/blob-cleanup.mjs
```

Tight preview with prefix + cap rehearsal:

```powershell
node scripts/blob-cleanup.mjs --prefix audio/ --min-age-days 14
```

Delete at most ten blobs after confirming counts:

```powershell
node scripts/blob-cleanup.mjs --delete --max-deletions 10
```

Remove the safety ceiling (explicit opt-in):

```powershell
node scripts/blob-cleanup.mjs --delete --no-limit
```

## Safety behaviours

| Check | Behaviour |
|-------|-----------|
| Missing prod or dev URL | Hard-exit (`DUAL-DB CHECK REQUIRED` message) |
| Identical prod + dev URLs | Hard-exit (dual-check pointless) |
| `--dry-run` + `--delete` | Hard-exit |
| Orphans strictly **>** `--max-deletions` while `--delete` | Hard-exit unless `--no-limit` |
| Prod or dev `$connect()` failure | Abort before deletes |
| Unreferenced blobs younger than `--min-age-days` | Skipped |

Logging prefix: `[blob-cleanup] blb=<uuid> …`.
