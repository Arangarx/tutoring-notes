# Phase 2 student shell — smoke triage (2026-06-17)

Andrew smoked the Phase-2 student-on-new-shell build (`phase2/wb-student-new-shell`, deployed tip [`5a04689`](https://github.com/Arangarx/tutoring-notes/commit/5a04689)) on real hardware 2026-06-17. The run **FAILED** with a broad regression cluster. Many issues are **shared-chrome regressions** of previously-solved behavior (not student-specific). Disconnect-resize fix [`974fc87`](https://github.com/Arangarx/tutoring-notes/commit/974fc87) and Exit-disconnect fix [`574fae9`](https://github.com/Arangarx/tutoring-notes/commit/574fae9) both proved **ineffective**. Raw smoke notes: [`phase-2-student-new-shell-smokebook-2026-06-16.md`](phase-2-student-new-shell-smokebook-2026-06-16.md) on `phase2/wb-student-new-shell` (committed [`f138dab`](https://github.com/Arangarx/tutoring-notes/commit/f138dab)).

---

## TIER 0 — Data integrity / presence (highest severity)

| ID | Symptom | Smoke item | Scope |
|---|---|---|---|
| **BLEED** | Cross-page stroke bleed **regression** — strokes from Board 2 appeared on Board 3 (PDF page-1 board) after import. Andrew: "solved TWICE"; data separation not honored. | 4 | Shared-chrome / engine |
| **PRESENCE** | Presence desync — student shows as connected on their own side but **DISCONNECTED** on tutor side (wife stepped away; also after Exit→rejoin tutor still shows disconnected). | 0, 1b-exit | Shared / A-V |

---

## TIER 1 — A/V regressions (previously working)

| ID | Symptom | Smoke item | Scope |
|---|---|---|---|
| **AV-NOVIDEO-STUDENT** | Student sees **no video at all** (neither self-view nor remote tutor). Tutor eventually sees student video only after several cold starts. | 0, 7, 8, 9 | Student path (related to shared cluster) |
| **AV-DISCONNECT-RESIZE** | When a peer leaves, the A/V cluster does **not** shrink — remaining (tutor) video grows to fill. [`974fc87`](https://github.com/Arangarx/tutoring-notes/commit/974fc87) was supposed to fix this and **did not**. | (chat) | Shared |
| **AV-NOCAM-INITIALS** | A peer with no camera shows blank empty space with **no initials avatar** until a manual resize, at which point initials pop in. Behaves differently from a real video stream arriving. Same paint/reflow family as the AV video-paint bandaid ([`3b996ae`](https://github.com/Arangarx/tutoring-notes/commit/3b996ae)). | (chat), 1b-exit ("waiting for video instead of initials") | Shared |
| **AV-TILE-FLASH** | Video tiles flash briefly then disappear. | 0 | Shared |
| **AV-REFRESH-LOSS** | Student hard-refresh loses **all** A/V (cam+mic not re-recognized); replugging device does not re-hook. | 9 | Student / A-V |
| **AV-AUDIO-INDICATOR-BLINK** | On desktop student, the top-bar tab audio indicator rapidly blinks/flashes instead of staying solid. Andrew wonders if related to student having no camera. Needs investigation. | (chat) | Student / A-V |
| **AV-HOTLOAD-AUDIO** | Device hotload — newly plugged camera worked (student could switch to it); but newly plugged audio device, when selected, sends **no sound** (doesn't hook up); unplugged device is not removed from picker; no Teams-style "switch to new device?" prompt. | 8b | Shared / A-V |

---

## TIER 1 — Tool regressions (previously working)

| ID | Symptom | Smoke item | Scope |
|---|---|---|---|
| **ERASE-TUTOR** | Eraser does **not work at all** for the **tutor**, but works well for the student. Escalates existing **WB-ERASE-RELIABILITY** — now known tutor-path-specific in new chrome. | (chat) | Shared / tutor |
| **UNDO-REDO** | Undo/redo does nothing for **both** tutor and student. | 1b, 1c | Shared |
| **LASER** | Laser broken — both roles render the **same color** (not distinct tutor vs student), neither is the original red, and the tutor **cannot see** the student's laser at all (student **can** see tutor's). D2 delta failed. | 0, 1b, 1d | Shared + student-delta |
| **RIGHTCLICK-END-LINE** | Right-click to end a line/arrow (finish multi-point shape) does not work for the student; needs to work for student too. | (chat) | Student parity |

---

## TIER 2 — Chrome layout (mostly student)

| ID | Symptom | Smoke item | Scope |
|---|---|---|---|
| **CHROME-OVERFLOW** | Student top bar overflows — controls pushed off-screen, especially with the recording-disclosure message present; can't see past the "Connected" pill; student loses tools/controls unless the window is fullscreen. | 0, 1b, 2 | Student chrome |
| **STYLES-MISSING** | Student styles panel — "more styles" section absent; shapes dropdown missing (only the line button shows, no shape picker); current-selection style display not visible on desktop (it at least partially showed on phone). | 0, 1b | Student chrome |
| **MOBILE-BROKEN** | Mobile/portrait student layout is largely broken — many tools missing, top bar off-screen. Andrew: mobile should rearrange basically the same way the tutor's does. | 1, 2, 11 (SKIP) | Student chrome / responsive — **not done** |
| **THEME-DARK-BG** | After student switches light→dark, the canvas **background** stays white (strokes switch theme, background does not). | 12 | Shared chrome |

---

## TIER 3 — Polish / design (lower severity; some deferrable)

| ID | Symptom | Smoke item | Scope |
|---|---|---|---|
| **EXIT-CORAL** | Andrew prefers a **coral Exit button with an exit icon** (as before) over the plain word "Exit"; at minimum a coral button even if it keeps text. | 1b | Student chrome (polish) |
| **MATCH-VIEW-BTN** | "Match tutor's view" button could be much smaller; find icons that convey stay-synced vs one-time-sync without taking so much space. | 6 | Student chrome (polish) |
| **TAB-HIGHLIGHT-Q** | **Open question:** Should the student's active board tab be highlighted at all if it is not clickable? | 1c | Student chrome — **do not decide** |
| **GRAPH-EXPR-Q** | **Open question:** Should students be able to enter their own graph expressions on embeds (vs strictly read-only)? Andrew mused a tutor might want a student to graph something. | 5 | Student parity — **do not decide** |
| **PDF-RESOLUTION** | Student at a different resolution sees a different crop/amount of an inserted PDF; possibly nothing to do. | 4 | Student / embed — low severity |
