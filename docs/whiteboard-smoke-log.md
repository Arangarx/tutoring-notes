# Tutoring-notes whiteboard — manual smoke log

**Canonical copy lives in this app repo** (`docs/whiteboard-smoke-log.md`). **tutoring-notes** is the main product folder (Next.js app, backlog, phase docs). Update this file when you run manual smoke or capture pilot quotes.

**Keep in lockstep** — same agent session, same pass:

| Artifact | Where |
|----------|--------|
| Engineering checklist (W-items + smoke fold table) | `tutoring-notes/.cursor/plans/WHITEBOARD-IMPROVEMENT-PLAN.md` (+ `whiteboard_improvement_execution.plan.md` for Cursor **Build**) |
| Phase handoff + adversarial list | `docs/WHITEBOARD-STATUS.md` |
| Implementation queue rows | `docs/BACKLOG.md` |

**`whiteboard-sync`** is a **sibling repo** with only the Fly.io **Socket.IO relay** — not part of the app, not a “second product.” It stays separate so a long-lived Node relay is not shipped inside the Vercel Next deployment. See `docs/AGENT-BOOTSTRAP.md` §2.

---

## Pending manual smoke (queue — re-run before pilot / release)

These are **not** re-smoked in CI yet; run in a real browser when touching whiteboard reliability.

**Solo rehearsal with live sync configured:** Set `NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT=1` in `.env.local`. Recording can start before anyone joins until the first peer has **ever** connected this session after that tutor opened the workspace — then Sarah’s disconnect pause rules apply again.
| Track | What changed in code | What to verify manually |
|-------|----------------------|-------------------------|
| **W-audio** — workspace mic → Blob → DB | Tutor workspace mounts **`WhiteboardWorkspaceAudioBridge`**: `useAudioRecorder` uploads via **`uploadAudioDirect`**, then **`registerWhiteboardSessionAudioSegmentAction`** links each segment to **`whiteboardSessionId`**. Recording **pauses** when live sync is on and the student drops (**`MediaRecorder.pause`**); **resume** on reconnect. Manual **Pause** / **End session** flushes a final segment; end flow **awaits** pending register calls before building events JSON. Mic **meter / device picker** not in the toolbar yet (headless). | **Solo (no sync URL):** Start recording → speak → Pause → confirm **Generate notes from whiteboard** (or DB) sees ≥1 **`SessionRecording`** for this session. **With sync:** two clients → Start → both present → audio level/time advances → disconnect student → recording **pauses** (no endless capture) → reconnect → resumes. **End session** shortly after speaking → replay / notes path still has audio. |
| **W2** — native image | Tutor `onChange`: after Blob upload for Excalidraw drag/drop / paste / library images, we sync `pageDataRef`, push `customData.assetUrl` into the recorder, `flushThrottledFrameNow`, then v3 document broadcast — fixes student placeholder tiles when tutor inserts without the PDF toolbar. **Student join page:** after upload, `syncActivePageElements` + `updateScene` so local page cache matches URLs before re-broadcast. | With **`WHITEBOARD_SYNC_URL` set**: tutor drags a PNG from disk → student sees the bitmap (not a broken tile). **Student** pastes/drops an image → tutor sees it. Repeat: **menu insert image**, **paste**. **Solo**: replay loads from events + Blob. |
| **W6** — refresh durability | Tutor workspace: **`pagehide`**, **`visibilitychange` → hidden**, and **`beforeunload`** flush the full multi-page board document to `sessionStorage` immediately (not only the 800 ms debounced save). | Hard-refresh **within 1 s** of drawing on **page 2** (or after PDF insert): scene + page list should match **without** tapping Excalidraw’s **“Load draft into board”** when possible. Still compare against that banner — we have not removed Excalidraw’s own recovery UX. |
| **Playwright** | `tests/smoke/whiteboard-workspace.spec.ts`: (1) DB-seeded session → **Excalidraw mount**; (2) consent → workspace runs only when **`BLOB_READ_WRITE_TOKEN`** is in `.env` (skipped otherwise). Playwright **webServer must start** (DB per `playwright.config.ts`). | Run: `npx playwright test tests/smoke/whiteboard-workspace.spec.ts --project=desktop`. |

---

## 2026-04 — session notes

### Core smoke (earlier run)

