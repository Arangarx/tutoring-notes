---
status: CAPTURE COMPLETE — 2026-06-06 evening Discord thread (~10:28–10:43 PM)
authored_by: Composer 2.5 subagent dispatch (Opus orchestrator scope blob)
source: Real live whiteboard tutoring session — Sarah (tutor, Mac + drawing pad) + student (PC)
---

# Sarah pilot feedback capture — 2026-06-06 live session

> **Source.** Discord thread between Andrew (Jarek) and Sarah (`malmesae`),
> 2026-06-06 ~10:28–10:43 PM, immediately after a **real live whiteboard
> tutoring session** (not a smoke call). Sarah = tutor on Mac with drawing
> pad; student on PC. Production surface (not a preview branch for
> parent/child login).
>
> **Method.** Verbatim-first from Andrew's authoritative transcription +
> five Discord screenshots. Sarah's exact words preserved where quoted.
> Andrew's responses + orchestrator triage sit in clearly-marked
> subsections.
>
> **Generalization caveat (n=1).** Same as
> [`sarah-pilot-feedback-2026-05-26-orchestrator-report.md`](sarah-pilot-feedback-2026-05-26-orchestrator-report.md)
> — single pilot user; desktop-to-desktop is the common case here (contrast
> with the 2026-05-26 iPhone-student smoke).
>
> **Complements** the 2026-05-26 capture; does not replace it. This is the
> first Sarah-driven **tutor-side desktop** session feedback at production
> scale.

---

## Screenshots (Discord thread)

| # | File | Content |
|---|------|---------|
| 1 | [`assets/c__Users_arang_AppData_Roaming_Cursor_User_workspaceStorage_be2a7c1bafae5ffb3a11ad1c21e84e64_images_image-4d22f617-8602-4711-9851-e3d8995ca3d9.png`](../assets/c__Users_arang_AppData_Roaming_Cursor_User_workspaceStorage_be2a7c1bafae5ffb3a11ad1c21e84e64_images_image-4d22f617-8602-4711-9851-e3d8995ca3d9.png) | Sarah's full feedback list (what worked + pain points) |
| 2 | [`assets/c__Users_arang_AppData_Roaming_Cursor_User_workspaceStorage_be2a7c1bafae5ffb3a11ad1c21e84e64_images_image-cf5ffc4e-95d1-43c0-98dc-036a1668cf6c.png`](../assets/c__Users_arang_AppData_Roaming_Cursor_User_workspaceStorage_be2a7c1bafae5ffb3a11ad1c21e84e64_images_image-cf5ffc4e-95d1-43c0-98dc-036a1668cf6c.png) | Andrew acknowledges UI debt; Sarah: hard to navigate, not critical |
| 3 | [`assets/c__Users_arang_AppData_Roaming_Cursor_User_workspaceStorage_be2a7c1bafae5ffb3a11ad1c21e84e64_images_image-71a63bdc-4c28-411e-9d1c-f813ef9f69a1.png`](../assets/c__Users_arang_AppData_Roaming_Cursor_User_workspaceStorage_be2a7c1bafae5ffb3a11ad1c21e84e64_images_image-71a63bdc-4c28-411e-9d1c-f813ef9f69a1.png) | Login confusion; couldn't find share button; copy-paste URL |
| 4 | [`assets/c__Users_arang_AppData_Roaming_Cursor_User_workspaceStorage_be2a7c1bafae5ffb3a11ad1c21e84e64_images_image-9a1ec3d9-6a99-4287-975e-f71f19e98cd7.png`](../assets/c__Users_arang_AppData_Roaming_Cursor_User_workspaceStorage_be2a7c1bafae5ffb3a11ad1c21e84e64_images_image-9a1ec3d9-6a99-4287-975e-f71f19e98cd7.png) | Andrew: join link may become unnecessary with student login |
| 5 | [`assets/c__Users_arang_AppData_Roaming_Cursor_User_workspaceStorage_be2a7c1bafae5ffb3a11ad1c21e84e64_images_image-381a59c7-fce7-4d08-b703-e6fac77cddc4.png`](../assets/c__Users_arang_AppData_Roaming_Cursor_User_workspaceStorage_be2a7c1bafae5ffb3a11ad1c21e84e64_images_image-381a59c7-fce7-4d08-b703-e6fac77cddc4.png) | Thread close — good night |

