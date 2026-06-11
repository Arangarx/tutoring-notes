# Local development — database and `.env`

The Prisma schema is **PostgreSQL only** (committed in `prisma/schema.prisma`). You do **not** flip the provider in git for deploy vs local — you only change **which database URLs** are in your **local `.env`** (gitignored).

## What gets committed vs what does not

| Committed | Not committed |
|-----------|----------------|
| `docker-compose.yml`, `docker/postgres/init/*` | `.env` — your real URLs and secrets |
| `.env.example` — **templates** with placeholder/local-safe values | Production Neon URLs (paste only in Vercel + your private `.env` when needed) |

Using the **same placeholder passwords** in `.env.example` as in `docker-compose.yml` is intentional: they are **local-only** defaults, not production secrets.

## Option A: Docker Postgres (recommended)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / macOS) or Docker Engine (Linux).

   `npm run db:up`, `npm run relay:build`, and `npm run test:wb-sync` call `ensure:docker` first: if the daemon is down, they start Docker Desktop (or `systemctl start docker` on Linux) and wait up to **180s** (override with `DOCKER_WAIT_TIMEOUT_MS`).

2. Start Postgres:

   ```bash
   npm run db:up
   ```

   This creates:

   - Database `tutoring_notes` — for `next dev`
   - Database `tutoring_notes_test` — for `npm test` (see `jest.global-setup.ts`)

3. Copy `.env.example` → `.env` and use the **Local Docker** URLs already shown there (`DATABASE_URL` + `DIRECT_URL` pointing at `tutoring_notes` on `127.0.0.1:5432`).

4. Apply the schema:

   ```bash
   npm run db:push
   ```

5. Run the app: `npm run dev`

To stop Postgres: `npm run db:down`  
To reset Docker data completely (wipes DBs): `docker compose down -v` then `npm run db:up` again.

## Option B: Neon dev branch (no Docker)

Create a free Neon project or a **branch** used only for development. Put the **pooled** URL in `DATABASE_URL` and **direct** URL in `DIRECT_URL` in your `.env`. Run `npm run db:push` once.

Jest still defaults to `postgresql://...@127.0.0.1:5432/tutoring_notes_test` unless you set `TEST_DATABASE_URL` in `.env` to a separate Neon database/branch for tests.

## Prod → dev DB mirror harness (destructive-op scripts)

Some maintenance CLIs assume **matching schema** plus realistic prod-like rows while pointing at Neon **development** blobs or tokens (for example [`scripts/blob-cleanup.mjs`](../scripts/blob-cleanup.mjs) runbook). Typical patterns:

### Neon-native copy

1. In the Neon console, duplicate the prod branch via **Branch from parent** into a disposable dev branch (`prod-mirror-<date>`), or refresh an existing mirror branch periodically.
2. Put that branch URL in **`DEV_DATABASE_URL`** (or **`PROD_DATABASE_URL` when practising against a cloned snapshot only—never confuse with live prod**) while practising `--dry-run` flows.

### Logical dump restore (PostgreSQL)

From a workstation with networking to both Neon endpoints:

```bash
pg_dump "$PRODUCTION_URL" \
  --no-owner --format=custom --file tutoring-notes-prod.dump

pg_restore "$DEV_MIRROR_URL" \
  --no-owner --clean --if-exists tutoring-notes-prod.dump
```

On Windows shells, substitute `set` / `$env:` as needed. Prefer **temporary** Neon branches dedicated to rehearsals so Preview traffic never shares credentials with practise dumps.

**Rule of thumb:** any script that deletes shared infrastructure (blobs + DB-backed references) rehearses against a **cloned** database first and only swaps in live Neon URLs plus `--delete` after manual review.

## Vercel / production

Set `DATABASE_URL` and `DIRECT_URL` in the Vercel project to your **production** Neon strings. No code change — only host env vars.

### Production Neon (tables / schema)

**Default:** Vercel runs **`prisma migrate deploy`** on every production build, using `DATABASE_URL` + `DIRECT_URL` from Vercel. You usually **do not** run anything manually for the live DB.

**Fallback** (broken deploy, emergency): from this folder, with Neon’s pooled + direct strings:

```powershell
$env:DATABASE_URL = "<pooled connection string>"
$env:DIRECT_URL   = "<direct connection string>"
npx prisma migrate deploy
```

Or **`scripts\push-schema-neon.ps1`** (uses `db push` — prefer `migrate deploy` when possible). See **[DEPLOY.md](./DEPLOY.md)**.

## Whiteboard regression net (`npm run test:wb-sync`)

Real-browser Playwright tests over a **local Docker relay** (not production `wss://wb.mortensenapps.com`). Requires Docker Desktop, Node 20+, and local Postgres (`npm run db:up`). Optional: `BLOB_READ_WRITE_TOKEN` in `.env` for image/PDF invariants 7 and 8 (tests self-skip if unset).

**You do not need to edit `.env` for `DATABASE_URL`.** The harness forces local Docker Postgres (`postgresql://postgres:postgres@127.0.0.1:5432/tutoring_notes`) for the Playwright runner (globalSetup + seed), the dev `webServer` (`prisma db push` + `npm run dev`), and both set `DIRECT_URL` to the same value. A **host safety rail** aborts immediately if the effective `DATABASE_URL` host is not `localhost` / `127.0.0.1` — so Neon/production URLs in `.env` cannot be used even by mistake.

1. `npm run db:up` (schema is applied by Playwright’s `prisma db push` on first run; `npm run db:push` is optional beforehand).
2. One-time relay image: `npm run relay:build` (builds `wb-relay-local` from sibling `../whiteboard-sync`).
3. Run the gate: `npm run test:wb-sync` (Jest whiteboard suites + Playwright `wb-regression` project).

Playwright starts the Next dev server on port **3100** with `WHITEBOARD_SYNC_URL=ws://localhost:3002` and polls `http://localhost:3002/` until the relay is up. See `docs/PLATFORM-ASSUMPTIONS.md` §9.4–9.5.

Pre-merge: any whiteboard-touching branch must show green `npm run test:wb-sync` before `git merge --no-ff` (see `AGENTS.md`).

## Migrating from old SQLite `dev.db`

If you previously used SQLite, that file is obsolete for this schema. Start Postgres (Docker or Neon), point `.env` at it, run `npm run db:push`, and recreate admin data via `/setup` if needed. Optionally export/import data separately — not automated here.
