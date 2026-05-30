#!/usr/bin/env node
"use strict";

/**
 * Stitch short tutor speech clips into one long session file for field-coverage
 * long-form smokes (upload size + transcript region retention).
 *
 * clip1 at START, clipN near END, middle clips evenly spaced; silence filler
 * between anchors. See docs/handoff/long-session-smoke-scripts.md.
 *
 * @see scripts/make-test-audio.cjs (encoding conventions)
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

/** Matches src/lib/recording/segment-policy.ts SEGMENT_MAX_SECONDS (50 min). */
const SEGMENT_MAX_SECONDS = 50 * 60;

const FILLER_RATIONALE = `
Filler choice: SILENCE (anullsrc mono @ 48 kHz)
  Whisper and our transcribe path may skip or trim long silent regions — that is
  expected and fine for this smoke. The spoken clips are the signal under test;
  silence only pads wall-clock duration and upload size without inviting
  hallucinated speech (unlike looping pink noise / synthetic tones).
`.trim();

function usage() {
  console.log(`
Usage: node scripts/make-test-session.cjs [options]

Options:
  --clips <list|dir>  Comma-separated clip paths, OR a directory of audio files
                      (sorted by filename — use clip1.m4a, clip2.m4a, …)
  --minutes <n>       Target total duration in minutes (default: 90)
  --format m4a|webm   Output codec (default: m4a)
  --bitrate <k>       Audio bitrate kbps (default: 80 — ~0.6 MB/min)
  --out <path>        Output file (default: ./test-session-<minutes>min.<ext>)
  --split             Also emit ~50 min + remainder segments (upload rollover)
  --tmpdir <path>     Temp segment dir (default: OS temp)
  --keep-tmp          Do not delete temp segments after encode
  --help, -h          Show this help

Examples:
  node scripts/make-test-session.cjs --clips ./clips/clip1.m4a,./clips/clip2.m4a --minutes 90
  node scripts/make-test-session.cjs --clips ./recorded-clips --minutes 90 --split
`);
}

function argvList() {
  return process.argv.slice(2);
}

function argvFlag(name) {
  return argvList().includes(name);
}

function argvValue(name) {
  const argv = argvList();
  const i = argv.indexOf(name);
  if (i === -1 || i + 1 >= argv.length || argv[i + 1]?.startsWith("-")) {
    return undefined;
  }
  return argv[i + 1];
}

function parseArgs() {
  if (argvFlag("--help") || argvFlag("-h")) {
    usage();
    process.exit(0);
  }

  const clipsRaw = argvValue("--clips");
  if (!clipsRaw) {
    fail("--clips is required (comma-separated paths or a directory)");
  }

  const minutesRaw = argvValue("--minutes");
  let minutes = 90;
  if (minutesRaw !== undefined) {
    minutes = Number(minutesRaw);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      fail(`Invalid --minutes: ${minutesRaw}`);
    }
  }

  const format = (argvValue("--format") ?? "m4a").toLowerCase();
  if (format !== "m4a" && format !== "webm") {
    fail(`Invalid --format: ${format} (use m4a or webm)`);
  }

  const bitrateRaw = argvValue("--bitrate");
  let bitrateK = 80;
  if (bitrateRaw !== undefined) {
    bitrateK = Number(bitrateRaw);
    if (!Number.isFinite(bitrateK) || bitrateK <= 0) {
      fail(`Invalid --bitrate: ${bitrateRaw}`);
    }
  }

  const ext = format === "m4a" ? "m4a" : "webm";
  const out =
    argvValue("--out") ??
    path.join(process.cwd(), `test-session-${minutes}min.${ext}`);

  return {
    clipsRaw,
    minutes,
    format,
    bitrateK,
    out: path.resolve(out),
    split: argvFlag("--split"),
    tmpdir: argvValue("--tmpdir")
      ? path.resolve(argvValue("--tmpdir"))
      : path.join(os.tmpdir(), `make-test-session-${process.pid}`),
    keepTmp: argvFlag("--keep-tmp"),
  };
}

function fail(message) {
  console.error(`make-test-session: ${message}`);
  process.exit(1);
}