---

## What worked (validation)

Sarah explicitly confirmed the **core loop holds** for a real paid-style
session on desktop:

- **Real-time whiteboard sync** — both tutor and student could read the
  board and see what the other was writing in real time; *"really
  helpful,"* no problems.
- **Drawing pad / tablet** — Sarah used a drawing pad to write on the
  whiteboard; *"really awesome."* **Validates** the May 2026-05-26
  priority #2 (XPPen Star G640 / writing-pad support) for the
  **desktop-tutor** path — no new backlog item; positive signal only.
- **Basics sufficient** — *"It at least has the basics and we were able
  to use it to share and show work."*

**Orchestrator note:** Reliability floor for collab strokes is **good
enough to tutor on**. Remaining pain is overwhelmingly **form** (layout,
chrome, naming, tool UX), not **function** (sync broke the session).

---

## Categorized feedback

| ID | Category | Item | Sarah's words / detail | Severity |
|----|----------|------|------------------------|----------|
| W1 | **Validation** | Real-time sync | Both sides saw live strokes; helpful | — |
| W2 | **Validation** | Drawing pad | Tablet writing worked well | — |
| W3 | **Validation** | Core utility | Basics + share/show work | — |
| B1 | **Bug** | Keyboard undo (Ctrl+Z) | Ctrl+Z *"doesn't work properly"* / *"did weird things"*; on-screen undo/back **did** work | High — daily tool |
| B2 | **Bug** | Copy-link clipboard (probable) | Couldn't find share affordance; resorted to copy-paste URL. Andrew: *"clicking the button didn't copy it to your clipboard?"* — silent failure suspected | High — join friction |
| U1 | **UX-form** | Desktop polish | Needs to be more *"computer-user-friendly"* (Mac tutor + PC student) | Medium — v1 pass |
| U2 | **UX-form** | Whiteboard too small | *"Significantly"* too small on computer | Medium — v1 pass |
| U3 | **UX-form** | Page clutter | Page feels *"cluttered"* / *"crowded"*; wants concise layout; sent **Wyzant** reference image | Medium — v1 pass |
| U4 | **UX-form** | Share button naming | Button named like *"copy student link"* — *"didn't make sense"*; wants *"share link"* or *"copy link"* | Medium — v1 pass |
| U5 | **UX-form** | Pen options dropdown | Pen dropdown *"takes up a quarter of the screen"*; wants compact bar for basics, full menu on-demand | Medium |
| U6 | **UX-form** | Pen stroke size | Wants **smaller** pen; strokes too thick, *"took up a lot of room"* | Medium |
| F1 | **Flow** | End-session discard | Wants **stop and delete** — forced to save a throwaway session after early connection trouble | Medium |
| F2 | **Flow** | Login / join confusion | Thought login was parent/child; was tutor-only; student *"made a login"*; fumbled join-link sharing; student eventually taught Sarah the flow | Medium — identity epic |
| S1 | **Strategic** | Data-wipe OK | *"You are free to wipe that video if you need to"* — test session recording need not be preserved | Note only |
| S2 | **Strategic** | Join link future | Andrew: join link may not be needed once student auth is required | Identity epic |
| S3 | **Strategic** | Andrew context | WB page *"atrocious"* — function first, form now; whiteboard bigger + decluttered in new version; notes *"within seconds"* of end; hotfix if critical | Context |
| S4 | **Strategic** | Sarah sentiment | *"It got the job done… nothing too critical, more just annoyances"* | Positive / patient |

---

## Sarah's overall sentiment

**Patient and positive on the core product.** She framed issues as
*annoyances*, not blockers — the session completed its job. She is
waiting for the UI/form pass Andrew described and did not request an
emergency hotfix tonight.

Andrew told her many layout issues are already in flight on the v1
redesign branch; she acknowledged and went to bed.

---

## Action items — triage vs planned work

