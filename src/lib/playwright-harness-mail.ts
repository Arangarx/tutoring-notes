import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { normalizeEmail } from "@/lib/normalize-email";
import { isPlaywrightHarnessActive } from "@/lib/playwright-harness";

export type HarnessMailKind = "tutor-verify" | "org-invite";

function harnessMailFile(kind: HarnessMailKind, email: string): string {
  const key = createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 32);
  return path.join(tmpdir(), "tutoring-notes-harness-mail", kind, `${key}.txt`);
}

/** Local Playwright only. The file holds the link that platform mail would have sent. */
export function writeHarnessMailUrl(kind: HarnessMailKind, email: string, url: string): void {
  if (!isPlaywrightHarnessActive()) return;
  const file = harnessMailFile(kind, email);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, url, "utf8");
}

export function readHarnessMailUrl(kind: HarnessMailKind, email: string): string | null {
  try {
    const text = readFileSync(harnessMailFile(kind, email), "utf8").trim();
    return text || null;
  } catch {
    return null;
  }
}
