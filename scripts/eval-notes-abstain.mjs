/**
 * Real-model eval for notes abstain (SMOKE-NOTES-3).
 * Loads OPENAI_API_KEY from the repo .env and never prints it or any other env value.
 *
 * Each fixture runs RUNS times at the reduce temperature in notes-prompts.ts.
 * Non-teaching must come back with every note field empty.
 * Teaching must come back with a non-empty topics field that names the subject.
 *
 * Usage: npm run eval:notes-abstain
 */
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

// Node loads the prompt module as TypeScript. App imports stay extensionless;
// this hook only applies to this process.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier.startsWith(".") &&
      !/\.(?:[cm]?js|ts|json|node)$/.test(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** First non-empty OPENAI_API_KEY. Worktree .env is preferred; a blank value falls through. */
function readEnvKey(path, name) {
  if (!existsSync(path)) return "";
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq).trim() !== name) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) return value;
  }
  return "";
}

const keyFiles = [
  resolve(root, ".env"),
  resolve(root, ".env.production.local"),
  resolve(root, "../tutoring-notes/.env"),
  resolve(root, "../tutoring-notes/.env.production.local"),
];

const RUNS = 3;
const FIELDS = ["topics", "assessment", "nextSteps", "links"];

let apiKey = "";
let model = "gpt-4o-mini";
for (const path of keyFiles) {
  if (!apiKey) apiKey = readEnvKey(path, "OPENAI_API_KEY");
  const fromFile = readEnvKey(path, "OPENAI_REDUCE_MODEL");
  if (fromFile) model = fromFile;
}
if (!apiKey) {
  console.error("OPENAI_API_KEY is not set in .env");
  process.exit(1);
}

const prompts = await import("../src/lib/recording/notes-prompts.ts");
const fixtures = JSON.parse(
  readFileSync(resolve(root, "tests/fixtures/notes-abstain.json"), "utf8")
).fixtures;

const client = new OpenAI({ apiKey });

function isBlank(value) {
  return typeof value !== "string" || value.trim() === "";
}

function summarize(fields) {
  if (!fields) return "unparsed";
  const bits = FIELDS.filter((name) => !isBlank(fields[name])).map(
    (name) => `${name}=${JSON.stringify(fields[name].trim()).slice(0, 80)}`
  );
  return bits.length === 0 ? "(all empty)" : bits.join(" ");
}

function passed(fixture, fields) {
  if (!fields) return false;
  if (fixture.kind === "non-teaching") {
    return FIELDS.every((name) => isBlank(fields[name]));
  }
  if (isBlank(fields.topics)) return false;
  const pattern = new RegExp(fixture.subjectPattern, "i");
  return pattern.test(fields.topics);
}

let failures = 0;
console.log(
  `eval:notes-abstain fixtures=${fixtures.length} runs=${RUNS} temperature=${prompts.REDUCE_TEMPERATURE}`
);

for (const fixture of fixtures) {
  let ok = 0;
  const samples = [];
  for (let run = 1; run <= RUNS; run += 1) {
    const userPrompt = prompts.buildReducePrompt([], [{ text: fixture.transcript }]);
    const response = await client.chat.completions.create({
      model,
      ...prompts.reduceCompletionParams(userPrompt),
    });
    const raw = response.choices[0]?.message?.content ?? "";
    const fields = prompts.parseReduceResponse(raw);
    const normalized = fields ? prompts.normalizeStructuredNote(fields) : null;
    const runPassed = passed(fixture, normalized);
    if (runPassed) ok += 1;
    else failures += 1;
    samples.push(`  run ${run}: ${runPassed ? "PASS" : "FAIL"} ${summarize(normalized)}`);
  }
  const need = fixture.kind === "non-teaching" ? RUNS : 1;
  const rowOk = ok >= need && (fixture.kind !== "non-teaching" || ok === RUNS);
  console.log(
    `${rowOk ? "PASS" : "FAIL"} ${fixture.id} (${fixture.kind}) ${ok}/${RUNS}`
  );
  for (const line of samples) console.log(line);
}

if (failures > 0) {
  console.error(`eval:notes-abstain failed runs=${failures}`);
  process.exit(1);
}
console.log("eval:notes-abstain passed");
