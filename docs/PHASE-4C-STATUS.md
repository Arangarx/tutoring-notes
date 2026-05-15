# Phase 4c — AV UI + workspace/student mounting + CSP unblock — branch handoff

**Branch:** `phase-4c-av-ui-and-mounting` (off `master` at the 4b merge
commit `e92c913`).
**Master plan:** `~/.cursor/plans/tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md`
**Pillars in scope:** Pillar 6 (Live A/V transport — UI + mounting +
per-route Permissions-Policy) + the Pillar 1 (multi-participant FSM)
input wiring on the workspace side.
**Position in Phase 4:** 3rd of 4 sub-chats (4a → 4b → **4c** → 4d).
**Companion docs:**
[PHASE-4A-STATUS.md](PHASE-4A-STATUS.md) (peer-mesh + signaling
foundation),
[PHASE-4B-STATUS.md](PHASE-4B-STATUS.md) (hook + recorder; the
canonical handoff for what 4c inherits),
[RECORDER-LIFECYCLE.md](RECORDER-LIFECYCLE.md) (ID-prefix
registry — `avx` continues to identify live-A/V; no new prefix
added),
[AGENTS.md](../AGENTS.md) (workspace conventions; **the new
per-route Permissions-Policy is documented here**).

This is the canonical handoff for Phase 4c. Read it FIRST when picking
up Phase 4d or this branch in a fresh chat — it lists what landed, the
per-route Permissions-Policy contract, the AV component public APIs,
the workspace + student mount integration shape, what is explicitly
deferred to 4d, and the smoke checklist.

---

## Status

**4c feature-complete. Branch pushed; PR open; awaiting Vercel preview
smoke before merging to `master`.**

This sub-chat covers Phase 4 Tasks 4 (UI components), 6 (workspace +
student mounting), and 7 (CSP / Permissions-Policy unblock — moved up
from 4d per the orchestrator's revised partitioning since the
unblock is a hard precondition for any browser-level smoke). Task 8
(graceful-degradation copy polish), Task 9 (`docs/LIVE-AV.md`), and
Playwright integration tests are deferred to 4d.

| Commit | Summary | Files changed |
|---|---|---|
| `7ff5306` | Per-route Permissions-Policy unblock. `buildPermissionsPolicy(pathname)` widens to `camera=(self), microphone=(self)` ONLY on workspace + student-join routes; all other routes keep the tight `camera=(), microphone=(self)` policy. Regression test asserts the asymmetry. | `src/lib/security/csp.ts`, `src/middleware.ts`, `src/__tests__/regressions/csp-headers.test.ts` |
| `d6ededf` | `src/components/av/{AVTile, AVTilesPanel, AVPermissionsPrompt, AVControls}.tsx` + 4 dom-test suites. Tiles render `<video muted>` + `<audio>` separately (no audio doubling). Prompt drives independent `requestMic()` / `requestCam()`. Controls expose local mute toggles + optional per-participant moderation override. | `src/components/av/*.tsx`, `src/__tests__/components/av/*.dom.test.tsx` |
| `c9bf60a` | Tutor-side mount. `WhiteboardWorkspaceClient` mints `localPeerId`, threads it into both `createWhiteboardSyncClient({peerId})` and `useLiveAV({localPeerId})`, populates the lifecycle FSM `inputStreams` with one `student:peer-<id>:mic` entry per active participant, instantiates one `remote-stream-recorder` per peer via a new `useRemoteMicRecorders` orchestrator hook gated by `shouldCapture` + a moderation set, and wires sync-reconnect → `liveAv.reconnectPeer` for every current peer. | `src/app/admin/.../workspace/WhiteboardWorkspaceClient.tsx`, `src/hooks/useRemoteMicRecorders.ts`, `src/__tests__/hooks/useRemoteMicRecorders.dom.test.tsx`, `src/__tests__/dom/WhiteboardWorkspaceClient.av-mount.dom.test.tsx` |
| `3996e67` | Student-side mount. Same `localPeerId` + `useLiveAV` + AV-component wiring as the tutor; NO recorder, NO FSM. Sync-reconnect mesh-restart identical to the tutor side. | `src/app/w/[joinToken]/StudentWhiteboardClient.tsx`, `src/__tests__/dom/StudentWhiteboardClient.av-mount.dom.test.tsx` |
| _this commit_ | `docs/PHASE-4C-STATUS.md` — this handoff doc | docs only |

