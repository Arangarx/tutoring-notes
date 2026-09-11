import { PrismaClient } from "@prisma/client";

const REQUIRED_DB_NAME = "tutoring_notes_test";
const REQUIRED_PORT = "5432";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const TRUNCATE_ADVISORY_LOCK_KEY = 0x7e57_7e57; // "TEST" — serializes per-test cleanup

/** Fail-closed: only the dedicated local jest Postgres may be truncated. */
export function isSafeLocalTestDatabaseUrl(urlString: string): boolean {
  const url = urlString.trim();
  if (!url) return false;

  const lower = url.toLowerCase();
  if (
    lower.includes("neon.tech") ||
    lower.includes(".neon.") ||
    lower.includes("vercel-storage") ||
    lower.includes("amazonaws.com") ||
    lower.includes("supabase.co") ||
    lower.startsWith("file:")
  ) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (!LOCAL_HOSTS.has(host)) return false;

  const port = parsed.port || REQUIRED_PORT;
  if (port !== REQUIRED_PORT) return false;

  const dbName = decodeURIComponent(
    parsed.pathname.replace(/^\//, "").split("/")[0] ?? ""
  );
  if (dbName !== REQUIRED_DB_NAME) return false;

  return true;
}

let truncateChain: Promise<void> = Promise.resolve();
let truncateClient: PrismaClient | undefined;

/** Skip truncate for suites that never touch Postgres (jsdom / pure unit). */
export function shouldRunDbReset(): boolean {
  const path = (expect.getState().testPath ?? "").replace(/\\/g, "/");
  if (path.includes(".dom.test.")) return false;
  if (path.includes("/hooks/")) return false;
  if (path.includes("/recording/upload-outbox.test")) return false;
  if (path.includes("/whiteboard/sync-client.test")) return false;
  if (path.includes("/recording/extract-chunk.test")) return false;
  if (path.includes("/transcription-worker.test")) return false;
  if (path.includes("/recording/notes-enqueue.test")) return false;
  if (path.includes("/recording/lifecycle-machine")) return false;
  return true;
}

/** Await any in-flight truncate from the prior test's afterEach. */
export async function awaitPendingTruncate(): Promise<void> {
  await truncateChain;
}

function getTruncateClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!truncateClient) {
    truncateClient = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
      log: [],
    });
  }
  return truncateClient;
}

async function terminateIdleInTransactionBackends(
  client: PrismaClient
): Promise<void> {
  await client.$executeRawUnsafe(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND state IN ('idle in transaction', 'idle in transaction (aborted)')
  `);
}

async function drainEventLoop(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise<void>((r) => setImmediate(r));
  }
}

async function truncateAllPublicTables(): Promise<void> {
  await drainEventLoop();

  const client = getTruncateClient();
  await terminateIdleInTransactionBackends(client);

  await client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(${TRUNCATE_ADVISORY_LOCK_KEY})`
    );
    await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '5000'`);
    await tx.$executeRawUnsafe(`
      DO $do$
      DECLARE
        tables text;
      BEGIN
        SELECT string_agg(format('%I', tablename), ', ')
        INTO tables
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename <> '_prisma_migrations';

        IF tables IS NOT NULL THEN
          EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
        END IF;
      END $do$;
    `);
  });
}

/**
 * Truncate every public table (except `_prisma_migrations`) in the local
 * jest test database. No-ops when `DATABASE_URL` does not clearly target
 * `tutoring_notes_test` on localhost:5432 — fail-closed against Neon/preview.
 */
export async function resetTestDatabase(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!isSafeLocalTestDatabaseUrl(databaseUrl)) {
    return;
  }

  const run = async () => {
    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await truncateAllPublicTables();
        return;
      } catch (err) {
        const code =
          err &&
          typeof err === "object" &&
          "code" in err &&
          typeof (err as { code: unknown }).code === "string"
            ? (err as { code: string }).code
            : "";
        const retriable =
          code === "40P01" || code === "55P03" || code === "57014";
        if (!retriable || attempt === maxAttempts - 1) {
          return;
        }
        await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
      }
    }
  };

  truncateChain = truncateChain.then(run, run);
  await truncateChain;
}