function resolveFfmpegPath() {
  let ffmpegPath;
  try {
    ffmpegPath = require("ffmpeg-static");
  } catch {
    fail("Could not load ffmpeg-static — run npm install in the repo root.");
  }
  if (!ffmpegPath || typeof ffmpegPath !== "string") {
    fail("ffmpeg-static returned no binary path.");
  }
  if (!fs.existsSync(ffmpegPath)) {
    fail(`ffmpeg binary not found at: ${ffmpegPath}`);
  }
  return ffmpegPath;
}

function runFfmpeg(ffmpegPath, args, label) {
  const result = spawnSync(ffmpegPath, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 20 * 1024 * 1024,
  });
  const stderr = result.stderr ?? "";
  const stdout = result.stdout ?? "";
  if (result.status !== 0) {
    const detail = (stderr || stdout).trim().slice(-4000);
    fail(
      `ffmpeg failed${label ? ` (${label})` : ""} (exit ${result.status}).\n${detail}`
    );
  }
}

function probeDurationSeconds(ffmpegPath, inputPath) {
  const result = spawnSync(
    ffmpegPath,
    ["-hide_banner", "-i", inputPath],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  const text = `${result.stderr ?? ""}${result.stdout ?? ""}`;
  const m = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) {
    fail(`Could not read duration from: ${inputPath}`);
  }
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  return h * 3600 + min * 60 + sec;
}

function encodeArgs(format, bitrateK) {
  if (format === "m4a") {
    return ["-c:a", "aac", "-b:a", `${bitrateK}k`, "-movflags", "+faststart"];
  }
  return ["-c:a", "libopus", "-b:a", `${bitrateK}k`];
}

