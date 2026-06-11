# Whiteboard Laser Sync — Smoke Checklist
**Branch:** `feat/wb-laser-sync`  
**Date:** 2026-06-11  
**Gate:** A5 sub-item / ST-05 / fixes pilot bug B9 ("Sarah doesn't see the laser pointer")

---

## ⚠️ JSDOM BLIND SPOT — Real-hardware smoke is REQUIRED

**jsdom + Jest cannot verify laser visibility.** The Excalidraw `collaborators` overlay is a canvas paint operation. Unit tests (including the 6 new pointer envelope tests) prove the wire protocol is correct — encryption, validation, subscriber fan-out, echo suppression, and outbound broadcast. But whether the **coral laser trail actually appears on the student's screen** can only be confirmed on real devices (real browser, real Excalidraw render, real network path through the relay).

Do not declare B9 fixed without completing Section 2 on real hardware.

---

## What shipped

| Stage | Description | Status |
|-------|-------------|--------|
| 1 | `WhiteboardWirePointerMsg` type, validator, `broadcastPointer`, `onRemotePointer`, immediate emit path in sync-client.ts | ✅ Landed |
| 2 | Tutor `onPointerUpdate` + `handlePointerUpdate` + `isCollaborating` on `<ExcalidrawDynamic>` | ✅ Landed |
| 3 | `useCollaboratorPointers` hook + student wiring + `isCollaborating` on student canvas | ✅ Landed |
| 4 | Bidirectional (student wand → tutor) | ⏸ Deferred — student toolbar has no wand yet (unbuilt per scoping notes). Tutor→student (B9 fix) is the must-land slice; stage 4 is a follow-up. |

---

## Verification summary (automated)

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ Exit 0, 0 errors |
| `npx eslint` on changed files | ✅ 0 errors, 3 pre-existing warnings |
| `npx jest` — sync-client pointer envelope tests (6 new) | ✅ All 6 pass |
| `npx jest` — full suite | ✅ 2108 pass; 5 fail = pre-existing DB/Prisma failures (auth.test.ts, password-reset.test.ts, identity-2fa-management.test.ts, identity-p2a.test.ts) |
| `npx next build` | ✅ Exit 0 |
| `npm run test:wb-sync` (hermetic Docker relay) | ✅ 13 pass, 1 skip (invariant 8 PDF — pre-existing skip) |

---

## Section 1 — Envelope design

**Wire payload shape** (`WhiteboardWirePointerMsg`):

```json
{
  "v": 1,
  "kind": "pointer",
  "peerId": "<sender stable peer id>",
  "role": "tutor",
  "pageId": "p1",
  "x": 123.4,
  "y": -56.7,
  "tool": "laser",
  "button": "up",
  "color": "#e27d60"
}
```

**Key design decisions:**
- `x`, `y` are **scene coordinates** (not viewport pixels). The receiver can pass them directly to `updateScene({ collaborators })` without any viewport transform.
- `tool` is always `"laser"` for now (narrowed at both type and validator level). Wire-extensible to `"pointer"` if needed later.
- The pointer envelope rides the **same AES-GCM encrypted channel** as all other whiteboard messages. The relay never sees plaintext coordinates.
- Path: `broadcastPointer` → `encryptAndEmitImmediate` → relay → `handleDecryptedWireMessage` → `remotePointerSubs` fan-out → `useCollaboratorPointers` → `updateScene({ collaborators })`. **NEVER** enters `handleExcalidrawChange` / `scheduleDocumentBroadcast`.

**Per-role colors:**
- Tutor: `WB_LASER_TUTOR_HEX = "#e27d60"` (coral, matches `--accent`)
- Student (reserved): `WB_LASER_STUDENT_HEX = "#0891b2"` (sky cyan)

---

## Section 2 — Real-hardware smoke (REQUIRED before merging)

### Setup
- Tutor device: open the whiteboard workspace for any session with sync enabled
- Student device: open the student join URL in a separate browser/device
- Verify both show "Connected" status

