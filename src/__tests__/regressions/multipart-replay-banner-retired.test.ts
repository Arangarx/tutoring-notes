/**
 * Literal-needle tripwire for the retired replay banner.
 * Reworded copy is covered by the render oracle in
 * WhiteboardReplayInFrame.dom.test.tsx (multi-segment, no concat URL).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { RETIRED_REPLAY_BANNER_NEEDLES } from "@/__tests__/helpers/retired-replay-banner-needles";

const SRC_ROOT = join(__dirname, "..", "..");
const NEEDLE_DEFINITION = join(
  SRC_ROOT,
  "__tests__",
  "helpers",
  "retired-replay-banner-needles.ts"
);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, acc);
    } else if (/\.(ts|tsx|css|js|jsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("multi-part replay banner stays removed", () => {
  it("does not contain the retired banner copy or hooks anywhere under src/", () => {
    const hits: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      if (file === NEEDLE_DEFINITION) continue;
      const text = readFileSync(file, "utf8");
      for (const needle of RETIRED_REPLAY_BANNER_NEEDLES) {
        if (text.includes(needle)) {
          hits.push(`${relative(SRC_ROOT, file)} contains ${JSON.stringify(needle)}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
