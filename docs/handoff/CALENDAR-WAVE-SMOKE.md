# Calendar wave — smoke runbook

**Branch:** `feat/calendar-wave`
**Tip commit:** [`d90a337d`](https://github.com/Arangarx/tutoring-notes/commit/d90a337d3494a2ee65be9d91f81af5696c612203)
**Preview:** [feat/calendar-wave preview](https://tutoring-notes-git-feat-calendar-wave-arangarx-5209s-projects.vercel.app)

---

## When Andrew runs this (mandatory policy)

Smokebooks are **not** mid-wave bug hunts. See [`.cursor/rules/smoke-when-done.mdc`](../../.cursor/rules/smoke-when-done.mdc).

| Phase | Who |
|-------|-----|
| Spec → implementation → Playwright per acceptance item → automated gates green | **Agents** |
| **One** hardware smoke when feature is **DONE** | **Andrew** |

**Smokebook items must be** new surface, subjective UX, or hardware / external-env paths Playwright cannot hermeticize. Use **Coverage** for automated citations; mark **N/A with notes** when Playwright already covers the behavior unless **human-only** applies. **Notes** is Andrew-only — leave blank during authoring.

Run order: top to bottom unless noted. Re-run **Cross-branch / post-merge** after integration merges to `master`.

---

## Feature smoke items

### 1. Apple Calendar — subscribe ICS HTTPS URL (Sarah primary)

**Action:** On the branch **Preview**, sign in as the pilot tutor. Open **Settings → Integrations** (`/admin/settings/integrations`). In **ICS subscription feed**, copy the **HTTPS** subscription URL (not webcal). On a Mac with Apple Calendar (Sarah’s primary client), add a calendar **From URL** / subscription using that HTTPS URL (File → New Calendar Subscription, or Calendar → Add Account → Other → CalDAV/ICS as appropriate for the OS version). Ensure at least one scheduled session exists in the app for a student whose ICS title you recognize. Wait for Apple’s poll refresh (may take several minutes; force refresh if the client offers it).

**Expect:** Subscribed calendar appears; events show plausible **start/end times** in the tutor’s local timezone; event **titles** match product rules (default first name only unless the per-student full-name toggle is on for that student). No duplicate ghost calendars from double-subscribe mistakes. Subscription survives app logout (URL is bearer-secret — treat compromise like a leaked password).

**Ignore this run:** Google Calendar “From URL” behavior (item 2). Google write-sync immediacy (item 3). Minor Apple UI differences between macOS versions.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `PLAYWRIGHT-GAP` — no hermetic Apple Calendar subscribe. `[human-only: live Apple Calendar From URL / subscribe has no hermetic stand-in]`. Surrogate unit oracles: `[automated: src/__tests__/calendar/ics-feed-stability.test.ts › double render with unchanged rows yields identical UID and DTSTAMP sets (parser oracle)]`; `[automated: src/__tests__/calendar/ics-summary-privacy.test.ts › default icsShowFullName false uses first name only]`; `[automated: src/__tests__/calendar/ics-summary-privacy.test.ts › flipping one student's flag changes only that student's parsed SUMMARY]`.

**Notes:**

### 2. Google Calendar — subscribe same ICS URL (From URL, poll lag)

**Action:** Using the **same HTTPS ICS URL** from item 1, in the tutor’s **real** Google Calendar (web or app), add via **From URL** / subscribe-by-URL (Settings → Add calendar → From URL). Note the time you subscribed. Compare against the app’s schedule list for the same sessions.

**Expect:** Google eventually shows the sessions (poll lag is **hours**, not seconds — this is expected). Names and times match the app once Google refreshes. Google write-sync (item 3) is a **separate** path and may already show events immediately while ICS stays stale.

**Ignore this run:** Expecting ICS updates in Google within minutes. OAuth-connected Google write path (item 3).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: Google ICS poll interval — no hermetic stand-in for real Google Calendar client refresh]`. Surrogate: `[automated: src/__tests__/calendar/ics-feed-stability.test.ts › double render with unchanged rows yields identical UID and DTSTAMP sets (parser oracle)]`.

**Notes:**

### 3. Google write immediacy vs ICS stale (demo rehearsal)

**Action:** With **Google Calendar connected** on **Preview** (`/admin/settings/integrations` → Connect if needed; complete OAuth). Open **Schedule** (`/admin/schedule`). **Create** a new scheduled session (pick a student, date, time). Confirm the event appears in the tutor’s **real Google Calendar UI** within a short window (seconds, not hours). **Edit** the session in the app (time or subject); confirm Google updates. **Delete** the session in the app; confirm the Google event **vanishes**. Optionally keep ICS subscribed from item 2 and note ICS still lags while Google write path is immediate — this is the intended demo narrative.

**Expect:** Create → visible in Google promptly; edit → Google reflects change; delete → Google event removed. ICS feed (if subscribed) remains stale until poll — contrast is clear for Sarah demo video rehearsal.

**Ignore this run:** Apple Calendar ICS timing (items 1–2). Badge copy on agenda rows (item 9).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: real Google Calendar UI + OAuth live grant — write immediacy not reproducible in relay Playwright]`. Backend surrogates covered in jest (google write idempotency / observability suites) — mark N/A unless rehearsing demo.

**Notes:**

### 4. Disconnect honesty — future writes stop; Google events remain

**Action:** With Google connected and at least one session synced to Google, open **Settings → Integrations**. Read the status copy above the Google row. Click **Disconnect** on Google. Create or edit a scheduled session in the app. Open Google Calendar and locate events that existed **before** disconnect.

**Expect:** UI copy states that disconnect stops **future** sync only and does **not** remove events already in Google — wording matches what you see on screen. After disconnect, new/edited sessions do **not** appear or update in Google. Pre-existing Google events **remain** (not bulk-deleted by our app).

**Ignore this run:** Revoked-grant reconnect flow (item 6). ICS subscription behavior (items 1–2).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/__tests__/calendar/disconnect-google.test.ts › deletes local OAuth row only — no Google events API calls]` — mark **N/A with notes** (“covered by Playwright/jest gate”) for server behavior; `[human-only: confirm leftover events still visible in real Google Calendar UI after disconnect]`.

**Notes:**

### 5. Per-student full name in calendar titles (student detail toggle)

**Action:** On **Preview**, open a student detail page (`/admin/students/[id]`). Find **Use full student name in calendar event titles (ICS feed and Google Calendar)**. Confirm default is **off**; note label clarity and placement. Toggle **on**, save if needed, schedule or adjust a session for that student. Refresh ICS (item 1 path) or Google write path (item 3) enough to see the title for that student. Toggle **off** for a second student and confirm titles differ appropriately.

**Expect:** Default off feels right for privacy; copy is understandable without reading LEGAL-SYNC. With toggle on, that student’s events use **full** `Student.name` in titles; with off, **first name only** in ICS (and Google when connected). Toggle does not flip other students.

**Ignore this run:** Pixel-perfect checkbox alignment. Legal page prose (item 7).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/__tests__/calendar/ics-show-full-name-toggle.test.ts › persists icsShowFullName after assertOwnsStudent]`; `[automated: src/__tests__/calendar/ics-summary-privacy.test.ts › flipping one student's flag changes only that student's parsed SUMMARY]` — mark N/A for persistence unless exercising UI; `[human-only: subjective feel/copy on student detail + ICS SUMMARY after subscribe in real calendar client]`.

