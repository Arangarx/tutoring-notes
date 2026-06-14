# Preview branch badge — smoke runbook

**Branch:** `feat/preview-branch-badge`
**Tip commit:** [`6bf1c4f`](https://github.com/Arangarx/tutoring-notes/commit/6bf1c4f2e363cc6bb28df73549073244c70d00a9)
**Preview (branch alias):** [feat/preview-branch-badge preview](https://tutoring-notes-git-feat-preview-f2a24e-arangarx-5209s-projects.vercel.app)
**Preview (stable domain):** [preview.usemynk.com](https://preview.usemynk.com) — assumes Andrew has repointed the stable preview domain to this branch.

---

## Legend

| Field | How to fill it |
|---|---|
| **Branch** | Git branch under test (exact ref). |
| **Tip commit** | `git log -1 --format=%H` on that branch at smoke time; link to GitHub. |
| **Preview** | Vercel preview for that branch — **fetched** via Vercel MCP (`list_deployments` → match `meta.githubCommitRef` → `https://<meta.branchAlias>`). Stable domain is convenience only after repoint. |
| **Overall result** | Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete. Overall verdict is PASS/FAIL only — no overall SKIP. |
| **Action** | Concrete steps: role, device/browser, route, clicks, inputs, preconditions. |
| **Expect** | Observable pass criteria. |
| **Ignore this run** | Known noise, out-of-scope UI, deferred adjacent work, or env quirks **for this item only**. Write `Nothing.` if there is nothing to ignore — field is always present. |
| **PASS** (per item) | Checked = test ran and passed. |
| **FAIL** (per item) | Checked = test ran and failed (explain in Notes). |
| **SKIP** (per item) | Checked = test deliberately skipped this run — **reason required in Notes**. |
| **None checked** (per item) | Not yet run / missed — **not** the same as a deliberate SKIP. |
| **Notes** | Freeform observations. SKIP items must state why here. |

Run order: top to bottom. Repeat **Action** / **Expect** in **light** and **dark** theme where readability matters (items 1–3).

---

## Feature smoke items

### 1. Badge visible on preview with correct branch + SHA

**Action:** On the **branch alias Preview** URL (wait for Vercel deploy `READY` if still building), open any public route (e.g. `/login`) without signing in. Look at the **bottom-right** corner of the viewport. Repeat in **light** theme, then **dark** theme (theme toggle if logged in, or set `[data-theme]` via devtools on `<html>`).

**Expect:** A compact pill/badge is fixed at bottom-right showing `feat/preview-branch-badge · 6bf1c4f` (branch name + 7-char SHA matching this smokebook tip). Readable in both themes. Does not cover primary page CTAs. Badge sits below modals/toasts if you trigger a toast elsewhere on the page.

**Ignore this run:** Exact pixel position nits if the badge remains unobtrusive and non-blocking.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 2. Click-to-copy branch name

**Action:** On the preview URL, click the badge pill (not the × dismiss). Paste into a text field or note app.

**Expect:** Clipboard contains exactly `feat/preview-branch-badge` (branch ref only, not the SHA). Badge briefly shows **Copied!** affordance, then reverts.

**Ignore this run:** Browser clipboard permission quirks on first paste — retry once.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 3. Dismiss persists for the session

**Action:** Click the **×** on the badge. Navigate to another route (e.g. `/login` → `/signup`). Open a new tab to the same preview origin and load `/login` again **in the same browser session** (same tab group / sessionStorage scope).

**Expect:** Badge stays hidden after dismiss for the remainder of the browser session. Reappears only after closing all tabs for that origin and opening a fresh session (or clearing sessionStorage for the origin).

**Ignore this run:** `Nothing.`

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 4. Whiteboard route — badge non-blocking

**Action:** Sign in as tutor on preview. Open any student whiteboard workspace. Confirm the badge (if not dismissed) does not intercept drawing or bottom chrome controls; try a stroke near the bottom-right if the badge is visible.

**Expect:** Whiteboard remains fully interactive; badge uses pointer-events only on itself (clicks pass through elsewhere).

**Ignore this run:** Badge hidden because item 3 dismiss was run first — re-open a fresh session without dismissing to verify placement.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 5. Production absence (Andrew verifies post-merge)

**Action:** **After** this branch merges to production (`master` / production Vercel target), open the live production site (e.g. `https://usemynk.com/login`). Inspect bottom-right on multiple routes.

**Expect:** **No preview branch badge anywhere.** This item is the production safety check — cannot pass on preview-only URLs.

**Ignore this run:** Run this item only post-merge to production; SKIP with reason if merge has not happened yet.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

## Cross-branch / post-merge

Run this section **after** the feature branch merges into the integration branch (`v1-redesign` or `master`). Use the **integration branch preview** (fetch alias the same way — branch name changes).

**Integration branch:** `v1-redesign`
**Integration tip commit:** `<fill at merge time>`
**Integration preview:** [<label>](https://<branchAlias>)

**Overall integration result:**

- [ ] PASS
- [ ] FAIL

### 1. Regression spot-check — badge still preview-only on integration cut

**Action:** On the integration **Preview** URL after merge, load `/login`. Confirm badge shows with integration branch ref + SHA. On **production** (post-master-cut), confirm badge absent (same as item 5 above).

**Expect:** Preview shows badge; production does not.

**Ignore this run:** Production check if master cut not yet deployed.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete. Overall verdict is PASS/FAIL only — no overall SKIP.

- [ ] PASS
- [ ] FAIL