function formatDuration(seconds) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${sec.toFixed(3).padStart(6, "0")}`;
  }
  return `${m}:${sec.toFixed(3).padStart(6, "0")}`;
}

function formatMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(3);
}

function mbPerMin(bytes, durationSec) {
  if (durationSec <= 0) return "n/a";
  return (bytes / (1024 * 1024) / (durationSec / 60)).toFixed(3);
}

const AUDIO_EXT = new Set([".m4a", ".mp4", ".webm", ".mp3", ".wav", ".aac", ".ogg"]);

function resolveClipPaths(clipsRaw) {
  const resolved = path.resolve(clipsRaw);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    const names = fs
      .readdirSync(resolved)
      .filter((n) => AUDIO_EXT.has(path.extname(n).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (names.length < 2) {
      fail(`Directory needs at least 2 audio files: ${resolved}`);
    }
    return names.map((n) => path.join(resolved, n));
  }

  const parts = clipsRaw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    fail("Provide at least 2 clips (comma-separated or a directory)");
  }
  const paths = parts.map((p) => path.resolve(p));
  for (const p of paths) {
    if (!fs.existsSync(p)) {
      fail(`Clip not found: ${p}`);
    }
  }
  return paths;
}

/**
 * Build ordered timeline segments: clip1 @ 0, clipN @ end, middles evenly spaced.
 * Returns { segments, targetSeconds } where each segment is
 * { kind: 'clip'|'filler', label, sourcePath?, durationSec, startSec }.
 */
function computeTimeline(clipPaths, clipDurations, targetSeconds) {
  const n = clipPaths.length;
  if (n < 2) {
    fail("Need at least 2 clips");
  }

  const clipTotal = clipDurations.reduce((a, b) => a + b, 0);
  if (clipTotal >= targetSeconds) {
    fail(
      `Clips total ${formatDuration(clipTotal)} exceeds target ${formatDuration(targetSeconds)} — ` +
        "use shorter clips or raise --minutes"
    );
  }

  const segments = [];
  let cursor = 0;

  const addFiller = (dur, label) => {
    if (dur < 0.001) return;
    segments.push({
      kind: "filler",
      label,
      durationSec: dur,
      startSec: cursor,
    });
    cursor += dur;
  };

  const addClip = (index) => {
    const dur = clipDurations[index];
    segments.push({
      kind: "clip",
      label: `clip${index + 1}`,
      sourcePath: clipPaths[index],
      durationSec: dur,
      startSec: cursor,
    });
    cursor += dur;
  };

  // clip1 @ start
  addClip(0);
  const afterFirst = cursor;
  const lastStart = targetSeconds - clipDurations[n - 1];

  if (n === 2) {
    addFiller(lastStart - afterFirst, "filler (between clip1 and clip2)");
    addClip(1);
  } else {
    const middleCount = n - 2;
    const middleDurSum = clipDurations.slice(1, n - 1).reduce((a, b) => a + b, 0);
    const middleSpan = lastStart - afterFirst;
    const fillerBudget = middleSpan - middleDurSum;
    if (fillerBudget < -0.01) {
      fail(
        `Middle clips too long for target duration (need ${formatDuration(middleSpan)} ` +
          `span, have ${formatDuration(middleDurSum)} of speech)`
      );
    }
    const gapCount = middleCount + 1;
    const gapSize = fillerBudget / gapCount;

    addFiller(gapSize, `filler (before clip2)`);
    for (let i = 1; i < n - 1; i++) {
      addClip(i);
      const gapLabel =
        i < n - 2 ? `filler (after clip${i + 1})` : `filler (before clip${n})`;
      addFiller(gapSize, gapLabel);
    }
    // clipN anchored at lastStart
    if (Math.abs(cursor - lastStart) > 0.05) {
      if (cursor < lastStart) {
        addFiller(lastStart - cursor, "filler (align clipN to end)");
      } else {
        fail(
          `Timeline overflow before clipN (cursor ${cursor.toFixed(2)} > lastStart ${lastStart.toFixed(2)})`
        );
      }
    }
    addClip(n - 1);
  }

  const drift = targetSeconds - cursor;
  if (Math.abs(drift) > 0.1) {
    fail(
      `Internal timeline error: cursor ${cursor.toFixed(3)} vs target ${targetSeconds.toFixed(3)}`
    );
  }

  return { segments, targetSeconds };
}

function encodeSilence(ffmpegPath, opts, durationSec, outPath) {
  const d = Math.max(0.01, durationSec);
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=48000:cl=mono",
    "-t",
    String(d),
    "-ar",
    "48000",
    "-ac",
    "1",
    ...encodeArgs(opts.format, opts.bitrateK),
    outPath,
  ];
  runFfmpeg(ffmpegPath, args, "silence");
}

function encodeClip(ffmpegPath, opts, inPath, outPath) {
  const args = [
    "-y",
    "-i",
    inPath,
    "-ar",
    "48000",
    "-ac",
    "1",
    ...encodeArgs(opts.format, opts.bitrateK),
    outPath,
  ];
  runFfmpeg(ffmpegPath, args, path.basename(inPath));
}

function concatSegments(ffmpegPath, opts, partPaths, outPath) {
  const listPath = path.join(opts.tmpdir, "concat-list.txt");
  const lines = partPaths.map((p) => {
    const escaped = p.replace(/\\/g, "/").replace(/'/g, "'\\''");
    return `file '${escaped}'`;
  });
  fs.writeFileSync(listPath, lines.join("\n") + "\n", "utf8");
  runFfmpeg(
    ffmpegPath,
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      outPath,
    ],
    "concat"
  );
}

function printTimelineReport(segments, targetSeconds, outPath, ffmpegPath, splitSegments) {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  TIMELINE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  target:  ${formatDuration(targetSeconds)} (${targetSeconds.toFixed(3)} s)`);
  console.log(`  output:  ${outPath}`);
  console.log(`\n${FILLER_RATIONALE}\n`);

  for (const seg of segments) {
    const end = seg.startSec + seg.durationSec;
    const range = `${formatDuration(seg.startSec).padStart(10)} → ${formatDuration(end).padStart(10)}`;
    if (seg.kind === "filler") {
      console.log(`  ${range}  [${seg.label}]  (${seg.durationSec.toFixed(1)} s silence)`);
    } else {
      const base = path.basename(seg.sourcePath);
      console.log(`  ${range}  ${seg.label}  ${base}  (${seg.durationSec.toFixed(1)} s)`);
    }
  }

  const actualDur = probeDurationSeconds(ffmpegPath, outPath);
  const stat = fs.statSync(outPath);
  console.log("\n───────────────────────────────────────────────────────────");
  console.log("  OUTPUT");
  console.log(`  duration:  ${formatDuration(actualDur)} (${actualDur.toFixed(3)} s)`);
  console.log(`  size:      ${formatMb(stat.size)} MB`);
  console.log(`  MB/min:    ${mbPerMin(stat.size, actualDur)}`);

  if (splitSegments?.length) {
    console.log("\n  SPLIT SEGMENTS");
    for (const seg of splitSegments) {
      const s = fs.statSync(seg.path);
      console.log(
        `    ${seg.label}: ${seg.path} — ${formatDuration(seg.durationSec)}, ${formatMb(s.size)} MB`
      );
    }
  }
  console.log("═══════════════════════════════════════════════════════════\n");
}

