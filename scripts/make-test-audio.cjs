#!/usr/bin/env node
"use strict";

/**
 * Fabricate long test audio for long-form record / upload / transcribe smokes.
 *
 * Uses ffmpeg-static (same binary as server-side transcribe). Output stays in
 * the repo root or /tmp — do not commit multi‑GB fixtures.
 *
 * Examples
 * --------
 * Loop a short speech clip to 90 min m4a (preferred — real Whisper load):
 *   node scripts/make-test-audio.cjs --minutes 90 --source ./my-3min.m4a
 *
 * Synthetic 90 min for upload size / timeout only (not transcript quality):
 *   node scripts/make-test-audio.cjs --minutes 90
 *
 * Desktop-Chrome-like webm + 50 min rollover segments for Upload tab:
 *   node scripts/make-test-audio.cjs --minutes 72 --source ./clip.webm --format webm --split
 *
 * Smoke handoff: build files locally, open /admin/students/<id> → Upload tab →
 * add segment(s) to the pending list → Transcribe & generate notes.
 * See docs/SMOKE-LONG-FORM-TRANSCRIBE.md (Path C).
 *
 * @see scripts/make-test-audio.README.md
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/** Matches src/lib/recording/segment-policy.ts SEGMENT_MAX_SECONDS (50 min). */
const SEGMENT_MAX_SECONDS = 50 * 60;

const SYNTHETIC_WARNING = `
⚠️  SYNTHETIC AUDIO MODE (no --source)
    Adequate for upload size, timeout, and ffmpeg-split smokes — NOT for
    transcript quality or true Whisper wall-clock measurement. Silence /
    hallucination guards may skip or distort synthetic tones.
    For faithful Whisper load, pass --source with a short real speech clip.
`.trim();

function usage() {
  console.log(`
Usage: node scripts/make-test-audio.cjs [options]

Options:
  --minutes <n>     Target duration in minutes (default: 90)
  --source <path>   Loop a short real speech clip to reach target duration (preferred)
  --format m4a|webm Output codec (default: m4a — iPhone Safari audio/mp4 AAC)
  --bitrate <k>     Audio bitrate in kbps (default: 80 — ~0.6 MB/min anchor)
  --out <path>      Output file (default: ./test-audio-<minutes>min.<ext>)
  --split           Also emit ~50 min + remainder segments (SEGMENT_MAX_SECONDS rollover)
  --help, -h        Show this help

Examples:
  node scripts/make-test-audio.cjs --minutes 90 --source ./voice-memo-3min.m4a
  node scripts/make-test-audio.cjs --minutes 90 --split --source ./clip.m4a
  node scripts/make-test-audio.cjs --minutes 60 --format webm
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
    path.join(process.cwd(), `test-audio-${minutes}min.${ext}`);

  return {
    minutes,
    source: argvValue("--source"),
    format,
    bitrateK,
    out: path.resolve(out),
    split: argvFlag("--split"),
  };
}

function fail(message) {
  console.error(`make-test-audio: ${message}`);
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

function printFileReport(label, filePath, durationSec) {
  const stat = fs.statSync(filePath);
  console.log(`\n${label}`);
  console.log(`  path:      ${filePath}`);
  console.log(`  duration:  ${formatDuration(durationSec)} (${durationSec.toFixed(3)} s)`);
  console.log(`  size:      ${formatMb(stat.size)} MB`);
  console.log(`  MB/min:    ${mbPerMin(stat.size, durationSec)}`);
}

function withPartSuffix(filePath, partLabel) {
  const ext = path.extname(filePath);
  const base = filePath.slice(0, -ext.length);
  return `${base}-${partLabel}${ext}`;
}

function buildSynthetic(ffmpegPath, opts, durationSec) {
  console.warn(`\n${SYNTHETIC_WARNING}\n`);
  const d = Math.ceil(durationSec);
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=220:duration=${d}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=330:duration=${d}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${d}`,
    "-f",
    "lavfi",
    "-i",
    `anoisesrc=color=pink:duration=${d}:sample_rate=48000`,
    "-filter_complex",
    "[0:a][1:a][2:a][3:a]amix=inputs=4:duration=first:dropout_transition=0,volume=0.35,tremolo=f=0.2:d=0.55",
    "-t",
    String(durationSec),
    ...encodeArgs(opts.format, opts.bitrateK),
    opts.out,
  ];
  runFfmpeg(ffmpegPath, args, "synthetic encode");
}

function buildFromSource(ffmpegPath, opts, durationSec, sourcePath) {
  const sourceDur = probeDurationSeconds(ffmpegPath, sourcePath);
  if (sourceDur <= 0) {
    fail(`Source has zero duration: ${sourcePath}`);
  }
  const loops = Math.max(0, Math.ceil(durationSec / sourceDur) - 1);
  console.log(
    `Looping source (${formatDuration(sourceDur)}, ${sourceDur.toFixed(1)} s) ` +
      `with -stream_loop ${loops} → target ${formatDuration(durationSec)}`
  );
  const args = [
    "-y",
    "-stream_loop",
    String(loops),
    "-i",
    sourcePath,
    "-t",
    String(durationSec),
    ...encodeArgs(opts.format, opts.bitrateK),
    opts.out,
  ];
  runFfmpeg(ffmpegPath, args, "source loop encode");
}

function splitSegments(ffmpegPath, opts, totalDurationSec) {
  if (totalDurationSec <= SEGMENT_MAX_SECONDS + 1) {
    console.warn(
      `\n--split: target (${formatDuration(totalDurationSec)}) is not longer than ` +
        `${SEGMENT_MAX_SECONDS / 60} min rollover — segments will not mirror a real 50+ min session.`
    );
  }
  const part1 = withPartSuffix(opts.out, "part1-50min");
  const part2 = withPartSuffix(opts.out, "part2-remainder");
  const part1Dur = Math.min(SEGMENT_MAX_SECONDS, totalDurationSec);

  runFfmpeg(
    ffmpegPath,
    ["-y", "-i", opts.out, "-t", String(part1Dur), "-c", "copy", part1],
    "split part1"
  );

  const remainder = totalDurationSec - part1Dur;
  if (remainder > 0.5) {
    runFfmpeg(
      ffmpegPath,
      ["-y", "-i", opts.out, "-ss", String(part1Dur), "-c", "copy", part2],
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
  const durationSec = opts.minutes * 60;

  fs.mkdirSync(path.dirname(opts.out), { recursive: true });

  if (opts.source) {
    const sourcePath = path.resolve(opts.source);
    if (!fs.existsSync(sourcePath)) {
      fail(`--source file not found: ${sourcePath}`);
    }
    buildFromSource(ffmpegPath, opts, durationSec, sourcePath);
  } else {
    buildSynthetic(ffmpegPath, opts, durationSec);
  }

  const actualDur = probeDurationSeconds(ffmpegPath, opts.out);
  printFileReport("Primary output", opts.out, actualDur);

  if (opts.split) {
    const segments = splitSegments(ffmpegPath, opts, actualDur);
    for (const seg of segments) {
      printFileReport(seg.label, seg.path, seg.durationSec);
    }
  }

  if (!opts.source) {
    console.warn(`\n${SYNTHETIC_WARNING}\n`);
  }

  console.log("\nDone. Upload via Admin → student → Upload tab (see docs/SMOKE-LONG-FORM-TRANSCRIBE.md).");
}

main();