---

## What changed (architecturally)

### 1. Per-route Permissions-Policy (Task 7)

Until 4c, `src/middleware.ts` shipped a single static header:
`Permissions-Policy: camera=(), microphone=(self), geolocation=()`.
That denies camera site-wide, so `getUserMedia({video: true})` could
never succeed in any browser. The 4c unblock keeps the deny-by-default
posture for everything except the two routes that NEED camera —
defense in depth.

**`src/lib/security/csp.ts`** now exports `buildPermissionsPolicy(pathname)`
and `LIVE_AV_ROUTE_PATTERNS`:

```ts
export const LIVE_AV_ROUTE_PATTERNS: ReadonlyArray<RegExp> = [
  /^\/admin\/students\/[^/]+\/whiteboard\/[^/]+\/workspace(?:\/.*)?$/,
  /^\/w\/[^/]+(?:\/.*)?$/,
];

export function buildPermissionsPolicy(pathname: string): string {
  if (LIVE_AV_ROUTE_PATTERNS.some((re) => re.test(pathname))) {
    return "camera=(self), microphone=(self), geolocation=()";
  }
  return "camera=(), microphone=(self), geolocation=()";
}
```

**`src/middleware.ts`** pulls `Permissions-Policy` out of
`staticSecurityHeaders` and re-builds it per-request via
`buildPermissionsPolicy(pathname)`. Every other security header
remains static. The CSP itself was NOT modified — CSP doesn't gate
WebRTC connections, only HTTP/connect/origin; the existing
`connect-src` already permits the configured sync server.

**`src/__tests__/regressions/csp-headers.test.ts`** has new cases for
the policy asymmetry:

- Workspace route (`/admin/students/.../whiteboard/.../workspace`,
  including nested paths) → `camera=(self), microphone=(self)`.
- Student-join route (`/w/[joinToken]`, including nested paths) →
  same widened policy.
- Sibling admin routes (`/admin/students/123/notes`, etc.) → tight
  `camera=()` policy unchanged.