### Test 2a — Tutor laser visible on student canvas (B9 fix)
1. On the tutor device, select the **Wand tool** (pointer wand / K shortcut, renders as "Pointer wand (K)" in tooltip)
2. Move the mouse/pointer slowly across the whiteboard canvas
3. **Expected on student device:** a **coral (#e27d60) laser trail** appears at the same relative scene position, live and timely (≤200ms perceived lag on local network)
4. **Expected on student device:** the trail follows the tutor's exact position — not offset, not lagging by seconds
5. Release the wand (switch to another tool or stop moving) — laser trail fades/disappears on the student canvas

### Test 2b — Cross-page isolation
1. While tutor is on Page 1 and moves the laser, student sees the coral trail
2. Tutor switches to Page 2; student is on Page 1
3. Move the tutor laser on Page 2
4. **Expected:** student (on Page 1) does NOT see the Page 2 laser (cross-page pointers are dropped in `useCollaboratorPointers` via the `pageId` check)

### Test 2c — No regression to stroke sync
1. With sync enabled, draw a normal stroke on the tutor canvas
2. **Expected:** stroke appears on the student canvas as usual (the laser path must not disturb document sync)
3. Verify the stroke is persisted after end-session

### Test 2d — Bidirectional (deferred / not in this branch)
Student → tutor laser is not wired (student has no wand tool yet). Confirm no errors appear in console when the student draws normally.

### Pass criteria
- [ ] 2a: Coral laser trail visible on student at correct scene position
- [ ] 2b: Cross-page pointers isolated
- [ ] 2c: No stroke sync regression
- [ ] 2d: No console errors from missing student wand

---

## Section 3 — Reliability seams confirmation

The implementation was verified against each reliability seam:

| Seam | Check | Outcome |
|------|-------|---------|
| Pointer path never enters `handleExcalidrawChange` / `scheduleDocumentBroadcast` | `handlePointerUpdate` calls `sync.broadcastPointer()` (immediate path); never calls `scheduleDocumentBroadcast` | ✅ |
| Tutor remote-apply guard (`applyingRemoteToCanvasRef`) | `useCollaboratorPointers` wraps `updateScene` in `applyingRemoteRef.current = true / false` | ✅ |
| Student remote-apply guard (`applyingRemoteRef`) | Same guard ref from `useStudentWhiteboardCanvas` passed to `useCollaboratorPointers` | ✅ |
| Pointers are ephemeral — no persistence | `broadcastPointer` calls `encryptAndEmitImmediate`, not the outbox; `useCollaboratorPointers` never writes to `pageDataRef` | ✅ |
| `captureUpdate: "NEVER"` on `updateScene({ collaborators })` | Set explicitly in `useCollaboratorPointers.ts` L87 | ✅ |
| Pointer throttle separate from document throttle | Pointer path uses its own 16ms `pointerThrottleRef` in `handlePointerUpdate`; 50ms doc throttle untouched | ✅ |

---

## Files changed

| File | Change |
|------|--------|
| `src/lib/whiteboard/sync-client.ts` | +`WhiteboardWirePointerMsg` type, `validateWirePointer`, `broadcastPointer`, `onRemotePointer`, `remotePointerSubs`, inbound dispatch, `encryptAndEmitImmediate` union, disconnect cleanup |
| `src/styles/token-values.ts` | +`WB_LASER_TUTOR_HEX`, `WB_LASER_STUDENT_HEX` |
| `src/lib/whiteboard/insert-asset.ts` | Extended `ExcalidrawApiLike.updateScene` to accept `collaborators` and `captureUpdate` |
| `src/hooks/useCollaboratorPointers.ts` | **New file** — student-side overlay hook |
| `src/hooks/useStudentWhiteboardCanvas.ts` | Exposed `activePageIdRef` + `applyingRemoteRef` in return |
| `src/app/w/[joinToken]/StudentWhiteboardClient.tsx` | Wired `useCollaboratorPointers`; added `isCollaborating` to student Excalidraw |
| `src/app/admin/.../WhiteboardWorkspaceClient.tsx` | Added `handlePointerUpdate`, `isCollaborating`, `onPointerUpdate` to tutor Excalidraw; imported `WB_LASER_TUTOR_HEX` |
| `src/__tests__/whiteboard/sync-client.test.ts` | +6 pointer envelope tests (round-trip, validation rejects, subscriber receives, echo suppression, broadcast emit, unsubscribe) |
| `src/__tests__/dom/StudentWhiteboardClient.av-mount.dom.test.tsx` | Added `onRemotePointer`, `broadcastPointer` to mock sync client |
| `src/__tests__/dom/student-follow-gating.dom.test.tsx` | Same mock update |
| `src/__tests__/dom/student-wbdebug-join.dom.test.tsx` | Same mock update |

---

## Follow-up (out of scope for this branch)

- **Stage 4 — student wand → tutor laser** (bidirectional): blocked by missing student toolbar wand tool. The sync-client `broadcastPointer` API supports both roles; only the student chrome (wand button) is missing. When the student toolbar is built, add `onPointerUpdate` to the student Excalidraw and wire `useCollaboratorPointers` on the tutor workspace (same pattern, symmetric).
- **B8 — tutor laser offset from own cursor**: separate local viewport issue, explicitly out of scope.
