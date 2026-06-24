# Smokebook template

> **This is the canonical template.** All smokebooks and smoke-runbooks in this repo **MUST** follow it. Enforced by [`.cursor/rules/smokebook-template.mdc`](../../.cursor/rules/smokebook-template.mdc).

Copy this file (or `@`-reference it) when authoring a new smokebook. Replace every placeholder; do not omit sections.

---

## Header block (one per feature / branch under test)

```markdown
# <Feature name> — smoke runbook

**Branch:** `<branch-name>`
**Tip commit:** [`<short-sha>`](https://github.com/Arangarx/tutoring-notes/commit/<full-sha>)
**Preview:** [<branch-name> preview](https://<branchAlias-from-Vercel-MCP>)
```

Fill **Preview** with a markdown link whose URL is the verified Vercel `branchAlias` (see rule file — never guess the hash segment). Link label = branch name or short feature label.

---

## When Andrew runs this (mandatory policy)

Smokebooks are **not** mid-wave bug hunts. See [`.cursor/rules/smoke-when-done.mdc`](../../.cursor/rules/smoke-when-done.mdc).

| Phase | Who |
|-------|-----|
| Spec → implementation → Playwright per acceptance item → automated gates green | **Agents** |
| **One** hardware smoke when feature is **DONE** | **Andrew** |

**Smokebook items must be:**

- **New surface** or **subjective UX** (feel, polish, tutor judgment)
- **Hardware / external-env** only Playwright cannot hermeticize (`PLAYWRIGHT-GAP` backlog items)
- Annotated in **Notes** when Playwright already covers the behavior: `[automated: <spec-file> › <test title>]` → Andrew marks **N/A with notes** unless `[human-only: <reason>]`

**Do not** ask Andrew to smoke per-fix commits, re-prove regressions that have Playwright tests, or use smoke as the first net for behavior agents could have caught in relay tests.

---

## Legend

| Field | How to fill it |
|---|---|
| **Branch** | Git branch under test (exact ref). |
| **Tip commit** | `git log -1 --format=%H` on that branch at smoke time; link to GitHub. |
| **Preview** | Vercel preview for that branch — **fetched** via Vercel MCP (`list_deployments` → match `meta.githubCommitRef` → `https://<meta.branchAlias>`). If MCP unavailable, use `<unverified — confirm in Vercel dashboard>` and fix before Andrew runs smoke. |
| **Overall result** | Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete. Overall verdict is PASS/FAIL only — no overall SKIP. |
| **Action** | Concrete steps: role (tutor/student/parent), device/browser, route, clicks, inputs, preconditions. Enough detail that Andrew does not have to infer the path. |
| **Expect** | Observable pass criteria — what you should see/hear/record; not implementation guesses. |
| **Ignore this run** | Known noise, out-of-scope UI, deferred adjacent work, or env quirks **for this item only**. Write `Nothing.` if there is nothing to ignore — field is always present. |
| **PASS** (per item) | Checked = test ran and passed. |
| **FAIL** (per item) | Checked = test ran and failed — primary expectation not met or wholly broken (explain in Notes). |
| **PARTIAL** (per item) | Checked = test ran and is **partially working** — some sub-checks pass and others fail. **Notes must spell out exactly what worked vs what didn't.** Distinct from FAIL (wholly broken), N/A with notes (does not apply as written), SKIP (deliberately not run), and none-checked (not yet run). |
| **N/A with notes** (per item) | Checked = the item **does not apply as written** for this run or configuration (e.g. the feature under test is absent in the current build, or the setup genuinely cannot exercise it). **A Note explaining why is required.** Distinct from **SKIP** (a valid test deliberately not run this pass) and from **leaving all boxes unchecked** (not-yet-run / missed). Example: a smoke item for "Recording Start/Pause" when those controls no longer exist in the UI — N/A with notes, not SKIP and not blank. |
| **SKIP** (per item) | Checked = test deliberately skipped this run — **reason required in Notes** (e.g. blocked by env, out of scope this pass, dependency not ready). Distinct from N/A with notes (item does not apply as written). |
| **None checked** (per item) | Not yet run / missed — **not** the same as a deliberate SKIP or N/A with notes. Check exactly one box per item when the run is complete; leave all unchecked if not yet reached. |
| **Notes** | Freeform observations, screenshots paths, console errors worth filing. SKIP and N/A with notes items must state why here. |

