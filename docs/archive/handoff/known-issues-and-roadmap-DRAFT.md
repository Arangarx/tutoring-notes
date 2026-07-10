# Known issues & roadmap — DRAFT (review only)

> **DRAFT — not shipped; you decide placement + final tone**
>
> This is a **content draft** synthesized from [`wb-wave5-execution-queue.md`](wb-wave5-execution-queue.md) (shipped-vs-open split as of 2026-07-05 overnight run on `wb-wave5-polish`, tip `28acea9`). **Placement is an open decision for Andrew:** in-app page (e.g. Help or Settings → “What’s new & known issues”) vs internal-only doc vs email to Sarah. The tone below is a **first pass at pilot-facing** copy — warm, plain-language, non-technical, reassuring (Sarah is a non-engineer tutor). Review for accuracy, omissions, and whether anything here is too internal or too alarming.

---

## Recently improved

*What you’ll notice in the app after this update wave.*

- Your session notes are ready almost immediately when you end a session, instead of taking a while.
- Session replays now play back smoothly as one continuous recording.
- Replays start from the beginning when you open them.
- You can scrub through a replay and land where you drop the playhead — it no longer jumps back to the start on longer recordings.
- Ending a session from your sessions list or the resume screen now saves your full recording, the same as ending from inside a live session.
- You can cancel or leave from the waiting room if plans change before a session starts.
- The app remembers your microphone choice more reliably, including when a device was briefly unavailable.
- Students can boost their own microphone volume when they need to be heard more clearly.
- When you mute yourself, your voice stays muted in the session recording too.
- Billable time is rounded to your chosen increment and locked in when a session ends; you can set your defaults under billing settings.
- Time-alert controls use clearer labels so you know what the alert does.
- Drawing style controls now show only the options that apply to the tool you’re using — no more sliders that don’t change pencil strokes.
- When you have more board tabs than fit on screen, you can scroll to reach the rest.
- Friendlier messages throughout — clearer saving status, reconnection text, error screens with a way forward, and plain-language notes when something is still preparing.
- If the app hits a loading glitch after an update, it tries to recover on its own instead of leaving you stuck.
- Your recording is better protected if you accidentally close the browser tab mid-session and come back to finish.

---

## Known issues we’re still working on

*Honest, low-alarm notes on things that may still come up. We’re on it.*

- **PDF boards — occasional stray mark:** Very rarely, after importing a PDF onto the whiteboard, a pen stroke from another board can appear on the new page. It’s intermittent and we’re working on a fix; refreshing or undoing usually clears it for now.
- **Student microphone boost — final check:** Students can adjust their own mic volume in the app; we’re doing one more round of real two-device testing to make sure tutors consistently hear the boost before we call this fully done.
- **Status badge during a session:** The top bar can still say “LIVE” even when you’re waiting for a student or paused — we’re wiring it to show the real session state.
- **Connection status visibility:** When sync is having trouble, the indicator can be hard to see; we’re making that more obvious so you’re not left guessing.
- **In-person sessions — waiting message:** Starting an in-person session can still show copy meant for waiting on a remote student; we’re fixing that wording.
- **Empty review screen:** If a session ended with little or no saved audio or notes, the review screen can look blank even though nothing is “broken” — we’re improving that empty state so it’s clear what happened.

---

## Roadmap / coming soon

*Direction, not dates — we’ll share more as pieces land.*

- A **tutor settings** area where you can set defaults once (time alerts, billing rounding, drawing preferences, and similar) instead of hunting for each control.
- **Smoother automatic updates** so you’re always on the latest version without hard-refreshing — including gentle prompts between sessions, without interrupting a recording in progress.
- **Richer billing options** per session and clearer billing summaries where parents see session time.
- Continued polish on **session review**, **waiting-room**, and **error recovery** flows so you never feel trapped or unsure what to do next.

---

## Appendix — Internal engineering reference (not for Sarah)

Compact map from pilot-facing bullets → workstream code + landing commit on `wb-wave5-polish`. Full specs: [`wb-wave5-execution-queue.md`](wb-wave5-execution-queue.md).

### Recently improved

