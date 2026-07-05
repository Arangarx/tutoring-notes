import { readLocalEnv } from "../utils/read-dotenv";

const SKIP_MESSAGE =
  "Blob harness not enabled (set BLOB_HARNESS_LOCAL=1 or BLOB_READ_WRITE_TOKEN).";

/**
 * True when Playwright hermetic harness is on OR a real Blob token is configured.
 * Checks `process.env` first, then `.env` file (same precedence as spec).
 */
export function blobIntegrationEnabled(): boolean {
  if (process.env.BLOB_HARNESS_LOCAL === "1") return true;
  const fromEnv = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (fromEnv) return true;
  const fromDotenv = readLocalEnv().BLOB_READ_WRITE_TOKEN?.trim();
  return Boolean(fromDotenv);
}

export function blobIntegrationSkipMessage(): string {
  return SKIP_MESSAGE;
}
