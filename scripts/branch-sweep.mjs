/**
 * Remove merged local + merged-remote branches safely after they land on master/main.
 *
 * Flags stale-but-unmerged branches — never deletes them automatically.
 *
 * @see branch-sweep.README.md
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const PREFIX = "[branch-sweep]";
const LOG_KEY = "brs";

function usage() {
  console.log(`
Branch sweep — merged locals/remotes reporter + optional pruner.

Default is dry-run. Stale-but-not-merged branches are listed — never deleted here.

  --dry-run          Force simulation (also default unless --delete is set)
  --delete           Actually run git branch -d / git push origin --delete
  --stale-days <n>   Age cutoff for stale flagging when not merged (default 30)
  --keep <glob>      Extra wildcard keep pattern (*), repeatable. Already shields:
                     master, main, current branch, origin/HEAD, origin/master, origin/main
  --help / -h

Examples:
  node scripts/branch-sweep.mjs
  node scripts/branch-sweep.mjs --delete --keep 'release/*'
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

function argvAllValues(flag) {
  const argv = argvList();
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== flag) continue;
    const v = argv[i + 1];
    if (v && !v.startsWith("-")) out.push(v);
  }
  return out;
}

/** @param {string[]} args @param {string} cwd */
function git(args, cwd) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
  });
  return {
    status: typeof r.status === "number" ? r.status : 1,
    stdout: String(r.stdout ?? "").trim(),
    stderr: String(r.stderr ?? "").trim(),
    error: r.error,
  };
}

function execOrThrow(repoRoot, args, hint) {
  const r = git(args, repoRoot);
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(
      `${hint} status=${r.status} stderr=${r.stderr.slice(0, 900)}\nstdout=${r.stdout.slice(0, 900)}`
    );
  }
  return r;
}

function globToRegex(glob) {
  let out = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") out += ".*";
    else if (/[-/\\^$+?.()|[\]{}]/.test(c)) out += `\\${c}`;
    else out += c;
  }
  out += "$";
  return new RegExp(out);
}

function repoRootPath() {
  // Use process.cwd() explicitly — passing "" to spawnSync cwd is undefined
  // behavior on Windows (doesn't fall back to the parent process cwd, so the
  // git invocation appears to run outside any checkout). Tripped during real
  // smoke 2026-05-17.
  const r = git(["rev-parse", "--show-toplevel"], process.cwd());
  if (r.status !== 0 || !r.stdout) {
    console.error(
      `${PREFIX} git rev-parse --show-toplevel failed: cwd=${process.cwd()} stderr=${r.stderr}`
    );
    throw new Error("not a git checkout");
  }
  return r.stdout;
}

function resolveBaseBranch(repoRoot) {
  if (git(["rev-parse", "--verify", "master"], repoRoot).status === 0) {
    return "master";
  }
  if (git(["rev-parse", "--verify", "main"], repoRoot).status === 0) return "main";
  throw new Error(`${PREFIX} need master or main as ancestry base`);
}

function isMergedIntoBase(repoRoot, tip, base) {
  return git(["merge-base", "--is-ancestor", tip, base], repoRoot).status === 0;
}

function unixAgeDays(repoRoot, repoFullRef) {
  const r = git(["log", "-1", "--format=%ct", repoFullRef], repoRoot);
  if (r.status !== 0) return undefined;
  const ts = Number(r.stdout.trim());
  if (!Number.isFinite(ts)) return undefined;
  return (Date.now() / 1000 - ts) / 86400;
}

function forbidLocalDeleteCrash(name, current, matchers) {
  const lower = name.toLowerCase();
  if (lower === "master" || lower === "main") return "critical branch guard";
  if (current.length > 0 && name === current) return "checkout guard";
  if (matchers.some((rx) => rx.test(name))) return "explicit --keep guard";
  return "";
}

function forbidRemoteDeleteCrash(bareBranch) {
  const lower = bareBranch.toLowerCase();
  if (lower === "master" || lower === "main" || lower === "head") return "critical origin guard";
  return "";
}

