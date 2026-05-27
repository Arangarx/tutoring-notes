# Whiteboard sync architecture redesign — 2026-05-27

> **Design pass type:** Full architecture redesign — library evaluation, relay evaluation,
> sync model design, 5-axis adversarial review, sequenced implementation plan.
>
> **Commissioned by:** Andrew Mortensen (founder), 2026-05-27, after three rounds of
> B1–B4 sync fixes on `reliability/sync-b1-b4` produced a fragility-and-regression spiral.
> Framing: *"right > fast; better to pay the bucks now to figure it out than even more
> bucks maintaining it."*
>
> **Authored by:** Sonnet 4.6 subagent dispatched by Opus orchestrator, 2026-05-27.
>
> **Companion docs read during this pass:**
> [`docs/RELIABILITY-REDESIGN-2026-05-27.md`](../RELIABILITY-REDESIGN-2026-05-27.md) ·
> [`docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md`](sarah-pilot-feedback-2026-05-26-orchestrator-report.md) ·
> [`docs/WHITEBOARD-STATUS.md`](../WHITEBOARD-STATUS.md) ·
> [`docs/whiteboard-smoke-log.md`](../whiteboard-smoke-log.md) ·
> [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) ·
> [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) ·
> [`docs/BACKLOG.md`](../BACKLOG.md)
>
> **Code read during this pass:** `sync-client.ts` (1841 lines) ·
> `apply-reconciled-remote-scene.ts` · `useStudentWhiteboardCanvas.ts` ·
> `useTutorLiveDocumentWire.ts` · `viewport-align.ts` (added in `9fe6e33`, extended
> in `5ce43bf`) · git diffs for commits `a504176`, `9fe6e33`, `5ce43bf` (rounds 1/2/3).

---

## Table of contents