function withPartSuffix(filePath, partLabel) {
  const ext = path.extname(filePath);
  const base = filePath.slice(0, -ext.length);
  return `${base}-${partLabel}${ext}`;
}

function splitOutput(ffmpegPath, outPath, totalDurationSec) {
  const part1 = withPartSuffix(outPath, "part1-50min");
  const part2 = withPartSuffix(outPath, "part2-remainder");
  const part1Dur = Math.min(SEGMENT_MAX_SECONDS, totalDurationSec);

  runFfmpeg(
    ffmpegPath,
    ["-y", "-i", outPath, "-t", String(part1Dur), "-c", "copy", part1],
    "split part1"
  );

  const remainder = totalDurationSec - part1Dur;
  if (remainder > 0.5) {
    runFfmpeg(
      ffmpegPath,
      ["-y", "-i", outPath, "-ss", String(part1Dur), "-c", "copy", part2],
      "split part2"
    );
    return [
      { label: "Segment 1 (~50 min rollover)", path: part1, durationSec: part1Dur },
      {
        label: "Segment 2 (remainder)",
        path: part2,
        durationSec: probeDurationSeconds(ffmpegPath, part2),
      },
    ];
  }
  console.warn("--split: no remainder after first segment; part2 skipped.");
  return [{ label: "Segment 1 (~50 min rollover)", path: part1, durationSec: part1Dur }];
}

function main() {
  const opts = parseArgs();
  const ffmpegPath = resolveFfmpegPath();
  const clipPaths = resolveClipPaths(opts.clipsRaw);
  const clipDurations = clipPaths.map((p) => probeDurationSeconds(ffmpegPath, p));
  const targetSeconds = opts.minutes * 60;

  const { segments } = computeTimeline(clipPaths, clipDurations, targetSeconds);

  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.mkdirSync(opts.tmpdir, { recursive: true });

  const partPaths = [];
  let partIndex = 0;

  for (const seg of segments) {
    const partPath = path.join(
      opts.tmpdir,
      `part-${String(partIndex).padStart(4, "0")}.${opts.format === "m4a" ? "m4a" : "webm"}`
    );
    partIndex += 1;
    if (seg.kind === "filler") {
      encodeSilence(ffmpegPath, opts, seg.durationSec, partPath);
    } else {
      encodeClip(ffmpegPath, opts, seg.sourcePath, partPath);
    }
    partPaths.push(partPath);
  }

  concatSegments(ffmpegPath, opts, partPaths, opts.out);

  let splitSegs;
  const actualDur = probeDurationSeconds(ffmpegPath, opts.out);
  if (opts.split) {
    splitSegs = splitOutput(ffmpegPath, opts.out, actualDur);
  }

  printTimelineReport(segments, targetSeconds, opts.out, ffmpegPath, splitSegs);

  if (!opts.keepTmp) {
    try {
      fs.rmSync(opts.tmpdir, { recursive: true, force: true });
    } catch {
      console.warn(`make-test-session: could not remove tmpdir ${opts.tmpdir}`);
    }
  } else {
    console.log(`Temp segments kept at: ${opts.tmpdir}`);
  }

  console.log(
    "Done. See docs/handoff/long-session-smoke-scripts.md for record → stitch → smoke steps."
  );
}

main();
