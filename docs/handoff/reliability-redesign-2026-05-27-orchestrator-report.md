---
status: COMPLETE — 2026-05-27 reliability redesign pass
authored_by: Sonnet subagent dispatched by Opus orchestrator chat
scope: 5-axis adversarial review + break-and-rebuild sequencing across 7 surfaces
---

# Reliability redesign — 2026-05-27 · Orchestrator handoff report

> **Orchestrator:** Opus (dispatching chat)
> **Executor:** Sonnet (this review + design pass)
> **Date:** 2026-05-27 (immediately following Sarah pilot call 2026-05-26 + doc-cleanup pass)
> **Design doc:** [`docs/RELIABILITY-REDESIGN-2026-05-27.md`](../RELIABILITY-REDESIGN-2026-05-27.md)
> **Pilot source:** [`docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md`](sarah-pilot-feedback-2026-05-26-orchestrator-report.md)

---

## Context — why this pass happened

Sarah's 2026-05-26 evening call + 12:03–12:17 AM follow-up thread surfaced three architecture-affecting findings:

1. **Solo / in-person tutor mode is a first-class v1 need** — Sarah explicitly asked for it (11:48 PM); currently disabled in production.
2. **"Log the time" is a major feature surface** (session log + reporting + search + billing compliance) — reclassified from Wave 6 polish to a billing-compliance + daily-workflow feature. Sarah named "log the time + notes" as a top-3 daily action.
3. **The wedge is whiteboard + live recording** — AI notes are secondary (§ 8 strategic reframe). This reinforces that whiteboard sync + live A/V reliability are the highest-leverage surfaces.

Andrew's framing (verbatim brief):

> "if we need to step back and re-design something to work more fluidly/reliably NOW is the time to do it while we're redoing the UI and url structure. Let's make sure we're following best practices, awesome UX, smooth user experience, etc I don't want 50 smoke iterations if I can help it, BUT I'd prefer we break stuff NOW for a moment while making it infinitely more reliable for the future, than keep things brittle, make sense?"

This is a breaking-changes-OK pass because Wave 3 (UI/URL refresh) is already in scope — the blast radius is compatible.

---

## Scope of the design pass

**Reviewed (7 surfaces):**
1. Session FSM + outbox + atomic end-session (Pillars 1-3)
2. Live A/V architecture (peer-mesh + signaling + iOS Safari)
3. Whiteboard sync architecture
4. URL structure + IA
5. Mobile architecture (student-side)
6. Solo / in-person tutor mode (greenfield gating + UX design)
7. Session log + reporting + search (greenfield data model + export architecture)

**Not reviewed (out of scope for this pass):**
- Student accounts + consent model (§ 2.5 of pilot feedback doc) — identified as Wave 5, Sonnet-tier design pass needed
- AI prompt iteration (v8 "plan replaces homework") — small scope, defer to standalone Composer dispatch
- Wyzant layout visual spec — belongs in `docs/UX-AND-A11Y-SPEC.md` Wave 3 design session
- Brand / social handle captures — not a reliability concern
- Phase 11a PostHog, Phase 11b AI edit signal — still gated on legal umbrella

---

## Findings summary

See [`docs/RELIABILITY-REDESIGN-2026-05-27.md`](../RELIABILITY-REDESIGN-2026-05-27.md) for per-surface 5-axis tables and full recommendations. Key findings:

**Architecture-class issues (require redesign):**
- Student-side mobile layout is architecture-class, not CSS-fixable. `StudentWhiteboardClient` was designed desktop-first and cannot reach Wyzant-benchmark viewport (80%+ whiteboard) with media-query overlays on iPhone.
- Session timestamps stored as "UTC pretending to be wall-clock" — a known tech debt that becomes a billing-compliance blocker when session log + reporting ships.