function mainImpl() {
  if (argvFlag("--help") || argvFlag("-h")) {
    usage();
    process.exit(0);
  }

  const hasDelete = argvFlag("--delete");
  const explicitDry = argvFlag("--dry-run");
  if (hasDelete && explicitDry) {
    console.error(`${PREFIX} refusing: --dry-run and --delete together`);
    process.exit(1);
  }
  const dryRun = !hasDelete;

  let staleDays = 30;
  const sd = argvValue("--stale-days");
  if (sd !== undefined) {
    staleDays = Number(sd);
    if (!Number.isFinite(staleDays) || staleDays < 0) {
      console.error(`${PREFIX} invalid --stale-days`);
      process.exit(1);
    }
  }

  const repoRoot = repoRootPath();
  execOrThrow(repoRoot, ["fetch", "--prune", "origin"], "fetch --prune");

  const base = resolveBaseBranch(repoRoot);
  const current = execOrThrow(repoRoot, ["branch", "--show-current"], "branch").stdout.trim();

  const userMatchers = argvAllValues("--keep").map(globToRegex);

  /** Shields deletion lists + stale noise for protected refs */
  const shieldsLocalBare = (/** @type {string} */ shortName) =>
    /^master$/i.test(shortName) ||
    /^main$/i.test(shortName) ||
    (current.length > 0 && shortName === current) ||
    userMatchers.some((rx) => rx.test(shortName));

  const shieldsRemoteLong = (/** @type {string} */ originSlug) => {
    const lower = originSlug.toLowerCase();
    if (/^origin\/(master|main|head)$/.test(lower)) return true;
    const bare = originSlug.startsWith("origin/")
      ? originSlug.slice("origin/".length)
      : originSlug;
    return shieldsLocalBare(bare) || userMatchers.some((rx) => rx.test(originSlug));
  };

  /** @type {{ name: string }[]} */
  const mergedLocals = [];

  /** @type {{ bare: string; remoteLong: string }[]} */
  const mergedRemotes = [];

  /** @type {{ label: string; approxAgeDays: number; detail: string }[]} */
  const staleRows = [];

  const localsRaw = execOrThrow(repoRoot, [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads/",
  ]).stdout.split("\n").filter(Boolean).map((s) => s.trim());

  const remoteRaw = execOrThrow(repoRoot, [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/remotes/origin/",
  ])
    .stdout.split("\n")
    .filter(Boolean)
    .map((s) => s.trim());

  /** locals */
  for (const lb of localsRaw) {
    const merged = isMergedIntoBase(repoRoot, lb, base);

    if (merged && !shieldsLocalBare(lb)) {
      mergedLocals.push({ name: lb });
    }

    const ageDays = unixAgeDays(repoRoot, `refs/heads/${lb}`);
    const staleCandidate =
      !merged &&
      !shieldsLocalBare(lb) &&
      ageDays !== undefined &&
      ageDays > staleDays;
    if (staleCandidate) {
      staleRows.push({
        label: lb,
        approxAgeDays: Math.round(ageDays),
        detail: `local not merged vs ${base}`,
      });
    }
  }

  /** remotess */
  for (const rn of remoteRaw) {
    if (/^HEAD$/i.test(rn)) continue;
    if (!/^origin\//.test(rn)) continue;
    const bare = rn.slice("origin/".length);
    if (!bare) continue;

    const merged = isMergedIntoBase(repoRoot, rn, base);

    if (merged && !shieldsRemoteLong(rn)) {
      mergedRemotes.push({ bare, remoteLong: rn });
    }

    const ageDays = unixAgeDays(repoRoot, `refs/remotes/${rn}`);
    const staleCandidate =
      !merged &&
      !shieldsRemoteLong(rn) &&
      ageDays !== undefined &&
      ageDays > staleDays;
    if (staleCandidate) {
      staleRows.push({
        label: rn,
        approxAgeDays: Math.round(ageDays),
        detail: `remote-tracking not merged vs ${base}`,
      });
    }
  }

  const runId = randomUUID();
  const logLine = (msg) => console.log(`${PREFIX} ${LOG_KEY}=${runId} ${msg}`);

  console.log("");
  console.log(`## MERGED LOCAL`);
  for (const r of mergedLocals) console.log(`  ${r.name}`);

  console.log("");
  console.log(`## MERGED REMOTE`);
  for (const r of mergedRemotes) console.log(`  ${r.bare}`);

  console.log("");
  console.log(`## STALE-NOT-MERGED`);
  if (staleRows.length === 0) console.log(`  (none)`);
  for (const s of staleRows) {
    console.log(
      `  ${s.label} ~${s.approxAgeDays}d (> ${staleDays}d) — ${s.detail}`
    );
  }

  if (dryRun) {
    console.log("");
    console.log(
      `${PREFIX} ${LOG_KEY}=${runId} SUMMARY LOCAL: deleted 0/${mergedLocals.length}; REMOTE: deleted 0/${mergedRemotes.length}; STALE: flagged=${staleRows.length}`
    );
    return;
  }

  /** delete */
  let localDeleted = 0;
  let remoteDeleted = 0;

  for (const row of mergedLocals) {
    const crashReason = forbidLocalDeleteCrash(row.name, current, userMatchers);
    if (crashReason) {
      console.error(
        `${PREFIX} HARD_STOP local=${row.name} reason=${crashReason}`
      );
      process.exit(1);
    }
  }

  for (const row of mergedRemotes) {
    const crashReason =
      forbidRemoteDeleteCrash(row.bare) ||
      (/^HEAD$/i.test(row.bare) ? "HEAD-guard" : "");
    if (crashReason || shieldsRemoteLong(row.remoteLong)) {
      console.error(
        `${PREFIX} HARD_STOP remote=${row.remoteLong} (${crashReason || "shield"})`
      );
      process.exit(1);
    }
  }

  for (const row of mergedLocals) {
    execOrThrow(repoRoot, ["branch", "-d", row.name], `branch -d`);
    localDeleted++;
    logLine(`deleted local ${row.name}`);
  }

  for (const row of mergedRemotes) {
    execOrThrow(
      repoRoot,
      ["push", "origin", "--delete", row.bare],
      `push origin --delete`
    );
    remoteDeleted++;
    logLine(`deleted remote ${row.bare}`);
  }

  console.log("");
  console.log(
    `${PREFIX} ${LOG_KEY}=${runId} SUMMARY LOCAL: deleted ${localDeleted}/${mergedLocals.length}; REMOTE: deleted ${remoteDeleted}/${mergedRemotes.length}; STALE-NOT-MERGED-flagged=${staleRows.length}`
  );
}

try {
  mainImpl();
} catch (e) {
  console.error(PREFIX, e instanceof Error ? e.stack : String(e));
  process.exit(1);
}
