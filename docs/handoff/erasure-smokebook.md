# Learner/family right-to-erasure (E5 admin UI) — smoke runbook

**Branch:** `wb-wave5-polish`
**Tip commit:** [`f6ad4bc`](https://github.com/Arangarx/tutoring-notes/commit/f6ad4bc7eeb55ed43dd53b9c8ef720cf0f7154c7)
**Preview:** [wb-wave5-polish preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app)

Admin-only erasure surface: per-learner and full-family scopes, immediate tombstone, 7-day grace before blob+DB purge, cancel during `requested` only. Route guards 404 on `Student.erasedAt` (post-purge); tutors retain read-access during grace. Themes not required for this admin-only smokebook.

---

### 1. Admin gate — non-admin cannot reach `/admin/erasure`

**Action:** Sign in as a **TUTOR** (non-ADMIN) account on the branch **Preview**. Navigate directly to `/admin/erasure`.

**Expect:** Page returns **404** (not found). No erasure UI, no job table, no trigger forms.

**Ignore this run:** Impersonation flows unrelated to erasure.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/lib/erasure/request-erasure-by-admin.test.ts › requestErasureByAdminAction admin role gate]`

**Notes:**

---

### 2. Trigger per-learner erasure — confirmation phrase enforced

**Action:** Sign in as **ADMIN**. Open `/admin/erasure`. Select a learner profile with display name **visible in the UI** (e.g. a test child). Enter a **wrong** confirmation phrase (not the display name, not `DELETE`). Submit the per-learner erasure request. Repeat with the **exact display name** (or `DELETE`).

**Expect:** Wrong phrase is **rejected** with a clear error — no job created, no tombstone. Correct phrase (display name or `DELETE`) **accepts** and creates a `requested` job.

**Ignore this run:** Copy nitpicks on button labels.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/lib/erasure/request-erasure-by-admin.test.ts › confirmation phrase enforcement]`

**Notes:**

---

### 3. Irreversible-warning copy present and honest

**Action:** On `/admin/erasure`, open the per-learner and full-family trigger panels (do not submit yet). Read the warning copy around immediate tombstone, 7-day grace, irreversible purge, and cancel window.

**Expect:** Copy states: identity redaction + login revoke are **immediate**; blob/DB purge happens after grace (~7 days); cancel only while status is `requested`; no dark-pattern “are you sure?” loops that hide consequences. Wording matches ratified semantics (no promise of instant full purge).

**Ignore this run:** Minor typography; theme colors.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: subjective honesty/readability of legal-adjacent copy]`

**Notes:**

---

### 4. Immediate tombstone — learner cannot log in; identity redacted

**Action:** Using a **fresh test learner** (child PIN login), note the display name. As **ADMIN**, trigger per-learner erasure with the correct confirmation phrase. Attempt **learner PIN login** again in an incognito window. Inspect the learner profile / family dashboard if accessible.

**Expect:** Login **fails** (credential revoked / tombstoned). Display name shows redacted placeholder (e.g. **"Deleted learner"**). Parent account holder is **not** tombstoned for per-learner scope.

**Ignore this run:** Parent AH session on a different browser tab (focus on learner login).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/lib/erasure/erasure-lifecycle.integration.test.ts › per-learner happy path (tombstone assertions)]`

**Notes:**

---

### 5. Trigger full-family erasure — AH + all children covered

**Action:** As **ADMIN**, pick a test family with **≥2 child learner profiles** (non-fixture). Trigger **account_holder** (full-family) erasure with the family display name or `DELETE`. Check the jobs table scope and affected learners.

**Expect:** One `account_holder` job created. **Account holder** tombstoned (redacted email/display). **All non-fixture child** learner profiles tombstoned. Job scope covers every student in the family.

**Ignore this run:** `isTestFixture` learners (should be excluded from family tombstone sweep).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/lib/erasure/erasure-lifecycle.integration.test.ts › full-family erasure]`

**Notes:**

---

### 6. Jobs table shows grace countdown / `purgeEligibleAt`

**Action:** After triggering erasure (item 4 or 5), stay on `/admin/erasure` jobs table.

**Expect:** Job row shows status `requested` and a **purge-eligible** timestamp ~7 days out (or human-readable countdown). `requestedAt` and principal (`admin:…`) visible.

**Ignore this run:** Exact date format localization.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/lib/erasure/request-erasure-by-admin.test.ts › job creation shape]`

**Notes:**

---

### 7. Cancel during `requested` — halts purge; cancel absent after

