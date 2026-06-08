# Morning smoke runbook — 2026-06-05

**Date:** 2026-06-05  
**Purpose:** Smoke every unsmoked branch top-to-bottom in one sitting — preview URLs, steps, and gates in one place.

**None of these branches are merged. Each section is independent; smoke in any order. Report pass/fail per branch and I'll merge --no-ff on pass.**

---

## Quick status

| Branch | Commit | What | Gate | Preview |
|--------|--------|------|------|---------|
| `security/durable-auth-2fa-limiters` | `7fa34a1` | Login error UX + durable AH/2FA rate limiters | tsc 0 · build 0 · regression 92/92 · auth-client 2/2 | [Preview](https://tutoring-notes-git-security-dura-b2e710-arangarx-5209s-projects.vercel.app) |
| `fix/replay-multi-segment` | `953efa0` | Multi-segment replay player (hardware gate) | tsc 0 · build 0 · regression 92 · wb-jest 518 | [Preview](https://tutoring-notes-git-fix-replay-mu-cd2a15-arangarx-5209s-projects.vercel.app) |
| `fix/family-id-and-page-insert` | `bd146f0` / `167eefa` / `14c4daf` | Family handle scheme A + WB page append + doc fix | tsc 0 · build 0 · regression 92 · identity 289 | [Preview](https://tutoring-notes-git-fix-family-id-f3095a-arangarx-5209s-projects.vercel.app) |
| `feat/landing-logged-in-redirect` | `385ec7d` | Authenticated `/` → dashboard redirect | tsc 0 · build 0 · regression 92/92 | [Preview](https://tutoring-notes-git-feat-landing-c296af-arangarx-5209s-projects.vercel.app) |

---

## 1. `security/durable-auth-2fa-limiters` @ `7fa34a1`

**What:** Login error UX + durable Neon-backed account-holder login and 2FA rate limiters.

**Preview:** [security/durable-auth-2fa-limiters @ 7fa34a1](https://tutoring-notes-git-security-dura-b2e710-arangarx-5209s-projects.vercel.app)

**Local gate:** tsc 0 · build 0 · regression 92/92 · new auth-client test 2/2

### Smoke script

1. Go to `/login`, enter your admin email + a **wrong** password, submit ~11 times within a minute.
   - **Expected:** An **inline** message: *"Too many attempts — please wait N seconds and try again."* that **counts down live** each second, with the Sign-in button disabled until it hits 0. Must **NOT** say "Couldn't reach Mynk" and must **NOT** be a standalone error card or raw JSON.

2. **CRITICAL** (submit path was rewritten from NextAuth `signIn()` to a hand-rolled `credentialsSignIn()`): On `/login`, enter your admin email + the **correct** password.
   - **Expected:** Successful sign-in and redirect to the dashboard. Verifies the rewrite did not break the happy path.

3. `/account/login` — same wrong-password burst (~11 attempts within a minute).
   - **Expected:** Same live countdown + disabled button behavior as step 1.

4. **Tab order:** On `/signup` (or `/account/signup`, which use the shared password field), press Tab from email.
   - **Expected:** Focus order is email → password input → next control, **skipping** the Show/Hide reveal toggle. On `/students/login`, Tab from username → PIN → Sign in, skipping the eye toggle.

---

## 2. `fix/replay-multi-segment` @ `953efa0`

**What:** Multi-segment replay player — **HARDWARE gate** (jsdom cannot verify playback; was dead, now repaired).

**Preview:** [fix/replay-multi-segment @ 953efa0](https://tutoring-notes-git-fix-replay-mu-cd2a15-arangarx-5209s-projects.vercel.app)

**Local gate:** tsc 0 · build 0 · regression 92 · wb-jest 518 · (wb-playwright = pre-existing env `--accept-data-loss` failure, not this diff)

**Setup:** Use a multi-segment session — one where you Paused → Resumed the whiteboard recording, producing 2 audio segments (e.g. the 0:58 session).

### Smoke script (multi-segment session)

- **S1:** Page load → Play/Pause button reads "Play"; click → "Pause"; click → "Play".
  - **Expected:** Toggle labels match playback state.

- **S2:** On load, the scrubber thumb is at the far left (t=0), not mid-line.
  - **Expected:** Thumb at start of timeline.

- **S3:** Press Play → scrubber advances in real time across the bar.
  - **Expected:** Thumb moves smoothly with playback.

- **S4:** While playing, drag the scrubber → thumb follows the pointer.
  - **Expected:** Scrubber responds to drag during playback.

- **S5:** Drag to mid-session and release → strokes at that time **persist** (canvas does not clear); if it was playing, playback continues from the release point.
  - **Expected:** Whiteboard frame stays visible; playback resumes from scrub position.

- **S6:** Let audio reach the end of segment 1 (the old pause point) → audio continues seamlessly into segment 2; scrubber keeps advancing.
  - **Expected:** No gap or stall at segment boundary.

### Additional checks

- **Single-segment sanity:** Open a normal 1-segment session → native audio controls, scrub + scene advance work.
- **Events-only:** A session with no audio → shows the final frame + "no audio" caption, no controls.

---

## 3. `fix/family-id-and-page-insert`

**Commits:** family-id `bd146f0` · page-insert `167eefa` · doc `14c4daf`

**What:** Family handle scheme A + whiteboard page append at END + doc correction.

**Preview:** [fix/family-id-and-page-insert](https://tutoring-notes-git-fix-family-id-f3095a-arangarx-5209s-projects.vercel.app)

**Local gate:** tsc 0 · build 0 · regression 92 · identity 289

### Smoke script

1. **Family-id** (Andrew already **PASSED** this — re-confirm if desired): Create a family with surname X → child login handle is bare `@x`. Create a second family with the same surname → `@x2` (numeric suffix only on collision).
   - **Expected:** First family gets bare handle; second gets suffixed handle on collision only.

2. **WB page insertion → END** (**NOT yet smoked**): In a whiteboard session sitting on, say, page 2 of 3, click Add page.
   - **Expected:** The new page appears at the **END** of the page strip (not right after the active page), and the canvas jumps to it.

3. **Doc §2 correction** — no smoke (docs only).

---

## 4. `feat/landing-logged-in-redirect` @ `385ec7d`

**What:** Authenticated visitors to `/` go to their dashboard.

**Preview:** [feat/landing-logged-in-redirect @ 385ec7d](https://tutoring-notes-git-feat-landing-c296af-arangarx-5209s-projects.vercel.app)

**Local gate:** tsc 0 · build 0 · regression 92/92

### Smoke script

1. Logged in as a tutor → visit `/`.
   - **Expected:** Lands on `/admin` (no marketing-page flash).

2. Logged out → visit `/`.
   - **Expected:** Marketing landing unchanged.

3. Logged in as a parent → visit `/`.
   - **Expected:** Lands on `/account/dashboard`. **Best done AFTER the session wrong-identity fix merges** — this page consumes the same `getAccountHolderSessionFromHeaders()` helper that currently has the P0 bug; the redirect itself is fine.

---

## Pending (not yet a branch)

- **Session wrong-identity P0 fix** — awaiting Andrew ratify of [`docs/handoff/session-wrong-identity-fix-design-2026-06-05.md`](docs/handoff/session-wrong-identity-fix-design-2026-06-05.md) (Q1–Q4; reply "ratify defaults" or pick per question). Orchestrator will build + smoke it after ratify. Until then, parent-path smoke on branch 4 and any claim-session flows may show the wrong-account behavior. Production is **NOT** affected (primary cause is preview-only).

---

## Merge / sequencing notes

- All four branches are independent / disjoint files (replay + page-insert both touch the whiteboard area but different files) → merge in **any order** on pass.
- **`SameSite=Lax` is deferred** (was ratified, now on hold): the investigation showed it worsens the wrong-identity bug, so it waits until the session fix lands, then applies as a follow-on.
