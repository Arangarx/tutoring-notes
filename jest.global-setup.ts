import { execSync } from "node:child_process";

const { jestDatabaseUrl } = require("./scripts/pw-stack.cjs");

export default async function globalSetup() {
  // Always use a dedicated test database — never the dev DB from .env.
  // TEST_DATABASE_URL wins. Otherwise PW_DB_NAME, else tutoring_notes_test.
  const testUrl = jestDatabaseUrl();
  process.env.DATABASE_URL = testUrl;
  process.env.DIRECT_URL = testUrl;
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "test-secret";
  process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
  process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "replace-me";

  try {
    // Use --force-reset to handle structural changes (new NOT NULL columns, dropped constraints, etc.)
    // Safe: this always targets the dedicated local test DB named below, never production.
    const dbName = new URL(testUrl).pathname.replace(/^\//, "");
    execSync("npx prisma db push --force-reset --skip-generate", {
      stdio: "inherit",
      env: {
        ...process.env,
        PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION:
          `jest global-setup: force-reset the local test DB (${dbName} at 127.0.0.1:5432) on every test run to keep schema in sync. Safe: this is an ephemeral test database.`,
      },
    });
    execSync("node scripts/apply-org-learner-guards.cjs", {
      stdio: "inherit",
      env: process.env,
    });
  } catch {
    // DB not reachable — unit tests (mocked, no DB) will still pass.
    // Integration tests that need the DB will fail on their own connection errors.
    console.warn(
      "[globalSetup] Could not reach test database — skipping db push. Unit-only tests will still run."
    );
  }
}
