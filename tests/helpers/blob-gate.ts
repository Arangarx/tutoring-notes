import { readLocalEnv } from "../utils/read-dotenv";

const SKIP_MESSAGE =
  "Blob harness not enabled (set PLAYWRIGHT_TEST=1 and BLOB_HARNESS_LOCAL=1, or BLOB_READ_WRITE_TOKEN).";

/**
 * True when Playwright hermetic harness is on OR a real Blob token is configured.
 * Harness path requires BOTH sentinels (matches server `isBlobHarnessActive()`).
 */
export function blobIntegrationEnabled(): boolean {
  const harnessOn =
    process.env.PLAYWRIGHT_TEST === "1" && process.env.BLOB_HARNESS_LOCAL === "1";
  if (harnessOn) return true;
  const fromEnv = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (fromEnv) return true;
  const fromDotenv = readLocalEnv().BLOB_READ_WRITE_TOKEN?.trim();
  return Boolean(fromDotenv);
}

export function blobIntegrationSkipMessage(): string {
  return SKIP_MESSAGE;
}
