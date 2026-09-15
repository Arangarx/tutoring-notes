# Calendar integration wave — ICS feed + Google Calendar write

> Superseded copy formerly at `~/.cursor/plans/calendar-verification-phase1.md`; **this in-repo file is now canonical.**

**Audience:** Cold-start orchestrator + eventual executor

---

## Status / TL;DR

**This wave ships two calendar paths in one branch on `master` (auth merge [`c8d613ca`](https://github.com/Arangarx/tutoring-notes/commit/c8d613ca) complete):**

1. **ICS subscription feed (platform-agnostic)** — no OAuth, no scopes, no Google verification. Serves Apple-primary tutors (including pilot Sarah) and any client that can subscribe to a webcal/ICS URL.
2. **Google Calendar API write** — `calendar.events.owned` to the tutor's **primary** calendar for instant create/update/delete. Requires OAuth verification with a genuine demo video.

**Why two paths:** "Sessions show up in my calendar" is calendar-agnostic. Google API write is a Google-specific implementation for timely sync. Pilot tutor Sarah (Discord 2026-09-11) is **Apple Calendar first, Gmail second** — Google write does not serve her primary workflow, though she does have a Google calendar.

**Google rejection (context):** Verification team rejected the prior submission (2026-09-11) — demo "does not sufficiently demonstrate why the following scope(s) are necessary or why narrower permissions cannot be used" for `calendar.readonly` and `calendar.events`. The old bundled-stub strategy is invalid: you cannot verify a scope for functionality that does not exist. Real write must ship before resubmit.

**Decided (Andrew 2026-09-11):** Build both paths in **one wave**, serial branch after auth merge. ICS event title defaults to **first name** (`Tutoring — Maya`); full student name is tutor opt-in. **Pre-empt** the "why not narrower?" review risk by documenting ICS polling latency and filming API-write **immediacy** in the demo (see [Pre-empting the narrower-alternative review risk](#pre-empting-the-narrower-alternative-review-risk)).

**Blocked on Andrew:** Google Cloud Console checks — Verification Center status, audience/publishing + unverified quota, branding URLs, OAuth client blast radius. See [Open dependency — Andrew Console checks](#open-dependency--andrew-console-checks). Scope availability is **closed**: `calendar.events.owned` confirmed in picker (2026-09-11).

**Not blocked:** Google Sign-In (`openid email profile` only) and self-serve auth (release priorities #1 and #3). `gmail.send` verified 2026-05-30. Calendar sensitive-scope review is separate from Sign-In.

---

## Why the bundled-stub strategy is invalid

### Google's requirement (plain language)

- The verification video must show **full operational functionality** of **every** requested scope.
- Write scopes require **Source Account Impact**: create/edit/delete in the app, then show the same change in the tutor's real Google Calendar UI.
- You cannot justify `calendar.events` by saying "we'll use it later" — the video must show event insert/update/delete if that scope is requested.
- Requesting scopes without matching functionality risks unverified-user quota consumption and user disruption if deployed to production before verification completes.

### What the codebase actually does (audit 2026-09-11)

| Surface | Finding |
|--------|---------|
| Scopes requested | `src/app/api/auth/calendar/connect/route.ts` lines 6–10: `calendar.events`, `calendar.readonly`, `userinfo.email` |
| Only Calendar API call | `src/app/api/auth/calendar/callback/route.ts` lines 72–85: one-time `calendarList.list` (requires `calendar.readonly`), annotated in-code as `// optional screencast helper — ignore failures` |
| DB field | `prisma/schema.prisma` line 936–937: `calendarCount` documented "One-shot calendarList.list count at connect time (screencast / status only)" |
| Write scope usage | **Zero** call sites for `events.insert` / `events.patch` / `events.delete` / watch |
| Reserved write field | `prisma/schema.prisma` line 963–964: `googleEventId` — "Reserved for future Google Calendar write — null until sync ships"; never written by any code path |

**Circularity (record explicitly):** The only Calendar functionality that existed was built in order to be filmed — `calendarList.list` exists solely to populate `calendarCount` for a screencast/status display. That does not satisfy Google's write-scope demo requirement for `calendar.events`, which was requested but entirely unused.

### Re-verification philosophy (Andrew's clarification)

> "I didn't mean literally forever...I just don't want to have to turn right back around and do it again for a feature we already know we want. I understand I'll have to re-verify as I add requested features."

**Interpretation:** Never verify twice for the **same** capability. Verifying again for a genuinely **new** capability (e.g. future collision detection via `calendar.events.owned.readonly`) is the normal Google lifecycle and is acceptable.

---

## Pilot tutor calendar preference (Sarah, Discord 2026-09-11)

Andrew asked: *"Which calendar do you personally use the most? Do you use google calendar or do you use an apple version of it or other?"*

Sarah replied: *"Apple calendar, second most gmail."*

**Significance:** The pilot tutor is Apple-first; Google Calendar is her secondary. Google Calendar API write does **not** serve her primary workflow, though she does have a Google calendar. This input expanded the wave beyond Google-only.

---

## ICS subscription feed — refresh-rate research (factual basis)

An ICS/webcal subscription feed is **polled by the client**, never pushed by us. Consequence stated plainly: an ICS feed is genuinely usable for Sarah on Apple, and effectively useless on Google Calendar for same-day scheduling changes.

| Client | Typical poll interval | Notes |
|--------|----------------------|-------|
| Google Calendar (web + mobile) | Every 8–24 hours, sometimes longer | **Not user-configurable.** No working manual refresh. Google ignores `REFRESH-INTERVAL` / `X-PUBLISHED-TTL` hints in the feed. |
| Apple Calendar macOS | Configurable per subscription: 5 min, 15 min, hourly, daily, weekly | Default **hourly**. Manual refresh via Cmd+R. |
| Apple Calendar iOS/iPadOS | Configurable per subscription | Defaults to **Daily**; background fetch can be deferred on battery / Low Power Mode. Opening the app forces a check. |
| Outlook web / M365 | ~3 hours | — |
| Outlook desktop | Configurable | Default **24h**. |

---

## Ratified decisions (Andrew 2026-09-11)

### Wave shape — build both, one branch

1. **Build both paths in ONE wave**, still sequenced **after** `feat/auth-ship-ready` merges (serial, one branch, not parallel, not a separate worktree; another agent was actively executing in the repo working tree as of 2026-09-11 — do not collide):
   - **(a) Platform-agnostic ICS subscription feed** — works on Apple, Google, Outlook, anything. Needs **no** OAuth, **no** scopes, **no** Google verification.
   - **(b) Google Calendar API event write** using `https://www.googleapis.com/auth/calendar.events.owned` to the tutor's **primary** calendar — as specified in [Google write decisions](#google-write-decisions) below.

   **Rationale:** "Sessions show up in my calendar" is calendar-agnostic; Google API write is a Google-specific implementation of it. The agnostic path serves the actual pilot tutor and every future non-Google tutor; the API path serves Google-primary tutors who need same-day accuracy.

### ICS event title default — first name

2. **ICS event title default = first name.** Format like `Tutoring — Maya`. Full student name is a **tutor opt-in**, not the default. This is a **parameter on one implementation**, never two code paths (repo rule: `.cursor/rules/composition-no-duplication.mdc`). Derive first name from `Student.name` at render time.

   **Reasoning (expensive to reverse once published):**
   - **Leaked-URL blast radius** is the primary driver. An ICS URL is a bearer secret in a URL, and URLs leak mundanely (browser history, screen shares, support tickets, and especially the tutor's own calendar-account configuration where anyone with account access can read it). A leaked generic/first-name feed exposes a schedule; a leaked full-name feed exposes a roster of identifiable children with session times and weekly cadence. Same leak, very different harm.
   - **New continuous third-party egress:** Google's and Apple's servers fetch the feed on a recurring schedule indefinitely, for every tutor. That plausibly makes them subprocessors of children's PII, which the privacy policy does not currently claim.
   - **Consistency with existing product posture:** the privacy page already states the "Include audio recording in parent share link" option is off by default. Sensitive content is opt-in here, not opt-out.
   - **Why NOT fully generic:** a day of four identical "Tutoring session" blocks forces the tutor to open each one. Sarah has explicitly complained about extra steps. First name disambiguates at a glance while being far less identifying than a full legal name.
   - **Default-safe is the reversible direction:** you cannot un-fetch names already published to third-party servers.

### Google write decisions

3. **Build real write, then verify once.** Implement Calendar event create/update/delete, then submit one verification with a genuine demo video. Do **not** re-film against the stub.

4. **Phase 1 scope:** `https://www.googleapis.com/auth/calendar.events.owned` — "see, create, change, and delete events on Google calendars you own." Sessions write to the tutor's **primary** calendar (`primary` calendar ID in Calendar API terms).

5. **Drop old scopes and stub read.** Remove `calendar.readonly` and `calendar.events` entirely. Delete the `calendarList.list` "screencast helper" in the callback route and remove the `calendarCount` column as part of cleanup.

6. **No calendar-picker UI in phase 1.** A picker requires reading the calendar list — another scope to justify. Primary calendar only.

7. **No collision/conflict detection in phase 1.** Andrew: "I imagine at some point they're going to want collision detection, but I don't think that's necessary in phase 1 till people ask for it." When asked for, the likely ask is **`calendar.events.owned.readonly`** ("see the events on Google calendars you own") — confirmed present in the picker 2026-09-11, and narrower than `calendar.events.freebusy` since it is limited to calendars the tutor owns rather than all calendars they can access. Either way it is a small, separate review. **Do not pre-request** a read scope in phase 1.

8. **Production gating of Connect button — deferred.** Andrew chose to **leave the Connect button reachable** for now (current users: Andrew, Sarah, Tyson — unverified-quota exposure negligible). **Revisit before unsupervised pilots** (release track explicitly targets unsupervised pilots). Mirror the existing Gmail pattern: `src/lib/gmail-connect-allowed.ts` (`GMAIL_CONNECT_ALLOWLIST` — when unset, any signed-in admin may connect; when set, comma-separated email allowlist). No new primitive needed. `docs/PLATFORM-ASSUMPTIONS.md` line 306 currently states Calendar connect has "no allowlist (any signed-in admin may connect)."

---

## Why `calendar.events.owned` rather than `calendar.app.created`

**Initial recommendation:** `calendar.app.created` — narrowest possible scope (create secondary calendars; manage events only on app-created calendars).

**Rejected as the phase 1 choice:** Calendars created through the API are frequently **not visible in the Google Calendar mobile app by default**. The user must open Settings → find the account → locate the calendar → manually toggle Sync. Setting `selected:true` / `hidden:false` via `calendarList.insert` does **not** reliably force mobile sync.

**Why that matters:** Tutors use phones for time-sensitive sessions; Sarah has said on Discord she resents extra steps. For Google-primary tutors, sessions must appear on the **primary** calendar they already check — not a hidden app-created secondary calendar. (Sarah herself is Apple-first; she is served by the ICS path in this wave, not Google write.)

**Comparison:**

| Scope | Coverage |
|-------|----------|
| `calendar.events` (rejected by Google **and** by us) | All calendars including ones merely shared with the tutor — too broad |
| `calendar.app.created` | App-created secondary calendars only — narrow but bad mobile UX for Sarah |
| `calendar.events.owned` | See/create/change/delete events on calendars the tutor **owns** — includes primary calendar |

**Least-privilege justification for Google:** `calendar.app.created` cannot write to the tutor's existing primary calendar, which is where tutors need sessions to appear. `calendar.events.owned` is the narrowest scope that delivers the feature.

---

## Pre-empting the narrower-alternative review risk

**This is prominent and non-negotiable in the verification package.**

Shipping an ICS feed that delivers calendar visibility with **zero scopes** invites a Google reviewer to ask why API write is needed at all. Andrew chose to **pre-empt** rather than sequence around it.

**Rejected alternative (record for audit):** Andrew considered sequencing — verify Google write first, ship ICS only after approval — and chose pre-emption instead.

**Therefore:**

1. **Written scope justification MUST include the refresh-latency argument:** Google refreshes external ICS feeds only every 8–24 hours, with no manual refresh and no user-configurable interval (see [ICS refresh-rate research](#ics-subscription-feed--refresh-rate-research-factual-basis)). A session rescheduled this morning stays wrong on a Google-primary tutor's calendar all day. `calendar.events.owned` write is the **only** way to deliver timely updates to those users. The ICS feed is a best-effort fallback for non-Google clients, **not** a substitute.

2. **Demo video MUST show the immediacy difference**, not merely that writing works — e.g. reschedule a session and show it update in Google Calendar right away, contrasted with the feed's polling delay.

3. **ICS does not replace the write-scope ask.** Frame both paths in the submission: agnostic feed for breadth + API write for Google-primary timeliness.

---

## Open dependency — Andrew Console checks

Andrew must inspect [Google Cloud Console](https://console.cloud.google.com/) (Google Auth Platform section) and report back. **Scope availability is closed** — `calendar.events.owned` confirmed 2026-09-11.

| Check | What to capture |
|-------|-----------------|
| **Data Access** | ✅ **RESOLVED 2026-09-11 (Andrew, Console screenshot).** `calendar.events.owned` **is** offered in the scope picker under Google Calendar API, described "See, create, change, and delete events on Google calendars you own." `calendar.events.owned.readonly` ("See the events on Google calendars you own") is listed alongside it. Both carry the lock icon = **sensitive**, so verification is still required — narrower than `calendar.events`, but there is no non-sensitive path. The picker banner ("Only scopes for enabled APIs are listed below") also confirms the **Google Calendar API is already enabled** in the project, which clears that item from `docs/handoff/ANDREW-FOLLOW-UPS.md`. Still worth capturing separately: the full contents of "Your sensitive scopes" as currently *selected* (not merely available). |
| **Verification Center** | Per-check status: Home page requirements, Branding guidelines, Privacy policy requirements, App functionality, Appropriate data access, Request minimum scopes. Determines whether a scope-config reply is a narrow fix or other fronts are still open. |
| **Audience** | Publishing status (should be "In Production"); user cap; unverified users consumed. |
| **Branding** | Registered app name, homepage, privacy, terms URLs (expected: mortensenapps.com umbrella). |
| **Clients** | How many OAuth clients exist; whether Sign-In, Gmail, and Calendar share one client. `gmail.send` verified 2026-05-30 — if Calendar rides the same client, scope changes touch an already-verified config and may affect other apps under the Mortensen Apps umbrella. **Blast radius must be known before changing scopes.** |

Paste findings into `docs/handoff/ANDREW-FOLLOW-UPS.md` status block when done.

---

## What is NOT gated by this rejection

| Flow | Scopes | Verification |
|------|--------|--------------|
| Google Sign-In | `openid email profile` only — `src/auth-options.ts` lines 44–48 | Non-sensitive; no sensitive-scope review |
| Gmail send | `gmail.send` | Verified 2026-05-30 |
| Calendar connect (current) | `calendar.events` + `calendar.readonly` + `userinfo.email` | **This rejection** |
| ICS subscription feed | None | Not applicable — no OAuth |

Release priorities **#1** (External Google validation — Sign-In UI) and **#3** (Tutor signup / self-serve auth) proceed independently of Calendar write verification. ICS feed ships in the same wave but does not gate on Google approval.

---

## Queued doc corrections (apply AFTER `feat/auth-ship-ready` merges)

****Applied 2026-09-15** on ``master`` doc pass — BACKLOG, ORCHESTRATOR-STATE, ANDREW-FOLLOW-UPS updated; this plan remains canonical for the implementation wave\.

### `docs/BACKLOG.md` (line 48)

Current wording:

> **ONE bundled verification (Andrew 2026-08-14):** hook up Calendar OAuth **now** (connect + token store + honest stub) even if sync is not implemented, so Andrew does **not** re-verify later when sync lands. Do **not** put calendar scopes on NextAuth Sign-In/Sign-Up (`openid email profile` only). Submit review only after the Connect demo is crawlable.

**Replace with:** Phase 1 ships real `calendar.events.owned` write before verification submit; stub-first bundled verify strategy superseded 2026-09-11 (Google rejection + audit). See this plan file.

### `docs/handoff/ORCHESTRATOR-STATE.md` (line 67)

Current wording:

> **Durable decisions (2026-07-10 + 2026-08-14):** Calendar verification = **one bundled round** — connect+stub ships **before** submit so scopes are in that one review; full two-way sync later does **not** trigger a second verify. Sign-In/Sign-Up Google stay `openid email profile` (never calendar). Apple Calendar = CalDAV/defer. Skip Facebook. Microsoft optional.

**Replace bundled-stub clause with:** Real Calendar write (`calendar.events.owned`, primary calendar) ships before verification submit; one verify per capability; stub-first strategy superseded 2026-09-11.

**Also correct the Apple Calendar line.** Current wording conflates two very different things:

> Apple Calendar = CalDAV/defer.

**Problem:** CalDAV is two-way and genuinely hard (correctly deferred). A one-way ICS subscription feed is trivial and appears never to have been separately considered. Deferring the hard thing accidentally buried the easy one.

**Replace with:** Apple Calendar primary path = ICS subscription feed (this wave). CalDAV two-way sync remains deferred. Google-primary timely sync = `calendar.events.owned` API write (this wave).

### `docs/handoff/ANDREW-FOLLOW-UPS.md` (line 22)

Current wording (item 6):

> **Submit ONE bundled verification** only after the Connect-Calendar demo is on a crawlable URL (honest stub is enough — no two-way sync required for the screencast)

**Replace with:** Submit verification only after real event write (create/edit/delete) is on a crawlable URL; demo must show Source Account Impact in the tutor's Google Calendar UI.

Related stale lines in same files (also update on the doc pass): BACKLOG line 47 (`calendar.events` + `calendar.readonly` scope model), BACKLOG line 52 ("sync not live"), ORCHESTRATOR-STATE line 64 (calendar callback + one verification submit when live).

---

## Implementation shape (sketch for executor)

Full plan gets written when the wave starts. This section orients a cold executor.

### ICS subscription feed (greenfield, small)

**No ICS export exists today.** A read-only grep for `text/calendar`, `.ics`, `ical`, `VCALENDAR`, `VEVENT`, `CalDAV` returned only substring noise (words like "critical", "typically", "identical"). Treat as greenfield but small. (This plan pass did not re-verify by writing anything in the repo.)

**Source of truth:** existing `ScheduledSession` model in `prisma/schema.prisma` — render tutor-owned rows as `VEVENT`s:

| Field | ICS use |
|-------|---------|
| `date` (`DateTime @db.Date`) + `startTime` / `endTime` (`HH:MM` strings) | `DTSTART` / `DTEND` — combine date + local times; executor must define timezone policy (tutor profile or app default) and emit correct UTC or `TZID` |
| `plannedDurationMinutes` | Cross-check against start/end; authoritative window is start/end |
| `subject` | Optional `CATEGORIES` or description prefix |
| `notes`, `location` | `DESCRIPTION`, `LOCATION` |
| `studentId` → `Student.name` | Event `SUMMARY` — default first name (`Tutoring — {first}`); full name only when tutor opt-in flag set |
| `adminUserId` | Feed scope — only this tutor's sessions |

**Token + revocation — reuse share-link pattern, do not invent a parallel scheme:**

- Follow `src/lib/share-access-scope.ts`: opaque token in URL, `revokedAt` null-check → 404 on revoked/missing, structured access logging on every fetch.
- Token minting: `generateShareToken()` from `src/lib/security.ts` (same as `ShareLink` in `src/app/admin/students/[id]/actions.ts` — `regenerateShareLink`).
- `ShareLink` is per-student for notes; the calendar feed needs a **per-tutor** token model (new table or `AdminUser` field) but the **pattern** is identical — not a second token philosophy.
- Log prefix: repo convention (`AGENTS.md` § Conventions) requires a 3-letter prefix for new capture/sync features. Propose **`ics`** (e.g. `[ics] ics=<token:8> action=feed_fetched|feed_denied adminUserId=<id>`). Must be registered in `AGENTS.md` when implemented.

**Serving:**

- Serve over **https** — Google's "From URL" accepts only `http`/`https`, not `webcal://`. Publish both `https://…` and `webcal://…` link forms in UI where practical (same URL, different scheme).
- **Gotcha:** Google reads a subscribed calendar's **name and time zone only at first subscribe**; later renames do not propagate.
- **Gotcha:** Google drops reminders carried in feeds — do not rely on ICS `VALARM` for notifications.

### Existing native scheduling (Postgres-only today)

`src/app/admin/schedule/actions.ts`:

- **`createScheduledSession`** — validates input (date, subject, times, duration 45/60/90 min), asserts student ownership, inserts `ScheduledSession` row, revalidates `/admin/schedule`.
- **`updateScheduledSession`** — same validation + ownership on session and student, updates row.
- **`deleteScheduledSession`** — ownership check, hard delete row.
- **`listScheduledSessionsForTutor(googleConnected)`** — lists tutor's sessions, maps via `toScheduledSessionView`.

No Google calls in any of these today.

### Wire Google Calendar API

- Hook **`events.insert` / `events.patch` / `events.delete`** into the three CRUD actions when tutor has an active `OAuthCalendarConnection`.
- Target calendar: tutor's **primary** calendar (no picker UI in phase 1).
- Populate existing **`googleEventId`** on `ScheduledSession` after successful insert; clear on delete; update on patch.
- Update **`src/app/api/auth/calendar/connect/route.ts`** scope list to `calendar.events.owned` + `userinfo.email` only.
- Remove **`calendarList.list`** from callback; drop **`calendarCount`** from schema, `src/lib/calendar-oauth.ts`, and any UI that displayed it.

### OAuth token refresh — reuse, do not duplicate

- **`src/lib/calendar-oauth.ts`** — current read path for stored connection; extend with access-token refresh for API calls.
- **Pattern to mirror:** `src/lib/gmail-transport.ts` — `OAuth2Client` from `google-auth-library`, `setCredentials({ refresh_token })`, `getAccessToken()`. Gmail and Calendar share `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` but different redirect URIs and scopes.
- Repo rule: `.cursor/rules/composition-no-duplication.mdc` — extract shared refresh helper if a third duplication would appear; do not write a parallel refresh stack.

### Fail-soft (mandatory)

Google outage, revoked token, or API error must **never** break native scheduling. Postgres CRUD succeeds regardless; Google sync is best-effort.

### Existing UI sync states (already wired for honesty)

**Mapper:** `src/lib/schedule/scheduled-session-mapper.ts` — `resolveSyncPresentation`:

- `googleEventId` set → `showSyncBadge: true`, `syncState: "synced"`
- Google connected but no `googleEventId` → `showSyncBadge: true`, `syncState: "not-connected"`
- Google not connected → `showSyncBadge: false`, `syncState: "not-connected"`

**Badge component:** `src/components/admin/schedule/SessionSyncBadge.tsx` — labels: "Synced", "Sync pending" (`pending` state exists in types but mapper does not emit it yet — executor may use for in-flight writes), "Not synced".

**Dialog copy:** `src/components/admin/schedule/CreateSessionDialog.tsx` lines 156–158:

- Connected: "Google Calendar is connected — events will show as not synced until calendar write ships."
- Not connected: "Sessions are saved in Mynk only until you connect Google Calendar."

After write ships, update copy and mapper so connected + successful write → `synced`; connected + write failure → consider `pending` or remain `not-connected` with honest messaging.

### Disconnect behavior (decide during implementation)

When tutor disconnects Google Calendar (`OAuthCalendarConnection` deleted): what happens to events already written to Google? Options to evaluate: leave events in Google (orphaned), attempt delete-all on disconnect, or document "events remain until manually removed." Pick one and document in privacy/terms.

### Testing

Per `.cursor/rules/exhaustive-testing-mandate.mdc`:

**ICS feed (deterministic output):**

- Assert generated ICS against spec: valid `VCALENDAR`/`VEVENT`, correct UTC/timezone handling.
- Revoked token → 401/404.
- First-name default vs tutor opt-in full-name title behavior.

**Google write:**

- Injectable Google Calendar client — CI must never call Google.
- Red-before / green-after for insert/patch/delete wiring.
- Playwright for UI sync badge states (connected + synced, connected + failed, disconnected).
- Jest for mapper + action fail-soft paths.

### Legal + platform docs (same commit as scope change)

Current copy is inaccurate once write ships:

- **`src/app/privacy/page.tsx`** lines 172–183 — describes `calendar.events` + `calendar.readonly`, "Calendar sync is not live yet", one-time calendar list read.
- **`src/app/terms/page.tsx`** lines 114–121 — "Calendar sync is not live yet".

Follow **`docs/LEGAL-SYNC.md`**; honesty rule is hard (Andrew 2026-07-09 — never claim capabilities the app does not implement; on master, never claim stub when write is live).

**ICS feed = NEW third-party data flow** — must be disclosed in `src/app/privacy/page.tsx` per `docs/LEGAL-SYNC.md` and the hard honesty rule. This is **in addition to** the scope-narrowing legal updates for Google write already noted above (continuous polling by Google/Apple calendar servers; first-name default vs opt-in full names).

Update **`docs/PLATFORM-ASSUMPTIONS.md`** section 4.3 (line 306 area) — new scope set, ICS feed as load-bearing external dependency (third-party poll cadence), optional allowlist note for pre-pilot gating, remove stub characterization. Repo convention: update in the **same commit** as the feature.

---

## Demo video requirements (get it right the first time)

Google's rejection email is the authority. Minimum bar for resubmission:

1. **Show full operational functionality of `calendar.events.owned`:**
   - Create a session in the app → show the event in the tutor's **actual Google Calendar UI** (web or mobile — primary calendar).
   - Edit the session in the app → show the change in Google Calendar.
   - Delete/cancel the session in the app → show the event gone from Google Calendar.

   That sequence **is** Source Account Impact for a write scope.

2. **Show immediacy vs ICS polling (pre-emption requirement):** Reschedule a session and show it update in Google Calendar **right away**. Contrast with the ICS subscribed feed still showing the old time (or state plainly that Google polls external feeds every 8–24h with no manual refresh). This directly answers "why narrower permissions cannot be used" — the feed alone cannot deliver same-day accuracy for Google-primary tutors.

3. **Do not** film the stub (`calendarList.list` / calendar count / "sync not live" messaging) as the demo centerpiece.

4. **Written justification (submission text):** Include the refresh-latency argument from [Pre-empting the narrower-alternative review risk](#pre-empting-the-narrower-alternative-review-risk). ICS = zero-scope fallback for non-Google clients; API write = timely sync for Google-primary users.

5. **Reply directly** to the existing rejection email thread to continue the review (do not open a parallel submission channel unless Google instructs otherwise).

6. **Respect live-app warning:** Trigger new scopes in a **staging environment within the production app**; publishing status stays **"In Production"** per Google's guidance — do not route unverified scopes to general production traffic before approval. Current pilot exposure (Andrew/Sarah/Tyson) is accepted risk until unsupervised pilots; revisit Connect allowlist before that gate.

7. **Narration tips:** State why `events.owned` is the minimum scope (primary calendar where tutors manage sessions; not all shared calendars). Do not request or demonstrate scopes not in the submission. Mention ICS feed exists for Apple/other clients but does not replace write for Google timeliness.

---

## Sequencing summary

```
feat/auth-ship-ready merge
        ↓
Doc correction pass (BACKLOG, ORCHESTRATOR-STATE incl. Apple/ICS correction, ANDREW-FOLLOW-UPS)
        ↓
Andrew Console checks (blast radius, Verification Center — scope availability closed)
        ↓
feat/calendar-integration (or equivalent) — ONE serial branch:
  • ICS subscription feed (no verification)
  • Google Calendar API write (calendar.events.owned)
        ↓
Gates: jest (ICS output + injectable Google client) + Playwright + legal sync + PLATFORM-ASSUMPTIONS + AGENTS.md ics= prefix
        ↓
Crawlable preview → demo video (immediacy + Source Account Impact) → reply to rejection email
        ↓
Verification approved → revisit Connect allowlist before unsupervised pilots
```

---

## References (repo — workspace-relative paths)

| Path | Relevance |
|------|-----------|
| `prisma/schema.prisma` | `ScheduledSession` (ICS source), `OAuthCalendarConnection`, `googleEventId`, `ShareLink` (token pattern) |
| `src/lib/share-access-scope.ts` | Tokenized revocable access + `sal=` logging pattern to mirror for ICS |
| `src/lib/security.ts` | `generateShareToken()` |
| `src/app/admin/schedule/actions.ts` | Native CRUD to extend (Google write hooks) |
| `src/app/api/auth/calendar/connect/route.ts` | Current scope request |
| `src/app/api/auth/calendar/callback/route.ts` | Token exchange + stub `calendarList.list` |
| `src/lib/calendar-oauth.ts` | Connection read + panel builder |
| `src/lib/gmail-transport.ts` | OAuth refresh pattern to reuse |
| `src/lib/gmail-connect-allowed.ts` | Allowlist pattern for pre-pilot gating |
| `src/lib/schedule/scheduled-session-mapper.ts` | Sync badge state logic |
| `src/components/admin/schedule/SessionSyncBadge.tsx` | Badge UI |
| `src/components/admin/schedule/CreateSessionDialog.tsx` | Honest pre-write copy |
| `src/app/privacy/page.tsx` | ICS third-party flow + Google scope copy |
| `docs/LEGAL-SYNC.md` | Privacy/terms sync protocol |
| `docs/PLATFORM-ASSUMPTIONS.md` | §4.3 Google OAuth + ICS polling assumptions |
| `docs/handoff/ORCHESTRATOR-STATE.md` | Stale "Apple Calendar = CalDAV/defer" — correct on doc pass |
| `AGENTS.md` | Register `ics=` log prefix on implementation |

External: [Google OAuth verification](https://support.google.com/cloud/answer/9110914), [Calendar API scopes](https://developers.google.com/calendar/api/auth)
