# Morning smoke runbook — 2026-06-06

**Date:** 2026-06-06  
**Branch context:** You are on `v1-redesign`. Two feature branches are **built + parked at Vercel previews** awaiting hardware smoke; the recording re-architecture design is **ratify-ready** (gates the next big build). This doc is your **single morning driver**: smoke the previews, then answer the decisions — no hunting across chats.

**Full orchestrator context:** [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) (⏩ HEAD block)  
**Recording re-architecture design:** [`recording-rearchitecture-design-2026-06-05.md`](recording-rearchitecture-design-2026-06-05.md)

---

## Test methodology (read once)

**Tutor side in Chrome, parent/student side in Edge, SAME device** — the two browsers keep separate sessions on purpose. Full device swap only for whiteboard 2-device tests.

---

## SECTION 1 — SMOKE SCRIPT

On pass per branch → reply pass/fail; orchestrator merges `--no-ff` to `v1-redesign`.

**Vercel dashboard** (grab exact preview URL if alias is truncated): [Vercel project — tutoring-notes](https://vercel.com/arangarx-5209s-projects/tutoring-notes)

---

### 1A. Admin dev-tools dashboard — `feat/admin-dev-dashboard @ 82a8122`

**Predicted alias:** `tutoring-notes-git-feat-admin-dev-dashboard-arangarx-5209s-projects.vercel.app`  
**Preview:** [feat/admin-dev-dashboard @ 82a8122](https://tutoring-notes-git-feat-admin-dev-dashboard-arangarx-5209s-projects.vercel.app)  
*(Confirm via dashboard if truncated.)*

| # | Step | Expected result | Pass / Fail |
|---|------|-----------------|-------------|
| 1 | Sign in as **admin** (`arangarx@gmail.com` — the operator/ADMIN account; NOT `arangarx@hotmail.com`, which is a tutor) → look for **Dev tools** in admin nav → click it | **Dev tools** link visible; page loads | |
| 2 | Click **Create tutor fixture** | Email + known password + **Impersonate** button shown | |
| 3 | Click **Impersonate** | Land in `/admin/students` as fixture tutor → click **Exit impersonation** → return to admin dashboard | |
| 4 | Click **Create family** for that fixture tutor | Parent email/password + child PIN + claim link, all with copy buttons → copy claim link → open in new tab → walk claim flow | |
| 5 | Click **Clear all fixtures** → confirm dialog | Fixtures table empties | |
| 6 | **(Sanity)** On **PRODUCTION** deploy, visit `/admin/dev-tools` | **404** (env-gated, inert in prod) | |

---

### 1B. Verify-email host-alignment — `fix/verify-email-host-align @ 56c0c99`

**Predicted alias:** `tutoring-notes-git-fix-verify-email-host-al-arangarx-5209s-projects.vercel.app`  
**Preview:** [fix/verify-email-host-align @ 56c0c99](https://tutoring-notes-git-fix-verify-email-host-al-arangarx-5209s-projects.vercel.app)  
*(Confirm via dashboard if truncated.)*

**RC-A fix:** verify-email link host must match the preview host you browse — claim flow should finally smoke on preview.

| # | Step | Expected result | Pass / Fail |
|---|------|-----------------|-------------|
| 1 | **Edge:** open preview URL → sign up as **Parent A** (new email) → receive verify email → **verify link host matches preview host** → click | `/auth/verify-done` → redirect to `/account/dashboard` | |
| 2 | **Edge:** sign up as **Parent B** (different new email) → verify | Dashboard as Parent B | |
| 3 | **Chrome** (tutor): open a student → mint claim invite link → copy | Claim link copied | |
| 4 | **Edge:** paste claim link | Interstitial shows **Parent B's identity** (signed-in chooser), **NOT** unauthenticated create/sign-in gate — **RC-A pass criterion** | |
| 5 | DevTools → Application → Cookies | Single `mynk_ah_session` on branch-alias domain for Parent B | |
| 6 | **(Injection-guard)** Vercel function logs for this preview during normal signup | **NO** `[ahx] getRequestBaseUrlSafe: host not allowlisted` warn lines. If one appears, note exact host (preview alias may need allowlist tuning) | |

---

### 1C. Replay v3 — OPTIONAL sanity (already merged on-trust to `v1-redesign`)

**Low priority.** Use the **`v1-redesign`** preview from [Vercel dashboard](https://vercel.com/arangarx-5209s-projects/tutoring-notes).

Re-record a whiteboard session with a pause, then review:

| # | Check | Expected result | Pass / Fail |
|---|-------|-----------------|-------------|
| S3 | First playback reaches end of timeline | Does **NOT** auto-replay segment 2 | |
| S4 | Seek / play button label | Label matches actual play state | |
| S5 | Segment boundary crossing | Smooth transition | |
| S6 | Scrubbing | No buzzing | |

**Ignore S1** (scrubber dot ~1–2% in at rest) — known cosmetic, deferred to B4.

---

## SECTION 2 — DECISIONS TO ANSWER

---

### 2A. RATIFY: recording re-architecture (GATING — authorizes Phase 1 build)

Open and read [`recording-rearchitecture-design-2026-06-05.md`](recording-rearchitecture-design-2026-06-05.md).

> **Accepting all defaults authorizes the Phase-1 build dispatch (consolidation + canonical blob, capture untouched). Phase 1 is the contained, independently-shippable slice.**

Reply **"ratify defaults"** to accept all, or fill per question below.

| # | Question | Options | Recommended default |
|---|----------|---------|-------------------|
| **Q1** | Pause model: collapse (gapless, recording-time clock) vs preserve wall-clock gap | Collapse / preserve gap | **Collapse** (D4) |

**Andrew:** [ ] accept &nbsp; [ ] override → _______________

| **Q2** | Treat involuntary disconnect same as pause (collapse)? | Yes / no | **Yes** (H1 observation) |

**Andrew:** [ ] accept &nbsp; [ ] override → _______________

| **Q3** | Consolidation timing: async-post-end vs inline-for-short | Async always / inline if ≤N segments | **Async always** (Vercel 300s) |

**Andrew:** [ ] accept &nbsp; [ ] override → _______________

| **Q4** | Keep `SessionRecording` segment rows post-consolidation? | Keep (audit + fallback) / GC immediately | **Keep; GC later** |

**Andrew:** [ ] accept &nbsp; [ ] override → _______________

| **Q5** | Keep 50-min rollover as internal mechanism? | Yes / remove | **Yes; revisit later** |

**Andrew:** [ ] accept &nbsp; [ ] override → _______________

| **Q6** | Backfill consolidation for existing multi-segment sessions? | New-only + stitch fallback / backfill all | **New-only + stitch fallback for old** |

**Andrew:** [ ] accept &nbsp; [ ] override → _______________

| **Q7** | Consolidation job log prefix | — | **`cns`** |

**Andrew:** [ ] accept &nbsp; [ ] override → _______________

| **Q8** | Ship Phase 1 (consolidation + canonical, capture untouched) before Phase 2 (pause semantics)? | Yes / parallel | **Yes — Phase 1 is the contained win** |

**Andrew:** [ ] accept &nbsp; [ ] override → _______________

| **Q9** | Gate Phase 2 on iOS hardware smoke of continuous pause/resume? | Yes / no | **Yes** |

**Andrew:** [ ] accept &nbsp; [ ] override → _______________

| **Q10** | Canonical audio storage location / format | — | **Vercel Blob, `sessions/{studentId}/{wbsid}/canonical.webm`** |

**Andrew:** [ ] accept &nbsp; [ ] override → _______________

---

### 2B. DECIDE: pivot ordering — which surface first?

**Context:** The "true redesign" = B3–B6. B3 (session log) + B4 (replay chrome + unified `SessionAudioPlayer`) are foundation-independent and startable now. B5 (workspace) is gated on Phase 3 consent + the recording re-architecture.

**After you ratify the re-architecture, what's first?**

- [ ] **(i)** Dispatch recording re-architecture Phase 1
- [ ] **(ii)** Start B3 session-log redesign
- [ ] **(iii)** Start B4 replay-chrome + unified player
- [ ] **(iv)** More dashboard / velocity tooling

**Andrew notes:** _______________

---

### 2C. SECONDARY (lower stakes — from prior smokes + open confirms)

| # | Item | Andrew |
|---|------|--------|
| 1 | **Landing-redirect model** — Netflix-style hard redirect to dashboard vs reachable landing with dashboard link? (Model B was decided 2026-06-05: fast `/` redirect + explicit nav to marketing; confirm still right?) | [ ] A hard-only &nbsp; [ ] B fast redirect + reachable landing &nbsp; Notes: ___ |
| 2 | **"Remember this device" login** — priority / when? | _______________ |
| 3 | **require-student-login-for-session** — confirm it lands before v1? | [ ] yes before v1 &nbsp; [ ] defer &nbsp; Notes: ___ |
| 4 | **SameSite `Strict` → `Lax`** — deferred until wrong-identity fix lands; still defer? | [ ] defer &nbsp; [ ] revisit now |
| 5 | **IAC-13 tutor-disconnect** — Q1–Q8 ratified 2026-06-04; build slots into identity Phase 2/3 when? | _______________ |
| 6 | **Architecture / dedup inventory** fronting the pivot (auth-form 8→1, `SessionAudioPlayer` 5→1, RC-A two base-URL sources) — dispatch before B3/B4? | [ ] yes &nbsp; [ ] no &nbsp; Notes: ___ |
| 7 | **Replay optional sanity (1C)** — worth doing today or skip? | [ ] do &nbsp; [ ] skip |

---

## After you're done

Reply in orchestrator chat with:

1. **Smoke:** pass/fail per branch (1A, 1B, 1C if run)
2. **Ratify:** "ratify defaults" or per-question overrides (2A)
3. **Pivot pick** (2B) + any secondary notes (2C)

On smoke pass → `merge --no-ff` to `v1-redesign` per branch.
