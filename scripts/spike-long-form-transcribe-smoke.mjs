/**
 * Controlled smoke: full browser path upload → transcribeAndGenerateAction and
 * generateNoteFromTextAction at long-form scale. Captures wall-clock timings
 * (Whisper/ffmpeg internals require Vercel logs — not available here).
 *
 * @example
 * set SPIKE_PREVIEW_URL=https://your-preview.vercel.app
 * node scripts/spike-long-form-transcribe-smoke.mjs --target=preview-url --test-student-id=<uuid>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readDotenv(dotenvPath) {
  if (!fs.existsSync(dotenvPath)) return {};
  const raw = fs.readFileSync(dotenvPath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function parseArgs(argv) {
  const args = {
    target: "preview-url",
    testStudentId: null,
    baseUrl: null,
    audioPath: path.join(REPO_ROOT, "tests/fixtures/long-form-transcribe-smoke/audio-55min-sine.webm"),
    textPath: path.join(REPO_ROOT, "tests/fixtures/long-form-transcribe-smoke/pasted-text-50k.txt"),
    skipAudio: false,
    skipText: false,
    textVariants: true,
    headless: true,
  };
  for (const a of argv) {
    if (a.startsWith("--target=")) args.target = a.slice("--target=".length);
    else if (a.startsWith("--test-student-id=")) args.testStudentId = a.slice("--test-student-id=".length);
    else if (a.startsWith("--base-url=")) args.baseUrl = a.slice("--base-url=".length);
    else if (a.startsWith("--audio-path=")) args.audioPath = path.resolve(REPO_ROOT, a.slice("--audio-path=".length));
    else if (a.startsWith("--text-path=")) args.textPath = path.resolve(REPO_ROOT, a.slice("--text-path=".length));
    else if (a === "--skip-audio") args.skipAudio = true;
    else if (a === "--skip-text") args.skipText = true;
    else if (a === "--no-text-variants") args.textVariants = false;
    else if (a === "--headed") args.headless = false;
  }
  return args;
}

function resolveBaseUrl(args, env) {
  if (args.baseUrl) return args.baseUrl.replace(/\/$/, "");
  if (args.target === "localhost") return "http://127.0.0.1:3000";
  if (args.target === "preview-url") {
    const u = env.SPIKE_PREVIEW_URL;
    if (!u) {
      console.error("SPIKE_PREVIEW_URL is required for --target=preview-url (or pass --base-url=https://...).");
      process.exit(1);
    }
    return u.replace(/\/$/, "");
  }
  if (args.target === "production") {
    const u = env.SPIKE_PRODUCTION_URL;
    if (!u) {
      console.error("SPIKE_PRODUCTION_URL is required for --target=production.");
      process.exit(1);
    }
    return u.replace(/\/$/, "");
  }
  console.error("Unknown --target:", args.target);
  process.exit(1);
}

async function login(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/login?callbackUrl=/admin/students`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin\/students/, { timeout: 30_000 });
}

function nowIso() {
  return new Date().toISOString();
}

function writeResults(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
  console.log("Wrote", filePath);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.testStudentId) {
    console.error("Required: --test-student-id=<uuid> (dedicated SPIKE_TEST_* student row).");
    process.exit(1);
  }

  const dotenv = {
    ...readDotenv(path.join(REPO_ROOT, ".env")),
    ...process.env,
  };
  const baseUrl = resolveBaseUrl(args, dotenv);
  const email = dotenv.ADMIN_EMAIL || "";
  const password = dotenv.ADMIN_PASSWORD || "";
  if (!email || !password) {
    console.error("ADMIN_EMAIL and ADMIN_PASSWORD must be set (.env or environment).");
    process.exit(1);
  }

  const resultsPath = path.join(REPO_ROOT, "scripts/spike-long-form-transcribe-smoke-results.json");
  /** @type {any} */
  const bundle = {
    meta: {
      repoRoot: REPO_ROOT,
      baseUrl,
      target: args.target,
      testStudentId: args.testStudentId,
      startedAt: nowIso(),
      audioPath: args.audioPath,
      textPath: args.textPath,
    },
    runs: [],
  };

  const uploadTimeout = 600_000; // 10 min — large client-direct Blob upload
  const actionTimeout = 480_000; // 8 min — server action / Vercel ceiling characterization

  const browser = await chromium.launch({ headless: args.headless });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept());

  try {
    console.log(`Logging in → ${baseUrl} …`);
    await login(page, baseUrl, email, password);

    const studentUrl = `${baseUrl}/admin/students/${args.testStudentId}`;
    console.log("Opening student page", studentUrl);
    await page.goto(studentUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByTestId("ai-assist-panel").waitFor({ state: "visible", timeout: 30_000 });

    // --- Audio path ---
    if (!args.skipAudio) {
      if (!fs.existsSync(args.audioPath)) {
        throw new Error(`Audio fixture missing: ${args.audioPath}`);
      }
      const stat = fs.statSync(args.audioPath);
      const run = {
        id: "audio-long-form",
        startedAt: nowIso(),
        stages: {},
        ok: false,
        fileBytes: stat.size,
      };

      console.time("audio:upload");
      const t0 = performance.now();
      await page.getByTestId("tab-upload").click();
      const fileInput = page.getByTestId("audio-file-input");
      await fileInput.setInputFiles(args.audioPath);
      await page.getByTestId("audio-upload-done").waitFor({ state: "visible", timeout: uploadTimeout });
      const tUpload = performance.now() - t0;
      console.timeEnd("audio:upload");

      run.stages.upload = {
        ms: Math.round(tUpload),
        outcome: "ok",
        bytes: stat.size,
        mbpsApprox: Number(((stat.size * 8) / (tUpload / 1000) / 1_000_000).toFixed(3)),
      };

      console.time("audio:transcribe-action");
      const t1 = performance.now();
      await page.getByTestId("ai-transcribe-btn").click();

      const gate = page.getByTestId("ai-generated-note-review-gate");
      const errAlert = page.getByRole("alert");
      let outcome = "unknown";
      let errorText = null;
      try {
        await Promise.race([
          gate.waitFor({ state: "visible", timeout: actionTimeout }),
          errAlert.waitFor({ state: "visible", timeout: actionTimeout }),
        ]);
        if (await gate.isVisible()) outcome = "ok";
        else if (await errAlert.isVisible()) {
          outcome = "error";
          errorText = (await errAlert.textContent())?.trim() ?? "";
        }
      } catch (e) {
        outcome = "timeout_or_hang";
        errorText = e instanceof Error ? e.message : String(e);
      }
      const tAction = performance.now() - t1;
      console.timeEnd("audio:transcribe-action");

      run.stages.transcribeAndGenerateAction = {
        ms: Math.round(tAction),
        outcome,
        errorText,
      };
      run.ok = outcome === "ok";
      run.endedAt = nowIso();
      bundle.runs.push(run);

      if (outcome === "ok") {
        await page.getByTestId("ai-generated-note-review-dismiss").click();
        await page.getByTestId("ai-session-text").waitFor({ state: "visible", timeout: 10_000 });
      } else {
        // Reset UI so pasted-text runs start from a clean panel state.
        await page.goto(studentUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.getByTestId("ai-assist-panel").waitFor({ state: "visible", timeout: 30_000 });
      }
    }

    // --- Text paths ---
    if (!args.skipText) {
      const textRaw = fs.readFileSync(args.textPath, "utf8");
      /** @type {{ id: string; chars: number; content: string }[]} */
      const variants = [{ id: "text-50k", chars: textRaw.length, content: textRaw }];
      if (args.textVariants) {
        variants.unshift({
          id: "text-10k",
          chars: 10_000,
          content: textRaw.slice(0, 10_000),
        });
        let big = textRaw;
        while (big.length < 130_000) big += "\n\n" + textRaw;
        variants.push({
          id: "text-130k-overcap",
          chars: 130_000,
          content: big.slice(0, 130_000),
        });
      }

      for (const v of variants) {
        await page.getByTestId("tab-text").click();
        const area = page.getByTestId("ai-session-text");
        await area.fill(v.content);

        const run = { id: v.id, startedAt: nowIso(), chars: v.chars, stages: {}, ok: false };
        console.time(v.id);
        const t0 = performance.now();
        await page.getByTestId("ai-generate-btn").click();

        const gate = page.getByTestId("ai-generated-note-review-gate");
        const errAlert = page.getByRole("alert");
        let outcome = "unknown";
        let errorText = null;
        try {
          await Promise.race([
            gate.waitFor({ state: "visible", timeout: actionTimeout }),
            errAlert.waitFor({ state: "visible", timeout: actionTimeout }),
          ]);
          if (await gate.isVisible()) outcome = "ok";
          else if (await errAlert.isVisible()) {
            outcome = "error";
            errorText = (await errAlert.textContent())?.trim() ?? "";
          }
        } catch (e) {
          outcome = "timeout_or_hang";
          errorText = e instanceof Error ? e.message : String(e);
        }
        const elapsed = performance.now() - t0;
        console.timeEnd(v.id);

        run.stages.generateNoteFromTextAction = {
          ms: Math.round(elapsed),
          outcome,
          errorText,
        };
        run.ok = outcome === "ok";
        run.endedAt = nowIso();
        bundle.runs.push(run);

        if (outcome === "ok") {
          await page.getByTestId("ai-generated-note-review-dismiss").click();
        }
      }
    }

    bundle.meta.endedAt = nowIso();
    writeResults(resultsPath, bundle);
    console.log("Done. Runs:", bundle.runs.map((r) => `${r.id}:${r.ok}`).join(", "));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
