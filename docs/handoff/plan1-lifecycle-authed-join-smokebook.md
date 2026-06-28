# Plan #1 — Session lifecycle + authenticated join + waiting-room overlay — smoke runbook

**Feature:** Plan #1 — Session lifecycle + authenticated join + waiting-room overlay  
**Branch:** `wb-wave5-polish`  
**Tip commit:** `[29af802](https://github.com/Arangarx/tutoring-notes/commit/29af802b3b22aa4c52ff55af280751e65c200238)`  
**Preview:** [Plan #1 preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app)

Smoke when Plan #1 is **DONE** — Playwright gates green on `wb-session-lifecycle.spec.ts`. This runbook is **new UX + hardware/human judgment only**; do not re-prove behaviors already hermeticized in relay tests unless a `[human-only: …]` reason applies. See `[.cursor/rules/smoke-when-done.mdc](../../.cursor/rules/smoke-when-done.mdc)`.

---

## Operational prerequisite (prod / pilot)

**Sarah's pilot family and learner must be CLAIMED and credentialed** (learner login exists and is linked to the student row) before this flow works in production. Anonymous `/w/[joinToken]` join is **fully retired** — every student enters via authenticated `/join/[sessionId]#k=…`. If the learner is not claimed, stop and complete family onboarding first; this smokebook does not apply until then.

---

## Hardware environments


| Setup                                                      | Use for                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tutor desktop + student phone** (second physical device) | Items 1–3, 5 — real login on mobile, A/V feel, takeover timing                                                                                                      |
| **Tutor desktop + student desktop** (second physical PC)   | Items 1–3, 5 — desktop learner login, device pickers                                                                                                                |
| **Same machine, two browsers**                             | **Invalid for items 2–3 and 5** — mark **N/A with notes** `same-machine A/V invalid`; item 1 login/key check is still weak on one machine (prefer two real devices) |


Use the **Preview** URL above for all items unless noted.

---

## Automated coverage (do not re-prove unless human-only reason)

Playwright: `[tests/integration/wb-session-lifecycle.spec.ts](../../tests/integration/wb-session-lifecycle.spec.ts)` (`@wb-presence`, `@wb-sync`, `@wb-chrome`, `@wb-av`).


| Area                               | Covered tests (hermetic relay)                                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Auth BLOCKERs**                  | `learner A cannot access learner B's session → 404`; `unauthenticated hit to /join/[sessionId] redirects to learner login`; `learner with no SessionParticipant row → 404`; `tutor (NextAuth) session at /join/[sessionId] redirects to learner login` |
| **Fragment preservation**          | `stale learner cookie + /join/[sessionId]#k=KEY → JoinAuthGate saves key…`; `no-cookie path: middleware redirects server-side, returnTo includes /join/ path`                                                                                          |
| **Phase-gated capture + timer**    | `recording does NOT start and billing timer does NOT accrue while PENDING`; `recording starts and timer accrues after tutor Start (PENDING → ACTIVE)`                                                                                                  |
| **Waiting overlay + Start gating** | `overlay visible for tutor while PENDING; Start disabled until student connects in LIVE mode`; `overlay visible for student while PENDING; dismisses when tutor clicks Start`; `IN_PERSON mode — Start is always enabled (no student required)`        |
| **Dual-device takeover**           | `second student device with same learner joins → older device shows takeover message`                                                                                                                                                                  |
| `**/w` retirement redirect**       | `/w/[token]#k=KEY redirects to /join/[sessionId]#k=KEY (client bridge)`; `/w/[token]#k=KEY → after learner auth, lands on /join/[sessionId] board`                                                                                                     |


**Known Playwright gap (not a smoke failure by itself):** the no-cookie middleware redirect path does not preserve `#k=` in the fragment (`[wb-session-lifecycle.spec.ts](../../tests/integration/wb-session-lifecycle.spec.ts)` architecture note + `docs/BACKLOG.md`). Item 1's human check focuses on the **real cross-device login** path where the student opens a tutor-copied link with `#k=` and ends up on a working board after login.

---

### 1. Authenticated join happy path (real login + real devices)

**Action:** On the **Preview** URL, sign in as the **pilot tutor**. Open Sarah's (or another **claimed**) student and **create a new whiteboard session** (or Start session from the student row). Confirm the tutor lands in the **waiting-room overlay** (`data-testid="wb-waiting-overlay"`), not straight into a live board with capture already running. Use **Copy student link** (or copy from the share UI) — the link must be `/join/<sessionId>#k=<encryption-key>`, not `/w/…`. On a **real second device** (phone or second PC), paste that link in a fresh browser profile (logged out of the learner). Complete **learner login** (`/students/login`) when prompted. After login, confirm you land on `/join/<sessionId>` with the waiting-room overlay visible and the board behind it loading (key survived — strokes/assets decrypt once live). Note subjective feel: login steps clear, no auth loop, link copy obvious to a tutor sharing with a parent/student.

**Expect:** Student reaches the **same session** in **PENDING** waiting room after real login; `#k=` encryption key preserved so the board is usable (not blank/garbled). Tutor still sees waiting room with student presence progressing toward connect. No 404, no anonymous `/w` path.

**Ignore this run:** Auth BLOCKER negatives (wrong learner 404, tutor-at-`/join` redirect, no-participant 404) — covered by Playwright. Unclaimed student / missing learner credential (prerequisite failure, not Plan #1 bug).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage (agent context — your notes go below):**  
`[automated: wb-session-lifecycle.spec.ts › Fragment preservation — #k= survives stale-session /join/ hit]` — JoinAuthGate + sessionStorage path.  
`[automated: wb-session-lifecycle.spec.ts › Auth BLOCKERs — /join/ participant gate]` — participant gate + login redirect.  
`[human-only: real second device + real learner login UX + confirm board key survived after login]`

**Notes: **  
This smoke run is desktop to desktop.  
Visual change: Need less space between options in top bar "more" menu.  Make it spaced more like left bar "more" menu.

---

### 2. Waiting-room mutual A/V before Start (hardware)

**Action:** With tutor on **desktop** and student on a **second physical device**, both in the **PENDING** waiting-room overlay (student joined per item 1 but **do not click Start yet**). Grant camera/mic permissions on both sides if prompted. Confirm **both sides see and hear each other** in the waiting-room video tiles (real WebRTC, not muted placeholders). On **each side**, toggle **mic off/on** and **camera off/on**; open the **device picker** and switch mic and camera if multiple devices exist. Read waiting-room copy (headings, status, encouragement) — note whether it feels calm and clear for a tutor waiting with a student before class starts.

**Expect:** Bidirectional **real** audio and video in PENDING before Start. Per-side toggles and device selection work without breaking the peer connection. Copy is understandable and not alarming. A/V state persists across toggles (no need to refresh).

**Ignore this run:** Phase-gated recording pill / billing timer not running yet in PENDING — correct behavior; `[automated: wb-session-lifecycle.spec.ts › Phase-gated capture + timer]`. Overlay visibility alone on tutor/student — `[automated: wb-session-lifecycle.spec.ts › Waiting-room overlay + Start gating]`.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage (agent context — your notes go below):**  
`[human-only: real cameras/mics, subjective A/V quality, device-picker feel on real hardware]`  
Optional cross-ref prior A/V smoke: `[wb-wave5-polish-part1-checkpoint-smokebook.md](wb-wave5-polish-part1-checkpoint-smokebook.md)` — distinct surface (waiting-room overlay vs in-session chrome).

**Notes:**  
**On tutor side when video is shut off, student just sees black, not initials.**  
Same with student, when video off they see initials, but tutor just sees black.  
Probably need volume boost controls here (at some point maybe individual volume controls for each other stream than your own, just backlog this)  


---

### 3. Tutor Start gating + dismiss (live mode, hardware)

**Action:** Continue from item 2 in **LIVE** mode (default; confirm `data-session-mode` is LIVE if visible). With only the tutor in the room, note whether **Start** is disabled. After the student connects on the real second device, wait until WebRTC is actually up (you can hear/see them). Confirm **Start becomes enabled**. Tutor clicks **Start**. Watch **both devices**: overlay should dismiss on tutor and student; session transitions to live board chrome. Confirm **capture arms** (recording pill / live indicator per product copy) and **billing/session timer** begins **only after** Start — not while waiting in PENDING.

**Expect:** Start **disabled** until remote student is truly connected in LIVE mode; **enabled** once reachable; one Start click dismisses overlay on **both** sides within a reasonable delay; post-Start feels like a smooth reveal of the already-mounted board (no full page remount jank). Recording/timer behavior matches "live starts now."

**Ignore this run:** Solo tutor with no student (IN_PERSON — item 4). Harness-only recording pill quirks in CI.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage (agent context — your notes go below):**  
`[automated: wb-session-lifecycle.spec.ts › overlay visible for tutor while PENDING; Start disabled until student connects in LIVE mode]`  
`[automated: wb-session-lifecycle.spec.ts › overlay visible for student while PENDING; dismisses when tutor clicks Start]`  
`[automated: wb-session-lifecycle.spec.ts › Phase-gated capture + timer]` — timer/capture inert in PENDING, accrues after Start.  
`[human-only: real WebRTC reachability timing, watching the transition on two real devices, subjective smoothness]`

**Notes:**

---

### 4. IN_PERSON mode (tutor solo)

**Action:** Create a **fresh session** (or end prior and start new). On the tutor waiting-room overlay, locate the **session mode toggle** (`data-testid="wb-session-mode-toggle"`). Switch to **IN_PERSON**. Confirm **Start is enabled without any student connected** (no remote peer required). Click **Start**. Confirm overlay dismisses and tutor can use the board solo. Note whether the mode affordance is discoverable and the IN_PERSON label/state is clear (tutor understands they are not waiting for a remote student).

**Expect:** IN_PERSON mode enables Start immediately with zero students; session goes ACTIVE tutor-only; no false "waiting for student" blocking. Mode toggle UI is understandable without reading internal docs.

**Ignore this run:** Consent projection / student consent flags (Plan #2). Student-side IN_PERSON (N/A — no remote student).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage (agent context — your notes go below):**  
`[automated: wb-session-lifecycle.spec.ts › IN_PERSON mode — Start is always enabled (no student required)]` — behavior with mode **pre-seeded**; Playwright does not click the mode toggle (pointer-interception note in spec).  
`[human-only: mode toggle affordance, discoverability, tutor comprehension of IN_PERSON vs LIVE]`

**Notes:**  
**I personally think the mode was discoverable, but that's also because I expect it, we'll see what more feedback we get with usage.**

---

### 5. Dual-device takeover (hardware — two real devices)

**Action:** With a live or PENDING session (PENDING is enough if student can join), have the **same learner** open the session link on **device A** and join successfully. Then open the **same `/join/<sessionId>#k=…` link** on **device B** (same learner login). Watch **device A**: it should show **"You joined on another device"** (or equivalent heading). On the **tutor** side, confirm only **one** student tile/presence remains (no duplicate ghost student). Note how quickly takeover happens and whether messaging on the old device is clear.

**Expect:** Newest device wins; older device is blocked with clear takeover copy; tutor roster shows a single student identity. No indefinite dual-student confusion.

**Ignore this run:** Different learners on two devices (wrong test — that's auth BLOCKER 404).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage (agent context — your notes go below):**  
`[automated: wb-session-lifecycle.spec.ts › second student device with same learner joins → older device shows takeover message]`  
`[human-only: real-device timing, message clarity, tutor single-tile feel]`

**Notes:**

---

### 6. Old `/w` link redirect (real shared link)

**Action:** Locate a **previously shared** legacy link of the form `/w/<joinToken>#k=<key>` (from an old session share, SMS, or saved bookmark — not a freshly copied `/join/` link). On a **logged-out** second device (or logged-out profile), paste the full URL including the `#k=` fragment on the **Preview** host. Complete learner login if redirected. Confirm the flow **does not 404** and ends at `/join/<sessionId>` (with fragment preserved where possible) for an active/claimable session. Repeat once while **already logged in** as the correct learner if you have a valid old link.

**Expect:** Legacy `/w/…` routes through the redirect bridge into authenticated `/join/…`; session id preserved; after auth, student can reach the board. No dead-end 404 from retirement.

**Ignore this run:** Expired/ended sessions (ended-state UI is separate). Links where the learner is not a participant (expect 404 — automated).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage (agent context — your notes go below):**  
`[automated: wb-session-lifecycle.spec.ts › /w/[token]#k=KEY redirects to /join/[sessionId]#k=KEY (client bridge)]`  
`[automated: wb-session-lifecycle.spec.ts › /w/[token]#k=KEY → after learner auth, lands on /join/[sessionId] board]`  
`[human-only: real in-the-wild old link from prior shares, prod-like paste-from-messages flow]`

**Notes:**

---

### 7. Light + dark themes — waiting-room overlay

**Action:** On the **Preview** URL, open a session until the **waiting-room overlay** is visible (tutor side is enough; repeat on student if convenient). Using the product **theme control**, switch to **light** mode. Scan overlay chrome: video tiles, mic/cam controls, mode toggle, **Start** button, headings/copy — confirm legibility and alignment. Switch to **dark** mode; repeat the same scan. Optionally toggle theme while overlay is open.

**Expect:** Overlay readable and well-aligned in **both** light and dark; controls not clipped; contrast sufficient on tiles and primary CTA; no theme-switch flash that loses A/V or traps focus.

**Ignore this run:** Non-waiting-room surfaces (board tools, marketing pages). System theme follow-OS unless you explicitly want to spot-check System.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage (agent context — your notes go below):**  
`[human-only: subjective theme polish on new waiting-room surface — per-branch smoke, both themes]`  
No dedicated Playwright theme lock for this overlay yet; layout visibility oracles in lifecycle spec do not assert light/dark contrast.

**Notes:**

---

## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete. Overall verdict is PASS/FAIL only — no overall SKIP.

- [ ] PASS
- [ ] FAIL