| Sarah-facing bullet (paraphrase) | WS-* | Commit |
|---|---|---|
| Notes ready ~immediately at end | WS-K | [`859f695`](https://github.com/Arangarx/tutoring-notes/commit/859f695) |
| Replay plays as one continuous recording | WS-G | [`d20ea9a`](https://github.com/Arangarx/tutoring-notes/commit/d20ea9a) |
| Replays start from beginning | WS-W | [`610ee90`](https://github.com/Arangarx/tutoring-notes/commit/610ee90) |
| Scrub lands on drop (not t=0) | WS-L | [`6799aa4`](https://github.com/Arangarx/tutoring-notes/commit/6799aa4) |
| Gate/roster End saves full recording | WS-N4 | [`0df4bf3`](https://github.com/Arangarx/tutoring-notes/commit/0df4bf3) |
| Waiting-room cancel / leave | WS-F | [`7bff936`](https://github.com/Arangarx/tutoring-notes/commit/7bff936) |
| Mic choice persistence | WS-H | [`c26f7ce`](https://github.com/Arangarx/tutoring-notes/commit/c26f7ce) |
| Student self mic boost | WS-M | [`3947728`](https://github.com/Arangarx/tutoring-notes/commit/3947728) |
| Tutor mute honored in recording | WS-I | [`f748ef7`](https://github.com/Arangarx/tutoring-notes/commit/f748ef7) |
| Billable rounding + settings UI | WS-J | [`1d23fc6`](https://github.com/Arangarx/tutoring-notes/commit/1d23fc6) |
| Time-alert copy / hint | WS-Q (copy slice) | [`4ac69d4`](https://github.com/Arangarx/tutoring-notes/commit/4ac69d4) |
| Roughness/roundness hidden for pencil | WS-R | [`8e23324`](https://github.com/Arangarx/tutoring-notes/commit/8e23324) |
| Board-tab overflow scroll | WS-O | [`82c0d40`](https://github.com/Arangarx/tutoring-notes/commit/82c0d40) |
| Friendlier copy / nav / confirms (9 items) | WS-U-COPY | [`dfe1bf4`](https://github.com/Arangarx/tutoring-notes/commit/dfe1bf4) |
| ChunkLoadError one-shot reload + footer SHA + `/api/version` | WS-P (deliv. 1/3/4) | [`b386ef6`](https://github.com/Arangarx/tutoring-notes/commit/b386ef6) |
| Tab-kill audio durability (enqueue-at-cut, drain, register) | WS-N (N1–N3, F-2) | [`32c95a7`](https://github.com/Arangarx/tutoring-notes/commit/32c95a7) (+ registerOk race [`6799aa4`](https://github.com/Arangarx/tutoring-notes/commit/6799aa4)) |

### Known issues / in progress

| Sarah-facing bullet (paraphrase) | WS-* | Status / note |
|---|---|---|
| PDF stray pen mark (intermittent) | WS-X | PARKED; WIP branch `wb-wave5-ws-x-wip` @ [`5d80ea8`](https://github.com/Arangarx/tutoring-notes/commit/5d80ea8); v3-broadcast `isDeleted` hypothesis |
| Student boost needs two-device smoke | WS-M | SHIPPED code; hardware verify before master merge |
| Hardcoded LIVE badge | WS-U-FRAGILE 2.4 | OPEN; FSM presentation wiring |
| Hidden sync pill | WS-U-FRAGILE 2.5 | OPEN; `sync-pill-presentation.ts` |
| In-person waiting copy wrong | WS-U-FRAGILE 1.3 | OPEN; `lifecycle-machine.ts` presentation |
| Empty review looks broken | WS-S + WS-U 1.4 | WS-S verified no hydrate bug; empty-state UX + WS-N4 loss path |

### Roadmap / deferred

| Theme | WS-* | Note |
|---|---|---|
| Tutor settings surface (alerts, rounding, etc.) | WS-Q (config slice) | Deferred Andrew-gates; parent theme with WS-J `/admin/settings/billing` |
| Auto-update poll + defer during live session | WS-P (deliv. 2) | PARKED on WS-P-A / WS-P-B; Skew Protection = Andrew dashboard action |
| Richer per-session billing | WS-J FOR-ANDREW | J-1..J-4 defaults + IN_PERSON pause semantics (N4/N5) |
| UX batch (exit confirm, nav rename, consent pages, …) | WS-U-BATCH | Taste/judgment — no auto-fix |

### Intentionally omitted from Sarah-facing sections

| Item | Why omitted |
|---|---|
| WS-A F-1 outbox register attempt cap | Internal reliability; no user-visible symptom under normal conditions |
| WS-N5 resume FSM armed stroke window | Edge-case stroke gap; folded into engineering queue |
| Prisma migrations not applied to prod (WS-K/G/J) | Infra / cut gate — not pilot-facing |
| WS-P footer short SHA | Developer/diagnostic affordance |
| WS-G immediate-first-review concat lag | Brief multi-segment fallback until concat async completes; judged too technical unless Andrew wants a “replay preparing” note |
| SEC tutor-asset origin pin | Security backlog |
| Phase-2 test-harness follow-ups | Test-only |
| WS-A/B/C/D overnight pillars (VAD, persist, end→review, resume) | Largely invisible infrastructure; partial overlap with bullets above (WS-N, WS-L, gate paths) |
