# `branch-sweep.mjs`

Operational helper that:

1. `git fetch --prune origin`
2. Finds **local branches** already merged into `master` (or `main` if master is absent)
3. Finds **remote-tracking branches** under `origin/*` likewise merged into the base branch
4. Separately surfaces **stale-but-not-merged** branches aged beyond `--stale-days`

## Safety

| Mode | Behaviour |
|------|-----------|
| Default | Dry-run (lists only); never modifies git |
| `--delete` | Runs `git branch -d …` then `git push origin --delete …` for merged rows only |

**Stale branches are NEVER auto-deleted** — inspect them manually.

Hard-stops (`process.exit(1)`) inside `--delete` if a candidate matches:

- Protected names: local `master` / `main`, remote `master` / `main` / `HEAD`
- The currently checked-out local branch (`git branch --show-current`)
- Any `--keep` glob you supply (applied to bare branch names **and** `origin/<branch>` spelling)

Examples always include `master/main`, `origin/master`, `origin/main`, `origin/HEAD`, and whatever branch you presently have checked out—even if `--keep` omitted.

Logs use `[branch-sweep] brs=<uuid> …`.

## Usage

Dry-run overview:

```powershell
node scripts/branch-sweep.mjs
```

Prune merged locals/remotes except long-lived prefixes:

```powershell
node scripts/branch-sweep.mjs --delete --keep 'experiment/*'
```

Staleness diagnostics only lengthens listing sections—defaults to 30 days:

```powershell
node scripts/branch-sweep.mjs --stale-days 60
```