| Item | Disposition | Where tracked |
|------|-------------|---------------|
| Real-time sync works | **VALIDATION** — no action | Reinforces Wave 1 reliability north star |
| Drawing pad works | **VALIDATION** — no action | Cross-ref May 2026-05-26 § 2.7 F1 (XPPen) |
| **B1 — Ctrl/Cmd+Z broken on desktop** | **NEW backlog** | [`docs/BACKLOG.md`](../BACKLOG.md) — `pilot-2026-06-06` (extends Apr 2026 shipped undo — on-screen works; keyboard regressed or conflicts) |
| **B2 — Copy/share link silent clipboard failure** | **NEW backlog** | [`docs/BACKLOG.md`](../BACKLOG.md) — `pilot-2026-06-06`; repro on prod Mac |
| **U5 — Pen options panel too large** | **NEW backlog** | [`docs/BACKLOG.md`](../BACKLOG.md) — `pilot-2026-06-06`; fold into v1 toolbar work where possible |
| **U6 — Thinner pen stroke option** | **NEW backlog** | [`docs/BACKLOG.md`](../BACKLOG.md) — `pilot-2026-06-06` |
| **F1 — End-session stop & delete / discard** | **NEW backlog** | [`docs/BACKLOG.md`](../BACKLOG.md) — `pilot-2026-06-06` |
| **U2 — Whiteboard too small** | **ALREADY COVERED** | v1 component redesign — workspace maximal canvas ([`v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md) § Workspace; Sarah May 2026-05-26 Wyzant ~85–90% decision) |
| **U3 — Clutter / Wyzant-like layout** | **ALREADY COVERED** | Same v1 workspace pass + May 2026-05-26 § 3 locked *Wyzant-shaped* |
| **U4 — Rename share button** | **ALREADY COVERED** | v1 workspace spec labels control **Share link** (not "Copy student link") |
| **U1 — Computer-user-friendly** | **ALREADY COVERED** | v1 UI/whiteboard redesign pass (form tranche Andrew described live) |
| **F2 — Login / join-link confusion** | **ALREADY COVERED** | Identity / access V1 epic ([`v1-redesign-STATUS.md`](v1-redesign-STATUS.md), [`session-identity-access-design-2026-05-31.md`](session-identity-access-design-2026-05-31.md)); parent/child sub-logins **not** on prod yet |
| **S2 — Join link may be removed** | **ALREADY COVERED** | Identity epic — student login replaces anonymous `/w/[token]` bearer join |
| Notes ready seconds after end | **ALREADY COVERED** | Recording re-architecture + async post-session transcription ([`recording-rearchitecture-design-2026-06-05.md`](recording-rearchitecture-design-2026-06-05.md); [`BACKLOG.md`](../BACKLOG.md) § V1 marketing — async transcription row) |
| **S1 — OK to wipe test video** | **RECORD ONLY** | Does **not** change ratified migrate-forward / Sarah-data-preservation policy — explicit consent to discard **this** throwaway test recording if needed for technical work |

---

## Andrew responses (context, not Sarah quotes)

- Acknowledged WB page UI is poor today; focusing on **form** after
  **function**.
- Promised whiteboard **much bigger** and **decluttered** in the new
  version.
- Offered live hotfix if anything were critical; Sarah declined —
  annoyances only.
- Described upcoming architecture: notes ready **within seconds** of
  session end.
- Mentioned full login system (tutor / parent / child sub-logins) —
  parent/child **not pushed to prod** at session time.
- Future: join link may be unnecessary once students must log in.

---

## Open follow-ups

| Item | Status |
|------|--------|
| Repro B1 (Ctrl+Z) on tutor Mac + student PC | **NEW** — desktop regression |
| Repro B2 (clipboard) on prod — click share, verify clipboard + toast | **NEW** |
| Sarah-drives-tutor-side (methodology) | **Still open** from 2026-05-26 — this session partially closes the gap (Sarah was tutor on desktop) |
| Wyzant reference image from this thread | **Check Discord** — Sarah said she sent Wyzant layout reference; capture to `assets/sarah-pilot-feedback-2026-06-06/` if not already in repo |

---

## Changelog

- **2026-06-06:** Initial capture from Discord thread + Andrew
  transcription. Backlog triage + `SARAH-CALL-PREP.md` pointer.