**Notes:**

### 6. Reconnect Google after revoke in Google Account settings

**Action:** With Google Calendar connected in the app, open [Google Account → Third-party access](https://myaccount.google.com/permissions) and **revoke** access for Tutoring Notes / the OAuth client. Return to the app **Schedule** agenda (`/admin/schedule`, agenda tab) and/or **Settings → Integrations**. Trigger a session row that should sync (or create one).

**Expect:** **Reconnect Google** (or equivalent reconnect-needed messaging) is visible on affected session rows and/or integrations panel — sync does not silently fail. Re-connecting via **Connect** restores write sync without requiring a full app re-login.

**Ignore this run:** Playwright-seeded `reconnectRequiredAt` without real revoke (item 9 covers badge text in CI).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: real invalid_grant from Google Account revoke — cannot hermeticize OAuth revocation]`; agenda badge surrogate: `[automated: tests/integration/calendar-sync-badge.spec.ts › shows synced, pending, and reconnect badge text]` — N/A unless verifying real revoke UX.

**Notes:**

### 7. Privacy and terms — calendar sections honest (preview eyeball)

**Action:** On **Preview** (not production), open [`/privacy`](https://tutoring-notes-git-feat-calendar-wave-arangarx-5209s-projects.vercel.app/privacy) and [`/terms`](https://tutoring-notes-git-feat-calendar-wave-arangarx-5209s-projects.vercel.app/terms). Read calendar-related sections (ICS subscription feed, Google Calendar write, tokens, polling, disconnect behavior, student name in titles).

**Expect:** Copy is **honest** about what the app does: bearer ICS URL, client polling (not instant everywhere), Google write when connected, disconnect does not delete remote events, first-name default and per-student full-name opt-in, revoke/rotate token. No claims about automation we have not shipped.

**Ignore this run:** Umbrella mortensenapps.com pages (product facades only). Pixel-perfect typography.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: Andrew leftover legal honesty eyeball on preview facades]`.