1. [Diagnosis of current architecture](#1-diagnosis-of-current-architecture)
2. [Library evaluation matrix](#2-library-evaluation-matrix)
3. [Relay evaluation](#3-relay-evaluation)
4. [Recommendation with rationale](#4-recommendation-with-rationale)
5. [Sync architecture for the recommended stack](#5-sync-architecture-for-the-recommended-stack)
6. [5-axis adversarial review](#6-5-axis-adversarial-review)
7. [Sequenced implementation plan](#7-sequenced-implementation-plan)
8. [What carries forward from current code](#8-what-carries-forward-from-current-code)
9. [Open questions for Andrew](#9-open-questions-for-andrew)

---

## 1. Diagnosis of current architecture

### 1.1 Round-by-round timeline

**Round 1 — commit `a504176` (2026-05-27, ~12:34 PM)**

Composer 2.5 dispatched with the original B1–B4 scope. Changes:
- Tutor v3 broadcasts read live `getSceneElements()` for the active tab (correct)
- Student v3 apply added rev regression guards
- Follow/snap wired to `pageViewState`
- Trailing rAF flush added

4/4 unit tests passed. **But smoke was run on master (not the branch)** — the reported
bugs came from un-patched code. Round 2 was dispatched unnecessarily.

**Round 2 — commits `3230713` + `9fe6e33` (2026-05-27, ~2:26 PM)**

Composer 2.5 dispatched to fix "what we thought was still broken" from round 1. Changes:
- Student v3 apply switched to `api.getSceneElements()` for the active page (good for
  active page, fatal for page-switch scenarios)
- `viewport-align.ts` created with `alignStudentScrollToTutorCenter()`
- Follow-tutor defaulted on

New symptom surfaced: **page-bleed regression**. PDF page 1 rendered on whiteboard
pages 2 and 3; whiteboard page 3 had pages 1+3 strokes mixed. Root cause (diagnosed by
round-3): `api.getSceneElements()` returned the OLD tab's elements while
`activePageIdRef.current` already pointed to the NEW tab (they updated in the same
synchronous frame but Excalidraw's canvas only re-renders asynchronously). The new tab's
bucket got contaminated with old-tab elements.

**Round 3 — commit `5ce43bf` (2026-05-27, ~4:01 PM)**

Composer 2.5 dispatched with explicit page-bleed scope. Fix: "freeze leaving tab,
prefetch incoming tab on canvas, only use live canvas read when tab did not switch this
apply." Page-bleed FIXED. But:
- Viewport-align math STILL wrong (Composer flagged in its report)
- New symptom: post-PDF-load, tutor→student stroke updates become massively laggy
- Eraser cursor mismatch: delete-position differs from cursor visual

**Andrew called it after round 3.** The quote that summarizes the situation:
> *"This has all been INCREDIBLY fragile. More fragile than would be explained by simple
> sync issues. Is this whiteboard page just badly designed from the ground level?"*

### 1.2 The four state authorities — concrete mapping

**State authority 1: `pageDataRef.current[pageId]`**

Where: `useStudentWhiteboardCanvas.ts`, `const pageDataRef = useRef<Record<string, ReadonlyArray<ExcalidrawLikeElement>>>(Object.create(null))`

Role: Per-page element cache. Populated by v3 wire applies. Consulted when switching
pages (to display elements from a page not currently in Excalidraw's canvas). **Problem:**
freshness is relative to the last apply. Between two applies, the student's local strokes
(if any) and any failed wire delivery leave this stale relative to the canvas.

**State authority 2: `api.getSceneElements()`**

Where: Excalidraw's internal canvas state. **Only valid for the currently-rendered page.**

Role: "Live" element state for whatever page Excalidraw is currently displaying. The
**fundamental mismatch**: our multi-page architecture has one Excalidraw instance. When
we call `getSceneElements()` during a page-switch event, the return value can be either
the leaving page (if the switch hasn't re-rendered) or empty (if Excalidraw wiped the
scene during the switch). Excalidraw does NOT expose a per-page state API.

**Round-2 bug origin:** the code called `api.getSceneElements()` for the active page
during v3 apply, but `activePageIdRef.current` had already been updated to the new page
— so `getSceneElements()` returned the OLD page's elements and assigned them to the NEW
page's `pageDataRef` bucket.

**State authority 3: `docV3.pages[pageId]` (wire payload)**

Where: decrypted in `sync-client.ts`, dispatched via `onRemoteScene` → `runV3Apply` in
`useStudentWhiteboardCanvas.ts`.

Role: Tutor's authoritative snapshot for all pages at broadcast time. **Problem:** the
v3 snapshot is throttled (50ms trailing-edge). A page switch on the tutor side can
produce a snapshot where `page.activePageId` has changed but `docV3.pages` still
reflects the scene as of the previous flush. The student receives a document that says
"active page is P3" but `pages.P3` contains whatever P3 had at the LAST broadcast, not
the current canvas state. The `onNewRemotePeer` callback works around this for the
welcome-packet case but not for mid-session page switches.

**State authority 4: Excalidraw's internal IndexedDB**

Where: Excalidraw's own recovery mechanism ("Load draft into board" / "Discard" dialog).

Role: Excalidraw autonomously persists the current scene to IndexedDB. This is a FOURTH
state store that exists independently of our application. It can produce a recovery dialog
that fights our relayed state (smoke log 2026-04: after refresh, "Load draft" restored
a stroke that our server checkpoint said was gone). We have no control over when
Excalidraw reads or writes this store.

### 1.3 Verification/refutation of the 4 structural fragility hypotheses

**Hypothesis 1 — Multiple state authorities with no canonical owner: CONFIRMED.**

The code confirms all four authorities. The round-2 → round-3 story is exactly this
playing out: round-2 introduced `api.getSceneElements()` as a state read for the
student's v3 apply, creating a new authority that raced against `pageDataRef`. Round-3
tried to fix the race with "freeze leaving tab" timing logic, but the fundamental problem
is that there are now TWO sources of truth for page elements (pageDataRef AND the canvas)
and the code must reason about which one to consult when.

**Hypothesis 2 — v2/v3 dual protocol: CONFIRMED, but less critical than H1.**

`sync-client.ts` handles v1, v2, and v3 in `validateWireMessage`. `useStudentWhiteboardCanvas.ts`
has distinct `runV3Apply` and `runV2Apply` (via the `v === 2` branch of the legacy
`handleRemoteScene` path). The tutor broadcasts v3 via `broadcastDocument`. The student
theoretically receives v3, but the student hook still has dead v2 code paths. This
doubles the surface area that must be kept consistent. More importantly, the `scenePageId`
field on v2 was the original attempt to solve the multi-page routing problem — and it was
the ancestor of the same conceptual confusion that v3 tried to fix.

**Hypothesis 3 — No formalized render-timing contract: CONFIRMED.**

`apply-reconciled-remote-scene.ts` contains `waitDoubleRaf()` — a hardcoded
2-frame wait to let "any pending local updateScene... land in Excalidraw's scene store
before we read it." This is an informal timing assumption, not a contract. The
viewport-align DOM fallback in round-3 (`readViewportSizeFromAppState` → fallback to
`.excalidraw-container` when `appState.width/height === 0`) is another ad-hoc timing
patch. The eraser cursor mismatch from round-3 is almost certainly this same class of
bug: the visual cursor runs in one coordinate frame (post-layout), the hit-test runs in
another (pre-layout or different scroll state).

**Hypothesis 4 — Coordinate-system math computed in one place, applied in another: CONFIRMED.**

`viewport-align.ts` (created in round-2) computes `alignStudentScrollToTutorCenter`. The
DOM fallback was added in round-3 because the math ran before the container had dimensions.
The issue: `readViewportSizeFromAppState` returns null when `appState.width/height === 0`,
and the DOM fallback reads `.excalidraw-container.getBoundingClientRect()` — but this
runs in a React effect that may fire before or after Excalidraw's own layout effect.
There is no guaranteed frame at which BOTH the tutor's viewport dimensions (from the wire)
AND the student's container dimensions (from the DOM) are simultaneously valid.

### 1.4 What the RELIABILITY-REDESIGN doc said vs what this pass found

`docs/RELIABILITY-REDESIGN-2026-05-27.md` § Surface 3 said:
> *"Root-cause class for B1–B4: Application bugs. The relay forwards what it receives...
> One focused Composer dispatch should target the sync surface holistically."*

**This pass diverges on one point.** The relay IS sound and the bugs ARE
application-level. But "application bugs" understates the structural nature of the
problem. The 4 fragility patterns are not bugs in specific logic — they are design-level
decisions (four state authorities, dual protocol, informal timing, split coordinate math)
that make every Composer dispatch *hard to get right*. Three Composer dispatches, all
reading the code carefully, all getting different symptoms wrong. That is not bad luck;
it is structural.

The correct framing: **the relay is fine; the architecture of the client sync layer
needs a deliberate redesign, not another targeted fix dispatch.** This redesign is what
the rest of this document delivers.

---

## 2. Library evaluation matrix

### Criteria explained

- **Collaboration architecture:** How does the library handle multi-user state?
- **TypeScript/React fit:** First-class TypeScript? React components?
- **Mobile UX quality:** Has it been tested on iOS Safari? Does it handle touch?
- **Customization:** Can Sarah rearrange tool panels? Set default draw type?
- **License/cost:** Production deployment cost.
- **Ecosystem velocity:** How actively maintained?
- **Integration cost:** How much of the current code carries forward?
- **Recorder-integration risk:** Can the recording outbox and lifecycle FSM still attach?

### Option A — Excalidraw (current, ^0.18.1)

| Dimension | Assessment |
|---|---|
| Collaboration architecture | Last-write-wins with `reconcileElements()` (version-vector per element). No native CRDT. Multi-user is built in but the sync layer is left to the application. |
| TypeScript/React fit | Excellent. First-class TypeScript, React component. |
| Mobile UX quality | Good for drawing; Excalidraw's touch events are well-tested. Safari quirks (no `timeslice`, MP4 mime) are already handled. |
| Customization | Rich customization API: `renderTopRightUI`, `renderBottomRightUI`, `UIOptions.tools` to hide/show tools, `initialData.appState` for defaults. Sarah's toolbar-reorder + default-draw-type requests are satisfiable with ~1 day of work. |
| License/cost | MIT. $0 for production. |
| Ecosystem velocity | Active; Excalidraw.com is the primary consumer. Upstream breaking changes are infrequent but happen on major versions. Pin to minor. |
| Integration cost | Zero migration. Everything we've built (recorder adapter, event log, PDF insert, math, Desmos, per-page strip, join token flow) stays. |
| Recorder-integration risk | Zero. The recorder and Excalidraw are decoupled at the `excalidraw-adapter.ts` boundary. |
| **Verdict** | **Best choice for Wave 1. Architecture redesign is in how WE build the sync layer, not in Excalidraw itself.** |

**Key constraint:** Excalidraw exposes exactly ONE canvas at a time. Our multi-page
architecture is built on top of this single canvas. This is a mismatch — but it's a
mismatch we've been living with since Phase 1. The correct fix is to make our sync layer
explicitly model this constraint, not to migrate libraries.

### Option B — tldraw (OSS SDK)

| Dimension | Assessment |
|---|---|
| Collaboration architecture | CRDT-native via TLRecord + vector clocks on every record. TLStore provides a single authoritative store; conflict resolution is deterministic and library-handled. `@tldraw/sync-core` provides `TLSocketRoom` for self-hosted WebSocket sync. |
| TypeScript/React fit | Excellent. First-class TypeScript, React component. |
| Mobile UX quality | Good but less field-tested than Excalidraw. No known iOS Safari regressions, but we'd need our own smoke matrix. |
| Customization | Native multi-page. Custom tools, shapes, and panels via the extension API. Sarah's requests would be easier to satisfy than with Excalidraw. |
| **License/cost** | **ELIMINATED. tldraw SDK 4.0 (Sep 2025) requires a production commercial license at $6,000/year for the startup tier. Andrew's explicit constraint: "I can't afford the $6k one."** 100-day free trial available but production deployment without a license violates terms. |
| Ecosystem velocity | Very active; well-funded ($12M Series A, Apr 2025). |
| Integration cost | High. Rewrite `WhiteboardWorkspaceClient.tsx` and `StudentWhiteboardClient.tsx`. New tldraw-adapter.ts for the canonical event log. All new sync hooks. ~3-5 weeks of Composer + Sonnet dispatches. |
| Recorder-integration risk | Medium. Recording hooks attach to the event log adapter, not directly to Excalidraw — but the adapter would need to be rewritten for tldraw's TLRecord shape. |
| **Verdict** | **ELIMINATED by license constraint. $6k/year is outside budget.** |

### Option C — Yjs + Excalidraw (`y-excalidraw`)

| Dimension | Assessment |
|---|---|
| Collaboration architecture | Yjs is a CRDT (Y.Doc with Y.Map/Y.Array). `y-excalidraw` (maintained by the Excalidraw team as `@excalidraw/excalidraw`'s official Yjs binding) maps Excalidraw elements into a Yjs Y.Map, giving true CRDT merging. No more `reconcileElements` version-vector conflicts. |
| TypeScript/React fit | Yjs has TypeScript types. `y-excalidraw` is a thin React hook. |
| Mobile UX quality | Inherits Excalidraw's mobile UX (good). The Yjs layer doesn't change the rendering surface. |
| Customization | Same as Excalidraw — Yjs only touches the sync layer, not the UI. Sarah's customization requests remain satisfiable. |
| License/cost | Yjs: MIT. `y-excalidraw`: MIT. Relay: y-websocket (MIT) self-hosted ~$5/mo, or Cloudflare Durable Objects ~$5/mo base. $0 library license. |
| Ecosystem velocity | Yjs is very active and has become the de-facto CRDT standard in the web collaboration space. `y-excalidraw` is less actively maintained — check for Excalidraw ^0.18 compatibility before committing. |
| Integration cost | Significant refactor. The `pageDataRef` + v3 wire apply path is replaced by a Yjs Y.Doc per page. The relay changes from excalidraw-room to y-websocket (or Cloudflare Durable Objects). The recorder adapter stays (Yjs state maps through the same `ExcalidrawLikeElement` shape). ~2-3 weeks of Sonnet + Composer dispatches. |
| Recorder-integration risk | Low. Yjs state changes are observable via `Y.Doc.observe`. The recorder adapter can listen to Yjs changes instead of Excalidraw's `onChange`. |
| **Verdict** | **Wave 3 research item. Structurally solves the CRDT problem. Not a Wave 1 option — the integration cost is too high to validate before Sarah's immediate sync issues are fixed. Revisit if the Wave 1 Excalidraw fix still produces regressions.** |

### Option D — Yjs + custom canvas

| Dimension | Assessment |
|---|---|
| Collaboration architecture | Yjs CRDT on a custom canvas (Konva, Fabric.js, rough.js, or raw Canvas2D API). Maximum control; no library coupling. |
| Mobile UX quality | Entirely in our hands. We'd need to build touch handling, pressure-sensitive pen input (XPPen Star G640), pinch-zoom, etc. |
| Customization | Maximum — we build exactly what Sarah needs. |
| License/cost | $0. |
| Integration cost | **Enormous.** We'd be throwing away all of Excalidraw's rendering, tool system, PDF/image handling, math embedding, Desmos embedding, undo/redo, and export. Estimate: 8-12 weeks of senior-developer-equivalent time. |
| **Verdict** | **Not recommended at any horizon. The cost of reimplementing Excalidraw's feature set is prohibitive, especially given that Excalidraw's fragility is in our sync layer, not in Excalidraw itself.** |

### Library evaluation summary

| Library | Overall | Notes |
|---|---|---|
| **Excalidraw (current)** | **Recommended for Wave 1** | Architecture redesign is in OUR sync layer. No migration cost. Sarah's customization requests are satisfiable. |
| tldraw | Eliminated | $6k/year production license. |
| Yjs + Excalidraw | Wave 3 option | Structural CRDT improvement, moderate integration cost, valid if Wave 1 still produces regressions. |
| Yjs + custom canvas | Not recommended | Cost prohibitive. |

**Where RELIABILITY-REDESIGN diverged:** The earlier Sonnet pass said "the relay and
sync architecture are sound" and treated B1-B4 as application bugs. That was close to
correct but missed that the sync layer's CLIENT-SIDE architecture has structural fragility.
This pass agrees the relay is fine and the bugs are application-layer, but diagnoses the
root cause as architectural design choices (four state authorities, dual protocol,
informal timing), not one-off bugs. The fix is a deliberate redesign of those choices,
not another targeted dispatch.

---

## 3. Relay evaluation

### Current relay: excalidraw-room on Fly.io

**Description:** Tiny Express + socket.io server that forwards encrypted WebSocket
frames to all room members. The relay never decrypts; payloads are AES-GCM opaque bytes.

| Dimension | Assessment |
|---|---|
| Cost | ~$2/mo for a `shared-cpu-1x@256MB` Fly.io machine with `auto_stop = true`. Currently the cheapest option by far. |
| Latency | Fly.io runs on the closest PoP to the server's location. Not global-edge, but for a single-tutor pilot with US-based users, latency is acceptable (~50-150ms round-trip). |
| Durability | **Stateless by design.** A relay restart drops all in-flight rooms. This is acceptable per the trust model: recording continues on the tutor's IndexedDB; `sync-disconnect`/`sync-reconnect` markers land in the event log. The relay is a byte-forwarder, not a state store. |
| Encryption integration | Excellent. The relay never sees plaintext; the E2E encryption model is exactly right. |
| Dev experience | Good. `fly deploy` after any change. One-shot setup documented in WHITEBOARD-STATUS.md. |
| Infrastructure complexity | Low. One Fly.io app, one `fly.toml`, one env var (`CORS_ORIGIN`). |
| **Verdict** | **Keep for Wave 1 and beyond. No migration needed. The relay is not the source of fragility.** |

### Alternative: Self-hosted Socket.IO on Fly.io (same platform, new image)

**Not meaningfully different from excalidraw-room.** excalidraw-room IS a Socket.IO
server. The only reason to replace it would be to add custom server-side logic (room
persistence, health endpoints, per-event logging). Cost and operational overhead are
identical. **If we want relay observability (health endpoint, room-count metric), patch
excalidraw-room's `src/index.ts` — don't spin up a separate server.**

### Alternative: PartyKit (now Cloudflare Durable Objects)

**Background:** PartyKit was acquired by Cloudflare in 2024. PartyKit projects now run
as Cloudflare Workers + Durable Objects. The `partykit` npm package provides a familiar
API; under the hood it's Cloudflare DO with WebSocket hibernation.

| Dimension | Assessment |
|---|---|
| Cost | Cloudflare Workers Paid: $5/mo base. WebSocket messages billed at 20:1 ratio to requests (100 WS messages = 5 request-equivalent). For pilot scale (1-3 peers, ~100 messages/minute for a 1-hour session): roughly $5.xx/mo total. At 100 tutors: ~$10-15/mo depending on session volume. |
| Latency | Cloudflare's global edge network: p50 under 30ms worldwide. Significantly better than Fly.io for globally-distributed tutors. |
| Durability | Durable Objects have persistent state (SQLite per DO). The relay COULD become stateful — storing the latest v3 document snapshot so a late-joining student gets the welcome packet without waiting for the tutor to rebroadcast. This solves the "student joins blank canvas" race more elegantly than our current `onNewRemotePeer` re-broadcast. |
| Encryption integration | Good. We'd still send encrypted bytes — the DO just forwards them. The encryption model is protocol-agnostic. |
| Dev experience | Very good. `partykit dev` for local, `partykit deploy` for production. TypeScript-first. |
| Infrastructure complexity | Medium. New runtime environment (Cloudflare Workers) to understand. CORS config, DO bindings, wrangler.toml. |
| CSP impact | Change `WHITEBOARD_SYNC_URL` to `wss://<project>.partykit.dev`. Add origin to `connect-src` in CSP. Document in PLATFORM-ASSUMPTIONS. |
| **Verdict** | **Valid future upgrade path, especially if we want: (a) relay observability, (b) stateful welcome packets, (c) global edge latency for non-US tutors. Not required for Wave 1.** |

### Alternative: Liveblocks

| Dimension | Assessment |
|---|---|
| Cost | Managed. Free tier: 25 MAU, 5 rooms. Starter: $29/mo for up to 100 MAU. |
| Latency | Global CDN, excellent. |
| Durability | Persistent room state, presence, conflict-free document storage (Liveblocks Storage, CRDT-based). |
| Encryption | **Blocker: Liveblocks stores room data on their servers**. Our E2E encryption model would need rethinking — we'd be storing encrypted blobs in Liveblocks, which works but loses the "relay is opaque" trust model. Legal review required. |
| Integration cost | Significant. New SDK (`@liveblocks/react`), new room model, new presence abstraction. |
| **Verdict** | **Not recommended.** The encryption integration story is weaker, cost jumps at scale, and the integration cost is high relative to keeping excalidraw-room. |

### Alternative: y-websocket (self-hosted Yjs relay)

**Context:** y-websocket is the standard WebSocket provider for Yjs. If we ever migrate
to Yjs + Excalidraw (Option C in the library matrix), we'd need y-websocket or a
compatible host.

| Dimension | Assessment |
|---|---|
| Cost | ~$5-10/mo self-hosted on Fly.io or Railway. |
| Latency | Same as excalidraw-room (depends on host). |
| Durability | y-websocket can persist Y.Doc state to LevelDB. With this, the latest document state is available for late joiners without client-side re-broadcast. |
| Encryption | Requires a custom encryption layer — y-websocket handles raw Y.Doc updates which are Uint8Array, so we'd wrap them with AES-GCM at the application layer (doable). |
| Integration | Only relevant if/when migrating to Yjs+Excalidraw. |
| **Verdict** | **Relevant only for Wave 3 Yjs migration. Not a Wave 1 option.** |

### Relay summary

| Relay | Verdict | Notes |
|---|---|---|
| **excalidraw-room/Fly.io** | **Keep (Wave 1 and beyond)** | Proven, $2/mo, E2E encryption is excellent |
| PartyKit/CF DO | Future upgrade | Global edge, stateful welcome packets, ~$5-15/mo |
| Liveblocks | Not recommended | Encryption model weaker, cost jumps |
| y-websocket | Wave 3 only (if Yjs) | Correct relay for Yjs migration |

---

## 4. Recommendation with rationale

### The recommendation: Excalidraw + disciplined sync layer + excalidraw-room relay

**In one sentence:** Keep Excalidraw and the excalidraw-room relay; redesign the
client-side sync layer with a single canonical state authority, v3-only protocol, and
explicit render-timing contract.

**What we lose vs the current implementation:**
- v2 wire compatibility (old student clients from before v3 adoption, if any exist — there are no such clients in production given solo pilot)
- The flexibility of reading from the canvas arbitrarily during applies (bad flexibility; we're trading it away intentionally)

**What we gain:**
- A sync layer that a Composer executor can reason about in one pass without a multi-round retry cycle
- No page-switch bleed (structurally impossible when the architecture is correct)
- No viewport-timing race (the render-timing contract makes the race explicit and eliminates it)
- Shorter B1-B4 fix: one focused Composer dispatch to the redesigned student apply hook

**Comparison with the RELIABILITY-REDESIGN call:**

The prior Sonnet pass called B1-B4 "application bugs" and recommended "one focused
Composer dispatch to target the sync surface holistically." This pass agrees with the
prognosis (one Composer dispatch IS the right execution vehicle) but disagrees that the
scope is a "targeted fix." The scope is a **disciplined redesign of the student apply
path** — same Composer dispatch, but the Composer is given a clear architecture spec
(this document) rather than "fix the bugs."

**On library migration (tldraw):**

tldraw 4.0 (Sep 2025) requires a $6k/year production commercial license. This directly
violates Andrew's stated constraint. Do not evaluate tldraw further at any timeline.

**On Yjs + Excalidraw:**

This is the structurally correct long-term path IF the disciplined Excalidraw sync layer
still produces regressions after one well-designed implementation attempt. The `y-excalidraw`
binding maps Excalidraw elements into a Yjs Y.Doc and gets true CRDT merging. The cost
is a meaningful refactor (2-3 weeks) and a new relay (y-websocket or Cloudflare DO).
**Defer to Wave 3 as a contingency.** Do not start the Yjs migration before the
Excalidraw fix is validated in Sarah's sessions.

**What we lose vs tldraw (for the record):**
- Native CRDT (tldraw's TLStore has deterministic conflict resolution vs our
  `reconcileElements` version-vector)
- Native multi-page (tldraw treats pages as first-class TLPage records vs our bolt-on
  single-canvas multi-page)
- Better Sarah customization story (tldraw's extension API is richer)

**What we gain vs tldraw:**
- $6k/year saved
- Zero migration cost ($0 vs ~3-5 weeks of senior-equivalent dev time)
- No library-version upgrade risk ($6k license + breaking changes on version bumps)

---

## 5. Sync architecture for the recommended stack

### 5.1 Single canonical state owner per state type

The root cause of all three rounds is that the student-side sync layer had no clear
answer to "where does the authoritative element list for page X come from right now?"

The new architecture has exactly one rule:

```
Wire payload → pageDataRef → canvas
                              ↑
                       NEVER read back
```

**Canonical owners:**

| State type | Canonical owner | Who reads it | Who writes it |
|---|---|---|---|
| All elements, all pages | Tutor's Excalidraw canvas (active page) + tutor's `pageDataRef` (non-active pages) | Tutor `getPagesSnapshot()` at broadcast time | Tutor's drawing actions |
| Student's copy of elements | `pageDataRef[pageId]` (wire-populated) | Student canvas display path | ONLY v3 wire apply |
| Active page id | `activePageIdRef.current` | All apply paths | ONLY `runV3Apply`, on page-change confirmation |
| Tutor's viewport (for follow) | `lastTutorFollowRef.current` | `applyTutorFollow()` | ONLY v3 wire apply |
| Page list | `pageListRef.current` | Page strip UI | ONLY v3 wire apply |

**The invariant that eliminates the page-bleed bug:**

> `api.getSceneElements()` is NEVER called inside `runV3Apply` for any purpose.
>
> The student's v3 apply path reads ONLY from `docV3.pages[pageId]` (wire truth) and
> `pageDataRef[pageId]` (previous wire truth). The canvas is a DISPLAY SURFACE, not a
> state store, from the student's perspective.

This is the rule that rounds 2 and 3 broke. Round 2 added `api.getSceneElements()` as a
merge input "to get live local strokes." Students don't draw in the current session model.
Even if they did, the correct pattern is: capture local state BEFORE applying remote,
then merge. Not: call `getSceneElements()` in the middle of the apply, after
`activePageIdRef` has already been updated.

**The tutor side is different and correct:**
The tutor's `getPagesSnapshot()` (in `useTutorLiveDocumentWire.ts`) reads from
`pageDataRef` for non-active pages and IMPLICITLY reads the canvas for the active page
(the tutor's `pageDataRef[activePage]` is kept in sync with the canvas via Excalidraw's
`onChange` callback). This is correct because the tutor IS the state source.

### 5.2 Wire protocol: v3 only, v2 retired

**Action:** Remove the v2 apply path from `useStudentWhiteboardCanvas.ts` entirely.
The student hook should throw (or log-and-return) if it receives a v2 message.

**Rationale:** v2 (`elements + scenePageId`) was an intermediate protocol that never
solved the multi-page state-routing problem cleanly. v3 (`pages: Record<pageId, elements>`)
is the correct abstraction. There are no non-development clients using v2 in production
(solo pilot, Sarah is the only student).

**Migration:** The `WhiteboardWireMessage` (v1) and `WhiteboardWireMessageV2` types can
stay in `sync-client.ts` for inbound validation (so a stale browser tab doesn't crash
the student hook), but the student hook MUST ignore v1/v2 messages via early return after
logging a warning. The `broadcastScene` method on the sync client (v2 outbound) stays for
WebRTC-signal compatibility and the student's own scene broadcasts (for attribution
labels) — but the student does NOT broadcast scene elements.

### 5.3 Render-timing contract

**The problem:** Excalidraw's `updateScene({ elements })` is asynchronous — the React
component re-renders on the next paint frame. Reading `getSceneElements()` in the same
synchronous frame as `updateScene()` returns the PRE-update state.

**The contract:**

```
Rule 1: During runV3Apply, NEVER call api.getSceneElements() for ANY purpose.
         Use pageDataRef exclusively.

Rule 2: The canvas (api.updateScene) is written EXACTLY ONCE per apply:
         api.updateScene({ elements: pageDataRef[activePageId] })
         at the END of runV3Apply, after all pageDataRef buckets are updated.

Rule 3: Page-switch detection happens BEFORE any api.getSceneElements() read.
         The "freeze leaving tab" pattern is correct in concept but must freeze
         from pageDataRef[leaving], not from api.getSceneElements() (which is
         unreliable during the switch).

Rule 4: Viewport alignment applies AFTER Rule 2's updateScene.
         Only apply the viewport if the student's container has non-zero
         dimensions. This is checked via api.getAppState().width/height,
         with a retry scheduled for the next requestAnimationFrame if zero.

Rule 5: The waitDoubleRaf() call in apply-reconciled-remote-scene.ts is
         eliminated for the student-side path. It was compensating for
         "stale getSceneElements" which no longer occurs (Rule 1).
         For reconcileElements calls, pass the last-known local elements from
         pageDataRef directly — no canvas read needed.
```

**The viewport-timing solution (Rule 4 detail):**

The round-3 DOM fallback (`readViewportSizeFromAppState` → `.excalidraw-container`)
was a bandaid because `api.getAppState().width === 0` before layout. The proper
solution: schedule a `requestAnimationFrame` retry if dimensions are zero. This avoids
DOM reads entirely (DOM reads in effects are layout-thrashing and unreliable in React's
rendering model).

```typescript
function applyViewportAligned(
  api: ExcalidrawApiLike,
  tutorFollow: WhiteboardWireFollow & { viewportWidth?: number; viewportHeight?: number }
): void {
  const appState = api.getAppState() as { width?: number; height?: number };
  const w = appState.width ?? 0;
  const h = appState.height ?? 0;
  if (w === 0 || h === 0) {
    // Canvas not laid out yet — retry after next paint
    requestAnimationFrame(() => applyViewportAligned(api, tutorFollow));
    return;
  }
  if (tutorFollow.viewportWidth && tutorFollow.viewportHeight) {
    const aligned = alignStudentScrollToTutorCenter(
      { ...tutorFollow, viewportWidth: tutorFollow.viewportWidth, viewportHeight: tutorFollow.viewportHeight },
      w, h
    );
    api.updateScene({ appState: { scrollX: aligned.scrollX, scrollY: aligned.scrollY, zoom: { value: aligned.zoom } } });
  } else {
    // No size info from tutor — apply raw scroll (legacy path)
    api.updateScene({ appState: { scrollX: tutorFollow.scrollX, scrollY: tutorFollow.scrollY, zoom: { value: tutorFollow.zoom } } });
  }
}
```

Note: the tutor's `viewportWidth`/`viewportHeight` must be included in the `follow`
wire payload for center-align to work. This is currently NOT included in the v3
`WhiteboardWireFollow` type — it only has `scrollX`, `scrollY`, `zoom`. Adding these two
fields is **required** for correct viewport alignment and is a Phase 1 action item.

### 5.4 Coordinate-system layer contract

`viewport-align.ts` is the right module. Its interface is correct. The bugs have been
in the callers (timing, zero-dimension guards), not in the math.

**The contract for `viewport-align.ts`:**

```
Inputs:
  - tutor: { scrollX, scrollY, zoom, viewportWidth, viewportHeight }
    All five fields required. viewportWidth/viewportHeight MUST be > 0.
    If not provided, fall back to raw scroll (no center-alignment).
  - student: { viewportWidth, viewportHeight }
    Read from api.getAppState().width/height.
    Must be > 0. If not, defer via requestAnimationFrame (see Rule 4 above).

Output:
  - { scrollX, scrollY, zoom } — safe to pass to api.updateScene({ appState }).

Invariants:
  - This function is pure (no side effects).
  - All inputs must be finite numbers > 0 for center-align to run.
  - NaN or Infinity inputs → return the raw tutor scroll unchanged (safe fallback).
```

**Wire protocol change required:** Add `viewportWidth?: number; viewportHeight?: number`
to `WhiteboardWireFollow` in `sync-client.ts`. The tutor workspace reads these from
`api.getAppState()` at broadcast time and includes them in the `follow` payload. When
absent (old/student clients), the student falls back to raw scroll.

### 5.5 Per-page invariants

These invariants must hold after every `runV3Apply` completes. The executor implementing
Phase 1 MUST include a test for each.

1. **No cross-page contamination:** `pageDataRef["p1"]` contains only elements from the
   tutor's v3 document `pages["p1"]`. An element's `id` never appears in more than one
   page bucket after an apply.

2. **Active page matches canvas:** After `runV3Apply` completes,
   `pageDataRef[activePageIdRef.current]` is exactly what was passed to
   `api.updateScene({ elements })`.

3. **Frozen leaving page:** When `runV3Apply` detects a page change (new
   `page.activePageId !== old activePageId`), `pageDataRef[old activePageId]` is NOT
   updated by reading from the canvas. It retains its value from the previous apply.

4. **Monotonic rev guard:** `runV3Apply` ignores (drops with a warn log) any v3 message
   with `rev <= lastTutorV3RevRef.current`, EXCEPT after a tutor reconnect (detected by
   the peer-presence map showing the tutor peer disappearing and reappearing — at which
   point `lastTutorV3RevRef.current` resets to 0).

5. **Hydration consistency:** After asset hydration (`hydrateRemoteImageFilesForScene`),
   the elements stored in `pageDataRef[pageId]` have their `customData.assetUrl` resolved
   to the proxied URL. The raw wire URL is never stored in pageDataRef (prevents double-
   resolution on subsequent applies).

6. **Viewport applied once per apply:** The `applyViewportAligned` call runs at most
   once per `runV3Apply`, after `api.updateScene` for elements. It NEVER runs for pages
   that are NOT the active page.

### 5.6 Conflict resolution

For the current session model (tutor draws, student follows), conflict resolution is
simple:

> **Tutor wins on all scene state. Student's local canvas edits (if any) are local-only.**

`reconcileElements` (from Excalidraw) resolves per-element by version vector. Since the
tutor is the only author, the tutor's version vector always dominates. Students do not
need CRDT conflict resolution in the current model.

If students are eventually allowed to draw (a future Wave 3+ feature), the conflict
model must be revisited. At that point, Yjs + y-excalidraw becomes the right answer
(see § 2 Option C).

### 5.7 Failure modes and recovery

| Failure | Detection | Recovery |
|---|---|---|
| Relay disconnect mid-session | `onDisconnect` fires → `sync-disconnect` marker in event log | Auto-reconnect (socket.io backoff: 500ms → 10s max). Tutor recording continues. Tutor sees "Reconnecting to student…" banner after 3s. |
| Initial hydration races first broadcast | Student hook buffers `pendingV3Ref` for the canvas-not-ready case | `excalidrawApiRef.current` watcher effect flushes buffer when API arrives |
| Page-switch during apply | Detected by `page.activePageId !== activePageIdRef.current` BEFORE any pageDataRef write | Freeze old page's last-known state (from pageDataRef, not canvas), update activePageIdRef, apply new page from wire |
| Student on mobile, network flutter | Socket.io reconnects transparently | Same as relay disconnect. The rev guard resets on tutor-peer re-detection so a missed rev doesn't stall the student permanently |
| Tutor page refresh mid-session | Tutor sync client disconnects, reconnects, resets rev counter | Rev reset: the student hook detects the tutor peer disappearing from `onRoomPeersChange` → sets `lastTutorV3RevRef.current = 0`. On next tutor broadcast, the full page-document arrives and the student applies cleanly |
| Welcome packet missing (student joins before tutor draws) | Canvas blank; student sees "Waiting for tutor" indicator | Tutor's `onNewRemotePeer` callback fires; tutor re-broadcasts the full v3 document; student's buffered `pendingV3Ref` applies on canvas mount |
| Relay restart | All rooms evicted; all clients disconnect | Same as relay disconnect. After reconnect, `new-user` fires; tutor re-broadcasts welcome packet |
| Viewport dimensions zero on follow-apply | `api.getAppState().width === 0` | Schedule `requestAnimationFrame` retry (Rule 4). At most 1-2 retries before the canvas is laid out |
| Asset hydration fails (private blob URL 403) | `hydrateRemoteImageFilesForScene` returns with `giveUpFileIds` populated | Elements stored in pageDataRef without the resolved asset (broken image tile). Future applies with the same asset skip re-fetch (giveUpFileIds guard). Not a blocking failure |

---

## 6. 5-axis adversarial review

Per `../../agenticPipeline/.cursor/rules/reliability-bar.mdc`: BLOCKERs folded into
Phase-1 acceptance criteria, not deferred.

### Axis 1 — Data durability

**What survives a tab crash:**
- Tutor: `handleEndSession` persists the events.json to Blob and the audio segment to
  IDB outbox. A crash before End-session loses the current recording segment (BACKLOG
  BLOCKER-PROD #1 — IDB partial-segment persistence — pre-existing, out of this redesign's scope).
- Student: Nothing to persist. Student's canvas state comes from the tutor's next broadcast.

**What survives a mid-session network drop:**
- Tutor recording: continues via the audio outbox; `sync-disconnect` markers land in
  the event log. The whiteboard visual on the tutor side stays intact (Excalidraw canvas
  is local).
- Student: canvas freezes. When the student reconnects (socket.io auto-reconnect),
  the tutor's `onNewRemotePeer` fires and re-broadcasts the full v3 document. Student
  canvas restores.
- **BLOCKER** (pre-existing, not introduced here): If the student's browser tab crashes
  during a session, the student must re-join via the same join link. No student-side
  session recovery. Acceptable for current model (students are passive).

**What survives a relay restart:**
- Same as mid-session drop. All clients disconnect → auto-reconnect → welcome packet.
- Risk: if the relay restarts while a tutor-to-student v3 broadcast is in-flight, the
  student may miss one update. The rev guard + tutor reconnect re-broadcast covers this.

**BLOCKER folded into Phase-1 acceptance:** The tutor's `getPagesSnapshot()` must
capture the current canvas state for the active page BEFORE `broadcastDocument`. If the
snapshot captures a stale `pageDataRef[activePageId]` that hasn't been updated since the
last `onChange` event, the wire payload is stale by up to 50ms (the throttle interval).
This is acceptable (50ms stale is invisible) but the executor MUST ensure the tutor's
`onChange` → `pageDataRef` update is synchronous (no async gap in the tutor path).

### Axis 2 — Clock and ordering

**Rev monotonicity:** The student's `lastTutorV3RevRef` guards against out-of-order
delivery. A reordered message with `rev < lastTutorV3RevRef.current` is dropped.
Socket.io with websocket transport delivers in-order (TCP), so reordering is rare in
practice but possible if the relay restarts mid-session and a queued message delivers
on the new connection.

**Rev reset on tutor reconnect:** The student detects tutor disappearance via
`onRoomPeersChange`. When the tutor peer disappears, `lastTutorV3RevRef.current` resets
to 0. This allows the tutor's fresh session (rev starting at 1 again) to be accepted.
**BLOCKER:** The reset must happen on tutor DISAPPEAR from the peer map, not on tutor
RECONNECT. If the reset happens too late (after the tutor's first new-session broadcast
arrives), the first message gets dropped. The executor must test this explicitly.

**Page-switch ordering:** The tutor may send multiple v3 messages in quick succession
during a rapid page-switch (page A → page B in under 50ms). With the throttle, these
are coalesced into one v3 message — the most recent one wins. This is correct (last
write wins for display state).

**Timestamp drift:** The student's session timer is anchored to `bothConnectedAt`
from the server — unaffected by this redesign. No additional clock drift risk.

### Axis 3 — Race conditions

**Page-switch-during-apply race:** Addressed by the render-timing contract (§ 5.3).
The key rule: `activePageIdRef.current` is only updated AFTER we've determined what to
freeze for the leaving page — and that freeze reads from `pageDataRef`, not from the
canvas (so the page identity of `getSceneElements()` is irrelevant).

**Mount/unmount race:** The student hook subscribes to `sync.onRemoteScene` in a
`useEffect`. If the tutor broadcasts a v3 message before the student's `useEffect` has
run (possible on cold mount), the `pendingV3Ref` buffer catches it. On mount, the effect
flushes `pendingV3Ref`. This pattern is already in the codebase and is correct.

**Recorder-pause-during-disconnect:** When the student disconnects (FSM → `paused`
state), the tutor's recording pauses. The whiteboard sync client disconnects too. On the
student side, the canvas freezes. On reconnect, the FSM resumes recording; the sync
client reconnects; the welcome packet restores the student canvas. The recorder and sync
are independent flows — no race between them.

**Initial hydration vs first broadcast:** The student's `excalidrawApiRef` is null until
Excalidraw mounts (lazy-loaded via `next/dynamic`). The `pendingV3Ref` buffer holds any
broadcast that arrives before the API. The hook's `useEffect` watches `excalidrawAPI`
and flushes the buffer on non-null transition. **BLOCKER test case:** The first broadcast
arrives while Excalidraw is still loading (network-slow student). The test must assert
that the student canvas shows the tutor's scene after Excalidraw finishes loading.

**applyingRemoteRef guard:** The student hook sets `applyingRemoteRef.current = true`
during applies. This is used by the student's `onChange` handler to suppress local
"dirty" events during remote applies. **BLOCKER:** Verify that `applyingRemoteRef.current`
is always reset to `false` even when `runV3Apply` throws (it must be in a `finally` block).
Currently it IS in a `try/finally` in the codebase — confirm this stays intact.

### Axis 4 — Cross-platform parity

**Desktop tutor + mobile student:** The primary production scenario. The viewport-align
fix (Rule 4 — rAF retry on zero dimensions) is specifically designed for mobile, where
Excalidraw may take longer to lay out due to the mobile browser's rendering pipeline.

**iOS Safari quirks:**
- Dynamic URL bar: The student's `appState.height` may be reported as the full height,
  but the Excalidraw canvas actually renders in a shorter viewport (dynamic bar visible).
  `dvh` units in CSS mitigate this; the scroll-center alignment math should use
  `api.getAppState().height` (which Excalidraw computes from the canvas container, not
  the CSS viewport height). This is already correct — no change needed.
- Low-power-mode rendering throttling: iOS throttles `requestAnimationFrame` in low
  power mode. The rAF retry in the viewport-align path may fire late. Add a fallback:
  if the rAF hasn't fired within 500ms, force-apply the raw scroll (without center-align).
  **BLOCKER:** Add this timeout-fallback to the rAF retry in `applyViewportAligned`.
- Touch event handling: Excalidraw handles touch internally. The sync layer doesn't
  intercept touch events — no change needed.

**Chrome vs Safari:** The `waitDoubleRaf()` removal (Rule 5) removes a Safari-friendly
timing hack. Before removing it, verify that the new approach (no canvas read during apply)
works on Safari. The unit tests should cover this; a real smoke on Safari iOS is
required as a Phase-1 smoke gate.

**Color palette dismiss on click-away (I7, Sarah's bug):** This is an Excalidraw
behavior not related to the sync redesign. Excalidraw's `onPointerDown` dismisses the
toolbar panel on outside click — this may require a custom `onPointerDown` handler or an
Excalidraw config option. Out of scope for this redesign; keep in BACKLOG.

### Axis 5 — Observability

**Current `wbsid` coverage in sync-client.ts:** The sync client logs every state
transition with `wbsync=${roomId.slice(0, 8)}`. This is good but partial — it doesn't
log the v3 `rev` number on receives or the `pageId` being applied.

**Required log additions for this redesign (all `wbsid=<id>` format per AGENTS.md):**

```
[student-apply] wbsid=<id> action=apply-v3-start rev=<n> activePageId=<pid> pageIds=[...]
[student-apply] wbsid=<id> action=page-switch from=<pid> to=<pid>
[student-apply] wbsid=<id> action=apply-v3-complete rev=<n> elementsOnActiveTab=<N>
[student-apply] wbsid=<id> action=rev-drop reason=stale rev=<n> last=<m>
[student-apply] wbsid=<id> action=rev-reset reason=tutor-reconnect
[student-apply] wbsid=<id> action=viewport-align-defer reason=zero-dimensions retry=<N>
[student-apply] wbsid=<id> action=viewport-align-applied panX=<x> panY=<y> zoom=<z>
[tutor-wire]    wbsid=<id> action=broadcast-v3 rev=<n> pages=[<pid>,...] activePageId=<pid>
```

These logs MUST be present in the Phase-1 implementation. Without them, debugging a
Sarah production issue is impossible without a screen recording.

**BLOCKER:** The `pvs` prefix (per-page view state, per AGENTS.md) should be used for
all viewport-state events. The `wbsid` prefix is session-level. Both should be
co-emitted: `pvs=<pageId> wbsid=<sessionId>` on viewport-align events.

---

## 7. Sequenced implementation plan

### Phase 1 — Disciplined sync layer redesign (Wave 1, highest priority)

**Scope:** Rewrite `useStudentWhiteboardCanvas.ts` `runV3Apply` to comply with the
canonical state authority rules (§ 5.1), render-timing contract (§ 5.3), and per-page
invariants (§ 5.5). Add `viewportWidth`/`viewportHeight` to the tutor's wire payload.
Retire the v2 apply path.

**Files changed (rough list):**
- `src/hooks/useStudentWhiteboardCanvas.ts` — primary changes: `runV3Apply`, `applyTutorFollow`, rev-reset logic
- `src/lib/whiteboard/viewport-align.ts` — add rAF-retry fallback and timeout backstop
- `src/lib/whiteboard/sync-client.ts` — add `viewportWidth`/`viewportHeight` to `WhiteboardWireFollow` type
- `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx` — include `viewportWidth`/`viewportHeight` in `getFollow()` return
- `src/__tests__/whiteboard/use-student-canvas.test.ts` — add test cases for all per-page invariants (§ 5.5) and failure modes (§ 5.7)
- `docs/WHITEBOARD-STATUS.md` — update phase status

**What NOT to change:**
- `sync-client.ts` wire logic (it's correct and well-tested)
- `apply-reconciled-remote-scene.ts` — the `mergeScenesReconciled` function itself is correct; we just stop using it with a live canvas read
- `useTutorLiveDocumentWire.ts` — the tutor broadcast path is correct

**Acceptance criteria (all must pass before Sarah smoke):**

1. [ ] Student applies tutor strokes on page 1 while tutor is drawing: strokes appear < 100ms (visible in Sarah's real session smoke)
2. [ ] Tutor switches from page 1 → page 2: student canvas switches to page 2; page 1 content unchanged on page 1
3. [ ] Tutor inserts PDF (multi-page): all pages populate on student; strokes on page 1 don't appear on pages 2-3
4. [ ] Tutor moves a PDF element: student sees the move without page change
5. [ ] Student loads in on a blank canvas then tutor draws: student sees the strokes (welcome packet path)
6. [ ] Tutor refreshes mid-session: student canvas freezes, then restores after tutor reconnects (rev-reset + welcome packet)
7. [ ] Student on iPhone Safari: viewport-align applies correctly (center matches tutor's view)
8. [ ] All per-page invariants (§ 5.5 items 1-6) pass as unit tests
9. [ ] All required log lines (§ 6 Axis 5) appear in the test suite's logger

**Smoke checklist (for Andrew to run on Vercel Preview):**
- [ ] Solo: Tutor draws circle on P1 → student sees circle < 2s
- [ ] Solo: Tutor moves the circle → student sees the move
- [ ] Solo: Tutor switches to P2, draws → student auto-follows to P2
- [ ] Solo: Return to P1 → student sees original circle, not P2 content
- [ ] PDF: Insert 3-page PDF → student sees 3 board pages; check content of each
- [ ] Viewport: Tutor zooms in/out → student view follows (center aligned)
- [ ] iPhone: Student on iPhone Safari; repeat above smoke scenarios
- [ ] Reconnect: Kill relay (`fly machine suspend`), wait for disconnect banner, restart → student canvas restores
- [ ] Refresh: Tutor hard-refreshes → student canvas freezes ~3s then restores

**Rollback plan:** `git revert <commit>`. The Phase 1 changes are in the student hook
only — rolling back restores round-3's behavior (page-bleed fixed, lag bug present).
The lag bug is less severe than the page-bleed was; rollback is safe.

**Honest effort estimate:** 3-4 hours Composer 2.5 dispatch. The scope is well-defined
and the architecture is explicit. No design ambiguity. Risk: Composer may need a second
pass if a test reveals a timing issue not anticipated here — budget a follow-up 1-2 hour
dispatch if the smoke finds a regression.

### Phase 2 — Relay observability (Wave 2, low priority)

**Scope:** Add a Fly.io health endpoint + basic room-count metric to excalidraw-room.
Add a relay health check to the workspace client (display "Relay connecting..." when the
socket is not connected).

**Files changed:** `whiteboard-sync/src/index.ts` (sibling repo) + `sync-client.ts`
onConnect/onDisconnect surfacing.

**Acceptance criteria:**
- [ ] `curl https://wb.mortensenapps.com/health` returns `{"status":"ok","rooms":N}`
- [ ] Workspace shows "Reconnecting to sync…" banner on relay disconnect, clears on reconnect

**Honest effort estimate:** 1-2 hours Composer 2.5.

### Phase 3 — Tutor viewport-size wire (required by Phase 1, same dispatch)

This is actually part of Phase 1 (the `viewportWidth`/`viewportHeight` wire change),
listed separately only to make the scope explicit.

**Files changed:** `sync-client.ts` (type), `WhiteboardWorkspaceClient.tsx` (getFollow),
`useStudentWhiteboardCanvas.ts` (consume), `viewport-align.ts` (require field).

**Acceptance criteria:** Center-align smoke passes on both desktop-tutor + mobile-student.

### Phase 4 (Wave 3 contingency) — Yjs + Excalidraw migration

**Precondition:** Phase 1 has been validated in ≥3 Sarah sessions with no regression.
If Phase 1 produces another round of regressions, escalate to this phase.

**Scope:** Migrate the sync layer to Yjs (`y-excalidraw`) and y-websocket (or Cloudflare
Durable Objects). Replace `pageDataRef` + `runV3Apply` with a Yjs Y.Doc per page.
Replace excalidraw-room with y-websocket server.

**This phase requires a Sonnet-tier design pass** before a Composer execution dispatch.
The design must cover:
- Yjs Y.Doc shape for per-page elements
- y-excalidraw integration with our multi-page model
- y-websocket or CF DO relay deployment
- Recording adapter changes
- Migration of the CSP + PLATFORM-ASSUMPTIONS

**Honest effort estimate:** 10-14 days (Sonnet design pass + multiple Composer dispatches).
Do not start this phase without Andrew's explicit go-ahead after Phase 1 validation.

---

## 8. What carries forward from current code

The following are explicitly preserved by the Phase 1 redesign:

| Component | Carries forward? | Notes |
|---|---|---|
| Encryption key lifecycle (`src/lib/whiteboard/encryption-key.ts`) | ✅ Unchanged | Per-session AES-GCM key in URL fragment + localStorage. Non-negotiable. |
| Join token flow (`issueJoinToken`, `revokeJoinTokensForSession`) | ✅ Unchanged | Server actions, Neon-backed, ownership-asserted. |
| Room policy (whiteboardSessionId → roomId in join URL) | ✅ Unchanged | Room isolation is correct. |
| Recorder integration boundary (`useWhiteboardRecorder`) | ✅ Unchanged | Phase 1 changes don't touch the recording path. |
| Event-log schema and adapter (`excalidraw-adapter.ts`, `event-log.ts`) | ✅ Unchanged | Library-agnostic design is correct. |
| Phase 0 brand tokens (`design-tokens.css`, ESLint guardrail) | ✅ Unchanged | Phase 1 is sync-only. No visual changes. |
| Per-page UI affordances (`PageStrip.tsx`, page list state) | ✅ Unchanged | Page list is populated by v3 wire; the UI component doesn't change. |
| Undo/redo synthetic Ctrl+Z (`undo-redo.ts`, `UndoRedoButtons.tsx`) | ✅ Unchanged | Undo/redo is Excalidraw-internal; no sync changes needed. |
| `sync-client.ts` (wire/crypto/socket layer) | ✅ Minor change | Only the `WhiteboardWireFollow` type gets `viewportWidth`/`viewportHeight` fields. The entire socket lifecycle, encryption, and subscription API is unchanged. |
| `apply-reconciled-remote-scene.ts` (`mergeScenesReconciled`) | ✅ Unchanged | The reconcile logic is correct; we just change who calls it and with what inputs. |
| `hydrate-remote-files.ts` | ✅ Unchanged | Asset hydration logic is correct. |
| `board-document-snapshot.ts` (PageViewState type) | ✅ Unchanged | |
| Excalidraw version (^0.18.1) | ✅ Unchanged | No library version change. |
| excalidraw-room relay on Fly.io | ✅ Unchanged | The relay is not the source of fragility. |
| CSP in `src/middleware.ts` | ✅ Unchanged | No new origins added. |
| PLATFORM-ASSUMPTIONS | Minor update required | Add `viewportWidth`/`viewportHeight` to the `WhiteboardWireFollow` wire schema entry (§ 7.5 in that doc). |

**What is explicitly removed by Phase 1:**

| Component | Removed | Reason |
|---|---|---|
| v2 apply path in `useStudentWhiteboardCanvas.ts` | ✅ Removed | v3-only. v2 messages logged-and-returned. |
| `waitDoubleRaf()` in the student apply path | ✅ Removed | Was compensating for canvas reads during apply. No longer needed. |
| DOM `.excalidraw-container` fallback in `viewport-align.ts` | ✅ Replaced | Replaced with rAF retry (Rule 4). DOM reads in effects are unreliable. |
| `api.getSceneElements()` call in `runV3Apply` | ✅ Removed | The root cause. `pageDataRef` is the source of truth for all pages. |

---

## 9. Open questions for Andrew

These decisions are required before the Phase 1 Composer dispatch can be written.
Each has 2-3 viable answers and a clear recommendation.

---

**Q1: Should Phase 1 include retiring the v2 `broadcastScene` call from the STUDENT side?**

Context: The student hook currently calls `sync.broadcastScene` with its own elements
(for attribution labels). This is a v2 outbound broadcast from student to tutor. It's
used for the student's cursor attribution in the tutor's participant tiles.

- Option A: Keep it — student still broadcasts v2 for attribution. The tutor's apply
  path handles v2 inbound from students. Low risk, less cleanup.
- Option B: Retire it — student broadcasts a presence-only `WhiteboardWirePresence`
  message (already exists) and never sends scene elements. Attribution comes from the
  presence map. Cleaner.
- **Recommendation: Option B.** Students don't own scene elements. The presence system
  (Phase 4b) already handles identity. Letting students broadcast elements creates a
  confusing second writer in the room.

---

**Q2: Should `viewportWidth`/`viewportHeight` be added to the v3 `WhiteboardWireFollow` type or to the `WhiteboardWirePage` type?**

Context: Both are broadcast in the same v3 message. The viewport size belongs
semantically with the follow info (it's needed to compute center-alignment on the student
side), but it could also be per-page (since each page's viewport might differ if the
tutor zoomed differently per page).

- Option A: Add to `WhiteboardWireFollow` — one pair of numbers for the currently-active
  page's viewport. Simple.
- Option B: Add per-page to the `pageList` rows (alongside `viewState`) — allows
  different viewport sizes per page.
- **Recommendation: Option A.** The follow viewport is the tutor's active window size.
  It doesn't change per-page (the browser window is the same size regardless of page).
  The tutor's per-page zoom is already in `viewState`. The student's center-alignment
  only needs the tutor's current window size.

---

**Q3: Should the Phase 1 redesign fix the eraser cursor mismatch (round-3 symptom) or defer it?**

Context: The eraser cursor mismatch (delete-position differs from cursor visual) is
almost certainly a coordinate-transform bug in how the eraser's scene coordinates are
computed. It may be a separate issue from the sync redesign (it might exist in solo mode
too). Scope creep risk: it's a different class of bug (rendering) from the sync
redesign (state flow).

- Option A: Fix in Phase 1 — determine if it's sync-related or rendering-related and fix it.
- Option B: Defer to a separate BACKLOG entry — keep Phase 1 scope tight.
- **Recommendation: Option B.** Keep Phase 1 tightly scoped to the sync state-flow issues.
  Add the eraser cursor mismatch to BACKLOG with priority "before next Sarah session."
  If it turns out to be a sync artifact (i.e., it disappears after Phase 1), close the
  backlog entry without a separate fix.

---

**Q4: Should Yjs + Excalidraw be on a formal timeline for Wave 3, or deferred indefinitely?**

Context: The Phase 1 redesign SHOULD solve the structural issues. If it does, the Yjs
migration is not needed. If it doesn't (another regression in Sarah's sessions), the Yjs
migration becomes the next escalation path.

- Option A: Commit to Yjs for Wave 3 regardless of Phase 1 results — ensures we have a
  clear path off the current architecture.
- Option B: Defer Yjs contingent on Phase 1 results — do Phase 1, validate with Sarah,
  only begin Yjs design if Phase 1 still produces regressions.
- **Recommendation: Option B.** The Phase 1 redesign is architecturally sound. Do not
  commit to a 10-14 day migration before proving we need it. "If Phase 1 regressions
  appear, escalate to Yjs" is the right contingency plan.

---

**Q5: Should we migrate the relay to PartyKit/Cloudflare DOs in Phase 2 or stay on fly.io?**

Context: excalidraw-room on Fly.io is working. PartyKit offers global edge latency and
stateful welcome packets. The migration cost is moderate (~2-3 hours Composer dispatch).

- Option A: Stay on Fly.io — relay works, don't fix what isn't broken.
- Option B: Migrate to PartyKit/CF DO — better global latency, relay observability,
  stateful welcome packets. ~$5/mo vs ~$2/mo.
- **Recommendation: Option A for now; revisit when: (a) a non-US tutor/student reports
  latency issues, or (b) the welcome-packet race causes a production incident.** The
  $3/mo saving over PartyKit is not the reason to stay — the reason is "relay is not the
  fragility source."

---

**Q6: Should per-session logging use a new `wbs` prefix or the existing `wbsid` convention?**

Context: AGENTS.md says "new capture/sync features pick a 3-letter prefix." The
whiteboard sync has `wbsid` for session-level events. The student apply path needs its
own prefix for apply-level events.

- Option A: Use `wba` (whiteboard apply) for apply-path events.
- Option B: Continue using `wbsid` with additional action tags.
- **Recommendation: Option A.** Keeps the grep-ability clean: `grep wba= logs` shows only
  apply events; `grep wbsid= logs` shows session lifecycle events. Register `wba` in
  AGENTS.md § Conventions.

---

## Changelog

- **2026-05-27:** Initial pass. Authored by Sonnet 4.6 subagent during Opus orchestrator
  redesign session. Code read: 4 source files + 3 git diffs. External research: tldraw
  SDK 4.0 license change confirmed ($6k/year); PartyKit acquisition by Cloudflare
  confirmed (now CF DOs). Recommendation: keep Excalidraw + excalidraw-room; redesign
  client sync layer with single canonical state authority.
