#!/usr/bin/env node
/**
 * Map a git diff (or explicit tags) → selective wb jest + Playwright commands.
 *
 * Usage:
 *   node scripts/wb-test-select.cjs [--base REF] [--tags @wb-graph ...] [--run]
 *   npm run test:wb-affected -- --base origin/v1-redesign
 *   npm run test:wb-playwright:tags -- @wb-graph @wb-recording
 *
 * Merge policy (see `.cursor/rules/test-selection.mdc`):
 *   - Small feature branch: affected tags only (+ adjacency expansion).
 *   - Into v1-redesign: affected; full suite when wave is large or touch is broad.
 *   - Into master: always full (`npm run test:wb-sync` + jest regression + next build).
 */
const { execSync, spawnSync } = require("node:child_process");
const path = require("node:path");

const TAG = {
  WB_SYNC: "@wb-sync",
  WB_STROKES: "@wb-strokes",
  WB_VIEWPORT: "@wb-viewport",
  WB_ASSETS: "@wb-assets",
  WB_PRESENCE: "@wb-presence",
  WB_GRAPH: "@wb-graph",
  WB_RECORDING: "@wb-recording",
  WB_CHROME: "@wb-chrome",
  WB_AV: "@wb-av",
};

const TAG_ADJACENCY = {
  [TAG.WB_SYNC]: [],
  [TAG.WB_STROKES]: [TAG.WB_SYNC],
  [TAG.WB_VIEWPORT]: [TAG.WB_SYNC, TAG.WB_STROKES],
  [TAG.WB_ASSETS]: [TAG.WB_SYNC, TAG.WB_STROKES],
  [TAG.WB_PRESENCE]: [TAG.WB_SYNC, TAG.WB_AV],
  [TAG.WB_GRAPH]: [TAG.WB_SYNC, TAG.WB_STROKES],
  [TAG.WB_RECORDING]: [TAG.WB_SYNC, TAG.WB_PRESENCE],
  [TAG.WB_CHROME]: [TAG.WB_SYNC],
  [TAG.WB_AV]: [TAG.WB_SYNC, TAG.WB_PRESENCE],
};

/** Changed path → tags (union). Order: more specific rules first. */
const PATH_RULES = [
  {
    re: /GraphEmbeddable|graph-state|graph-persist|insert-asset/i,
    tags: [TAG.WB_GRAPH],
  },
  {
    re: /lifecycle-machine|recording\/|upload-outbox|WhiteboardWorkspaceAudioBridge/i,
    tags: [TAG.WB_RECORDING],
  },
  {
    re: /useLiveAV|peer-mesh|mic-recorder|WbAVCluster|AVTile/i,
    tags: [TAG.WB_AV, TAG.WB_PRESENCE],
  },
  {
    re: /whiteboard-chrome|WbActionSheet|BoardTabStrip|mynk-wb-|wb-chrome/i,
    tags: [TAG.WB_CHROME],
  },
  {
    re: /viewport-align|pageViewState|followTutor|useStudentWhiteboardCanvas|useCollaboratorPointers/i,
    tags: [TAG.WB_VIEWPORT],
  },
  {
    re: /PdfImage|snapshot-png|ensure-native-image|hydrate-remote/i,
    tags: [TAG.WB_ASSETS],
  },
  {
    re: /sync-client|whiteboard\/sync|wb-e2e-scene|apply-reconciled|wb-relay/i,
    tags: [TAG.WB_SYNC, TAG.WB_STROKES],
  },
  {
    re: /tests\/integration\/wb-student-exit-rejoin/i,
    tags: [TAG.WB_PRESENCE, TAG.WB_AV],
  },
  {
    re: /tests\/integration\/wb-chrome/i,
    tags: [TAG.WB_CHROME],
  },
  {
    re: /WhiteboardWorkspaceClient|StudentWhiteboardClient/i,
    tags: [TAG.WB_SYNC],
  },
  {
    re: /src\/lib\/whiteboard\/|src\/components\/whiteboard\//i,
    tags: [TAG.WB_SYNC],
  },
];

function parseArgs(argv) {
  const out = { base: "HEAD~1", tags: [], run: false, jest: true, playwright: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--run") out.run = true;
    else if (a === "--no-jest") out.jest = false;
    else if (a === "--no-playwright") out.playwright = false;
    else if (a === "--base") out.base = argv[++i];
    else if (a.startsWith("@")) out.tags.push(a);
    else if (a === "--tags") {
      while (argv[i + 1]?.startsWith("@")) out.tags.push(argv[++i]);
    }
  }
  return out;
}

function gitChangedFiles(base) {
  try {
    const out = execSync(`git diff --name-only ${base}...HEAD`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (out) return out.split(/\r?\n/).filter(Boolean);
  } catch {
    // fall through
  }
  try {
    const out = execSync(`git diff --name-only ${base}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return out ? out.split(/\r?\n/).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function tagsForPaths(files) {
  const selected = new Set();
  for (const file of files) {
    for (const rule of PATH_RULES) {
      if (rule.re.test(file)) {
        for (const t of rule.tags) selected.add(t);
      }
    }
  }
  return [...selected];
}

function expandTags(tags) {
  const out = new Set(tags);
  for (const tag of tags) {
    for (const adj of TAG_ADJACENCY[tag] ?? []) out.add(adj);
  }
  return [...out].sort();
}

function tagsToGrep(tags) {
  return tags.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}

function needsWbJest(files, tags) {
  if (tags.length > 0) return true;
  return files.some(
    (f) =>
      /src\/(lib|components|hooks)\/.*whiteboard/i.test(f) ||
      /sync-client|lifecycle-machine|viewport-align/i.test(f) ||
      /src\/__tests__\/.*whiteboard/i.test(f)
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = gitChangedFiles(args.base);
  let tags =
    args.tags.length > 0 ? [...new Set(args.tags)] : tagsForPaths(files);
  tags = expandTags(tags);

  const grep = tagsToGrep(tags);
  const runJest = args.jest && needsWbJest(files, tags);
  const runPlaywright = args.playwright && tags.length > 0;

  console.log("wb-test-select");
  console.log(`  base:       ${args.base}`);
  console.log(`  files:      ${files.length ? files.join(", ") : "(none)"}`);
  console.log(`  tags:       ${tags.length ? tags.join(", ") : "(none — no wb gate)"}`);
  if (grep) {
    console.log(`  grep:       ${grep}`);
  }

  const commands = [];
  if (runJest) {
    commands.push("npm run test:wb-jest");
  }
  if (runPlaywright) {
    commands.push(
      "npx playwright test --project=integration-setup",
      `npx playwright test --project=wb-regression --grep "${grep}"`
    );
  }
  if (tags.length === 0 && files.length > 0) {
    console.log("  note:       diff has no wb-tagged paths — jest-only or docs-only change");
  }
  if (commands.length === 0) {
    console.log("  commands:   (none)");
  } else {
    console.log("  commands:");
    for (const c of commands) console.log(`    ${c}`);
  }

  if (!args.run) {
    console.log("\n(dry-run — pass --run to execute)");
    return;
  }

  const root = path.resolve(__dirname, "..");
  if (runJest) {
    const r = spawnSync("npm run test:wb-jest", {
      shell: true,
      stdio: "inherit",
      cwd: root,
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  if (runPlaywright) {
    for (const cmd of commands.filter((c) => c.includes("playwright"))) {
      const r = spawnSync(cmd, { shell: true, stdio: "inherit", cwd: root });
      if (r.status !== 0) process.exit(r.status ?? 1);
    }
  }
}

main();
