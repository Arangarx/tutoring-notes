import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = join(__dirname, "../docs/eval");
// First create `_raw-extract-b3b4-prompt.txt` (copy of the <user_query> user_message from
// Cursor agent JSONL) or the script will fail — see docs/eval/README.md.
const raw = fs.readFileSync(join(path, "_raw-extract-b3b4-prompt.txt"), "utf8");
const body = raw
  .replace(/^<user_query>\s*/i, "")
  .replace(/<\/user_query>\s*$/i, "")
  .trim();

const splitMarker = "there we go um I've been doing testing";
const i = body.indexOf(splitMarker);
if (i === -1) {
  console.error("split marker not found");
  process.exit(1);
}
const partA = body.slice(0, i).trim();
const partB = body.slice(i).trim();

const out = [
  "# Sarah B3 / B4 evaluation transcripts",
  "",
  "**Retention:** keep until B3 (umbrella topics) and B4 (trailing / next-session) are implemented and re-eval’d.",
  "Source: user paste; extracted 2026-04-25 from Cursor transcript JSONL (`ba79d3b8-…`).",
  "",
  "---",
  "",
  "## Transcript 1 — recording `410b-4302-b12a-15db508c2d36`",
  "",
  "*(parametric / curve work; includes scheduling “9 a.m. tomorrow” before long ASR tail.)*",
  "",
  partA,
  "",
  "---",
  "",
  "## Transcript 2 — recording id TBD in product DB",
  "",
  "*(hyperbola / parabola / directrix; includes “tomorrow at 3:15 online”; opens with app upload feedback.)*",
  "",
  partB,
  "",
].join("\n");

fs.writeFileSync(join(path, "sarah-b3b4-evaluation-transcripts.md"), out, "utf8");
console.log("wrote", out.length, "chars to sarah-b3b4-evaluation-transcripts.md");
const rawPath = join(path, "_raw-extract-b3b4-prompt.txt");
if (fs.existsSync(rawPath)) {
  fs.unlinkSync(rawPath);
  console.log("removed _raw-extract-b3b4-prompt.txt");
}
