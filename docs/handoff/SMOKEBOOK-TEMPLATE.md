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
**Overall result:**

- [ ] PASS
- [ ] FAIL
```

Fill **Preview** with a markdown link whose URL is the verified Vercel `branchAlias` (see rule file — never guess the hash segment). Link label = branch name or short feature label.

---

## Legend

| Field | How to fill it |
|---|---|
| **Branch** | Git branch under test (exact ref). |
| **Tip commit** | `git log -1 --format=%H` on that branch at smoke time; link to GitHub. |
| **Preview** | Vercel preview for that branch — **fetched** via Vercel MCP (`list_deployments` → match `meta.githubCommitRef` → `https://<meta.branchAlias>`). If MCP unavailable, use `<unverified — confirm in Vercel dashboard>` and fix before Andrew runs smoke. |
| **Overall result** | Check **PASS** only if every in-scope test item is PASS. Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete. |
| **Action** | Concrete steps: role (tutor/student/parent), device/browser, route, clicks, inputs, preconditions. Enough detail that Andrew does not have to infer the path. |
| **Expect** | Observable pass criteria — what you should see/hear/record; not implementation guesses. |
| **Ignore this run** | Known noise, out-of-scope UI, deferred adjacent work, or env quirks **for this item only**. Write `Nothing.` if there is nothing to ignore — field is always present. |
| **PASS / FAIL** (per item) | Two separate checkboxes. Check exactly one per item when done. |
| **Notes** | Freeform observations, screenshots paths, console errors worth filing. |

Run order: top to bottom unless a block says otherwise. Re-run **Cross-branch / post-merge** after integration merges.

---

## Per-test-item block (repeat for every test)

Each numbered item **must** include all fields below **in this order**. Do not combine PASS/FAIL into one line.

```markdown
### N. <short title>

**Action:** <detailed steps>

**Expect:** <observable pass criteria>

**Ignore this run:** <explicit exclusions, or `Nothing.`>

- [ ] PASS
- [ ] FAIL

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

**Notes:**

### 2. <add integration-specific checks>

**Action:**

**Expect:**

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL

**Notes:**