Run order: top to bottom unless a block says otherwise. Re-run **Cross-branch / post-merge** after integration merges.

---

## Comprehensive pre-master smoke — both themes (F5b, Andrew 2026-06-12)

**Applies to:** the **pre-master comprehensive smoke** (integration cut before `v1-redesign` / feature stack merges to `master` — e.g. MASTER-CUT or equivalent full-site runbook). **Does not** require every per-branch feature smokebook to duplicate all items in both themes unless that branch explicitly scopes theme parity.

**Requirement:** Andrew must have **seen every in-scope surface in both light and dark** before a master cut. For each test item in the comprehensive runbook, run the **Action** / **Expect** pass **twice** — once with the app in **light** mode, once in **dark** mode (use the product theme toggle; note `System` only if the smoke item explicitly covers follow-OS behavior).

**How to record:**

- Prefer **paired sub-items** when a surface has theme-specific expectations (e.g. `### 12a. … (light)` / `### 12b. … (dark)`), **or**
- A single item whose **Action** explicitly says *"Repeat in light, then dark"* and whose **Notes** record both passes.

**Per-item verdict:** PASS only if **both** themes pass (or the item's **Ignore this run** excludes one theme with a stated reason). A failure in either theme → FAIL for that item.

Cross-ref: Gate A1 both-theme component gate ([`docs/BACKLOG.md`](../BACKLOG.md)); [`.cursor/rules/both-theme-components.mdc`](../../.cursor/rules/both-theme-components.mdc).

---

## Per-test-item block (repeat for every test)

Each numbered item **must** include all fields below **in this order**. Do not combine PASS/FAIL/PARTIAL/N/A with notes/SKIP into one line.

```markdown
### N. <short title>

**Action:** <detailed steps>

**Expect:** <observable pass criteria>

**Ignore this run:** <explicit exclusions, or `Nothing.`>

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

```

### Worked example (reference richness — delete when copying)

```markdown
### 1. Whiteboard theme toggle (tutor, desktop Chrome)

**Action:** On the branch **Preview** URL, sign in as the pilot tutor account. Open any student's whiteboard workspace (`/admin/students/[id]/whiteboard` or Start session from the student row). In the whiteboard top bar, click the theme control (sun/moon icon). Open the dropdown; select **Dark**, then **Light**, then **System**. Press **Escape** once while the menu is open; click outside the menu once while open again.

**Expect:** Menu opens on click; each theme choice applies immediately to the board chrome and canvas surround; Escape closes the menu without changing theme; outside-click closes the menu. No console errors containing `CSP` or `chunk`. Board drawing and page tabs remain usable after each switch.

**Ignore this run:** Marketing-site header theme on non-whiteboard routes (separate item). Minor contrast nits called out in BACKLOG as cosmetic-only. Student-role theme control (not in this branch's scope).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

```

---

## Feature smoke items

<!-- Copy the per-test-item block for each test. Number sequentially: ### 1., ### 2., … -->

### 1. <first test title>

**Action:**

**Expect:**

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

## Cross-branch / post-merge

Run this section **after** the feature branch merges into the integration branch (`v1-redesign` or `master`). Use the **integration branch preview** (fetch alias the same way — branch name changes).

**Integration branch:** `<e.g. v1-redesign>`
**Integration tip commit:** `<short-sha>`
**Integration preview:** [<label>](https://<branchAlias>)

**Overall integration result:**

- [ ] PASS
- [ ] FAIL

### Integration items (stub — customize per cut)

### 1. Regression spot-check — prior merged features still work

**Action:** On the integration **Preview**, smoke the highest-risk flows from recently merged branches (list them). At minimum: tutor login, open one student, start or resume a whiteboard session, draw one stroke, end session without error toast.

**Expect:** No new failures vs. the last green integration smoke; end-session completes; no auth loop.

**Ignore this run:** Features not yet merged into this integration branch.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

### 2. <add integration-specific checks>

**Action:**

**Expect:**

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete. Overall verdict is PASS/FAIL only — no overall SKIP.

- [ ] PASS
- [ ] FAIL
