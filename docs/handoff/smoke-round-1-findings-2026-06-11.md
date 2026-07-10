# Smoke round 1 findings — 8 overnight master-cut branches

**Date:** 2026-06-11  
**Runner:** Andrew  
**Scope:** Smoke round 1 of the 8 overnight master-cut feature branches (against each branch's Vercel Preview).

**Sources:**
- Andrew's inline runbook notes in [`MASTER-CUT-SMOKE-2026-06-11.md`](MASTER-CUT-SMOKE-2026-06-11.md) @ commit [`a176e4f`](https://github.com/Arangarx/tutoring-notes/commit/a176e4f)
- Screenshots captured during the smoke session
- Orchestrator chat context (sequencing, reasoning, disposition)

**Branches under test (none merged to `v1-redesign` at time of smoke):**
1. `feat/component-dry-mechanical`
2. `feat/security-tier-b`
3. `feat/wb-laser-sync`
4. `feat/wb-end-session-review`
5. `feat/wb-replay-a6-slice`
6. `feat/parent-create-learner`
7. `feat/signup-waitlist` (Gate B1)
8. `feat/b2-consent` (Gate B2)

---

## Process / sequencing notes (Andrew's chat)

- Many tests cannot complete until branches merge into `v1-redesign` and `v1-redesign` is **re-merged back into the WB branches** so both tutor and student run the new whiteboard — e.g. laser position (L2/L3), replay positioning (R1 ties), transcription C-5.
- Email flows are untestable on previews (W3) — "set in stone" per Andrew.
- Expect "a lot of juggling of what we finish first, get into `v1-redesign`, then merge into others to make them more smokable."

---

## Gate B1 — `feat/signup-waitlist`

### W1 — [BLOCKER]

| Field | Detail |
|---|---|
| **ID** | W1 |
| **Severity** | [BLOCKER] |
| **Branch(es)** | `feat/signup-waitlist` + 2FA (cross-cutting) |
| **Observed** | New WAITLISTED tutor login → A-2 reaches `/admin/pending-approval`, but A-3 fails: an error page on redirect, then after ~5–10s redirects to `/admin/settings/2fa/setup` with a black-JSON **"Too many requests"** (429). Direct hit to `/admin/pending-approval` shows **ERR_TOO_MANY_REDIRECTS** (screenshot). **Hypothesis:** middleware's WAITLISTED→pending-approval redirect collides with the 2FA-not-enrolled→`/admin/settings/2fa/setup` redirect, producing an infinite loop; the loop hammers the 2FA setup endpoint → 429. Blocked the entire tutor-side waitlist smoke (A-4..A-10 halted; Smoke E not testable). Operator login ALSO hit forced 2FA redirect; had to clear cookies to proceed. |
| **Disposition** | Fix redirect precedence (decide order: 2FA enrollment vs approval gate) so they don't loop; verify `pending-approval` is exempt from the 2FA-forcing redirect (or vice-versa). |

### W2 — [HIGH]

| Field | Detail |
|---|---|
| **ID** | W2 |
| **Severity** | [HIGH] |
| **Branch(es)** | `feat/signup-waitlist` |
| **Observed** | Signup form ghosts on invalid email — `tilly@t.t` → "Enter a valid email" shown, but the submit button sticks on **"Creating..."** permanently, never re-enables, can't try a second email; requires hard refresh. Form submit/pending state not reset on validation failure. |
| **Disposition** | Reset pending state on validation error. |

### W3 — [INFO/ENV]

| Field | Detail |
|---|---|
| **ID** | W3 |
| **Severity** | [INFO/ENV] |
| **Branch(es)** | Preview infra (cross-cutting) |
| **Observed** | Email validation now rejects throwaway addresses (forces real email). Combined with email-confirmation loopback, signing up on a **PREVIEW** lands you on **PRODUCTION** by the time you finish. Net: email-dependent flows (password reset, claim email, notes email) can't be smoked on previews. **"Set in stone" per Andrew.** |
| **Disposition** | Note as a standing preview-testing limitation; consider a preview email sink later. |

### W4 — [MED]

| Field | Detail |
|---|---|
| **ID** | W4 |
| **Severity** | [MED] |
| **Branch(es)** | `feat/signup-waitlist` (routes) |
| **Observed** | A stale `/admin/waitlist` route already exists alongside the new `/admin/tutor-approvals`. |
| **Disposition** | Remove/redirect the old `/admin/waitlist` to avoid duplication. |

### W-PASS — [INFO]

| Field | Detail |
|---|---|
| **ID** | W-PASS |
| **Severity** | [INFO] |
| **Branch(es)** | `feat/signup-waitlist` |
| **Observed** | Smoke B (operator approves: list, nav link, Approve, row disappears, log), Smoke C (tutor after approval can navigate + start session/Blob seed), Smoke D (grandfathered test-tutor + admin log in normally; `approvalStatus` APPROVED) all **PASSED** once past the login loop. Andrew used his own test tutor, not Sarah's actual account. |
| **Disposition** | No action — record as pass once W1/TFA1 fixed. |

---

## 2FA (cross-cutting, surfaced during B1 smoke)

### TFA1 — [BLOCKER]

| Field | Detail |
|---|---|
| **ID** | TFA1 |
| **Severity** | [BLOCKER] |
| **Branch(es)** | Cross-cutting |
| **Observed** | `/admin/settings/2fa/setup` returns 429 **"Too many requests"** repeatedly; console shows multiple 429s on setup + verify. In a fresh incognito window 2FA worked first try (went straight to 2FA, finished with just the code) — so it's state/cookie/loop-driven (W1 loop hammering the endpoint), and/or the rate limit is too aggressive for legit setup. |
| **Disposition** | Fix together with W1; re-check 2FA setup rate-limit threshold. |

### TFA2 — [DESIGN]

| Field | Detail |
|---|---|
| **ID** | TFA2 |
| **Severity** | [DESIGN] (redesign) |
| **Branch(es)** | Cross-cutting |
| **Observed** | 2FA setup page is unstyled vs v1 — "offcenter tile, backup codes block nearly unreadable." Part of the broader **"v1 design not yet applied everywhere"** theme (see X2). |
| **Disposition** | Fold into v1-design-application workstream. |

---

## Gate B2 — `feat/b2-consent`

### C1 — [BLOCKER]

| Field | Detail |
|---|---|
| **ID** | C1 |
| **Severity** | [BLOCKER] |
| **Branch(es)** | `feat/b2-consent` (only bites when `CONSENT_ENFORCEMENT=true`) |
| **Observed** | Consent denial surfaces to the tutor as a generic 500 **"Could not start the session — the server hit an unexpected error. Error ID: 3879705692"** instead of the intended actionable **"Parental consent for live sessions has not been granted. Please update consent preferences."** The real `ConsentError` IS in Vercel logs (`[createWhiteboardSession] REJECTED allowLiveSession=false (B2); Error [ConsentError]: Parental consent for live sessions has not been granted, digest 3879705692`) but the message does NOT reach the UI. Same shape for the audio gate (2b): "random 500 in console." This is the actual tutor experience once the flag flips. |
| **Disposition** | Catch `ConsentError` at the action/UI boundary and surface the friendly, actionable message (not a 500); applies to `createWhiteboardSession` + audio-segment + notes/email gates. |

### C2 — [BLOCKER for flag-usability]

| Field | Detail |
|---|---|
| **ID** | C2 |
| **Severity** | [BLOCKER for flag-usability] |
| **Branch(es)** | `feat/b2-consent` — this is the **DEFERRED Step 6** |
| **Observed** | No parent UI to view/change consent/privacy preferences after the fact (none on the parent dashboard / child page). Andrew had to bypass via direct DB update to continue. Blocks 2c testing and is required before the flag can be flipped. |
| **Disposition** | Build parent per-tutor consent management page + update route (the deferred Step 6). |

### C3 — [DESIGN]

| Field | Detail |
|---|---|
| **ID** | C3 |
| **Severity** | [DESIGN] |
| **Branch(es)** | `feat/b2-consent` (claim flow ordering + framing) |
| **Observed** | **(a)** Login setup should be **ABOVE** privacy preferences on the claim page. **(b)** "Allow live sessions" should be framed as a **BASE CONTRACT** to use the tutor's services, not a peer toggle — if declined, what happens? Likely "can't use the service." **(c)** Tie to Sarah's point: **STRONGLY encourage audio + whiteboard recording ON**; if declined, warn explicitly what it means (only final-notes-level access). |
| **Disposition** | Redesign claim Panel A ordering + framing; decide `allowLiveSession`-as-prerequisite semantics. |

### C4 — [DESIGN]

| Field | Detail |
|---|---|
| **ID** | C4 |
| **Severity** | [DESIGN] |
| **Branch(es)** | `feat/b2-consent` (recording retention when consent denied — refines D-1) |
| **Observed** | Andrew's evolving position: for **AUDIO** maybe keep recording the TUTOR, just not the student; for **WHITEBOARD**, if recording not allowed we likely **CANNOT keep the data at all** (e.g. tutor uploads a PDF with child info → storing it violates privacy). **Conclusion FOR NOW:** if whiteboard recording not allowed, we can't retain it — they're "SOL for recording usefulness." Future: get tricky — record tutor strokes only, or require tutor to flag protected child info on uploads. Reinforces C3's "strongly encourage both on + warn." |
| **Disposition** | Capture as the governing principle for consent×retention; no build now beyond C1/C2. |

### C5 — [DESIGN]

| Field | Detail |
|---|---|
| **ID** | C5 |
| **Severity** | [DESIGN] |
| **Branch(es)** | `feat/b2-consent` (billable minutes — also see N1) |
| **Observed** | For live-recording-derived notes, all 3 notes screens show start/end times; Andrew wants to consider showing **BILLABLE MINUTES** instead (as planned for WB sessions), since tutors bill from this. |
| **Disposition** | Design decision; align notes + WB session billing display. |

### C-D2 — [INFO]

| Field | Detail |
|---|---|
| **ID** | C-D2 |
| **Severity** | [INFO] (confirm) |
| **Branch(es)** | `feat/b2-consent` |
| **Observed** | D-2 confirmed — a student can make consent **MORE restrictive** but never **LESS** than the parent's ceiling. D-5 confirmed fine — if no consent record, allow with the same encouragement/warnings; saving with no consent should be permitted (with warnings). |
| **Disposition** | No action — design decisions confirmed. |

### C-LOG — [MED]

| Field | Detail |
|---|---|
| **ID** | C-LOG |
| **Severity** | [MED] |
| **Branch(es)** | `feat/b2-consent` |
| **Observed** | Andrew could NOT find `[cns]` log entries in Vercel logs OR browser console during flag-OFF smoke. Either not emitted on the paths he hit, or a logging gap. |
| **Disposition** | Verify `[cns]` emission on snapshot-create / consent-check paths. |

### C-PASS — [INFO]

| Field | Detail |
|---|---|
| **ID** | C-PASS |
| **Severity** | [INFO] |
| **Branch(es)** | `feat/b2-consent` |
| **Observed** | Flag-OFF Smoke 1 largely passed (session create/end/notes normal; Panel A visible with 4 OFF-default toggles; toggle+save persists `ConsentRecord`; no blocking errors). Couldn't test send-email (preview email loopback). Flag-ON 2a/2b: blocking happened but via the 500 (C1); 2c untestable (email); 2d self-learner auto-pass **PASSED**. |
| **Disposition** | No action — record as partial pass; C1/C2 block flag flip. |

---

## `feat/parent-create-learner`

### P1 — [BLOCKER]

| Field | Detail |
|---|---|
| **ID** | P1 |
| **Severity** | [BLOCKER] |
| **Branch(es)** | `feat/parent-create-learner` (children's credentials) |
| **Observed** | Weak PIN `123456` was **ACCEPTED** (should be rejected "too easy to guess"). Andrew expected the weak-PIN progression to already be in `v1-redesign` — possible regression. He also asks: add interactive weak/strong feedback up front (like passwords) + a visible requirement that weak PINs are disallowed. |
| **Disposition** | Restore weak-PIN rejection on this path; consider live strength feedback. |

### P2 — [BLOCKER]

| Field | Detail |
|---|---|
| **ID** | P2 |
| **Severity** | [BLOCKER] |
| **Branch(es)** | `feat/parent-create-learner` |
| **Observed** | Invalid username `no spaces` (contains a space) was **ACCEPTED** (should error "Username must be 3–20 characters…"). The learner-detail screenshot shows a learner literally named "no spaces". |
| **Disposition** | Enforce username validation on the parent-create path. |

### P-PASS — [INFO]

| Field | Detail |
|---|---|
| **ID** | P-PASS |
| **Severity** | [INFO] |
| **Branch(es)** | `feat/parent-create-learner` |
| **Observed** | §6 steps 1–7 **PASSED** (dashboard empty-state + with-learner, create by name, detail page, PIN setup, child login at `/students/login`, notes empty-state copy for tutorless learner, cross-parent ownership 404). Notes page currently requires manual nav (no link yet) — known/expected. |
| **Disposition** | No action — record as pass aside from P1/P2. |

---

## `feat/security-tier-b`

### S1 — [HIGH]

| Field | Detail |
|---|---|
| **ID** | S1 |
| **Severity** | [HIGH] |
| **Branch(es)** | `feat/security-tier-b` (security) |
| **Observed** | Forgot-password stale-token cleanup did **NOT** work — Andrew requested a reset and clicked 3 successive links; **ALL 3** reached the choose-new-password page (expected: only the latest valid, priors invalidated). Additionally: password-reset emails **ARE** sending (surprising vs other flows that don't), and the "From" appears to be Andrew's own address ("is it 'from' me??"). |
| **Disposition** | **(a)** Verify/fix prior-token invalidation actually deletes/expires older `PASSWORD_RESET` tokens; **(b)** check the email From/sender identity config. |

### S2 — [INFO/expected]

| Field | Detail |
|---|---|
| **ID** | S2 |
| **Severity** | [INFO/expected] |
| **Branch(es)** | `feat/security-tier-b` |
| **Observed** | Browser GET of `/api/upload/audio` and `/api/upload/blob` returns 405 (screenshots). This is **EXPECTED** — they're POST-only; a GET = 405 Method Not Allowed. The "upload error sanitization" test targets the response BODY of a **REJECTED (auth-failed) upload**, which can't be triggered by a plain browser GET. |
| **Disposition** | Not a bug; clarify the test method (needs a crafted POST), or mark that step SKIP-on-browser. |

### S3 — [LOW]

| Field | Detail |
|---|---|
| **ID** | S3 |
| **Severity** | [LOW] |
| **Branch(es)** | `feat/security-tier-b` |
| **Observed** | Vercel function logs show `DEP0169 DeprecationWarning: 'url.parse()' is not standardized... use the WHATWG URL API`. |
| **Disposition** | Grep our code for `url.parse(`; if ours, migrate to `new URL()`; if a dep, note and ignore. |

### S-DEC — [DECISION→recommend]

| Field | Detail |
|---|---|
| **ID** | S-DEC |
| **Severity** | [DECISION→recommend] |
| **Branch(es)** | `feat/security-tier-b` |
| **Observed** | **SHOULD-FIX-2** (chunk-transcribe F&F bearer): Andrew defers to our recommendation ("whatever is clean and secure"). |
| **Disposition** | Record the OPEN decision; the orchestrator will recommend an option (A vs B) back in chat. **Do NOT implement here.** |

---

## `feat/wb-end-session-review`

### E1 — [BLOCKER]

| Field | Detail |
|---|---|
| **ID** | E1 |
| **Severity** | [BLOCKER] |
| **Branch(es)** | `feat/wb-end-session-review` |
| **Observed** | The branch's core feature **FAILED** in real preview — after End session it went **BACK TO THE OLD REPLAY SCREEN** instead of flipping the shell in-place to review mode (URL should stay on `/workspace`, live canvas → review surface "Session complete — [Student]"). Andrew confirmed he WAS on the correct branch preview (`…feat-wb-end-s-e8ec41…`). He stopped §4 here ("didn't go to the right place anyway"); B–G untested. **Hypothesis:** shell didn't flip / fell back to legacy router nav (`onSessionEnded` not wired, or merge-base/old-WB interaction). |
| **Disposition** | Investigate on the actual preview why the in-shell flip didn't fire; this is the reason the branch exists. |

---

## `feat/wb-laser-sync`

### L1 — [HIGH]

| Field | Detail |
|---|---|
| **ID** | L1 |
| **Severity** | [HIGH] |
| **Branch(es)** | `feat/wb-laser-sync` |
| **Observed** | Laser color mismatch — tutor sees bright **RED**, student sees an **orangish** color; expected coral `#e27d60` on both. Tutor's own pointer render ≠ the broadcast color the student sees. |
| **Disposition** | Make tutor + student laser color consistent (coral) or intentional-by-design. |

### L2 — [HIGH, confounded]

| Field | Detail |
|---|---|
| **ID** | L2 |
| **Severity** | [HIGH, confounded] |
| **Branch(es)** | `feat/wb-laser-sync` |
| **Observed** | Laser **POSITION** mismatch — "the position I draw is NOT where it shows up on her phone." Confounded by L3 (old-mobile vs new-WB centering). |
| **Disposition** | Re-verify after both sides are on the new WB interface. |

### L3 — [HIGH/cross-cutting]

| Field | Detail |
|---|---|
| **ID** | L3 |
| **Severity** | [HIGH/cross-cutting] |
| **Branch(es)** | Interface skew (cross-cutting) |
| **Observed** | Centering differs between the **NEW** whiteboard (desktop) and the **OLD** mobile WB interface — "my center on new whiteboard doesn't equal center on phone whiteboard with old interface." This confounds laser position AND replay position verification. |
| **Disposition** | Must re-smoke laser + replay positioning once BOTH tutor & student are on the new WB (ties to v1-design-application + re-merge sequencing). |

### L4 — [HIGH]

| Field | Detail |
|---|---|
| **ID** | L4 |
| **Severity** | [HIGH] |
| **Branch(es)** | Live video (seen on laser branch) |
| **Observed** | Student video does not come through even when allowed — the tile doesn't even appear with a black background; only her audio arrives. (See X1 video.) |
| **Disposition** | Investigate live video display path. |

### L5 — [MED]

| Field | Detail |
|---|---|
| **ID** | L5 |
| **Severity** | [MED] |
| **Branch(es)** | `feat/wb-laser-sync` |
| **Observed** | Student cannot be on a different page/board even with "sync with tutor zoom and pan" — cross-page isolation (Test 2b) not verifiable; student appears forced to follow tutor. |
| **Disposition** | Confirm whether per-student page independence is intended/implemented. |

### L6 — [LOW]

| Field | Detail |
|---|---|
| **ID** | L6 |
| **Severity** | [LOW] (design) |
| **Branch(es)** | `feat/wb-laser-sync` |
| **Observed** | "Connected" status pill not yet in the new design. Strokes persist correctly. |
| **Disposition** | Fold into v1-design-application workstream. |

---

## `feat/wb-replay-a6-slice` + replay (general)

### R1 — [HIGH]

| Field | Detail |
|---|---|
| **ID** | R1 |
| **Severity** | [HIGH] |
| **Branch(es)** | Replay general (beyond this branch) |
| **Observed** | Replay is broadly broken. The branch's graph-render fix **WORKS** (graphs visible in admin + share replay), BUT: audio is **NOT synced at all**, and audio keeps playing even after the scrubber reaches the end. |
| **Disposition** | This is the known A6-1 replay regression; needs a dedicated fix pass (not this branch). |

### R2 — [HIGH]

| Field | Detail |
|---|---|
| **ID** | R2 |
| **Severity** | [HIGH] |
| **Branch(es)** | Replay general |
| **Observed** | Dropping the scrubber restarts audio — scrubber stays where dropped but audio starts over from that point rather than seeking. |
| **Disposition** | Fix scrub→seek behavior in the custom player (A6-1). |

### R-PASS — [INFO]

| Field | Detail |
|---|---|
| **ID** | R-PASS |
| **Severity** | [INFO] |
| **Branch(es)** | `feat/wb-replay-a6-slice` |
| **Observed** | Graph-in-replay (the branch's actual scope) **PASSED** on both admin + share routes. |
| **Disposition** | No action — branch scope verified; R1/R2 are out-of-scope regressions. |

---

## Cross-cutting / look-and-feel / v1 design

### X1 — [HIGH]

| Field | Detail |
|---|---|
| **ID** | X1 |
| **Severity** | [HIGH] |
| **Branch(es)** | Video capture/display (cross-cutting) |
| **Observed** | Live video does not start on by default (known/deferred) AND won't turn on at all when toggled (new); student video doesn't come through on the laser branch (L4). Live video is effectively non-functional. |
| **Disposition** | Dedicated investigation; was treated as post-V1 but live display is broken now. |

### X2 — [DESIGN/META]

| Field | Detail |
|---|---|
| **ID** | X2 |
| **Severity** | [DESIGN/META] — Andrew's central point |
| **Branch(es)** | Cross-cutting |
| **Observed** | The full-site component audit was **PREMATURE** — the final v1 design has **NOT** been applied to many pages yet (whiteboard session start panel, 2FA setup, pending-approval, signup, the "Connected" pill, AV pip, etc.). The **ORIGINAL requirement was NO DUPLICATION** — every component built once and composed up front so "fix once fixes everywhere." The DRY work and the v1-design-application are intertwined and should proceed **together** (build shared components, compose, apply everywhere). |
| **Disposition** | Stand up a **"v1-design-application via shared components"** workstream as a first-class thread; treat `component-dry-mechanical` as its safe mechanical base. |

### X3 — [LOW]

| Field | Detail |
|---|---|
| **ID** | X3 |
| **Severity** | [LOW] |
| **Branch(es)** | AV pip (cross-cutting) |
| **Observed** | On/off for audio/video on the AV pip is less clear than the top-bar distinction. |
| **Disposition** | UX polish. |

### X4 — [MED]

| Field | Detail |
|---|---|
| **ID** | X4 |
| **Severity** | [MED] |
| **Branch(es)** | Audio capture (cross-cutting) |
| **Observed** | Testing across the house produced feedback (speaker→mic loopback; expected echo cancellation not happening). Also audio "didn't start when sound started — started some ways in" (maybe ignored feedback noise; maybe a capture-start delay). |
| **Disposition** | Check echo cancellation + capture-start timing. |

### X5 — [LOW]

| Field | Detail |
|---|---|
| **ID** | X5 |
| **Severity** | [LOW] |
| **Branch(es)** | Student list (cross-cutting) |
| **Observed** | The student-initials "versioning" in the student list (e.g. "Child1 Kalearn"/"Child1 McFamily") reads like a visual glitch rather than intentional. |
| **Disposition** | UX polish. |

### X6 — [INFO]

| Field | Detail |
|---|---|
| **ID** | X6 |
| **Severity** | [INFO] |
| **Branch(es)** | Notes lifecycle (cross-cutting) |
| **Observed** | Notes from LIVE recordings arrive as DRAFT and must be marked READY before a parent can see them; the "extra info" (start/end times) only shows for live-recording-derived notes, not WB-session notes. Informs C5 (billable minutes). |
| **Disposition** | No action — understanding capture; informs C5 design. |

### X7 — [LOW]

| Field | Detail |
|---|---|
| **ID** | X7 |
| **Severity** | [LOW] |
| **Branch(es)** | Buttons (cross-cutting) |
| **Observed** | The "Continue" button uses white text while other coral buttons use dark text — minor inconsistency on the WB session panel (page hasn't had its mock applied yet). |
| **Disposition** | Fold into v1-design-application workstream. |

---

## Severity summary

| Tag | Count | IDs |
|---|---|---|
| [BLOCKER] | 8 | W1, TFA1, C1, C2, P1, P2, E1 |
| [HIGH] | 9 | W2, S1, L1, L2, L3, L4, R1, R2, X1 |
| [MED] | 4 | W4, C-LOG, L5, X4 |
| [LOW/polish] | 5 | S3, L6, X3, X5, X7 |
| [DESIGN] | 5 | TFA2, C3, C4, C5, X2 |
| [INFO] | 9 | W3, W-PASS, C-D2, C-PASS, P-PASS, S2, S-DEC, R-PASS, X6 |
| **Total findings** | **40** | |
