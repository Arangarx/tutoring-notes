# Phase 2 — iOS Safari real-hardware smoke matrix

> **Wave 1 BLOCKER-PROD** — axis 4 cross-platform parity (`docs/BACKLOG.md` reliability gap **#10**). Sarah uses an **iPhone** for some sessions; iOS Safari behavior is **unknown or partly broken** (Record → Transcribe failures with **no server `rid=`**, reload vs fresh-navigation divergence). This matrix is the **canonical runnable checklist** Andrew fills on real hardware; it becomes the living **iOS limitations** doc as rows are ticked.

**Companion:** Long-form transcribe ceiling smoke — `docs/SMOKE-LONG-FORM-TRANSCRIBE.md` (**S7** below). Live-A/V opportunistic checks — **S11**, **S12**, plus BACKLOG **AVTile Tap to hear** + **Workspace SSR 500**.

**Do not edit `docs/BACKLOG.md` during the smoke pass** — file Fail/Partial rows here first, then a separate dispatch adds BACKLOG entries with matrix row IDs.

---

## 1. Purpose

Prove Mynk is **trustworthy on iOS Safari** for the pilot path Sarah actually uses — or document **explicit limitations** so she is not surprised mid-session.

**Dispositive sub-test (Wave 1 gate):** On **Sarah's iPhone** (or Andrew's iPhone standing in until Sarah's device is available), **S3 + S4 + S7** must **Pass** or the failure must be **accepted as a documented limitation** with a workaround (e.g. Upload + desktop transcribe). Silent breakage blocks Wave 1.

**Pre-fix baseline:** Several scenarios test **current** behavior while fixes are still in Backlog (#1 refresh recovery, #7 hot-swap mic). Mark **baseline** in Notes — do not fail the matrix because a fix is not shipped yet; capture what happens **today**.

---

## 2. Devices and browsers in scope

### 2.1 In scope

| Slot | Device | Fill when run |
|------|--------|---------------|
| D1 | **iPhone** (Andrew primary) | Model: ______ · iOS: ______ |
| D2 | **Sarah's iPhone** (pilot) | Model: ______ · iOS: ______ |
| D3 | **iPad** (if available) | Model: ______ · iPadOS: ______ |

| Browser | Notes |
|---------|--------|
| **Safari** (latest stable on each device) | Primary — WebKit engine for all iOS browsers. |
| **Older iOS Safari** | Only if Sarah reproduces on a specific version — add a D4 row. |

### 2.2 Out of scope (unless Andrew explicitly cares)

| Item | Why |
|------|-----|
| Chrome / Firefox / Edge on iOS | Same WebKit as Safari; low marginal signal. |
| Android Chrome | Covered separately in BACKLOG #11; not this matrix. |
| Desktop Safari | Useful for Web Inspector pairing; not a substitute for D1–D2. |

### 2.3 Remote debugging (recommended)

| Setup | Use |
|-------|-----|
| **Mac + USB** → iPhone → Safari → Develop menu | Console errors, network waterfall, `rid=` not visible client-side but Server Action POSTs visible. |
| **No Mac** | iOS **Screen Recording** + screenshots; copy UI **Ref:** lines from errors. |

---

## 3. Test scenarios (S1–S13)

For each row: run **Steps**, compare to **Expected**, if mismatch capture per **§4**.

---

### S1 — Login + signup flow

| | |
|---|---|
| **Steps** | 1. Private tab or logged-out state. 2. Open `/login` (or signup from marketing home). 3. Complete email/password or OAuth flow Sarah uses. 4. Land in admin/student area. |
| **Expected** | Auth completes without blank page, infinite spinner, or "unexpected response". Session cookie persists on **fresh navigation** (not only reload). |
| **Routes** | `src/app/login/…`, NextAuth callbacks |
| **Baseline risks** | bfcache, ITP, third-party cookie restrictions (usually N/A for same-site). |

---

### S2 — Mic permission grant + revoke

| | |
|---|---|
| **Steps** | 1. Open `/admin/students/<id>` → Record tab. 2. Grant mic when prompted. 3. iOS Settings → Safari → Microphone → Deny (or reset). 4. Return to app → revoke/re-grant via UI. |
| **Expected** | Clear copy when denied; **Start recording** can re-prompt. `navigator.permissions.query` path: auto-acquire when already granted (`AiAssistPanel` / `AudioRecordInput`). |
| **Capture if fail** | Whether picker shows "Unknown device"; whether meter moves at 3.00× boost. |

---

### S3 — Solo recording start (Sarah-critical)

| | |
|---|---|
| **Steps** | 1. Record tab → confirm **Input:** device name. 2. **Start recording** → speak 15+ s. 3. Confirm timer advances, meter moves, state = recording. |
| **Expected** | `MediaRecorder` starts (likely **audio/mp4** on iOS — `src/lib/recording/mime.ts`). No timeslice fragmentation guard violated. FSM: recording active; segment counter sane. |
| **Logs** | If Mac attached: console for recorder errors; Vercel only after upload/transcribe. |
| **Baseline** | iOS timer may drift when screen locks (BACKLOG timer item) — note separately, not an S3 fail unless capture stops. |

---

### S4 — Solo recording stop / End session (Sarah-critical)

| | |
|---|---|
| **Steps** | 1. From S3, **Stop** → segment appears in pending list. 2. If testing whiteboard path: workspace **End session** → review/recap loads. 3. Confirm audio uploaded (pending → blob URL) and recap UI visible. |
| **Expected** | Segment in pending list with playable preview (`AudioPreview`). Atomic end-session path succeeds for whiteboard; **no silent data loss** on stop. |
| **Whiteboard** | `/admin/students/<id>/whiteboard/<wbsid>/workspace` → End → `/review` |
| **Baseline** | #1 refresh mid-record **not** required to pass S4 — that's S6. |

---

### S5 — Hot-swap mic mid-session

| | |
|---|---|
| **Steps** | 1. Start recording with Bluetooth headset. 2. Mid-session: disconnect BT / unplug wired headset. 3. Reconnect or switch to built-in mic. 4. Continue 30 s → stop. |
| **Expected (today)** | **Pre-fix baseline** — BACKLOG **#7**: may record silence with **no banner**. Capture actual behavior. |
| **Future** | Pause + explicit "mic lost" copy when #7 ships. |

---

### S6 — Refresh during recording

| | |
|---|---|
| **Steps** | 1. Start recording. 2. Hard refresh or close tab → reopen same student URL. |
| **Expected (today)** | **Pre-fix baseline** — BACKLOG **#1**: in-progress segment likely **lost**; recovery banner absent or incomplete. |
| **Capture** | Whether any IDB/local blob survives; whether UI offers resume. |

---

### S7 — Long-form transcribe on iOS Safari (Sarah-critical)

| | |
|---|---|
| **Steps** | 1. Complete S3–S4 (or Upload long audio). 2. Tap **Transcribe & generate notes**. 3. Wait full wall-clock (may take several minutes). |
| **Expected** | Same as `docs/SMOKE-LONG-FORM-TRANSCRIBE.md` pass criteria **on iOS**. UI shows success or **actionable** error with **Ref:** / `rid=` if server reached. |
| **Failure modes** | "Unexpected response" **without** Vercel `rid=` → WebKit Server Action transport (Sarah Apr thread). Timeout → may be 300s or iOS connection drop. |
| **Pair** | Run desktop Preview smoke first; iOS compares. |

---

### S8 — Recap edit

| | |
|---|---|
| **Steps** | 1. Open note with AI-filled or manual recap fields. 2. Edit Topics/Homework/etc. on iPhone. 3. Scroll long content, tap inputs, save. |
| **Expected** | Touch targets usable; keyboard does not obscure fields; save persists after reload. |
| **Routes** | Student note form / recap editor components on admin student page |

---

### S9 — Send to parent (share)

| | |
|---|---|
| **Steps** | 1. Generate parent share link from note/session UI. 2. Copy link (long-press copy). 3. Optional: iOS Share Sheet → Mail/Messages. |
| **Expected** | Token URL copies intact; no truncation; share form submits. |

---

### S10 — Parent share view (received link)

| | |
|---|---|
| **Steps** | 1. On **fresh** iOS Safari (or Sarah's phone as "parent"), open `/s/<token>` from S9. 2. Read recap; play audio; open whiteboard replay if present. |
| **Expected** | Recap renders; **audio plays after user gesture** if autoplay blocked; replay scrubs. |
| **Autoplay** | Tap play if `<audio>` blocked — same class of issue as AVTile. |

---

### S11 — Whiteboard workspace (heavy)

| | |
|---|---|
| **Steps** | 1. Start whiteboard session → workspace. 2. Draw strokes, insert PDF subset, insert math, pan/zoom. 3. Optional: student joins from second device. 4. End session. |
| **Expected** | Canvas usable; address bar resize does not brick layout permanently; PDF insert respects iOS memory warning (`PdfImageUploadButton` iOS copy). |
| **Opportunistic** | **Workspace SSR 500** (BACKLOG): if `GET …/workspace` → 500, capture `X-Vercel-Id` + whether UI recovers. |
| **Routes** | `/admin/students/<id>/whiteboard/<wbsid>/workspace` |

---

### S12 — Live A/V join (student on iOS)

| | |
|---|---|
| **Steps** | 1. Tutor starts workspace with live A/V enabled. 2. Student opens `/w/<joinToken>#k=…` on iPhone. 3. Grant cam/mic; confirm remote audio/video. |
| **Expected** | Tiles render; remote audio audible (may need **Tap to hear audio** — `src/components/av/AVTile.tsx`). |
| **Opportunistic** | BACKLOG **AVTile Tap to hear** + iOS asymmetric audio — document if student hears tutor but not vice versa. |
| **Routes** | `src/app/w/[joinToken]/page.tsx` |

---

### S13 — Mic permissions denied

| | |
|---|---|
| **Steps** | 1. Deny mic in iOS Settings for Safari. 2. Open Record tab → attempt Start. |
| **Expected** | Disabled controls + explainer; no silent "recording" with zero signal. Recovery path points to Settings. |
| **Contrast** | S2 tests revoke cycle; S13 tests hard deny from cold start. |

---

## 4. What to capture per scenario (on Fail / Partial)

Minimum bundle for any non-Pass row:

1. **Scenario ID** (e.g. S7) + **Device row** (D2 Sarah iPhone).
2. **Exact steps** — numbered, including reload vs fresh open.
3. **iOS version** + **Safari version** (Settings → General → About).
4. **Device model**.
5. **Screenshot or screen recording** — link/file name in Notes column.
6. **Console errors** (Web Inspector) or UI **Ref:** / error string verbatim.
7. **Network** — Wi-Fi vs cellular; any failed `POST` visible (Server Action flight).
8. **Session IDs** if known — `wbsid=` from whiteboard logs (server); client may not show `rid=` until transcribe.
9. **Timing** — e.g. transcribe spinner died at ~60s vs ~300s.
10. **Baseline vs regression** — "pre-fix #7" / "new breakage".

---

## 5. Matrix table template

Fill **Status** with `Pass` | `Fail` | `Partial` | `Skip` (with reason).

**Placeholder grid:** one row per scenario × device. Duplicate device rows as needed (add D4, D5).

| Scenario | Device + iOS | Safari ver | Status | Notes / capture refs |
|----------|--------------|------------|--------|----------------------|
| S1 Login/signup | D1 iPhone ___ / iOS ___ | ___ | | |
| S1 Login/signup | D2 Sarah iPhone ___ / iOS ___ | ___ | | |
| S2 Mic grant/revoke | D1 | ___ | | |
| S2 Mic grant/revoke | D2 | ___ | | |
| S3 Solo record start | D1 | ___ | | |
| S3 Solo record start | D2 | ___ | | **Wave 1 dispositive** |
| S4 Solo record stop / end | D1 | ___ | | |
| S4 Solo record stop / end | D2 | ___ | | **Wave 1 dispositive** |
| S5 Hot-swap mic | D1 | ___ | | baseline #7 |
| S6 Refresh mid-record | D1 | ___ | | baseline #1 |
| S7 Long-form transcribe | D1 | ___ | | link smoke doc run |
| S7 Long-form transcribe | D2 | ___ | | **Wave 1 dispositive** |
| S8 Recap edit | D1 | ___ | | |
| S9 Send to parent | D1 | ___ | | |
| S10 Parent share view | D1 (as parent) | ___ | | |
| S11 Whiteboard workspace | D1 | ___ | | SSR 500 opportunistic |
| S12 Live A/V join | D2 student phone | ___ | | Tap to hear |
| S13 Mic denied | D1 | ___ | | |
| S3 Solo record start | D3 iPad ___ | ___ | | optional |
| S11 Whiteboard workspace | D3 | ___ | | optional |

---

## 6. Acceptance criteria (overall)

iOS smoke **passes for Wave 1** when:

| # | Rule |
|---|------|
| G1 | **S3, S4, S7 on D2 (Sarah's iPhone)** — all **Pass**, OR **Partial** with written workaround Sarah can follow (e.g. "Upload only; transcribe on desktop") accepted by Andrew. |
| G2 | **Every other scenario** — at least **Partial** (known broken + documented), not **Fail** without notes. |
| G3 | **No silent Fail** — Fail/Partial rows have §4 capture bundle. |
| G4 | **Limitations block** (§9) updated from findings — tutors see honesty, not surprise. |
| G5 | **Hard Fail** on S3/S4/S7 without workaround ⇒ Wave 1 **blocked** until fix or explicit product acceptance. |

**Pass rows:** Notes can be brief ("OK 2026-05-20") — absence of a defect is the result.

---

## 7. Known iOS Safari quirks to watch for

High-signal heads-up list (not exhaustive):

| Quirk | Symptom | Mynk touchpoints |
|-------|---------|------------------|
| **Dynamic viewport / URL bar** | Canvas height jumps; Excalidraw toolbar clipped | S11 whiteboard workspace |
| **`<audio>` / `<video>` autoplay** | Remote audio silent until tap | S10, S12, `AVTile` "Tap to hear audio" |
| **`AudioContext` suspended** | Boost/meter dead until gesture | Record tab Web Audio graph |
| **`MediaRecorder` codec** | **MP4** not WebM; no timeslice | `mime.ts`, `useAudioRecorder` |
| **MP4 fragmentation** | Unplayable concatenation if timeslice abused | Rollover gapless path — must stay no-timeslice |
| **IndexedDB quota / eviction** | Lost blobs after refresh | S6, BACKLOG #1 |
| **Background tab throttling** | `setInterval` timer freeze; possible capture pause | S3 timer copy; BACKLOG timer |
| **Server Actions + fetch** | HTML error body → "unexpected response" | S7 Sarah thread |
| **File input / memory** | PDF insert OOM | S11 — 30 pp cap + iOS warning |
| **Touch vs pointer** | Drawing palm rejection; undo toolbar | S11 — Excalidraw |
| **Screen lock** | Recording may continue while UI timer stalls | S3/S4 notes |
| **PWA / Add to Home Screen** | Not required for pilot; note if Sarah uses it | Optional footnote |

---

## 8. What to do with results

| Result | Action |
|--------|--------|
| **Pass** | Short date in Notes; no BACKLOG file required. |
| **Partial** | Document workaround in Notes + §9 Limitations; optional BACKLOG row on follow-up dispatch. |
| **Fail (BLOCKER-PROD)** | Notes + escalate orchestrator for Wave 1 re-seq; reference matrix row `S#` + device. |
| **Cross-link** | Follow-up dispatch updates `docs/BACKLOG.md` § *Pilot — Sarah (iPhone Safari)* and reliability gap **#10** table cells. |

**Phase 2 task 2 row:** When the master plan / roadmap lists iOS matrix as Phase 2 task 2, point to **this file** as the filled artifact.

---

## 9. Documented limitations (fill after smoke)

*Tutors should see these in-product eventually; until then this section is the honest public list.*

| Limitation | Scenarios | Workaround | Status |
|------------|-----------|------------|--------|
| *(example)* In-browser transcribe on iPhone may fail with generic network error | S7 | Upload segment + transcribe on desktop Chrome | UNVERIFIED |
| Refresh mid-record loses in-progress audio | S6 | Do not refresh; wait for stop | baseline #1 |
| Headphone unplug may record silence without banner | S5 | Stop and re-start recording | baseline #7 |
| | | | |

---

## 10. Companion live-A/V smoke notes

When running **S11** or **S12**, opportunistically check BACKLOG items:

| BACKLOG theme | What to try | Pass signal |
|---------------|-------------|-------------|
| **AVTile — Tap to hear audio** | Student joins on iOS; tutor speaks | Student taps overlay; hears tutor |
| **Workspace SSR 500** | Third device joins; load workspace URL | No 500 on `GET …/workspace`; if 500, UI still usable + log `X-Vercel-Id` |
| **iOS asymmetric audio** | Both directions | Document one-way audio |

These are **not separate matrix rows** — fold outcomes into S11/S12 Notes.

---

## 11. Smoke run log (meta)

| Field | Value |
|-------|-------|
| Matrix version | 2026-05-20 initial template |
| Filled by | |
| Date range | |
| Deploy URL tested | |
| Git SHA | |
| Overall Wave 1 iOS gate | PASS / FAIL / PARTIAL |

---

## Appendix — Route map

| Scenario | Primary URL / surface |
|----------|----------------------|
| S1 | `/login`, `/signup` |
| S2–S7, S8, S9 | `/admin/students/[id]` |
| S4 whiteboard | `…/whiteboard/[wbsid]/workspace` → End → review |
| S10 | `/s/[token]` |
| S11 | `…/whiteboard/[wbsid]/workspace` |
| S12 | `/w/[joinToken]` |

**Related docs:** `docs/RECORDER-LIFECYCLE.md`, `docs/RECORDER-REFACTOR-STATUS.md`, `docs/LIVE-AV.md`, `docs/BACKLOG.md` (Pilot — Sarah iPhone), `docs/SMOKE-LONG-FORM-TRANSCRIBE.md`.
