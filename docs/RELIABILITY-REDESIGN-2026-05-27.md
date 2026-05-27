# Reliability redesign pass — 2026-05-27

> **Design pass type:** 5-axis adversarial reliability review + break-and-rebuild sequencing.
> **Breaking-changes-OK framing:** see § Framing reminder.
> **Authored by:** Sonnet subagent, dispatched by Opus orchestrator chat, 2026-05-27.
> **Companion handoff doc:** [`docs/handoff/reliability-redesign-2026-05-27-orchestrator-report.md`](handoff/reliability-redesign-2026-05-27-orchestrator-report.md)
> **Source docs:** [`docs/INDEX.md`](INDEX.md), [`docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md`](handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md), [`docs/RECORDER-LIFECYCLE.md`](RECORDER-LIFECYCLE.md), [`docs/LIVE-AV.md`](LIVE-AV.md), [`docs/WHITEBOARD-STATUS.md`](WHITEBOARD-STATUS.md), [`docs/BACKLOG.md`](BACKLOG.md), [`docs/PLATFORM-ASSUMPTIONS.md`](PLATFORM-ASSUMPTIONS.md), [`docs/RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md)

---

## 1. Executive summary

Three biggest decisions and their breaking-change call:

1. **Student-side mobile layout → BREAKING redesign** (Surface 5 + partial Surface 3).
   The current desktop-first responsive layout leaves the whiteboard at ~35% of iPhone viewport (B/I5 in pilot smoke). This is an architecture-class failure, not a CSS tweak. A mobile-first redesign of `StudentWhiteboardClient` is the correct fix. Best window: during Wave 3 UI/URL refresh.

2. **Session log + reporting → GREENFIELD new surface** (Surface 7).
   Reclassified from Wave 6 polish to a billing-compliance and daily-workflow feature. Sarah needs institutional format exports (Wyzant 25-word per session, UVU per-period aggregate) and general-purpose date-range + student-filter search — today. This requires new DB columns on `WhiteboardSession` (billing duration, timezone anchor) and a new export module. Session timestamps also need a **breaking migration from UTC-fake-wall-clock to proper timezone-aware storage** — doing this during the UI/URL refresh break window is the right time.

3. **Solo / in-person tutor mode → ADDITIVE, but production-gate must be removed immediately** (Surface 6).
   The FSM already handles solo mode (`soloEnabled=true` + no participants → armed). What's missing is: (a) production env flag must become a per-session UX toggle, (b) consent copy for in-person attestation, (c) signaling-skip for pure offline solo. This is a **Wave 1 or early Wave 2 item** (Sarah explicitly asked; it's disabled in production right now, blocking her use case).

Additional high-severity findings:

4. **Whiteboard sync B1–B4 are application bugs, not architecture** (Surface 3). The `excalidraw-room` relay and sync architecture are sound. The broken sync-to-tutor checkbox / button are CRITICAL-priority bugs requiring a focused sweep dispatch before the next Sarah session.

5. **Audio durability BLOCKER-PRODs (#1 and #2 from BACKLOG) are still open** (Surface 1). IDB partial-segment persistence and upload-failure blob retention are not yet shipped. These predate this review; they should be folded into the Wave 1 reliability sweep.

---

## 2. Framing reminder

> *"if we need to step back and re-design something to work more fluidly/reliably NOW is the time to do it while we're redoing the UI and url structure. Let's make sure we're following best practices, awesome UX, smooth user experience, etc I don't want 50 smoke iterations if I can help it, BUT I'd prefer we break stuff NOW for a moment while making it infinitely more reliable for the future, than keep things brittle, make sense?"*
> — Andrew, 2026-05-27 (briefing for this pass)

Translation: bias toward greenfield + breaking changes where reliability + UX returns are clearly worth the one-time blast radius. This is the right window because Wave 3 (UI/URL refresh) is already in scope — the blast radius is compatible with changes Andrew has already budgeted.

---

## 3. Cross-cutting principles

These apply across all surfaces. Any new feature plan must satisfy them.

1. **Every state mutation logs `<prefix>=<id>` at each state transition.** Per AGENTS.md convention. New features: pick a 3-letter prefix before writing code, not after. Register it in `AGENTS.md` § Conventions and `RECORDER-LIFECYCLE.md` § Cheat Sheet.

2. **Every long-running flow has a kill-switch + retry with observable state.** Drains, uploads, end-session flows — all must be cancellable and must surface their in-flight state to the tutor's UI. "Grey button forever" is not an acceptable failure mode.

3. **Mobile-first student surface is a deliberate constraint, not a fallback.** Sarah's students are on iPhone. Any student-facing UI surface must be designed for mobile-first, then scaled up — not the reverse. The Wyzant layout benchmark (85–90% whiteboard, corner-tucked video) is the acceptance bar for student-side.

4. **Solo mode is first-class v1, not a dev-only env flag.** Session creation must offer solo vs live mode explicitly. The FSM handles both; the UX and consent flow must handle both.

5. **Session timestamps are billing data.** `startTime`/`endTime` stored as UTC-pretending-to-be-wall-clock is a known tech debt (BACKLOG § "Time-storage tech debt"). Session log + reporting will surface this immediately when multiple timezones appear. Fixing timestamps during the Wave 3 break window avoids a second migration.

---

## 4. Per-surface decisions

### Surface 1 — Session FSM + outbox + atomic end-session (Pillars 1-3)

**Current state:** Solid architecture. The FSM is a pure function (`evaluateLifecycle`), the outbox is IDB-backed with serial-within/parallel-across guarantees, and `endWhiteboardSession` is a single Prisma transaction. Multi-stream and multi-participant are supported from day one. Solo mode is already handled at the FSM level via `soloEnabled: boolean` input.
Ref: [`docs/RECORDER-LIFECYCLE.md`](RECORDER-LIFECYCLE.md).

**5-axis findings:**

| Axis | Issue | Severity | Root-cause class |
|---|---|---|---|
| 1 — Data durability | Partial audio segment in-memory chunks die on browser crash/refresh/OOM — BACKLOG #1 | **BLOCKER-PROD** | architecture (IDB persistence not shipped) |
| 1 — Data durability | Upload retry exhaustion: blob dies when user navigates away — BACKLOG #2 | **BLOCKER-PROD** | architecture (IDB hold-until-confirmed not shipped) |
| 2 — Clock + ordering | Session timer drift on iOS when screen locks (interval throttled) | Medium | platform (visibilitychange reconcile fix needed) |
| 3 — Race conditions | FSM is a pure function — no hidden state, no race | OK | — |
| 4 — Cross-platform | iOS Safari IDB ITP eviction after 7 days of inactivity (platform assumption §8.5) | Low | platform (intra-day sessions are fine; flag for multi-day) |
| 5 — Observability | `rid=` coverage partial on mutating actions — BACKLOG #13/#14 | **BLOCKER-PROD** | app-bug |

**Solo mode gap at this layer:**
The FSM already handles solo correctly: `soloEnabled=true` + `participants.size===0` + `!everHadParticipants` → armed with solo grace. The gap is that `soloEnabled` is an env flag (`WHITEBOARD_SYNC_URL` unset = solo). Solo mode must become a per-session UX toggle, not an env flag. The FSM contract does not change.

**Recommendation: ADDITIVE.**
- Ship BLOCKER-PROD #1 + #2 (IDB partial-segment persistence + upload-hold-on-retry-exhaust) as Wave 1.
- Solo mode: wire `soloEnabled` to `sessionMode === "solo"` UX toggle (see Surface 6) — additive FSM input binding change, no FSM redesign.
- `rid=` + `wbsid=` coverage: audit + close the #13/#14 gaps in Wave 1.

**Migration path:** None needed. IDB persistence is additive. Existing outbox rows continue to work.

**Open questions:**
- Should the IDB partial-segment persistence use the existing outbox store schema, or a separate "live-segment-draft" store? The outbox is designed for completed segments. A separate store may be cleaner. Decision needed before the Wave 1 executor dispatch.

---

### Surface 2 — Live A/V architecture (peer-mesh + signaling)

**Current state:** Phase 4a-4d fully shipped. 12 load-bearing invariants documented in [`docs/LIVE-AV.md`](LIVE-AV.md). Web Audio fan-out for mixdown recording is solid. Device hotswap via `replaceLocalTrackOnAllPeers` is implemented.

**5-axis findings:**

| Axis | Issue | Severity | Root-cause class |
|---|---|---|---|
| 1 — Data durability | Audio segment crash loss — same as Surface 1 BLOCKER-PROD #1/#2 | **BLOCKER-PROD** | architecture |
| 1 — Data durability | Devices not released on session end (B11) — students blocked from Discord after session | High | app-bug |
| 2 — Clock + ordering | Auto-pause detection too slow on student disconnect (B7) — pause triggers only after full WebSocket drop | Medium | app-bug |
| 3 — Race conditions | Ghost peer / duplicate camera tiles on reload (B5) — `localPeerId` is now session-stable (4d Commit 4), but stale-tile eviction is still open | High | app-bug |
| 3 — Race conditions | Audio recovery after device-route theft (B6) — Discord/system stole the mic; can we recover without full refresh? | High | platform + app-bug |
| 4 — Cross-platform | iOS camera permission re-prompted every session (I1) — iOS behavior; can only mitigate UX, not fix platform | Medium | platform |
| 4 — Cross-platform | iOS alarm interrupts A/V session (B12) — `AVAudioSession` interruption | Medium | platform |
| 4 — Cross-platform | Safari background → camera black (I4) — likely iOS-normal behavior | Low | platform (document as known limitation) |
| 4 — Cross-platform | TURN not deployed → cellular peers on symmetric NAT fail silently | Medium | architecture (deferred in roadmap; deploy when failures reported) |
| 5 — Observability | `avx=` + `peer=` prefixes well established; per-peer tile state changes visible | OK | — |

**Solo mode gap at this layer:**
When `sessionMode === "solo"`, the sync client connects to `WHITEBOARD_SYNC_URL` unnecessarily, the "Waiting for student" banner shows, and the WebRTC signaling layer initializes for no reason. For a pure in-person session, none of this is needed.

**Recommendation: ADDITIVE.**
- Solo mode: when `sessionMode === "solo"`, skip sync client connection + skip signaling init + show solo-appropriate workspace UX. The `useLiveAV` hook should not even mount in solo mode. FSM receives `soloEnabled=true` from the session mode.
- B11 (device release): fix MediaStream tracks `.stop()` on session end — app-bug, targeted Composer dispatch.
- B7 (auto-pause): investigate faster `RTCPeerConnection.iceConnectionState` monitoring vs WebSocket close event ordering.
- B6 (audio recovery): surface a "Reconnect audio" button that re-calls `getUserMedia` without a full page refresh — Composer dispatch.
- B5 (ghost tiles): implement stale-tile eviction (backlog) — Composer dispatch.
- TURN: defer until first NAT-failure report in the wild.
- Mobile-first student layout: **see Surface 5** — this is where the architectural work lives.

**Migration path:** None needed for additive changes. No schema changes.

**Open questions:**
- For B6 (audio route theft): can `MediaDevices.ondevicechange` + `AudioContext.onstatechange` detect the theft event reliably on Safari and Chrome? This determines whether the recovery can be automatic vs manual-button-triggered.
- For B7 (faster disconnect detection): does the sync server forward WebSocket `close` events to peers? If so, signaling could act faster than ICE detection.

---

### Surface 3 — Whiteboard sync architecture

**Current state:** `excalidraw-room` relay on Fly.io (`wss://wb.mortensenapps.com`). Socket.io WebSocket transport. End-to-end encrypted payloads. Client: `sync-client.ts` with `BufferedRemoteSignal` (4c fix). Welcome-packet on student join ensures canvas is not blank (blocker #23 addressed). Per-page view state via `pageViewState` envelopes.
Ref: [`docs/WHITEBOARD-STATUS.md`](WHITEBOARD-STATUS.md).

**5-axis findings:**

| Axis | Issue | Severity | Root-cause class |
|---|---|---|---|
| 1 — Data durability | Relay restart drops any in-flight socket.io rooms (relay is stateless) | Medium | architecture (acceptable: tutor's IndexedDB checkpoint survives relay restart; sync-reconnect marker logged) |
| 2 — Clock + ordering | B3: last stroke not syncing until page change — suggests incremental event delivery broken | **CRITICAL** | app-bug (not relay-architecture) |
| 2 — Clock + ordering | B4: images/PDFs not syncing until page change — suggests asset delivery depends on page-change trigger | **CRITICAL** | app-bug |
| 3 — Race conditions | B1: sync-to-tutor checkbox has no effect | **CRITICAL** | app-bug (Sarah's #1 priority) |
| 3 — Race conditions | B2: sync button does not snap to tutor view | **CRITICAL** | app-bug |
| 4 — Cross-platform | I5: whiteboard occupies ~35% of iPhone viewport | **CRITICAL** | architecture (student-side layout — see Surface 5) |
| 4 — Cross-platform | Color palette not dismissible on click-away (I7) | Medium | app-bug |
| 5 — Observability | Relay-side event visibility is zero — no per-event logging on the relay | Medium | architecture (relay is a black box; add relay health endpoint + event counter) |

**Is the relay architecture right?**
Yes. For pilot scale (1–3 peers), `excalidraw-room` is sound. The trust model is excellent: E2E-encrypted payloads mean a relay compromise doesn't leak whiteboard content. CRDT / OT would be over-engineering at current scale and would require replacing Excalidraw's sync mechanism entirely. The relay is an opaque forwarder — the architecture is not the problem.

**Root-cause class for B1–B4:** Application bugs. The relay forwards what it receives. If strokes aren't syncing until page change, it is almost certain that the tutor client is not emitting incremental events OR the student client is not processing them outside of the page-change welcome-packet path. One focused Composer dispatch should target the sync surface holistically (tune `excalidraw-adapter.ts` event emission, student-side event application, and the per-page view state change paths).

**Recommendation: ADDITIVE for protocol. BREAKING for student-side layout (Surface 5).**
- B1–B4: targeted application-bug sweep. One Composer dispatch (Wave 1, highest priority).
- Relay: no protocol change needed. Consider adding a simple Fly.io healthcheck endpoint + basic room-count metric for observability.
- iPhone viewport (I5): broken out into Surface 5 — architecture-class, must be redesigned.

**Migration path:** No relay migration needed.

**Open questions:**
- Is `shouldCaptureWB` (FSM output) correctly gating the whiteboard event emission? If the FSM is in a non-recording state, do we still emit sync events? (Yes — sync is independent of recording, but if the gate is wrong, it would explain B1–B4.)
- Are `pageViewState` envelopes being sent for EVERY viewport change or only on page switch? If on page switch only, that would explain why sync-to-tutor works "on page change."

---

### Surface 4 — URL structure + IA

**Current state (inferred from codebase patterns):**
- `/admin/students/[id]/whiteboard/[whiteboardSessionId]` — tutor whiteboard review
- `/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace` — live workspace
- `/w/[joinToken]` — student join
- `/s/[token]/whiteboard/[sessionId]` — parent share replay
- `/api/auth/[...nextauth]` — NextAuth OAuth callbacks

**5-axis findings:**

| Axis | Issue | Severity | Root-cause class |
|---|---|---|---|
| 1 — Data durability | Share tokens (`/s/[token]`) held by parents will 404 if path renamed without redirects | High | app-bug (solvable with 301 redirects + token validation) |
| 2 — Clock + ordering | N/A | — | — |
| 3 — Race conditions | N/A | — | — |
| 4 — Cross-platform | OAuth callback URL must match Google Cloud Console registration; `NEXTAUTH_URL` must match new domain | High | platform |
| 5 — Observability | N/A | — | — |

**Breaking-change scope for Wave 3:**
Wave 3 is explicitly in scope for URL refresh. The breaking changes that matter:

1. **`/s/[token]` parent share paths** — if we rename this path, existing parent links break. Mitigation: 301 permanent redirect from old path → new path. Token extraction logic stays the same; only the URL prefix changes. Acceptable if the token is in the URL segment (not just a query param).

2. **`/w/[joinToken]` student join** — if renamed, existing join links in Sarah's messages to students break. 301 redirect covers this; join tokens are session-scoped so they expire naturally.

3. **OAuth callbacks** — `/api/auth/callback/google` is registered in Google Cloud Console. URL structure change requires: (a) add new callback URL to Google Cloud Console, (b) deploy, (c) verify login works with new URL, (d) remove old URL from Console. Must be done as a coordinated deploy, not incrementally.

4. **Session log + reporting new routes** — `/admin/sessions/log` or similar — additive, no migration needed.

5. **CSP** — no new external origins implied by URL structure change. CSP is built dynamically from `WHITEBOARD_SYNC_URL`; the internal URL structure doesn't affect it.

**Recommendation: ADDITIVE with 301 redirects.**
- Design the new URL structure in the Wave 3 design session (belongs in `docs/UX-AND-A11Y-SPEC.md` IA section).
- Implement URL changes with 301 redirects for every public-facing route that might be held by a parent or bookmarked by a tutor.
- Coordinate OAuth callback update as a single deploy step.
- Student accounts (new entity from § 2.5) imply new routes: `/student/login`, `/student/dashboard` or similar — flag for the v1 design session.

**Open questions for the v1 design session:**
- Should the student join URL (`/w/[joinToken]`) change to `/join/[token]` or `/student/join/[token]`? This is an IA + brand decision. Flag for `docs/UX-AND-A11Y-SPEC.md`.
- Should the parent share URL (`/s/[token]`) change to `/share/[token]` or `/parent/[token]`? Same — IA decision.
- The new student account login flow — does it need a separate subdomain (`student.usemynk.com`) or a path (`/student/...`)? This affects CSP + OAuth scope. Flag for Sonnet-tier design.

---

### Surface 5 — Mobile architecture (student-side)

**Current state:** Student-side is `StudentWhiteboardClient.tsx` at `/w/[joinToken]`. Responsive but designed desktop-first. Sarah's iPhone smoke (I5) showed whiteboard at ~30–35% of viewport; the rest is chrome.

**Viewport breakdown (I5 diagnosis):**

| Element | Viewport % consumed | Root-cause class |
|---|---|---|
| Safari dynamic URL bar (collapsible) | ~7–10% | platform — can use `dvh` units to mitigate |
| Camera tile panel (above whiteboard) | ~15–20% | architecture — should overlay whiteboard corner, not stack |
| "Board pages" explainer card | ~20–25% | app-bug — this card should be a small bottom strip, not a full-width card |
| Excalidraw toolbar (full, left side) | ~10–15% | architecture — student only needs follow-mode toggle; full toolbar is wrong |
| Bottom control bar | ~5–10% | architecture — too large for mobile |

**Diagnosis:** This is NOT just a CSS fix. The layout architecture (separate stacked regions for camera, whiteboard, toolbar, control bar) produces ~35% whiteboard when stacked vertically on a 375px wide screen. Fixing it requires changing the layout model: camera overlay → overlapping the whiteboard corner (Wyzant pattern); toolbar hidden/minimal for student; Board pages → bottom pill indicator; control bar collapsed to a FAB or bottom sheet.

**5-axis findings:**

| Axis | Issue | Severity | Root-cause class |
|---|---|---|---|
| 1 — Data durability | Students don't record — not applicable | — | — |
| 2 — Clock + ordering | Sync-to-tutor broken (B1/B2) — separate from layout | CRITICAL | app-bug (Surface 3) |
| 3 — Race conditions | N/A | — | — |
| 4 — Cross-platform | Whiteboard at ~35% of iPhone viewport (I5) | **CRITICAL** | architecture |
| 4 — Cross-platform | Camera tile far from whiteboard (I6) | High | architecture |
| 4 — Cross-platform | Palette doesn't dismiss on click-away (I7) | Medium | app-bug |
| 4 — Cross-platform | iOS camera permission every session (I1) | Medium | platform (only mitigatable; can't fix) |
| 4 — Cross-platform | iOS background → camera black (I4) | Low | platform (document as known limitation) |
| 5 — Observability | No student-side session ID in logs | Medium | app-bug |

**Recommendation: BREAKING redesign (mobile-first).**
Accepted losses during the redesign:
- Current student-side responsive layout is discarded.
- "Board pages" card is replaced with a compact bottom tab strip.
- Camera tile moves from stacked-above to overlay-bottom-right (Wyzant pattern per Sarah's reference image).

What survives:
- All existing data flows, sync client, FSM inputs from student side.
- `StudentWhiteboardClient.tsx` exists — it's the integration point. The layout shell is what changes.
- Existing `/w/[joinToken]` route and token validation logic.

Target layout (Wyzant-shaped, per Sarah's reference image at §2 of pilot feedback doc):
- Whiteboard: ≥80% of viewport at `375px` wide on iOS Safari with dynamic viewport unit (`dvh`)
- Camera tile: small, corner-overlay (bottom-right), tap-to-expand
- Toolbar: visible for follow-mode toggle only; other tools hidden in a collapsed overflow menu
- Board pages: compact bottom pill/tab strip, not a card
- Controls (mic toggle, leave): bottom-anchored FAB cluster

**Wave placement:** Wave 3 (alongside UI/URL refresh). Designing and building this in isolation from the brand refresh would mean redesigning twice. The mobile-first student layout IS part of the Wave 3 brand + UX refresh scope.

**Migration path:** No data migration. Student join URL unchanged (or 301 redirect if renamed). The visual redesign replaces the responsive layout shell only; all data flows unchanged.

**Open questions:**
- Should student-side be a PWA (installable)? iOS PWA avoids the dynamic URL bar. This is a UX-spec-level decision — flag for `docs/UX-AND-A11Y-SPEC.md`.
- Does the student need a "Board pages" navigation surface at all (are students expected to jump to specific pages, or do they always follow the tutor)? Sarah was uncertain about student-side add-page (I5 note: "she'd have to work with it"). Flag for follow-up Sarah session.

---

### Surface 6 — Solo / in-person tutor mode (Greenfield gating + UX)

**Current state:** `soloEnabled: boolean` FSM input, wired to `WHITEBOARD_SYNC_URL` env var presence. When unset, the whiteboard runs in solo mode. Currently disabled in production.
Source: [`docs/WHITEBOARD-STATUS.md`](WHITEBOARD-STATUS.md) § Sync host deploy notes.

**Sarah's request (§9 of pilot feedback doc):**
> "we did talk about possible logging in to use the whiteboard in person so it can record while in person, that is slightly different than what we did today. I just can't think of anything more right now, but if I do I'll let you know."

**5-axis findings:**

| Axis | Issue | Severity | Root-cause class |
|---|---|---|---|
| 1 — Data durability | In-person recording has the same crash-loss risk as live mode (BLOCKER-PROD #1/#2) | BLOCKER-PROD | architecture (same fix as Surface 1) |
| 2 — Clock + ordering | No remote peer to drift against — actually simpler than live mode | Low | — |
| 3 — Race conditions | Solo mode bypasses the participant-join race conditions | Simplification | — |
| 4 — Cross-platform | Solo mode must work on iPad (classroom use case), not just desktop | Medium | app-bug (iPad layout not validated) |
| 5 — Observability | Session mode not logged at session start — can't tell solo vs live in prod logs | Low | app-bug |

**Design decisions:**

**Gating:** Session creation modal (`StartWhiteboardSession` / `ConsentModal`) must present a mode picker. Suggested UI:
- "Live session" — student joins with a link (existing flow)
- "Solo / in-person" — no remote student; I'm recording for myself and in-person students

The `soloEnabled` FSM input becomes `sessionMode === "solo"` from the session's `WhiteboardSession.sessionMode` field.

**Schema addition:**
```prisma
// Additive migration — WhiteboardSession
sessionMode   String  @default("live")  // "live" | "solo"
```

**FSM wiring:** No FSM change needed. The workspace reads `session.sessionMode === "solo"` and passes `soloEnabled: true` to `evaluateLifecycle`. The sync client is not started for solo mode. `useLiveAV` is not mounted.

**UX in solo mode:**
- No "Waiting for student" banner
- No "Copy student link" button (or: hidden, with a "Add remote student" upgrade path if the tutor wants to include a remote viewer mid-session)
- Recording indicator still shows (recording IS the whole point)
- Timer starts immediately (no `bothConnectedAt` waiting; solo sessions start the timer at session creation)
- Optional: "In-person student on device" button — generates a join link anyway for a tablet next to the whiteboard. This is the "second device in-person" pattern.

**Consent flow for solo mode:**
The existing consent modal says "My student has consented to this session being recorded (audio + writing)." For in-person solo mode, this copy should read:
- "My student is present in-person and has consented to audio and whiteboard recording of this session."
- For minors: "I have obtained written parent/guardian consent for a student under 18 to be recorded." (same 4-boolean consent model from § 3; just different copy + attestation by tutor rather than student self-consent)

**The 4-boolean consent model from § 3 (from pilot feedback):**
```
consentRecordingAudio
consentRecordingVideo
consentEducationalUseAudio
consentEducationalUseVideo
```
These were flagged as student-level consent fields on the `Student` entity. For solo mode, the tutor attests all four on behalf of the in-person student. This is a UX difference, not a data model difference — same fields, different attestor.

**Schools pitch / classroom mode:** Solo mode is a prerequisite for the classroom use case (one tutor, many in-person students, no remote connection). When classroom mode becomes a scope item, the schema should support `sessionMode: "live" | "solo" | "classroom"` — don't hard-code binary. No classroom mode code needed now.

**Recommendation: ADDITIVE + production enable. Wave 1 or early Wave 2.**
This is the lowest-lift path to Sarah's explicitly-requested feature. The FSM already handles it. The missing pieces are:
1. `WhiteboardSession.sessionMode` column (additive migration)
2. Mode picker in the session creation modal
3. Solo-specific consent copy
4. Signaling skip in `WhiteboardWorkspaceClient` when `sessionMode === "solo"`
5. Timer starts immediately (no wait for `bothConnectedAt`)
6. `sessionMode` logged at session start

**Migration path:** Additive column with `@default("live")`. All existing sessions become `sessionMode: "live"`. No data backfill needed.

**Open questions:**
- Should the tutor be able to SWITCH from solo → live mid-session (add a remote student after starting solo)? This would require starting the sync client mid-session. Simpler v1: no mid-session mode switch; choose at start. Flag for future.
- Should solo mode be the DEFAULT for new tutors who haven't configured a student yet? Possibly reduces confusion for first-use flow.
- "In-person student on device" tablet-join: does it share the existing `/w/[joinToken]` flow, or needs a distinct "in-person device" role (no A/V, just whiteboard follow)? Flag for v1 design session.

---

### Surface 7 — Session log + reporting + search (Greenfield)

**Current state:** Zero purpose-built session log infrastructure. Existing data:
- `WhiteboardSession.startedAt`, `endedAt`, `durationSeconds`, `bothConnectedAt` — timestamps exist
- `SessionNote.startTime`, `endTime` — stored as "UTC pretending to be wall-clock" (BACKLOG § "Time-storage tech debt")
- No disconnect-gap tracking
- No billing duration (nearest-5-min rounding) stored
- No export module
- No date-range + student-filter query surface

**Sarah's requirements (Q2 follow-up, 11:57 PM, verbatim):**
> "log time and notes would log total time and when you started and ended a session, if you got disconnected, and there is time gap, it would adjust to the total time... the time like if i tutored 55 mins, it would show that amount and that I tutored from 10:00am-10:55am... rounded to the nearest 5 at the very end... search for the notes for a certain time period... for which students, maybe it just one, maybe its all of them for the last two weeks"

**5-axis findings:**

| Axis | Issue | Severity | Root-cause class |
|---|---|---|---|
| 1 — Data durability | No billing log entity — duration/timezone data not persisted at session close | BLOCKER | greenfield missing |
| 2 — Clock + ordering | `startTime`/`endTime` stored as UTC-pretending-wall-clock — breaks timezone-aware billing | High | tech-debt (existing architecture flaw) |
| 2 — Clock + ordering | No disconnect-gap log — can't reconstruct "adjusted total time" post-session | High | greenfield missing |
| 3 — Race conditions | Rounding to nearest 5 at session close: race if tutor edits billing duration manually after close | Low | solvable with optimistic locking |
| 4 — Cross-platform | Search/export UI must work on iPad (tutor may review billing there) | Medium | design constraint |
| 5 — Observability | No session-level billing observability — Andrew can't see billing durations in admin | High | greenfield missing |

**Data model recommendation:**

Extend `WhiteboardSession` with billing fields (additive migration):
```prisma
// Existing fields (from current Prisma schema)
id              String
adminUserId     String
studentId       String
// ... etc

// NEW from Wave 2.5 (full-precision actual — audit trail, never displayed for billing)
actualStartUtc      DateTime    // session start, full precision
actualEndUtc        DateTime?   // session end, full precision (null if active)
disconnectGapMs     Int         // cumulative time during disconnects, computed from FSM events; frozen at close

// NEW from Wave 2.5 (locale + grouping; frozen at session-close)
tutorTimezone       String      // e.g. "America/Denver" — locked at close
sessionDateLocal    String      // e.g. "2026-05-27" — locked at close, for billing-period grouping

// NEW from Wave 2.5 (what Sarah saw — FROZEN at session-close, NEVER recomputed)
billedStartLocal    String      // e.g. "10:00" — frozen at close
billedEndLocal      String      // e.g. "10:55" — frozen at close
billedDurationMin   Int         // e.g. 55 — frozen at close

// DEFERRED until in-app billing ships
// ratePerHour       Decimal?
// billedAmount      Decimal?
```

> **Invariant: `billed*Local` + `billedDurationMin` are FROZEN at session-close.** Sarah is already billing externally (Wyzant 25-word/session; UVU per-pay-period) off whatever Mynk displays. Once a session closes and shows "10:00am-10:55am, 55 minutes," that displayed range becomes part of her external audit trail — we cannot retroactively change it by tweaking rounding logic later. If we revise rounding rules in the future, only NEW sessions use the new rules; existing rows keep their frozen values. `actualStartUtc` / `actualEndUtc` / `disconnectGapMs` are also frozen but are the FULL-PRECISION truth (audit-trail-of-the-truth, in case any forensic question comes up later); they are NOT displayed for billing — `billed*Local` + `billedDurationMin` are.

The naming convention `billed*` rather than `displayed*` or `reported*` is intentional: when in-app billing ships, the column names already match the billing semantics. If Andrew prefers `reported*` instead, it's a rename in this doc — flag in handoff for confirmation.

A separate `SessionBillingLog` entity is NOT recommended for v1. The session IS the billing unit; adding a second table adds join complexity for the common case (show sessions list with billing info). Use a separate entity only if billing needs to span multiple sessions (e.g. a monthly aggregate) — that's a Wave 5+ concern.

**Disconnect-gap tracking:** When the FSM transitions to `"paused"` due to `"all_participants_disconnected"`, log a gap start event. When it resumes, log gap end. Persist as a JSONB/string column or via a new lightweight `SessionGapLog` child table. For v1, a JSON column is sufficient; normalize later if needed.

**Query surface:**
- `/admin/sessions/log` — tutor's session log view
  - Filters: date range (calendar picker, week/month shortcuts), student (all OR single)
  - Columns: date, student, duration, billed minutes, notes preview
  - Pagination: cursor-based (date DESC order), page size 25
  - Default: last 14 days, all students

**Aggregation:**
- Date-range subtotal row: total billed minutes, total sessions
- Per-student subtotal: same, for multi-student date-range query
- "Consolidated format" Sarah described: a summary card per date range with all sessions listed

**Export architecture:**
```
src/lib/session-export/
  index.ts                    # SessionExportService: buildExport(sessions, formatter)
  types.ts                    # SessionExportRecord, ExportFormatter interface
  formatters/
    wyzant.ts                 # 25-word minimum summary + session date + duration
    uvu.ts                    # Pay-period aggregate + each session breakdown
    generic-csv.ts            # Full CSV: date, student, start, end, duration, billed, notes
    generic-json.ts           # Same as CSV but JSON
```

`ExportFormatter` interface:
```ts
interface ExportFormatter {
  format(sessions: SessionExportRecord[], options?: FormatOptions): string;
  mimeType: string;
  filename(dateRange: DateRange): string;
}
```

This is extensible: adding a new institutional format is adding a new formatter file. The `SessionExportService` doesn't change.

**"Looking back at notes" — retroactive history (Sarah's action #7):**
This is the `/admin/sessions/log` view with full-text search added. The existing `/admin/students/[id]` notes history page (BACKLOG note: "lacks date-range filter") should be unified with the session log view — don't build two separate history surfaces. Recommendation: one tutor-side history page at `/admin/sessions/log` with:
- Date-range filter
- Student filter
- Content search (existing `ILIKE %q%` is fine for pilot scale; flag `pg_trgm` for scale)

**Timezone fix (breaking migration during Wave 3 window):**
The existing "UTC pretending to be wall-clock" timestamp storage (BACKLOG § "Time-storage tech debt") must be fixed before session log + reporting is shipped. Proposed migration:
1. Add `tutorTimezone String?` to `AdminUser` (optional, filled at first login or in Settings)
2. Add `sessionDateLocal DateTime?` to `WhiteboardSession` (see above)
3. Add `tutorTimezone String?` to `WhiteboardSession` (snapshot of tutor's TZ at session create)
4. Existing `startTime`/`endTime` in `SessionNote` remain as-is (they're note fields, not billing fields); session log uses `WhiteboardSession.startedAt` + `endedAt` + `tutorTimezone` for correct display
5. NO backfill on old records — treat `tutorTimezone == null` as "display UTC-local, flag for review"

This is a breaking migration only in the sense that the billing display changes behavior. No data is deleted. Old records without `tutorTimezone` display in UTC (which is what they are now, just honest about it).

**Recommendation: GREENFIELD. New Wave between current Wave 2 and Wave 3** (or an expanded Wave 2 with a clear sub-scope). This is NOT Wave 6 polish. Sarah needs billing compliance exports before she can replace Wyzant + UVU reporting.

**Wave placement rationale:** The timezone migration should happen during the Wave 3 break window (already breaking changes). But the session log query surface + export module can ship before the UI/URL refresh. Suggested split:
- Wave 2.5 (or "Wave 2 expansion"): data model (schema changes, billing duration logic, gap tracking, `tutorTimezone` capture), query API, export module backend
- Wave 3: session log UI surface, integrated with the new design system

**Migration path:**
- Additive columns on `WhiteboardSession` and `AdminUser` — no data loss
- Timezone backfill: not needed; old records display in UTC as before
- Export module: additive new code

**Open questions for Andrew:**
- What is Sarah's billing rate? Does she want rate-per-hour stored in the app and amount calculated automatically, or does she prefer to see billing minutes only and calculate payment externally? This determines whether `ratePerHour` and `billedAmount` belong on the session log entity.
- Wyzant + UVU forms: Sarah committed to sharing these artifacts. Until they arrive, the formatter implementations are stubs. When should the "share Wyzant form" follow-up happen?
- Does "looking back at notes" need to search inside AI-generated note content (Topics, Plan sections), or just the session metadata (date, student, duration)? Full-text note search requires `pg_trgm` at scale; metadata-only search is fine on standard Postgres index.

---

## 5. Updated wave structure

The existing 6-wave roadmap absorbs the findings as follows. Waves are in priority order (not strict sequence — W1 and W3 can run in parallel on separate branches).

### Wave 1 — Reliability Floor (expanded)

**New additions from this pass:**
- B1–B4 sync reliability sweep (Surface 3 app bugs — Sarah's #1 priority — insert as Wave 1 BLOCKER-PROD)
- Solo mode production enable: `WhiteboardSession.sessionMode` additive migration + mode picker UX + `soloEnabled` wiring (Surface 6 — small scope; unblocks Sarah's in-person use case)
- B11 device release on session end (Surface 2 — app-bug fix)
- B6 audio recovery button (Surface 2 — app-bug fix)
- B5 ghost peer eviction (Surface 2 — app-bug fix)
- `rid=` / `wbsid=` / `sessionMode` coverage at session start (Surface 1 + 6)

**Still in Wave 1 (pre-existing):**
All rows from the existing Wave 1 table in [`docs/RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md) remain. Audio crash/refresh durability (BLOCKER #1+#2) is the most urgent.

**Wave 1 exit signal (updated):**
Sarah's primary pain points resolved: B1–B4 sync working, audio durability BLOCKERs shipped, solo mode available in production. Sarah can run both remote and in-person sessions without a backup recorder.

### Wave 2 — Polish + Quick Wins (unchanged + session log data model)

**New addition from this pass:**
- Session log data model (schema, billing duration logic, gap tracking, `tutorTimezone`) — Wave 2.5 sub-scope. Backend-only; no UI yet.
- Timezone migration (additive columns only — no visual change until Wave 3 session log UI)

### Wave 3 — Brand + UX Refresh (expanded)

**New additions from this pass:**
- Student-side mobile layout **BREAKING redesign** (Surface 5). This is the biggest Wave 3 addition. Must be treated as a full design pass, not a responsive CSS patch.
- Session log UI surface (integrated with new design system; backend already in Wave 2.5)
- URL structure decisions + 301 redirects for any renamed routes (Surface 4)
- OAuth callback URL coordination for any domain changes
- Solo mode consent UX polish (if not shipped fully in Wave 1)

**Wave 3 exit signal (updated):**
Student-side iPhone experience meets Wyzant viewport benchmark (≥80% whiteboard); session log UI ships; brand/URL refresh complete.

### Wave 4 — Admin Platform + Pitch Metrics (unchanged)

Session log export module (Wyzant/UVU formatters) may be a Wave 4 sub-item, or it may ship in Wave 3 if Sarah needs institutional exports urgently. Decision: ask Sarah at the next call whether she's actively blocked on Wyzant/UVU reporting right now.

### Wave 5 — Pitch-Ready Infrastructure (unchanged)

Student accounts + consent model (§ 2.5 of pilot feedback) is Wave 5 scope — it requires schema design, new auth boundary, consent capture flow, A/V gating logic, minor-data defaults. This is a Sonnet-tier design pass + multiple Composer execution dispatches. Not Wave 1 — but it IS pre-university-pitch blocker.

### Wave 6 — Replay + Phase 6 Polish (unchanged)

No changes from this review pass.

### Waves now obsolete or merge-able?

None are obsolete. The main structural change is adding a "Wave 2.5" sub-scope for session log data model, and expanding Wave 3 with the student-side mobile layout redesign.

---

## 6. Sequenced break-and-rebuild plan

Phase-ordered. Dependencies noted. Model tier per AGENTS.md model usage protocol.

| # | Work item | Depends on | Tier | Wave | Breaking? |
|---|---|---|---|---|---|
| P1 | **Sync reliability sweep (B1–B4):** audit sync event emission in `excalidraw-adapter.ts`, student-side event application, `pageViewState` envelope timing | None | **Composer 2.5** | W1 | Additive |
| P2 | **Audio BLOCKER-PROD #1:** IDB partial-segment persistence in `useAudioRecorder` | None | **Composer 2.5** (IDB design needs Sonnet if arch is unclear) | W1 | Additive |
| P3 | **Audio BLOCKER-PROD #2:** IDB hold-blob-until-retry in outbox | P2 (shared IDB module) | **Composer 2.5** | W1 | Additive |
| P4 | **Solo mode production enable:** `WhiteboardSession.sessionMode` migration + mode picker + consent copy + signaling skip + timer fix | None | **Composer 2.5** (reads RECORDER-LIFECYCLE.md + LIVE-AV.md first) | W1 | Additive |
| P5 | **B11 + B6 + B5 device/peer fixes:** device release on end, audio recovery button, stale tile eviction | None | **Composer 2.5** | W1 | Additive |
| P6 | **`rid=` / `wbsid=` coverage close + `sessionMode` logging** | None | **Composer 2.5** | W1 | Additive |
| P7 | **Session log data model:** schema migration (`billedDurationMin`, `disconnectGapMs`, `tutorTimezone`, `sessionDateLocal`), billing duration logic, gap tracking wiring in FSM host | P4 (sessionMode useful to have, not blocking) | **Sonnet** (auth-boundary: `assertOwnsStudent` on new query surfaces; clock-correctness reasoning) | W2.5 | Additive migration + breaking timestamp semantics |
| P8 | **Session log query API + export module backend:** `/admin/sessions/log` server actions, `SessionExportService` + Wyzant/UVU/generic formatters (stub until Sarah shares forms) | P7 | **Composer 2.5** | W2.5 | Additive |
| P9 | **Student-side mobile layout redesign:** `StudentWhiteboardClient.tsx` shell, mobile-first layout (80%+ whiteboard, overlay camera, minimal toolbar, compact board pages strip) | Wave 3 design session (UX spec needed) | **Sonnet** (cross-cutting: iOS Safari quirks, viewport units, Excalidraw integration) | W3 | **BREAKING** |
| P10 | **Session log UI:** date-range picker, student filter, aggregation view, export button | P8 (backend), Wave 3 design | **Composer 2.5** | W3 | Additive |
| P11 | **URL structure + 301 redirects:** new route names, redirect rules, OAuth callback update | Wave 3 design session | **Composer 2.5** | W3 | Breaking (redirected) |
| P12 | **Student accounts + consent model design:** `Student` entity, 4-boolean consent, minor-data defaults, `assertStudentSelf` boundary | P11 (URL structure settled) | **Sonnet** (auth-boundary + new entity) → Composer for execution | W5 | Breaking (new entity, new auth boundary) |

**Critical-path ordering:**
P1 (sync sweep) → ship → Sarah validation → P2+P3+P4 (can run in parallel) → P5+P6 (parallel with P2/P3) → Wave 2.5 starts → Wave 3 starts.

---

## 7. Cost discipline notes

| Category | Estimated effort | Tier | Rationale |
|---|---|---|---|
| P1 Sync sweep | ~3–5h Composer | Composer 2.5 | App-bug fix; well-understood codebase; reads WHITEBOARD-STATUS + LIVE-AV |
| P2+P3 IDB persistence | ~4–6h Composer | Composer 2.5 | Proven pattern (outbox IDB exists); RECORDER-LIFECYCLE.md is the guide |
| P4 Solo mode | ~2–3h Composer | Composer 2.5 | FSM already handles it; small schema + UX gate |
| P5+P6 Device/peer/logging fixes | ~2–3h Composer | Composer 2.5 | Targeted app-bug fixes |
| P7 Session log data model | ~3–4h Sonnet | Sonnet | Auth-boundary + clock-correctness reasoning needed; new query surface |
| P8 Export module | ~3–4h Composer | Composer 2.5 | Well-structured module; formatter pattern is straightforward |
| P9 Student mobile redesign | ~6–10h Sonnet + Composer | Sonnet designs, Composer ships | Cross-cutting iOS Safari + Excalidraw; needs design pass first |
| P10 Session log UI | ~3–4h Composer | Composer 2.5 | Standard table + filter UI after backend is ready |
| P11 URL redirects | ~1–2h Composer | Composer 2.5 | Mechanical; redirect rules + OAuth update |
| P12 Student accounts | ~10–15h Sonnet + Composer | Sonnet designs, Composer ships | New entity, new auth boundary, consent flow |

**Summary:** Wave 1 items (P1–P6) are approximately **14–22 Composer 2.5 hours** — roughly 6–10 dispatch sessions of 2–3h each. Wave 2.5 (P7–P8) is approximately **6–8 hours**: 3–4h Sonnet + 3–4h Composer. Wave 3 mobile redesign (P9–P11) is **10–16 hours**: 6–10h Sonnet/Composer for P9, plus P10+P11.

At roughly 30× cost differential, this is substantially cheaper than Opus-class execution throughout. The Sonnet-class items (P7, P9, P12) are the exceptions: they touch auth boundaries or require cross-cutting mobile reasoning where Composer 2.5 quality risk is material.

---

## 8. Open questions for the v1 design session resumption

These are UX-spec-level decisions that belong in `docs/UX-AND-A11Y-SPEC.md`, not in this design doc. List here; do not resolve here.

1. **Student join URL naming** — should `/w/[joinToken]` become `/join/[token]` or `/student/[token]`? Affects brand, IA, and 301 redirect scope. Lock in Wave 3 design session.

2. **Parent share URL naming** — should `/s/[token]/...` change? Affects existing parent links Sarah has already shared. Lock in Wave 3 design session with explicit 301 redirect plan.

3. **Student accounts: subdomain vs path** — `student.usemynk.com` vs `usemynk.com/student`. CSP + auth implications differ. Lock before P12.

4. **Session log: rate-per-hour and calculated amount** — does Sarah want billing amount auto-calculated in the app, or just billed minutes? Requires asking Sarah. Do not design the rate/amount fields until answered.

5. **"In-person student on device" tablet-join for solo mode** — same `/w/[joinToken]` flow, or distinct "in-person device" role (whiteboard follow only, no A/V)? Flag for Sarah at next call.

6. **Solo mode as default** — should solo mode be the default for new tutors on first session, or should live mode always be default? UX/onboarding question.

7. **Waiting room concept (U1)** — Sarah said a waiting room (like Google Meet/Teams) where the session timer doesn't start until the student leaves the room might be better. Is this in v1 scope? Affects student join flow, session timer logic, and consent flow timing. Flag for v1 design session.

8. **Student "add page" capability (F4)** — Sarah was uncertain whether students should be able to add whiteboard pages. Lock before student-side mobile redesign (P9) because it affects the student toolbar design.

9. **PWA installable for student side** — avoids iOS Safari dynamic URL bar. Tradeoff: adds service worker complexity, PWA manifest, update flow. Flag for `docs/UX-AND-A11Y-SPEC.md` mobile section.

10. **`sessionMode: "classroom"` in schema now vs later** — should the initial `sessionMode` migration use a string enum that includes "classroom" (future-proof), or just `"live" | "solo"` (YAGNI for now)? Recommend string column with `@default("live")` — no enum constraint — so any future value is additive.

---

## Changelog

- **2026-05-27:** Initial pass. Created by Sonnet subagent during reliability redesign orchestration, commissioned post-Sarah-pilot-call-2026-05-26 + Andrew's breaking-changes-OK framing.