| Step | Result | Notes |
|------|--------|--------|
| 1 Tutor draws P1 | **Pass** | Console acceptable |
| 2 Student opens link | **Pass** | Sees tutor shape |
| 3 Second stroke | **Pass** | Syncs while drawing |
| 4 Tutor P2 | **Pass (caveat)** | Student sees P2; **student cannot switch pages freely** (e.g. P1 disabled / follow) |
| 5 Rapid switch+draw | **Pass (slow)** | Quick switch historically bled; slow path OK |
| 6 Student alone on P2 | **N/A** | UI blocks independent student page switch |
| 7 Student hard refresh | **Pass** | Shapes OK tutor on P1 or P2 |
| 8 Tutor hard refresh + Resume | **Pass** | Resume gate OK; **first run did not try refresh starting on P2** |

### Follow-up: tutor refresh on Page 2

- **First report:** After tutor hard refresh from **P2**, **student jumped to P1 with tutor** (active page / follow behavior).
- **Later run:** Hard refresh on P2 → **both** returned to **P2** once; behavior felt inconsistent. **Page 1** may have been missing in some states (needs exact repro).

### Refresh durability vs Excalidraw IndexedDB

- **Observed:** Small shape on P2 → **hard refresh** → **gone for both**; **Page 2 missing** after load.
- **Excalidraw banner:** “Browser recovery (IndexedDB)” — **Load draft into board** / **Discard** (not the stale-session / relay resume dialog).
- **Result:** **Load draft into board** restored the **lost stroke** and **second page** → cold load matched **stale server or incomplete persistence**; **local draft was ahead**.

**Smoke verdict — refresh without draft rescue:** **Partial / fail** until refresh shows same scene as pre-refresh without using Load draft.

### Test 9 — assets

| Case | Result | Notes |
|------|--------|--------|
| Image (drag/drop into Excalidraw) | **Fail** | **Placeholder** (broken image tile) on **tutor and student** |
| PDF insert | **Pass** | Works (eventually) |
| Product idea | **Confirmed (Sarah)** | See **Sarah feedback** below — separate pages + **page picker**; phone **photos** common. |

### Open issues (inventory)

1. **Viewport alignment** — tutor vs student camera/layout; scene data can be fine.
2. **Student page independence** — follow-only vs bug (blocks some scenarios).
3. **Image insert / `files` + URLs** — drag/drop path vs PDF path; placeholders.
4. **Post-refresh hydration** — server snapshot can lag in-memory + IndexedDB draft; document **durability** gap. **Sarah (2026-04-24):** reload/crash should restore **exactly** prior state — **essential**.

### Next checks (optional)

- Image via **menu Insert image** / **paste** vs **Explorer drag** (isolate broken path).
- After “important” edits: **hard refresh without** Load draft — should match if persistence is solid.

---

## Sarah feedback (malmesae) — captured 2026-04-24

*Source: Discord thread (Jarek ↔ malmesae); sent **before** the longer structured questionnaire.*

**Pilot / status (from Jarek’s message to her):** Whiteboard smoke testing in progress; **working**, but **does not record video and audio together yet** (audio/whiteboard timeline integration still in flight).

**PDFs and board structure**

- Wants **PDFs on separate pages** (not one flat canvas with everything piled together).
- **Reference:** Wyzant lets her **choose which pages** of a document to import; she **likes that** and wants the same idea here (import **subset of pages**, not forced whole-document).
- **Materials mix:** A lot of the time they are uploading **photos taken on phones**, not only PDFs — **image-from-phone path** should be first-class (aligns with fixing drag/drop / mobile photo flow, not only PDF toolbar).

### Sarah — structured questionnaire (partial), 2026-04-24 ~4:11 PM

*Source: Discord (malmesae); **only questions she had time for** — remainder TBD.*

| Topic | Verbatim / summary |
|------|---------------------|
| **Board pages** (student mirrors tutor / limited page switching) | **Not sure** if it would bother her; **not a dealbreaker**. |
| **Framing** (zoom/scroll may differ if drawing matches) | **Probably fine** if different, **as long as** they **can see the same thing** (shared content correctness). |
| **Reload / crash** | Wants it **exactly as it was before** — **"pretty essential."** |

*Unanswered this round:* restore-prompt confusion, image insert habit, PDF layout (partially answered earlier: separate pages + page picker), devices, timer, Phase 2 extras, optional one-liner.

---

*Last updated: 2026-05-05 — canonical path: `tutoring-notes/docs/whiteboard-smoke-log.md`; lockstep with STATUS, BACKLOG, WHITEBOARD-IMPROVEMENT-PLAN.*