**Notes:**

### 8. Google Calendar OAuth connect — scopes and connect entry (automated gate)

**Action:** *(Optional — agents gate this.)* Tutor → **Settings → Integrations** → **Connect**; inspect redirect URL scopes, or rely on CI.

**Expect:** OAuth uses **calendar.events.owned** (not readonly-only); sign-in Google provider stays **openid email profile** without calendar scopes.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/calendar-oauth-connect.spec.ts › Connect starts Google OAuth with calendar scopes]`; `[automated: src/__tests__/calendar-oauth.test.ts › keeps sign-in scope to openid email profile only (no calendar scopes)]`; `[automated: src/__tests__/calendar-oauth.test.ts › 302 includes owned calendar scope on the Google authorize URL]` — Andrew: **N/A with notes** (“covered by Playwright/jest gate”) unless spot-checking OAuth consent screen copy.

**Notes:**

### 9. Schedule agenda sync badges — Synced / Not synced yet / Reconnect Google (automated gate)

**Action:** *(Optional.)* Open schedule agenda with mixed sync states, or rely on CI.

**Expect:** Rows show **Synced**, **Not synced yet**, or **Reconnect Google** badge text matching connection state.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/calendar-sync-badge.spec.ts › shows synced, pending, and reconnect badge text]` — Andrew: **N/A with notes** unless human-only badge contrast judgment desired.

**Notes:**

### 10. ICS feed security — 404 and Cache-Control (not user-facing; automated gate)

**Action:** *(No user-facing UI.)* Agents verify via jest; Andrew skips unless auditing.

**Expect:** Valid feed returns `private, no-store`; missing/revoked tokens return identical 404 denial with same cache headers.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/__tests__/calendar/ics-feed-security.test.ts › 200 feed includes private no-store]`; `[automated: src/__tests__/calendar/ics-feed-security.test.ts › 404 denial includes private no-store]`; `[automated: src/__tests__/calendar/ics-feed-security.test.ts › missing and revoked tokens return identical status and body]` — Andrew: **N/A with notes** (“not user-facing; covered by jest gate”).

**Notes:**

---

## Cross-branch / post-merge

Run this section **after** `feat/calendar-wave` merges into `master`. Fetch a fresh **integration preview** via Vercel MCP (`meta.githubCommitRef=master` or the integration branch in use).

**Integration branch:** `master` (after calendar wave merge)
**Integration tip commit:** `<short-sha after merge>`
**Integration preview:** [<unverified — fetch branchAlias via Vercel MCP after merge>](https://vercel.com)

**Overall integration result:**

- [ ] PASS
- [ ] FAIL

### 1. Calendar + schedule regression spot-check on integration preview

**Action:** On the integration **Preview**, tutor login → **Schedule** → create one session → confirm Google connect UI still loads on **Settings → Integrations** → open one student detail and confirm ICS full-name toggle present. Smoke one whiteboard Start if calendar touched scheduling entry points.

**Expect:** No auth loop; schedule CRUD works; calendar integrations panel renders; no new console CSP errors on calendar routes.

**Ignore this run:** Full pre-master comprehensive smoke (separate runbook); re-proving items 1–10 above unless merge introduced regressions.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** Prior feature smoke items 1–7 remain human-only on hardware when re-validating after merge.

**Notes:**

---

## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete.

- [ ] PASS
- [ ] FAIL