**Application bugs (CRITICAL priority, app-bug class, additive fix):**
- B1 + B2 + B3 + B4: whiteboard sync broken (Sarah's #1 priority — sync-to-tutor checkbox/button has no effect; strokes/assets don't sync until page change). Root cause: `excalidraw-adapter.ts` event emission or student-side application path, not relay architecture. The `excalidraw-room` relay is sound.
- B11: devices not released on session end (blocks Sarah's students from Discord post-session).
- BLOCKER-PROD #1 + #2 (existing): IDB partial-segment persistence + upload-failure blob retention not yet shipped.

**Greenfield surfaces (no existing architecture):**
- Solo / in-person mode: FSM already handles it (`soloEnabled`); missing pieces are `WhiteboardSession.sessionMode` schema field + UX gate + consent copy change. Small scope.
- Session log + reporting: requires `billedDurationMin`, `disconnectGapMs`, `tutorTimezone`, `sessionDateLocal` on `WhiteboardSession`; new export module (`src/lib/session-export/`); session log query surface at `/admin/sessions/log`.

---

## Decisions locked

| Decision | Value | Breaking? | Wave | Severity |
|---|---|---|---|---|
| Student-side mobile layout | **BREAKING redesign** — mobile-first, Wyzant-benchmark (≥80% whiteboard, overlay camera) | **BREAKING** | W3 | CRITICAL |
| Session timestamps | **Fix timezone storage** — `tutorTimezone` + `sessionDateLocal` on `WhiteboardSession` during Wave 3 break window | Breaking migration (additive + semantic change) | W3 | High |
| Session log + reporting | **Major feature surface, NOT Wave 6 polish** — new schema columns + export module + history UI | Additive | W2.5 | High |
| Solo mode | **ADDITIVE production enable** — `WhiteboardSession.sessionMode` enum + UX gate + signaling skip | Additive | W1 | High |
| Whiteboard sync relay | **STAY on `excalidraw-room`** — relay architecture is sound; B1–B4 are app bugs, not relay protocol bugs | Additive | W1 | CRITICAL |
| Sync B1–B4 bugs | **App-bug sweep, one Composer dispatch** — highest priority before next Sarah session | Additive | W1 | CRITICAL |
| `sessionMode` schema | **String column `@default("live")`** — no enum constraint; forward-compatible with "classroom" | Additive | W1 | Medium |
| Export architecture | **`ExportFormatter` interface + per-institution formatter files** — extensible to future institutional formats | Additive (greenfield) | W2.5–W3 | Medium |
| CRDT / OT migration | **Deferred indefinitely** — relay is correct for pilot scale; CRDT is over-engineering | N/A | Backlog | Low |
| TURN server | **Deferred until first NAT failure reported in production** | N/A | Backlog | Low |

---

## Open questions for Andrew

Where Sonnet-class judgment was applied but confidence is not 100%. Andrew should confirm before executor dispatches begin.

1. **Session log billing rate** — Does Sarah want her hourly rate stored in the app so billing amount is auto-calculated, or just billed minutes (she calculates payment externally)? This determines whether `ratePerHour` + `billedAmount` fields go on the session log entity. **Andrew's call; ask Sarah at next call.**

2. **Wyzant + UVU forms artifact** — Sarah committed to sharing screenshots of Wyzant and UVU forms. The export formatters (`wyzant.ts`, `uvu.ts`) are stubs until those arrive. How urgent is the institutional export vs the session log search surface? If search is the daily need and export is the compliance need, prioritize search first.

3. **B6 audio recovery (device-route theft)** — Can `MediaDevices.ondevicechange` + `AudioContext.onstatechange` detect Discord stealing the mic reliably on both Safari and Chrome? If yes, automatic recovery (re-acquire mic without refresh) is feasible. If no, a manual "Reconnect audio" button is the best we can do. This is a technical pre-check before the B6 executor dispatch.

4. **Waiting room (U1)** — Sarah's suggestion of a waiting room (session timer doesn't start until student leaves waiting room) changes the session-start flow and timer logic materially. Is this in Wave 1 scope (because it affects iOS permission UX too) or Wave 3 scope (UX redesign)? Recommend Wave 3, but confirm if Sarah considers this a reliability issue.

5. **`SessionNote.startTime`/`endTime` timezone migration backfill** — Do existing notes' time fields need to be backfilled (lossy — we don't know the original timezone), or do we accept that historical notes display in UTC and only new sessions get timezone-aware storage? Recommend accept-and-move-forward (no backfill), but confirm with Andrew.

---

## Sequenced executor briefings

The next two dispatches Andrew should run:

### Dispatch A — Sync reliability sweep (P1, highest priority)

**When to run:** Immediately. This resolves Sarah's #1 priority before the next session.

**Scope blob for the Composer 2.5 subagent:**

> Read `docs/RECORDER-LIFECYCLE.md`, `docs/WHITEBOARD-STATUS.md`, and `docs/LIVE-AV.md` before touching any code.
>
> **Task:** Audit and fix the whiteboard sync pipeline to resolve B1–B4 from the 2026-05-26 Sarah smoke:
> - B1: sync-to-tutor checkbox (student side) has no effect — `follow tutor view` mode broken
> - B2: sync button on student side does not snap to tutor's current view
> - B3: last stroke on tutor side not syncing to student until page change
> - B4: tutor-side image/PDF inserts not appearing on student side until page change
>
> Investigation approach:
> 1. Read `src/lib/whiteboard/excalidraw-adapter.ts` — is the tutor client emitting incremental `add`/`update`/`remove` events in real-time, or only on page change?
> 2. Read `src/app/w/[joinToken]/StudentWhiteboardClient.tsx` — is the student applying incremental sync events, or relying only on the welcome-packet snapshot?
> 3. Read `src/lib/whiteboard/sync-client.ts` — is `WHITEBOARD_SYNC_URL` event forwarding working in all directions?
> 4. Check the `shouldCaptureWB` FSM output — is it correctly set to `true` during a live session? If the FSM is not in a recording/live state, sync events may be gated out.
> 5. Check `pageViewState` envelopes — are they being sent only on page switch, or continuously?
>
> Do NOT change the relay (`whiteboard-sync` sibling repo). The relay architecture is correct.
>
> Deliver: branch `fix/whiteboard-sync-b1-b4`; smoke checklist for manual verification; update `docs/whiteboard-smoke-log.md` with findings.

