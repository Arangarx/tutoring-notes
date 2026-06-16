# Phase 2 — Student on the new whiteboard shell: Detailed Executable Plan

> **Branch:** `phase1/wb-review-correct` (execution may continue here or fork `phase2/wb-student-new-shell` off `v1-redesign` at Andrew's cut — do not assume merge order)  
> **Program:** Experience-Driven Wedge — WB ground floor (Gate A2/A5: two-way sync + student-on-same-board)  
> **Authored:** 2026-06-16 (planning pass — **no P2 production code in this commit**)  
> **Parent context:** [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) P1 replay-in-frame thread; [`docs/handoff/whiteboard-chrome-design-2026-06-07.md`](whiteboard-chrome-design-2026-06-07.md) §4 Phase 2 student-mobile  
> **Design refs:** [`docs/handoff/whiteboard-session-shell-design-2026-06-08.md`](whiteboard-session-shell-design-2026-06-08.md); [`docs/handoff/whiteboard-chrome-p1.2-visual-design-2026-06-08.md`](whiteboard-chrome-p1.2-visual-design-2026-06-08.md); mobile mock [`docs/brand-previews/whiteboard-mobile-mock-2026-06-10.html`](../brand-previews/whiteboard-mobile-mock-2026-06-10.html)  
> **Reliability bar:** [`../../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc)

---

## ⛔ HARD CONSTRAINT — extend don't rewrite

**Tutor live engine (`WhiteboardWorkspaceClient.tsx`) is ADDITIVE-ONLY for P2.**

P2 does **not** mount the student through the tutor workspace engine. The student gets a **new** `StudentLiveWorkspaceClient.tsx` that composes the **same chrome frame** (`LiveBoardChrome`, `WbRoleProvider`, shared CSS) and **reuses** existing sync hooks/libs — mirroring how P1 replay used an isolated surface instead of forking the live engine.

| Allowed | Forbidden |
|---|---|
| New `StudentLiveWorkspaceClient.tsx` + student chrome slot JSX | Rewriting `pageDataRef` / sync / recorder paths inside `WhiteboardWorkspaceClient.tsx` |
| Surgical, additive changes to `WhiteboardSessionShell.tsx` (role branch) | Behavioral changes to tutor page switch, recording FSM, v3 wire |
| Extend `wb-role.tsx`, `LiveBoardChrome` slots, CSS (`whiteboard-chrome.css`) | Deleting or gutting `StudentWhiteboardClient.tsx` before two-device smoke passes |
| Flag gate in `src/app/w/[joinToken]/page.tsx` | Retiring `/w/[joinToken]` URL shape |

**Executor pre-flight:** `git diff` must show **zero** behavioral edits to tutor-engine paths in `WhiteboardWorkspaceClient.tsx` (default: **no touches**).

---

## 1. Goal + scope

### Goal

Route the **anonymous student join** (`/w/[joinToken]#k=…`) through the **same unified session shell + `LiveBoardChrome` frame** the tutor uses, with `role="student"` and **straight-to-live** (no waiting room). Both sides share modern chrome, theme tokens, and layout language. **Full mutual visibility** on the live board (strokes, PDF pages, graphs, page list) with existing per-page data isolation preserved.

### Baked-in decisions (do not re-litigate)

| ID | Decision |
|---|---|
| **(c)** | **Keep** `/w/[joinToken]` as a **permanent backup** join path even when authenticated learner join exists later (hybrid). Tutor can always share this link. |
| **(e)** | Student camera default = **self-view ON** (student sees their own tile so they know they're on camera). |
| — | **Mobile-first** student chrome (phones/tablets are the primary student device). |
| — | **Both sides see everything** the other has on the live board. |

### In scope

- Student renders in unified shell, **live mode only** (P2).
- Mobile-first responsive chrome (`data-role="student"`, `useWbLayoutMode`).
- Self-view ON by default (`WbAVCluster` local tile always shown when cam granted).
- Preserve sync + data isolation (`useStudentWhiteboardCanvas`, per-page routing, tombstones, undo/redo scoped per peer).
- Per-session logging: `wbsid=`, `wba author=student`, `avx peer=`.
- **Loading scene…** safeguard (verify-first, then belt-and-suspenders) — §5.
- **Additive + flag-gated** rollout; legacy client remains fallback until two-device smoke passes.

### Out of scope (P3+)

- Mutual waiting room (`mode === "waiting"`).
- A/V device configuration UI beyond existing permission prompt + minimal mic/cam toggles.
- Consent toggle wiring / educational-use enforcement UI.
- Synchronized session start.
- Retiring tutor consent-acknowledgment click.
- Authenticated learner join route (future; `/w/[joinToken]` stays regardless).

---

## 2. Current state

### Legacy student client (`/w/[joinToken]`)

| Piece | Location | Behavior today |
|---|---|---|
| Server page | [`src/app/w/[joinToken]/page.tsx`](../../src/app/w/[joinToken]/page.tsx) | Token auth; stamps `bothConnectedAt`; passes `syncUrl`, `studentId`, timer seeds; **no** admin session. |
| Client | [`src/app/w/[joinToken]/StudentWhiteboardClient.tsx`](../../src/app/w/[joinToken]/StudentWhiteboardClient.tsx) | ~970 lines; **legacy** layout (`container`/`card`, inline pills). |
| Encryption | Hash `#k=` via `readKeyFromHash()` | Same E2E model as tutor; key never hits server. |
| Sync | `createWhiteboardSyncClient({ role: "student", peerId, … })` | Room = `whiteboardSessionId`. |
| Canvas wire | [`src/hooks/useStudentWhiteboardCanvas.ts`](../../src/hooks/useStudentWhiteboardCanvas.ts) | Per-page isolation, follow tutor viewport, v3 apply chain, image hydrate. |
| Excalidraw | `ExcalidrawDynamic` **without** `zenModeEnabled`; **no** `initialData` | Native Excalidraw UI visible → **"Loading scene…"** overlay can appear. Theme via `useExcalidrawThemeFromSystem()` (OS-only, not app toggle). |
| A/V | `useLiveAV` + legacy `AVTilesPanel`/`AVControls`/`VideoControls` | Self-view **already wired** via `localTile` (L761–771); not in draggable `WbAVCluster`. |
| Pages | Inline `PageStrip variant="student"` | Not in `BoardTabStrip` chrome. |
| Follow | Checkbox + "Match tutor's view" button | Not in chrome capability model. |

### Tutor new shell

| Piece | Location | Behavior today |
|---|---|---|
| Shell | [`WhiteboardSessionShell.tsx`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardSessionShell.tsx) | `live` → `WorkspaceResumeGate` → `WhiteboardWorkspaceClient`; `review` → `SessionReviewMode`. **Tutor-only props** (`adminUserId`, consent, recording prefs). |
| Workspace | [`WhiteboardWorkspaceClient.tsx`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx) | `WbRoleProvider role="tutor"` + `LiveBoardChrome`; `zenModeEnabled`; `initialData` appState; `WbAVCluster`; recording FSM. |
| Chrome frame | [`LiveBoardChrome.tsx`](../../src/components/whiteboard/chrome/LiveBoardChrome.tsx) | Role-agnostic slots; `data-role`, `data-layout`, `data-orientation`. |
| Capabilities | [`wb-role.tsx`](../../src/components/whiteboard/chrome/wb-role.tsx) | `deriveWbCapabilities("student")` sets `showFollowControls: true`, **`defaultShowLocalVideo: false`** (conflicts with decision **(e)** until flipped). |

### Gap

| Gap | Impact |
|---|---|
| **Two chrome stacks** | Student = legacy cards; tutor = `mynk-wb-chrome` — visual/UX split ([`v1-design-gap-inventory-2026-06-11.md`](v1-design-gap-inventory-2026-06-11.md) L3). |
| **No student shell entry** | `WhiteboardSessionShell` has no `role="student"` branch or anonymous props. |
| **Excalidraw mount differs** | Student exposes native UI + no `initialData`; tutor hides native UI (`zenModeEnabled`) + seeds appState — hang may **not** reproduce on new shell (verify first). |
| **Theme** | Student uses OS theme only; tutor uses `useTheme()` + `WbThemeToggle` (TU-12/TU-13). |
| **No feature flag** | No env gate for safe rollback. |

---

## 3. Target architecture

```
/w/[joinToken]/page.tsx  (server unchanged — token auth, bothConnectedAt stamp)
        │
        ├─ NEXT_PUBLIC_WB_STUDENT_NEW_SHELL !== "1"
        │       └─ StudentWhiteboardClient  (legacy fallback — KEEP)
        │
        └─ NEXT_PUBLIC_WB_STUDENT_NEW_SHELL === "1"
                └─ StudentWhiteboardSessionShell  (new thin wrapper)
                        └─ WhiteboardSessionShell  role="student"  mode="live" only
                                └─ StudentLiveWorkspaceClient  (new)
                                        ├─ WbRoleProvider role="student"
                                        ├─ LiveBoardChrome  (shared frame)
                                        ├─ useStudentWhiteboardCanvas  (unchanged hook)
                                        ├─ useLiveAV + WbAVCluster  (self-view ON)
                                        └─ ExcalidrawDynamic  zenModeEnabled + initialData + safeguard
```

### Shell contract (`WhiteboardSessionShell` extension)

Add a **discriminated union** (additive):

```typescript
// Tutor branch — unchanged props surface
type TutorShellProps = { role?: "tutor"; adminUserId: string; … };

// Student branch — new
type StudentShellProps = {
  role: "student";
  joinToken: string;
  tutorName: string;
  // No adminUserId, no initialUserWantsRecording, no review flip
};

export type WhiteboardSessionShellProps = TutorShellProps | StudentShellProps;
```

**Student branch behavior:**

- `mode` locked to `"live"`; session ended → render existing join-unavailable copy (reuse `joinUnavailableCopy` from legacy client — extract to shared module).
- **Skip** `WorkspaceResumeGate` (IndexedDB resume is tutor-only).
- Mount `StudentLiveWorkspaceClient` instead of `WhiteboardWorkspaceClient`.
- **Do not** mount `SessionReviewMode` for student.

### Flag + gating

| Env var | Semantics |
|---|---|
| `NEXT_PUBLIC_WB_STUDENT_NEW_SHELL=1` | Student join page uses new shell stack. |
| unset / `0` | Legacy `StudentWhiteboardClient` (production default until Andrew smoke-pass). |

- Document in [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) in the **implementation** commit (same commit as code).
- Vercel Preview: set flag on branch under test only; Production stays off until retire-legacy gate (§7).

### Mobile-first chrome (`data-role="student"`)

Per [`whiteboard-chrome-design-2026-06-07.md`](whiteboard-chrome-design-2026-06-07.md) §4:

- `100dvh` shell height; ≥80% canvas; bottom tool bar; compact `BoardTabStrip` (≤40px).
- Tools: pencil + eraser + overflow (no PDF/image/graph insert on student).
- Follow controls in chrome (`showFollowControls` capability) — default **follow ON**.
- CSS: extend [`src/styles/whiteboard-chrome.css`](../../src/styles/whiteboard-chrome.css) with `data-role="student"` rules; **no** `dark:` in components ([`.cursor/rules/both-theme-components.mdc`](../../.cursor/rules/both-theme-components.mdc)).

### Self-view default (decision **(e)**)

1. **`wb-role.tsx`:** set `defaultShowLocalVideo: true` for `role === "student"`.
2. **`StudentLiveWorkspaceClient`:** always pass `localTile` to `WbAVCluster` when cam stream exists (same streams as legacy L761–771).
3. On mobile layout, cluster may collapse — tile must remain reachable (not silently dropped).

### Sync + isolation (unchanged contracts)

Reuse without modification unless a P2 bug forces a surgical fix:

- [`src/lib/whiteboard/sync-client.ts`](../../src/lib/whiteboard/sync-client.ts) — `role: "student"`.
- [`src/hooks/useStudentWhiteboardCanvas.ts`](../../src/hooks/useStudentWhiteboardCanvas.ts) — per-page `pageDataRef`, v3 rev chain.
- [`src/hooks/useSyncTombstonedElementIds.ts`](../../src/hooks/useSyncTombstonedElementIds.ts).
- [`src/hooks/useCollaboratorPointers.ts`](../../src/hooks/useCollaboratorPointers.ts) — tutor laser on student canvas.
- Native image upload path: `ensureNativeImageAssetUrlsForSync` + join-token-scoped API (legacy L485–507).

### Logging registry (extend [`AGENTS.md`](../../AGENTS.md))

| Prefix | Use |
|---|---|
| `wbsid=` | Session id (existing) |
| `wba author=student` | Apply path (existing) |
| `avx peer=` | Live A/V (existing) |
| **`wjg`** | **New** — whiteboard **j**oin **g**ate lifecycle (see §5) |

---

## 4. Task breakdown (ordered)

Each step is independently committable; **do not** merge to `master` until §7 passes.

### Step 0 — Hang reproduction spike (before building safeguard)

**Goal:** Determine whether "Loading scene…" occurs on the new student shell at all.

| Action | Detail |
|---|---|
| Scaffold minimal mount | Temporary dev-only branch: mount `ExcalidrawDynamic` with `zenModeEnabled` + empty `initialData` inside a throwaway route or Storybook-style page — **or** land Step 2 canvas mount first without watchdog. |
| Two-device repro | Tutor on new shell + student on new shell; student hard-refresh 5×; student join cold 5×. |
| Record | Note whether Excalidraw loading overlay appears in DOM (`[class*="loading"]` or visible "Loading scene" text). |
| Outcome | Document in smokebook Notes; if **never reproduces**, watchdog is still shipped (§5) but prioritized as belt-and-suspenders. |

**Exit:** Written repro result in smokebook item 0 (PASS = hang confirmed or ruled out).

---

### Step 1 — Flag gate + page router (no new UI yet)

| File | Change |
|---|---|
| [`src/app/w/[joinToken]/page.tsx`](../../src/app/w/[joinToken]/page.tsx) | Import shell/client; `process.env.NEXT_PUBLIC_WB_STUDENT_NEW_SHELL === "1"` → new shell; else legacy. |
| [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) | Document flag (implementation commit). |

**Exit:** Flag off = byte-identical legacy path; flag on = placeholder shell or "coming soon" only if Step 2 not ready (prefer landing Steps 1+2 together).

---

### Step 2 — `StudentLiveWorkspaceClient` + chrome composition

**New file:** [`src/app/w/[joinToken]/StudentLiveWorkspaceClient.tsx`](../../src/app/w/[joinToken]/StudentLiveWorkspaceClient.tsx)

**Extract from** [`StudentWhiteboardClient.tsx`](../../src/app/w/[joinToken]/StudentWhiteboardClient.tsx) (copy-adapt, do not delete legacy):

| Concern | Source lines (approx) | New home |
|---|---|---|
| Hash key + sync client lifecycle | L106–244 | StudentLiveWorkspaceClient |
| `useLiveAV` + reconnect on sync | L251–293 | Same |
| Timer poll `/api/whiteboard/.../join-timer` | L311–366 | Same |
| `useStudentWhiteboardCanvas` | L408–432 | Same |
| `useCollaboratorPointers` | L434–442 | Same |
| Native image back-fill on change | L467–518 | Same |
| Graph embeddable render | L521–557 | Same |
| Join-unavailable / key-missing guards | L559–592 | Shared helper or shell |

**Wire `LiveBoardChrome` slots** (pattern: `WhiteboardWorkspaceClient.tsx` L4176+):

| Slot | Student content |
|---|---|
| `topBar` | Tutor name, `WbThemeToggle`, connection pills (`WbStatusPill` or equivalent tokens), session timer, **Leave** (not End) per `showLeaveInsteadOfEnd` |
| `toolStrip` | Pencil + eraser (+ shapes overflow if parity requires) — hide tutor-only inserts |
| `canvas` | `ExcalidrawDynamic` `zenModeEnabled` + §5 `initialData` + safeguard overlay |
| `propsMobileBar` / `bottomToolbar` | Stroke props (reuse `WbStrokePropsPanel` subset) + undo/redo |
| `boardTabStrip` | `BoardTabStrip` fed from `pageList` / `selectStudentPage` |
| `nonVisualMounts` | `AVPermissionsPrompt` (until permissions granted) |
| Canvas overlay | `WbAVCluster` with `localTile` + `defaultShowLocalVideo` |
| Banners | Material safeguard + board-wait (port `student-board-sync-wait-banner`) |

**Theme:** replace `useExcalidrawThemeFromSystem` with `useTheme().resolvedTheme` (match tutor TU-12).

**Do not import** recording hooks, `WorkspaceResumeGate`, tutor server actions, or PDF insert handlers.

**Exit:** Flag on → student sees `mynk-wb-chrome` frame; flag off unchanged.

---

### Step 3 — Extend `WhiteboardSessionShell` for `role="student"`

| File | Change |
|---|---|
| [`WhiteboardSessionShell.tsx`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardSessionShell.tsx) | Add student union branch; skip resume gate + review. |
| **New** [`src/app/w/[joinToken]/StudentWhiteboardSessionShell.tsx`](../../src/app/w/[joinToken]/StudentWhiteboardSessionShell.tsx) | Thin adapter: maps page.tsx props → `WhiteboardSessionShell` student props. |

**Exit:** Tutor workspace path unchanged (regression: existing `WhiteboardSessionShell.dom.test.tsx` green).

---

### Step 4 — Capability + self-view fix

| File | Change |
|---|---|
| [`wb-role.tsx`](../../src/components/whiteboard/chrome/wb-role.tsx) | `defaultShowLocalVideo: true` for student. |
| [`StudentLiveWorkspaceClient.tsx`](../../src/app/w/[joinToken]/StudentLiveWorkspaceClient.tsx) | Gate `WbAVCluster` local tile on capability; request cam early enough for self-view. |

**Exit:** DOM test asserts local tile present when `localVideoStream` mocked.

---

### Step 5 — Loading scene safeguard + `wjg` logging (§5)

Implement per §5; land hook + overlay in `StudentLiveWorkspaceClient`.

**Exit:** Unit test: watchdog clears `isLoading` after timeout; `wjg` lines emitted on join milestones.

---

### Step 6 — Shared extract (optional but recommended)

| File | Change |
|---|---|
| **New** `src/lib/whiteboard/join-unavailable-copy.ts` | `joinUnavailableCopy()` from legacy client. |
| [`StudentWhiteboardClient.tsx`](../../src/app/w/[joinToken]/StudentWhiteboardClient.tsx) | Import shared copy (minimal diff). |

Reduces drift between legacy and new paths.

---

### Step 7 — Tests

| Suite | Action |
|---|---|
| [`src/__tests__/dom/StudentWhiteboardClient.av-mount.dom.test.tsx`](../../src/__tests__/dom/StudentWhiteboardClient.av-mount.dom.test.tsx) | Keep green (legacy). |
| **New** `src/__tests__/dom/StudentLiveWorkspaceClient.dom.test.tsx` | AV mount, chrome `data-role="student"`, follow toggle, self-view tile. |
| **New** `src/__tests__/dom/student-excalidraw-loading-guard.dom.test.tsx` | Watchdog + reload affordance. |
| [`src/__tests__/dom/WhiteboardSessionShell.dom.test.tsx`](../../src/__tests__/dom/WhiteboardSessionShell.dom.test.tsx) | Add student branch smoke (live only). |
| Integration | `npm run test:wb-sync` — **mandatory** (touches sync surface). |

---

### Step 8 — Smokebook + two-device gate

Author [`docs/handoff/phase-2-student-new-shell-smokebook-2026-06-16.md`](phase-2-student-new-shell-smokebook-2026-06-16.md) per [`SMOKEBOOK-TEMPLATE.md`](SMOKEBOOK-TEMPLATE.md); preview URL via Vercel MCP (never guess).

**Exit:** Andrew two-device smoke PASS with flag **on**; legacy path spot-checked with flag **off**.

---

### Step 9 — Retire-legacy gate (post-smoke only)

| Action | When |
|---|---|
| Flip default / enable flag in Production | Andrew explicit go |
| Keep `StudentWhiteboardClient.tsx` in tree | Until one release cycle; then deprecate imports only |
| Remove flag | Only after Production soak — separate PR |

---

## 5. "Loading scene…" safeguard design

### Hypothesis

Tutor path uses `zenModeEnabled` + explicit `initialData.appState` ([`WhiteboardWorkspaceClient.tsx`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx) L4664–4691). Legacy student path does **not** — Excalidraw may leave `appState.isLoading === true` if async hydration races the overlay. **New shell may not exhibit the hang**; Step 0 validates.

### Implementation (belt-and-suspenders)

**New hook:** `src/hooks/useExcalidrawLoadingGuard.ts`

| # | Mechanism | Detail |
|---|---|---|
| 1 | **`initialData` on mount** | Pass to `ExcalidrawDynamic`: `{ elements: [], appState: { isLoading: false, viewBackgroundColor: <token> }, scrollToContent: false }` + same stroke defaults as tutor (`currentItemRoughness: 0`, sharp, thin stroke). Use **stable ref** for `initialData` (replay lesson: unstable ref re-applies scene). |
| 2 | **~5s watchdog** | After `excalidrawAPI` ready: if `getAppState().isLoading` still true at 5s → `updateScene({ appState: { isLoading: false } })`; set `stuckLoading: true` UI state. |
| 3 | **Reload affordance** | When `stuckLoading`, show student-visible banner over canvas: "Board is taking too long to load" + **Reload** (`window.location.reload()`) + Dismiss. `data-testid="student-excalidraw-loading-guard"`. |
| 4 | **`wjg` join-gate logging** | Emit structured `console.info` at milestones: |

```
[wjg] wjg=<joinToken:8> wbsid=<id> action=mount role=student
[wjg] wjg=<joinToken:8> wbsid=<id> action=key_ok|key_missing
[wjg] wjg=<joinToken:8> wbsid=<id> action=sync_connect|sync_disconnect
[wjg] wjg=<joinToken:8> wbsid=<id> action=excalidraw_api_ready
[wjg] wjg=<joinToken:8> wbsid=<id> action=loading_cleared source=initial|watchdog|remote_scene
[wjg] wjg=<joinToken:8> wbsid=<id> action=loading_stuck ageMs=5000
[wjg] wjg=<joinToken:8> wbsid=<id> action=student_reload reason=loading_guard
```

Register `wjg` in [`AGENTS.md`](../../AGENTS.md) logging registry in implementation commit.

**Legacy path:** Optionally port guard behind same flag in `StudentWhiteboardClient` for A/B — **defer** unless Step 0 shows hang on legacy only.

---

## 6. Reliability — 5-axis acceptance scaffold

> **For adversarial reviewer:** Fill BLOCKER/SHOULD-FIX tags below. **All `[BLOCKER]` items fold into Phase-1 (P2) acceptance** — not follow-up tickets. See [`reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc).

**Sarah-trust framing:** If the student board fails to load, loses strokes, or hides the student's face, Sarah keeps Zoom open beside Mynk — P2 is not done.

### Axis 1 — Data durability

| ID | Acceptance stub | Reviewer notes |
|---|---|---|
| P2-A1 | Student refresh mid-session: strokes on **active page** rehydrate from tutor v3 wire; no cross-page bleed. | |
| P2-A2 | Student tab backgrounded 10 min: reconnect restores board without tutor re-draw. | |
| P2-A3 | Session ended while student connected: student sees ended copy; no crash loop. | |

### Axis 2 — Clock + ordering correctness

| ID | Acceptance stub | Reviewer notes |
|---|---|---|
| P2-B1 | Session timer on student chrome matches tutor timer (same `join-timer` API + `bothPresentForTimer` gate). | |
| P2-B2 | Page switch order: student follow does not apply stale tutor page after rapid tutor tab switch. | |
| P2-B3 | v3 rev monotonicity preserved (`useStudentWhiteboardCanvas` chain). | |

### Axis 3 — Race conditions on user input

| ID | Acceptance stub | Reviewer notes |
|---|---|---|
| P2-C1 | Double-tap Leave / Reload does not double-disconnect sync client. | |
| P2-C2 | Follow toggle mid-stroke: no echo loop (`studentApplyingRemoteRef` guard). | |
| P2-C3 | Cam/mic permission prompt: concurrent Allow clicks idempotent. | |

### Axis 4 — Cross-platform parity

| ID | Acceptance stub | Reviewer notes |
|---|---|---|
| P2-D1 | **iPhone Safari** — student join + draw + self-view (real hardware). | Mark tested vs assumed. |
| P2-D2 | **Android Chrome** — same smoke subset. | |
| P2-D3 | **Desktop Chrome** — tutor + student two-tab. | |
| P2-D4 | Layout: `100dvh` chrome on mobile; no canvas offset contamination (viewport-align offset-invariance). | jsdom insufficient — real browser. |

### Axis 5 — Observability

| ID | Acceptance stub | Reviewer notes |
|---|---|---|
| P2-E1 | Every join attempt logs `wjg` + `wbsid` from mount through `loading_cleared` or `loading_stuck`. | |
| P2-E2 | Sync apply logs retain `wba author=student` per apply-v2/v3. | |
| P2-E3 | A/V logs retain `avx peer=` on connect/reconnect. | |
| P2-E4 | A stuck join is diagnosable from prod logs in &lt;10 min without repro. | |

### Reviewer summary table (fill on review)

| # | Axis | Classification | Title |
|---|---|---|---|
| | | | |
| | | | |

**Verdict:** _PENDING — reviewer sets CLEAN / NOT-CLEAN_

---

## 7. Verification plan

### Automated (merge gate)

| Command | When |
|---|---|
| `npx jest` (targeted + regression) | Every commit |
| **`npm run test:wb-sync`** | **Mandatory** before merge — hermetic relay + real Chromium ([`docs/handoff/whiteboard-regression-net-design-2026-05-30.md`](whiteboard-regression-net-design-2026-05-30.md)). Pre-build relay: `npm run relay:build`. |
| `npx next build` | If CSS/chrome/build surface changes |

**Note:** Pre-existing `sync-client.test.ts › broadcastSignal bypasses the scene throttle` failure is out of scope unless P2 touches that path ([`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md)).

### Two-device real-browser smoke (outline)

Author full smokebook from template; minimum items:

| # | Title | Action / Expect summary |
|---|---|---|
| 0 | Loading scene repro | Step 0 spike — hang yes/no documented |
| 1 | Flag off legacy | Legacy client unchanged; draw sync works |
| 2 | Flag on chrome | Student sees `mynk-wb-chrome` `data-role="student"`; tutor sees tutor chrome |
| 3 | Mutual draw | Stroke on either side appears on other within 2s |
| 4 | Page isolation | Tutor P1 vs P2: student strokes stay on active page |
| 5 | PDF / image | Tutor inserts PDF; student hydrates |
| 6 | Graph embed | Tutor graph visible read-only on student |
| 7 | Follow toggle | Default on; independent view off; snap works |
| 8 | Self-view | Student cam on → sees own tile (decision **(e)**) |
| 9 | A/V | Tutor hears student; student hears tutor |
| 10 | Student refresh | Hard refresh; board restores |
| 11 | Loading guard | If stuck, reload affordance appears; `wjg` in console |
| 12 | Mobile | Phone portrait: bottom bar usable; canvas ≥80% |
| 13 | Theme | Repeat 2–6 in **light** and **dark** (WB theme toggle) |
| 14 | Session ended | Tutor ends; student sees ended message |

### Flag-gated rollout

1. Dev: `.env.local` flag on.  
2. Preview: Vercel env on branch.  
3. Production: flag off until item 1–14 PASS.  
4. Retire legacy: Andrew go + soak → flag on in Production → later remove flag + legacy component.

---

## 8. Open questions / Andrew-confirms

| ID | Question | Default if silent |
|---|---|---|
| Q1 | Branch strategy: continue on `phase1/wb-review-correct` vs fork `phase2/wb-student-new-shell` off `v1-redesign`? | Fork dedicated branch before Step 2 code. |
| Q2 | Student tool parity: pencil+eraser only, or match tutor shape tools read-only? | Pencil + eraser per chrome design §4. |
| Q3 | `VideoControls` device picker on student mobile — keep in overflow or omit for P2? | Omit (out of scope device config UI); mic/cam toggles only. |
| Q4 | Leave button behavior: close tab vs navigate to static "you left" card? | Static card (no auth redirect). |
| Q5 | Port loading guard to legacy client behind flag for A/B? | Defer unless Step 0 hang is legacy-only. |
| Q6 | Authenticated learner join route design — still P3+? | Yes; `/w/[joinToken]` remains backup per **(c)**. |

---

## File touch map (quick reference)

| Path | Role |
|---|---|
| `src/app/w/[joinToken]/page.tsx` | Flag router |
| `src/app/w/[joinToken]/StudentWhiteboardSessionShell.tsx` | **New** — student shell adapter |
| `src/app/w/[joinToken]/StudentLiveWorkspaceClient.tsx` | **New** — student live engine |
| `src/app/w/[joinToken]/StudentWhiteboardClient.tsx` | Legacy — keep until retire gate |
| `src/app/admin/.../WhiteboardSessionShell.tsx` | Additive `role="student"` branch |
| `src/components/whiteboard/chrome/LiveBoardChrome.tsx` | Unchanged (role-agnostic) |
| `src/components/whiteboard/chrome/wb-role.tsx` | `defaultShowLocalVideo` + capabilities |
| `src/styles/whiteboard-chrome.css` | Student `data-role` layout rules |
| `src/hooks/useStudentWhiteboardCanvas.ts` | Reuse (no change expected) |
| `src/hooks/useExcalidrawLoadingGuard.ts` | **New** — §5 |
| `src/lib/whiteboard/join-unavailable-copy.ts` | **New** — shared copy |
| `docs/PLATFORM-ASSUMPTIONS.md` | Flag docs |
| `AGENTS.md` | `wjg` registry |
| `docs/handoff/phase-2-student-new-shell-smokebook-2026-06-16.md` | **New** — at Step 8 |
