/**
 * Runs before `@/lib/blob` is loaded.
 *
 * `src/lib/env.ts` parses the process environment at import time, and a
 * dynamic `import()` of those modules skips Playwright's TypeScript loader
 * ("Cannot use import statement outside a module"). A static import, which
 * the rest of the Playwright suite already uses, evaluates this file first
 * so the token and the local database URL are set before that parse.
 * The token value is never logged. An already-set token is kept, matching
 * Next's rule that existing environment variables win over env files — the
 * same rule `next start` uses for this suite.
 */

import fs from "node:fs";
import path from "node:path";
import { parse as parseEnvFile } from "dotenv";
import { PROD_SHAPE_NEXTAUTH_SECRET } from "../helpers/prod-shape-secret";

const { applyWbRegressionLocalDatabaseEnv, assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

applyWbRegressionLocalDatabaseEnv();
assertLocalDatabaseUrlForHarness();

if (!process.env.NEXTAUTH_SECRET) {
  process.env.NEXTAUTH_SECRET = PROD_SHAPE_NEXTAUTH_SECRET;
}
if (!process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = "http://localhost:3102";
}

if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
  const file = path.join(process.cwd(), ".env.production.local");
  let token: string | undefined;
  try {
    token = parseEnvFile(fs.readFileSync(file)).BLOB_READ_WRITE_TOKEN?.trim();
  } catch {
    throw new Error("prod-shape cleanup could not read the production-local env file");
  }
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is unset");
  process.env.BLOB_READ_WRITE_TOKEN = token;
}

const productionLocked =
  process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
if (
  !productionLocked &&
  process.env.PLAYWRIGHT_TEST === "1" &&
  process.env.BLOB_HARNESS_LOCAL === "1"
) {
  throw new Error(
    "prod-shape cleanup refused: the blob harness is active, so a delete would miss the real store"
  );
}