**Model:** `composer-2.5`. **Tier:** Composer. **Estimated:** 3–5h.

---

### Dispatch B — Solo mode production enable (P4)

**When to run:** After Dispatch A is smoke-passed (or in parallel if separate files).

**Scope blob for the Composer 2.5 subagent:**

> Read `docs/RECORDER-LIFECYCLE.md` and `docs/LIVE-AV.md` before touching any code. Also read `src/lib/recording/lifecycle-machine.ts` (FSM) and `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx` (workspace host).
>
> **Task:** Enable solo / in-person tutor mode as a first-class v1 feature. Sarah explicitly asked for this on 2026-05-26 (disabled in production right now).
>
> Changes needed:
> 1. **Schema (additive migration):** Add `sessionMode String @default("live")` to `WhiteboardSession` in `prisma/schema.prisma`. Generate and apply migration.
> 2. **Session creation modal:** Update `ConsentModal.tsx` (or `StartWhiteboardSession` entry point) to show a mode picker before the consent checkbox:
>    - "Live session — student joins with a link" (default)
>    - "Solo / in-person — recording only, no remote student"
>    Pass the selected mode to `createWhiteboardSession` server action; store it on the session row.
> 3. **Consent copy:** For `sessionMode === "solo"`, change consent text to: "My student is present in-person and has consented to audio and whiteboard recording of this session." Keep the existing `consentAcknowledged: Boolean` field.
> 4. **Workspace integration:** In `WhiteboardWorkspaceClient.tsx`:
>    - Pass `soloEnabled: session.sessionMode === "solo"` to `evaluateLifecycle`. (Currently `soloEnabled` is wired to `!!syncEnabled`; change to use session mode instead, OR keep as `session.sessionMode === "solo" || !syncEnabled` for backwards compat.)
>    - When `session.sessionMode === "solo"`: do NOT start the sync client connection; do NOT mount `useLiveAV`; hide the "Waiting for student" banner; hide the "Copy student link" button; set `bothConnectedAt` immediately at session start (no waiting for student ping).
> 5. **Logging:** Add `sessionMode=<mode>` to the session-start log line (`wbsid=...`).
>
> Do NOT change the FSM logic — it already handles `soloEnabled=true` correctly (armed with solo grace, no participant wait).
>
> Deliver: branch `feat/solo-mode-production`; smoke checklist (start a solo session, record 2 min of audio, end session, verify note generation works); NO changes to existing live-session flow.

**Model:** `composer-2.5`. **Tier:** Composer. **Estimated:** 2–3h.

---

## Cost-discipline summary

| Phase | Work | Tier | Estimated |
|---|---|---|---|
| P1 | Sync B1–B4 sweep | Composer 2.5 | 3–5h |
| P2+P3 | IDB audio durability | Composer 2.5 | 4–6h |
| P4 | Solo mode enable | Composer 2.5 | 2–3h |
| P5+P6 | Device/peer fixes + logging | Composer 2.5 | 2–3h |
| P7 | Session log data model | Sonnet | 3–4h |
| P8 | Session log backend + export | Composer 2.5 | 3–4h |
| P9 | Student mobile redesign | Sonnet + Composer | 6–10h |
| P10+P11 | Session log UI + URL redirects | Composer 2.5 | 4–6h |
| P12 | Student accounts + consent (Wave 5) | Sonnet + Composer | 10–15h |

**Wave 1 total (P1–P6):** ~14–22 Composer 2.5 hours.
**Wave 2.5 total (P7–P8):** ~6–8 hours (Sonnet + Composer mix).
**Wave 3 (P9–P11):** ~10–16 hours.

Sonnet-class items are P7 (auth-boundary + clock reasoning), P9 (cross-cutting mobile + iOS Safari + Excalidraw), and P12 (new auth boundary + entity). Everything else defaults to Composer 2.5.

---

## Maintenance

- **Cross-link:** The design doc (`docs/RELIABILITY-REDESIGN-2026-05-27.md`) should be @-referenced in any executor dispatch that touches a surface covered here.
- **Wave updates:** When executor branches ship items from this plan, update [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md) to reflect the new wave structure (Wave 2.5, expanded Wave 3 scope).
- **Surface 7 unblock:** When Sarah shares Wyzant + UVU form artifacts, dispatch the export formatter implementation immediately. Don't wait until session log UI is ready.
- **Session log UI timing:** Can ship when P7+P8 land (backend ready). Does not need to wait for the full Wave 3 brand refresh unless Andrew prefers one coordinated visual release.