- Static-asset / sign-in / home routes → tight policy unchanged.
- Regex anchoring asserted (so a URL like
  `/foo/admin/students/.../workspace/x` doesn't accidentally widen).

### 2. AV UI components (Task 4)

Four React components live under `src/components/av/`. They are pure
presentation — no business logic, no FSM, no recorder calls. They
read state from `useLiveAV` and surface callbacks the host wires up.

| File | Responsibility | Notes |
|---|---|---|
| `AVTile.tsx` | One participant tile. Renders `<video autoPlay muted playsInline>` with `srcObject = participant.videoStream` + (remote only) a separate `<audio autoPlay>` with `srcObject = participant.audioStream`. | Video element is ALWAYS muted to prevent audio doubling — audio plays exclusively through the companion `<audio>` element. Local tile omits the `<audio>` entirely (would echo). Mirrors local video via `transform: scaleX(-1)`. Shows label + connection-state pill (`peerConnectionState` verbatim in 4c; 4d makes it user-friendly). |
| `AVTilesPanel.tsx` | Flex-wrap grid of tiles. | Renders the optional `localTile` first (so the tutor / student sees themselves), then remote `participants` in their incoming order (already lex-sorted by `useLiveAV`). Empty-state copy when there are no participants. |
| `AVPermissionsPrompt.tsx` | First-mount permission ask. | Reads `hasMicPermission` + `hasCamPermission` from `useLiveAV`. Two independent "Allow" buttons (per the 4b realignment — must support mic-granted-cam-denied). "Requesting…" label while a request is in flight. "Try again" affordance on the denied state (closes the 4b deferral on late-grant). Auto-hides when both permissions are `"granted"` OR the local stream is already attached. |
| `AVControls.tsx` | Local mute toggles + (tutor-only) per-participant moderation. | Local toggles always render; the moderation section only renders when the host passes a `moderation` prop. Moderation flips a per-`peerId` recording-only suppress flag — the live audio still plays to the tutor; only the outbox segment is suppressed. Wire-level mute remains post-v1, out of scope. |

Each component has a dedicated dom-test suite under
`src/__tests__/components/av/`:

| Suite | Cases | Asserts |
|---|---|---|
| `AVTile.dom.test.tsx` | 14 | `srcObject` set correctly for video + audio; label fallback to role; pill renders `peerConnectionState`; local tile omits `<audio>`; mirror transform applied; mic-muted overlay; `data-peer-id` exposed for queries; remote tile renders audio even when video is null. |
| `AVTilesPanel.dom.test.tsx` | 6 | Empty state; local-tile-first ordering; remote tiles render in input order; multi-peer scenario doesn't double-render; `data-peer-id` selector reliably targets root tile elements (not nested). |
| `AVPermissionsPrompt.dom.test.tsx` | 9 | Hidden when both granted + streams present; visible when either is `"prompt"`/`"unknown"`/`"denied"`; independent button clicks call the right `request*`; "Requesting…" label while in-flight; "Try again" on denied. |
| `AVControls.dom.test.tsx` | 11 | Mic + cam toggles call the right callback; `aria-pressed` flips; disabled state prevents click; moderation rows only render when prop provided; check/uncheck calls `onTogglePeer(peerId, true|false)`; disabled checkboxes for connecting peers can't be toggled (asserted via `disabled` attribute, not synthetic event — see "Errors / fixes" below). |

### 3. Tutor-side mount in `WhiteboardWorkspaceClient.tsx` (Task 6)

The workspace is the orchestrator. It mints the identity, threads it
through every layer, owns the moderation state, populates the FSM,
and instantiates the recorders.

**Stable `localPeerId`** is minted ONCE per workspace mount via
`useMemo(() => crypto.randomUUID(), [])`. A defensive fallback handles
the legacy-runtime case where `crypto.randomUUID` is missing. The same
id is passed to BOTH:

- `createWhiteboardSyncClient({peerId: localPeerId, localPeerLabel,
  ...})` — so the sync-client's outbound presence envelopes carry
  this peerId and the signaling envelopes target the right peer.
- `useLiveAV({localPeerId, syncClient, sessionId: whiteboardSessionId})`
  — so peer-mesh's polite/impolite role assignment + the signaling
  layer's targetPeerId demux see the same identity.

**This resolves the open scoping question from 4b** ("who owns peerId,
the workspace or the hook?") in favour of single-source-of-truth at
the workspace. The hook is a consumer, not the owner.

**`localPeerLabel`** defaults to `"Tutor"` on the workspace and
`"You"` on the student side. Real admin-display-name threading is a
4d polish task that doesn't change the contract.

**FSM `inputStreams` population**: the `lifecycleInputStreams` memo
extends the existing tutor-mic entry with one
`student:peer-<peerId>:mic` entry per active participant. A small
local `pcStateToStreamHealth` mapper converts
`RTCPeerConnectionState` → `StreamHealth`:

| `peerConnectionState` | `StreamHealth` |
|---|---|
| `"connected"` | `"ok"` |
| `"new"` / `"connecting"` / `"disconnected"` | `"degraded"` |
| `"failed"` / `"closed"` | `"failed"` |

The mapping deliberately lives in the workspace (alongside the mount
glue) rather than inside `useLiveAV` — keeping the hook FSM-agnostic
mirrors the same separation `remote-stream-recorder` maintains.

**Per-participant recorder orchestration** goes through a new hook,
`src/hooks/useRemoteMicRecorders.ts`. The workspace was already very
large (~2000 lines); extracting the recorder reconciliation made the
mount surgical AND testable in isolation:

```ts
useRemoteMicRecorders({
  participants: liveAv.participants,
  sessionId: whiteboardSessionId,
  outbox: uploadOutbox,
  shouldCapture: lifecycle.shouldCapture, // from evaluateLifecycle
  mutedPeerIdsInRecording, // Set<peerId> driven by AVControls moderation
});
```

The hook owns three side effects:

1. **Reconcile** — keep a `Map<peerId, RemoteStreamRecorder>` in sync
   with the participant set. New peer with audioStream → instantiate
   with `streamId: studentMicStreamId(peerId)`; peer left → `stop()`
   then `dispose()`; peer without audioStream yet → wait.
2. **Gate** — on every render, gate each recorder's `start()` /
   `stop()` by
   `shouldCapture(streamId) && !mutedPeerIdsInRecording.has(peerId)`.
   The FSM is the primary authority; moderation is a per-peer veto.
3. **Teardown** — on unmount, stop + dispose every recorder so devices
   are freed even when the workspace navigates away mid-session.

The hook returns `void` — the workspace doesn't need to observe
recorder state directly; everything the UI needs is already in
`useLiveAV.participants[i].peerConnectionState`.

**Tutor moderation state** (`mutedPeerIdsInRecording: Set<peerId>`)
is owned by the workspace as a `useState`. `AVControls`' `moderation`
prop receives the participant list + the muted set + a toggle
callback. Wire-level coordination (asking the remote peer to actually
stop transmitting) stays post-v1 / out of scope.

**Sync-reconnect resilience** (closing the 4b deferral): the
workspace tracks `sawDisconnectSinceLastConnectRef` and, on the
disconnect → reconnect transition, calls
`liveAv.reconnectPeer(peerId)` for every current peer. The FIRST
`onConnect` after mount is suppressed (it's the natural handshake;
peer-mesh is being set up, nothing to recover). Without this
suppression, the workspace would race peer-mesh's initial
negotiation with a spurious ICE restart and break first-mount.

### 4. Student-side mount in `StudentWhiteboardClient.tsx` (Task 6)

Mirrors the tutor mount with the student-specific constraint: no FSM,
no recorder. Student is a receive-only consumer of remote tracks.

Same `localPeerId` minting + threading pattern. Same `useLiveAV`
shape (with `syncClient`, `localPeerId`, `sessionId`). Same
sync-reconnect mesh-restart wiring with first-mount suppression. Same
three AV components rendered in the same order. The student-side AV
panel sits between the existing header card (connection / timer
pills) and the page-strip card.

The `AVControls` component on the student side omits the
`moderation` prop, so only the local mic / cam toggles render — there
is no per-participant moderation surface for students.

### 5. Logging contract

No new ID prefixes added per the AGENTS.md "keep the registry tight"
recommendation. New log lines reuse `avx` (live-A/V) and `obx` (outbox
rows) and pair them with `peer` for per-participant events. The
workspace mount adds:

```
[WhiteboardWorkspaceClient]   wbsid=<id> avx=<id> sync-reconnect peers=<N>
[useRemoteMicRecorders]       avx=<id> recorder created peer=<peerId> streamId=<...>
[useRemoteMicRecorders]       avx=<id> recorder started peer=<peerId>
[useRemoteMicRecorders]       avx=<id> recorder stopped peer=<peerId> reason=<shouldCapture|moderated|unmount>
[useRemoteMicRecorders]       avx=<id> recorder disposed peer=<peerId> (<reason>)
[StudentWhiteboardClient]     wbsid=<id> avx=<id> sync-reconnect peers=<N>
```

Existing 4b lines from `useLiveAV`, `remote-stream-recorder`, and
`sync-client` continue to fire and are documented in
PHASE-4B-STATUS.md.

---

## Public API — what Phase 4d inherits

### AV components — exported props (stable; don't break these)

```ts
// src/components/av/AVTile.tsx
type AVTileProps = {
  participant: {
    peerId: string;
    role: "tutor" | "student";
    label?: string;
    audioStream: MediaStream | null;
    videoStream: MediaStream | null;
    peerConnectionState: RTCPeerConnectionState;
    iceConnectionState: RTCIceConnectionState;
  };
  isLocal?: boolean;                 // omits <audio>, mirrors video
  localMicMuted?: boolean;           // local tile only — drives muted overlay
  localCamMuted?: boolean;           // local tile only — drives black-out
  testId?: string;                   // default `av-tile-${peerId}`
};

// src/components/av/AVTilesPanel.tsx
type AVTilesPanelProps = {
  participants: ReadonlyArray<AVTileProps["participant"]>;
  localTile?: AVTileProps["participant"] & {
    isMicMuted?: boolean;
    isCamMuted?: boolean;
  };
  className?: string;
  testId?: string;                   // default `av-tiles-panel`
};

// src/components/av/AVPermissionsPrompt.tsx
type AVPermissionsPromptProps = {
  hasMicPermission: "unknown" | "prompt" | "granted" | "denied";
  hasCamPermission: "unknown" | "prompt" | "granted" | "denied";
  hasMicStream: boolean;             // overrides "denied" hiding if mic is already live
  hasCamStream: boolean;
  error: AvAcquireError | null;
  videoError: AvAcquireError | null;
  requestMic: () => Promise<void>;
  requestCam: () => Promise<void>;
  heading?: string;
  testId?: string;
};

// src/components/av/AVControls.tsx
type AVControlsProps = {
  isMicMuted: boolean;
  isCamMuted: boolean;
  toggleMic: () => void;
  toggleCam: () => void;
  disabled?: boolean;                // typically !isActive
  moderation?: {                     // tutor side only
    participants: ReadonlyArray<{ peerId: string; label?: string;
                                  peerConnectionState: RTCPeerConnectionState }>;
    mutedPeerIds: ReadonlySet<string>;
    onTogglePeer: (peerId: string, nextMuted: boolean) => void;
  };
  testId?: string;
};
```

### `useRemoteMicRecorders` (new in 4c — host orchestrator hook)

```ts
function useRemoteMicRecorders(opts: {
  participants: ReadonlyArray<{
    peerId: string;
    audioStream: MediaStream | null;
  }>;
  sessionId: string;                 // whiteboardSessionId
  outbox: UploadOutbox;              // Phase 1b instance via upload-outbox-instance
  shouldCapture: (streamId: string) => boolean;     // from evaluateLifecycle
  mutedPeerIdsInRecording: ReadonlySet<string>;     // from workspace state
  log?: Pick<Console, "log" | "warn" | "error">;
}): void;
```

The hook is intentionally `void`-returning. It owns the recorder Map
and runs side effects; the workspace doesn't need direct access to
the recorder instances. If 4d needs to expose per-peer recording
state, the cleanest pattern is to derive it from
`useLiveAV.participants[i]` + the moderation set rather than reaching
into the hook.

### CSP / Permissions-Policy

`src/lib/security/csp.ts` exports:

```ts
export const CONTENT_SECURITY_POLICY: string;  // unchanged in 4c
export const LIVE_AV_ROUTE_PATTERNS: ReadonlyArray<RegExp>;
export function buildPermissionsPolicy(pathname: string): string;
```

If 4d (or any future work) needs to widen Permissions-Policy on a new
route, update `LIVE_AV_ROUTE_PATTERNS`. The middleware picks up the
change automatically.

---

## CSP discipline — per AGENTS.md

> "Adding a new external origin (sync server, embed, font CDN)
> requires updating `src/middleware.ts` and documenting it in the
> feature's STATUS doc."

Phase 4c didn't add any new external origins. The CSP itself was NOT
modified (no new `connect-src` / `script-src` / `media-src` entries
needed — the camera/mic streams are local). The Permissions-Policy
WAS widened, but only to `(self)` (same-origin) on two specific
routes — that's a relaxation, not a new external origin. This doc
serves as the per-feature documentation of that relaxation.

---

## Test counts

| Surface | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `src/__tests__/regressions/csp-headers.test.ts` (extended) | all green |
| `src/__tests__/components/av/*.dom.test.tsx` (40 cases across 4 suites) | all green |
| `src/__tests__/hooks/useRemoteMicRecorders.dom.test.tsx` (12 cases) | all green |
| `src/__tests__/dom/WhiteboardWorkspaceClient.av-mount.dom.test.tsx` (6 cases) | all green |
| `src/__tests__/dom/StudentWhiteboardClient.av-mount.dom.test.tsx` (5 cases) | all green |
| `npx jest` (full repo) | **952 of 960 unit tests pass.** Same 8 pre-existing DB-dependent failures Phases 4a + 4b documented (`auth.test.ts`, `email.test.ts`, `note-and-share.test.ts`, `password-reset.test.ts`, `transcribe-late-hallucination.test.ts`). NOT regressions. |

### What the new suites assert (in brief)

The component suites are tight contract tests against the props
above. The mount suites use a mock-at-module-boundary strategy
(same shape as the existing `WhiteboardWorkspaceEnd.dom.test.tsx`)
so the heavy upstream deps (Excalidraw, recorders, audio bridge,
server actions, theme hook, image hydrators) don't enter the test
graph. See each file's top-of-file comment block for the assertion
list.

The workspace mount suite is the most important one for 4d to keep
green:

- `localPeerId` is minted once and threaded into BOTH sync-client
  AND `useLiveAV`. Same id everywhere, no drift.
- 3-peer canary: tutor + 2 students renders 3 tiles, instantiates 2
  recorders with the canonical `student:peer-<id>:mic` streamId, and
  populates FSM `inputStreams` with both student-mic entries.
- `peerConnectionState` → `StreamHealth` mapping is exactly
  connected→ok, connecting→degraded, failed→failed.
- Sync-reconnect: disconnect → connect transition fires
  `liveAv.reconnectPeer(peerId)` for every current peer.
- First-mount `onConnect` does NOT fire `reconnectPeer` (defensive
  against the "premature mesh.restart races initial negotiation"
  regression).

---

## Errors / fixes (kept for posterity)

- **`AVTilesPanel` testId selector mismatch.** Initial test selector
  used `getAllByTestId(/^av-tile-/)` and matched nested elements inside
  the tile. Fixed by switching the selector to
  `panel.querySelectorAll<HTMLElement>("[data-peer-id]")` (root tile
  elements only) and dropping a stray `testId` override on the local
  tile so the default `av-tile-${peerId}` pattern applies uniformly.

- **`AVControls` disabled-checkbox synthetic event.** A test tried to
  `fireEvent.click()` a disabled checkbox and assert the toggle
  callback was NOT called. jsdom's React-synthetic-event path can
  still fire `onChange` on a disabled input even when a real browser
  wouldn't. Fixed by asserting the `disabled` HTML property directly
  (the actual user-facing behavior) instead of simulating the event.

- **Sync-reconnect first-mount false-positive.** First implementation
  seeded the "was-connected" ref from `sync.isConnected()` (which is
  `false` at mount), so the first `onConnect` fired a spurious
  mesh.restart. Switched to a "saw-disconnect-since-last-connect"
  flag whose default is `false` — the first `onConnect` is suppressed,
  subsequent connect-after-disconnect transitions fire the restart.
  This matches production semantics where peer-mesh is being set up
  on the first connect (nothing to recover) and the restart only
  matters after a real disconnection.

- **Pre-existing 8 DB-dependent jest failures.** Same baseline as 4a +
  4b; tests assume a reachable local Postgres on `127.0.0.1:5432`.
  Not a regression. They run on CI / Vercel preview where the DB IS
  reachable.

---

## What Phase 4d must add (not done here)

This is the explicit handoff list. Each item is OUT of scope of 4c
and IN scope of 4d.

1. **Graceful-degradation polish** (Task 8):
   - Map `AvAcquireError.type` / `videoError.type` to user-facing
     copy on the `AVPermissionsPrompt` denied state.
     mic-granted-cam-denied = audio-only proceed; both-denied =
     reroute the session into a no-AV mode (whiteboard + tutor-mic
     recording continue, which is the existing pre-4c behavior).
   - Map `peerConnectionState` to friendly pill copy on `AVTile`:
     `"connecting"`/`"new"` → "Connecting…" with a spinner;
     `"disconnected"` → "Reconnecting…"; `"failed"` → "Cannot
     connect — Reconnect" button wired to
     `liveAv.reconnectPeer(peerId)`.
   - Initials-placeholder for camera-off / cam-muted tiles (replace
     the current black-out).
   - Real admin-display-name threading into `localPeerLabel` on the
     workspace side; real student-name threading on the student
     side.

2. **`docs/LIVE-AV.md`** (Task 9): architecture overview tying
   together Phases 4a (peer-mesh + signaling) + 4b (hook + recorder)
   + 4c (UI + mounting + CSP). The four STATUS docs already cover
   the per-phase narrative; LIVE-AV.md is the always-fresh entry
   point for someone touching live-A/V in 6 months.

3. **Playwright integration tests**. Smoke the full tutor + student
   join path with real(-ish) `getUserMedia` mocks. Confirms the AV
   tiles render with the right `srcObject` after the permission
   prompt is acknowledged; confirms the moderation toggle suppresses
   the outbox row for the muted period.

4. **(Optional but nice-to-have) Audio-level indicator on `AVTile`.**
   Wire `AudioContext` + `AnalyserNode` to the audioStream to draw a
   small VU-meter on each tile. Gate it behind a prop so 3-peer-plus
   sessions can opt out if the CPU envelope is non-trivial. The 4c
   stop-condition explicitly said "if it adds measurable CPU at 3+
   peers, gate it behind a prop and let 4d optimize" — 4c shipped
   without it to land the smokeable mount first.

5. **(Optional) Drag/dock + collapse on `AVTilesPanel`.** 4c ships a
   flex-wrap grid. The original spec said drag/dock + collapse were
   4c-acceptable but could slip to 4d. They slipped.

### Assumptions 4d inherits from 4c (do not violate)

- `localPeerId` is minted by the host (workspace or student client),
  NOT by `useLiveAV`. Don't move id generation into the hook.
- `useLiveAV` stays INERT until `requestMic()` / `requestCam()` are
  called. The `AVPermissionsPrompt` is the trigger. Don't wire
  permission requests anywhere else (would duplicate state).
- `useRemoteMicRecorders` is the workspace's recorder orchestrator.
  Don't instantiate `createRemoteStreamRecorder` directly in the
  workspace component — go through the hook so the gating logic
  (shouldCapture + moderation) stays in one place.
- FSM `inputStreams` is populated by the WORKSPACE, not the hook.
  4c's `pcStateToStreamHealth` mapper is a workspace-local function
  in `lifecycleInputStreams`; if 4d needs to make this configurable,
  move the mapper to a small util but keep the call site in the
  workspace.
- Permissions-Policy widening is per-route; do NOT widen site-wide.
  If a new route needs `camera=(self)`, add a pattern to
  `LIVE_AV_ROUTE_PATTERNS`, don't widen the default.
- AV component props are stable (see "Public API" above). Adding
  optional props is fine; renaming or removing existing ones is a
  breaking change.

---

## Known not-yet-tested edge cases (deferred per plan)

These are explicitly out of scope of 4c; flagged for 4d.

1. **End-session replay with student-mic tracks.** 4b's
   `endWhiteboardSession` already handles arbitrary `streamId` (the
   outbox schema is generic). Replay UI for tutor-mic + per-student-mic
   mix is post-v1 — the segments LAND, but mixing them at playback
   is a separate workstream.
2. **Refresh-mid-session recovery for live A/V.** The sync-client
   reconnects automatically and 4c's mesh-restart kicks the
   negotiation back into sync, but the upload-outbox may have
   in-flight segments that get re-enqueued. Outbox idempotence is
   load-bearing (Phase 1b) so this should be safe; smoke under 4d.
3. **Wire-level moderation.** Tutor's "Don't record this student"
   only suppresses the outbox lane, NOT the live audio stream. If
   the tutor wants the student silenced for the OTHER students too,
   that's wire-level mute coordination — post-v1, out of scope at
   every sub-phase.
4. **Device hot-swap (mic/cam unplug-replug mid-session).** Same as
   the 4b deferral; `useLiveAV` doesn't listen for `devicechange`
   events.
5. **Large-mesh CPU envelope.** Sarah's realistic max is ≤5 peers.
   Each remote audio track gets its own `MediaRecorder` running in
   parallel; profile on a sub-$300 student Chromebook in 4d's smoke
   pass.

---

## Smoke checklist — before merging to master

This is the FIRST sub-phase where live A/V actually fires in a real
browser. Smoke is real, not just non-regression.

- [ ] On the **branch preview URL** (NOT `tutoring-notes.vercel.app`),
      hard-refreshed since the last deploy.
- [ ] Vercel build green for the `phase-4c-av-ui-and-mounting` branch.
- [ ] Open the workspace as tutor. `AVPermissionsPrompt` appears.
      Click "Allow Microphone" — browser prompts, accept. Click "Allow
      Camera" — browser prompts, accept. Prompt auto-hides. Local
      tile shows tutor's own mirrored video.
- [ ] Open the student join link (`/w/[token]#k=...`) in a second
      window. `AVPermissionsPrompt` appears. Allow both. Both windows
      now show two tiles each (self + remote) within ~5 seconds.
      Audio plays both directions (talk in one window, hear in the
      other).
- [ ] Mute mic on the tutor side. Speak. Student window does NOT
      hear you. Unmute. Student hears you again.
- [ ] Mute camera on the student side. Tutor's tile for the student
      goes black (polished initials placeholder lands in 4d).
- [ ] Open a 3rd tab to the same join link (simulates 2 students).
      All three windows show 3 tiles. Audio routes correctly across
      all three.
- [ ] Tutor records a 30-second session. End the session. Replay
      shows the tutor's mic audio + the student-mic audio as separate
      tracks (replay UI for mixing is post-v1; the data lands).
- [ ] Tutor's "Don't record this student" toggle: enable mid-session.
      The student's mic continues to play live audio to the tutor
      (only muted in the recording). End session, replay does NOT
      include the muted-period student audio.
- [ ] Refresh the tutor window mid-session. Reopen. Live A/V
      re-establishes within ~10 seconds via sync-reconnect →
      `liveAv.reconnectPeer`. Outbox flushes any in-flight recorded
      segments.
- [ ] DevTools console for all windows: no errors. New
      `[useLiveAV] avx=… peer=… …` log lines and
      `[useRemoteMicRecorders] avx=… recorder created peer=… …` log
      lines visible per participant. NO CSP / Permissions-Policy
      violations in the console.
- [ ] Existing whiteboard sync (tutor draws → strokes appear on
      student) still works. **Existing tutor-mic recording (the
      load-bearing audio path Sarah uses today) still works**. Phase
      4c must not regress either.
- [ ] `npx jest` locally: 952/960 (pre-existing 8 DB failures only).
- [ ] `npx tsc --noEmit` clean.

---

## How to pick this up in a fresh chat

1. Read this doc. Then PHASE-4B-STATUS.md (the inherited contract).
2. `git log master --oneline -10` to confirm 4c is in master.
3. Read `src/components/av/*.tsx` to internalize the props.
4. Read the workspace mount block in
   `WhiteboardWorkspaceClient.tsx` — search for the `// Phase 4c:`
   comments to find the integration points.
5. Read `src/hooks/useRemoteMicRecorders.ts` end-to-end (it's small).
6. Run the new test suites:
   `npx jest src/__tests__/components/av src/__tests__/hooks src/__tests__/dom/WhiteboardWorkspaceClient.av-mount src/__tests__/dom/StudentWhiteboardClient.av-mount`.
7. Branch off master for 4d.

If anything feels stale or wrong, check the open PR for late review
comments before extending.
