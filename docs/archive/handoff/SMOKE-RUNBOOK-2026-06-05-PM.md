# Smoke runbook — 2026-06-05 PM

Consolidated smoke script for the branches awaiting Andrew's smoke as of
`v1-redesign @ 6dbf82b`. Supersedes the (stale) morning runbook. Each branch
merges to `v1-redesign` via `merge --no-ff` on smoke pass.

**Suggested order:** single-browser/desktop ones first (fast), the two-device
one (join-reliability) last.

> Not in this list: `chore/wb-playwright-env-fix` (`f107b35`+`aae0b75`) — that's
> CI/test-infra + a prod-inert auth-path change, no user smoke; it merges on a
> direct greenlight, not a hardware smoke.

---

## 1. Landing-B + login home nav — quickest, desktop

**Preview:** https://tutoring-notes-git-fix-landing-m-e73916-arangarx-5209s-projects.vercel.app
**Branch/commit:** `fix/landing-model-b-and-login-nav @ 4886712`
(folds in the base landing redirect — supersedes the old `feat/landing-logged-in-redirect`)

Steps:
1. **Logged-in tutor:** open `/` → should redirect to dashboard (`/admin` / `/admin/students`).
2. Click the **Mynk wordmark** in the admin header → lands on `/?view=home` (marketing landing), **no redirect loop**.
3. From there click **Features** → `/features` loads while logged in.
4. Navigate back to the workspace (dashboard link / admin nav).
5. **Logged-out, on `/login`:** click the **Mynk wordmark** above the sign-in card → lands on `/` marketing landing.
6. Repeat 5 on `/account/login` (same `AuthShell` wordmark).

**Pass:** wordmark reaches the landing without a redirect loop from every surface; `/features` reachable while authed; login wordmark → landing.

---

## 2. Session wrong-identity (P0) — desktop, two accounts

**Preview:** https://tutoring-notes-git-fix-session-w-0c21aa-arangarx-5209s-projects.vercel.app
**Branch/commit:** `fix/session-wrong-identity @ 9de290a` — **MERGED to `v1-redesign` 2026-06-05.**

> **⚠️ HOST REQUIREMENT (preview only):** tutor AND parent must operate on the **same preview hostname**. On Vercel preview the signup verify-email link uses the per-deployment `VERCEL_URL` host while the tutor's claim link is built from `window.location.origin` (branch-alias host) — different `*.vercel.app` hosts = the parent's `mynk_ah_session` cookie is absent on the claim page → gate instead of interstitial (RC-A). This is a **preview artifact, not a prod bug** (prod has one canonical domain). Andrew's Chrome-tutor / Edge-parent same-device split is fine **as long as both browsers land on the same host** — easiest is to note the host the parent lands on after clicking verify (the `VERCEL_URL` deployment host) and have the tutor mint the claim from that same host. Fix queued: align verify-email link to the request host. `SameSite=Lax` is a SEPARATE later item and does NOT fix this.

Setup: be able to create two parent accounts (A and B) and have a tutor account to mint a claim link.

Steps:
1. Sign up **parent Account A** → click the verify email link.
   - Assert: routed through `/auth/verify-done` → `/account/dashboard`; DevTools → Application → Cookies shows **one** `mynk_ah_session` on the branch-alias domain.
2. Sign up **parent Account B** → click its verify link.
   - Assert: same flow; DevTools now shows **one** `mynk_ah_session` (A's is gone — revoked on verify).
3. As tutor, mint a claim link for any student.
4. **Paste the claim link in the SAME tab** (paste-over).
   - Assert: the identity interstitial shows **B** — never A.
5. **Open a NEW tab**, paste the same claim link.
   - Assert: interstitial shows **B** — never A.
6. Re-click B's already-used verify link.
   - Assert: redirect to `/account/login?notice=link_already_used`, no new session.
7. **Multi-device check (confirms Q2 is verify-only):** log Account D in on Browser 1, then on Browser 2.
   - Assert: Browser 1 stays signed in (logging in elsewhere does **not** sign it out).

**Pass:** interstitial always resolves to the most-recently-verified account; multi-device login doesn't log out other sessions.

---

## 3. Replay-v2 — desktop, needs varied sessions

**Preview:** https://tutoring-notes-git-fix-replay-mu-cd2a15-arangarx-5209s-projects.vercel.app
**Branch/commit:** `fix/replay-multi-segment @ 46de859`

Setup: have a **multi-segment** session (paused/resumed recording), a **single-segment** session, and a **no-mic / events-only** session in admin.

Steps:
1. **S2a — scrubber at t=0:** open a replay; before pressing Play the scrubber dot is flush-left at 0.
2. **S2b — no layout shift:** press Play; the button flips to "Pause" with **no width change**, scrubber track doesn't reflow, dot stays continuous.
3. **S3 — clean end stop:** play a multi-segment session to the end (or scrub near end). At the end: button → "Play", scrubber rests far-right, audio stops — **no jump back to segment 2 / no second playback**.
4. **Seek label:** while playing, drag the scrubber — button label matches actual state (stays "Pause" if it keeps playing; "Play" if it pauses). Explicit Pause → "Play" immediately; Play → "Pause" immediately.
5. **No initial flash:** hard-refresh a replay; before Play it shows the **t=0** state, not a flash of the final scene.
6. **Seamless boundary:** play multi-segment across the segment boundary — "Replay time" label stays continuous (no flicker), canvas doesn't jump.
7. **No-audio real-time:** open the events-only / no-mic session — same Play/Pause + scrubber UI (not a static final frame). Press Play → strokes animate from t=0 in **real time**; pause/resume/seek all work; ends with button "Play", scrubber far-right.
8. **Single-segment unified:** open a one-segment session → shows the **same custom player**, NOT the native `<audio controls>` bar.

**Pass:** all of 1–8. (All are hardware/visual — jsdom can't see them.)

---

## 4. Join-reliability — TWO devices (tutor + student)

**Preview:** https://tutoring-notes-git-fix-join-welc-d96853-arangarx-5209s-projects.vercel.app
**Branch/commit:** `fix/join-welcome-reliability @ d66c603`

Steps:
1. **Tutor** opens a whiteboard session and **draws a few strokes**, then **stops drawing** (sits idle).
2. **Student** joins via a **fresh** link (separate device/browser).
   - Assert: the student sees the tutor's **existing board within ~2 seconds**, WITHOUT the tutor drawing or switching pages.
3. Watch the **tutor's pill** as the student joins.
   - Assert: shows amber **"Student connected — syncing board…"** for ~5s, then green **"Student connected"**.

**Pass:** idle-tutor board appears for the late-joining student without any tutor action; pill is honest (amber→green).

---

## Merge greenlights still open
- `chore/wb-playwright-env-fix` (gate-fix) — ready to merge on a direct greenlight (no hardware smoke needed).
- Branches 1–4 above — merge on their respective smoke pass.