**Action:** Trigger a new per-learner erasure. While status is **`requested`**, click **Cancel** on the job row. Confirm job moves to `canceled`. Trigger another erasure, wait until worker would advance (or manually run resume CLI on a past-grace job — item 8) and confirm cancel control is **gone** once status is past `requested`.

**Expect:** Cancel succeeds during grace → status `canceled`, no purge. Tombstone **remains** (Option A — no un-tombstone). Cancel button/control **not shown** for `blobs_purging`, `db_scrubbing`, or `completed`.

**Ignore this run:** None.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/lib/erasure/erasure-lifecycle.integration.test.ts › cancel during grace]` + `[automated: src/app/admin/erasure/cancel-erasure-by-admin.test.ts]`

**Notes:**

---

### 8. Worker/cron processing — `erasure:resume` advances past-grace job

**Action:** **Preview-only simulation** (requires a job whose `purgeEligibleAt` is in the past):

1. Trigger per-learner erasure on a disposable test learner (item 4).
2. Note the `jobId` from the admin jobs table.
3. In Vercel **preview** environment (or local against preview DB if wired), an operator with `ERASURE_WORKER_SECRET` runs: `npm run erasure:resume -- --jobId=<id>` **only if** `purgeEligibleAt` can be moved into the past via admin DB access — **on stock preview without DB access, SKIP**.

**Alternative (local operator):** Against local/staging DB, update `purgeEligibleAt` to yesterday for the test job, then run `npm run erasure:resume -- --jobId=<id>` and refresh admin UI.

**Expect:** Job advances through `blobs_purging` → `db_scrubbing` → `completed`. `Student.erasedAt` set. Blobs purged (no reachable content).

**Ignore this run:** Cron timing on Vercel (hourly) — manual CLI is the smoke path.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/lib/erasure/process-erasure-job.test.ts › happy path]` + `[automated: src/lib/erasure/erasure-lifecycle.integration.test.ts › per-learner happy path]`

**Notes:**

---

### 9. Post-purge content 404 — replay + APIs for erased student

**Action:** After a **completed** erasure job (item 8 or natural grace expiry), as **tutor**, attempt to open:

- Session replay page for the erased student's session
- Events / snapshot / audio / tutor-asset API routes for that student

**Expect:** All return **404** (not 403, not empty 200). No PII in error payloads.

**Ignore this run:** Unrelated students/sessions.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/lib/erasure/erasure-lifecycle.integration.test.ts › per-learner happy path (post-purge guards)]` + `[automated: src/lib/erasure/assert-student-not-erased.test.ts]`

**Notes:**

---

### 10. Grace-window read-access nuance — tutor can still open content before purge

**Action:** Trigger per-learner erasure on a learner with **existing session content** (replay/audio). **Before** `purgeEligibleAt` passes (status still `requested`), as **tutor**, open the replay page and fetch events/audio for that student.

**Expect:** Tutor **can still read** content during grace (route guards key off `Student.erasedAt`, which is null until purge). Learner login is already blocked (item 4). Document: this is **expected** — content recoverable during grace; end-session short-circuit prevents new content registration.

**Ignore this run:** End-session button behavior during grace (covered by integration tests).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/lib/erasure/erasure-lifecycle.integration.test.ts › per-learner happy path (grace read-access + short-circuit)]`

**Notes:**

---

### 11. "[Deleted learner]" placeholder in student lists

**Action:** After purge completes, view tutor **student list** / roster where the erased learner appeared.

**Expect:** Student row shows **`[Deleted learner]`** placeholder — **not hidden**, not blank. Session aggregates may still show counts (billing preserved).

**Ignore this run:** Sort order of deleted vs active students.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/lib/erasure/process-erasure-job.test.ts › happy path (name placeholder)]`

**Notes:**

---

### 12. `blob-cleanup.mjs` L-1 — chunk blobs not treated as orphans

**Action:** **Code-confirmation / dry-run item** (no prod purge): Review E7 fix — `TranscriptChunk.chunkBlobUrl` included in `blob-cleanup.mjs` reference set. Optionally run blob cleanup **dry-run** against staging if available: `node scripts/blob-cleanup.mjs --dry-run` and confirm chunk URLs tied to live rows are **not** listed as orphans.

**Expect:** Chunk blob URLs referenced by `TranscriptChunk` rows are in the reference set; dry-run does not flag them as deletable orphans.

**Ignore this run:** Actual orphan deletion; unrelated blob namespaces.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/lib/erasure/blob-inventory.test.ts › chunkBlobUrl inventory]` — confirm `scripts/blob-cleanup.mjs` grep for `chunkBlobUrl` in reference set.

**Notes:**

---

## Overall result

- [ ] PASS
- [ ] FAIL
