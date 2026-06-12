# Whiteboard replay Gate A6 safe slice — smokebook

**Branch:** `feat/wb-replay-a6-slice`  
**Date:** 2026-06-11  
**Scope:** A6-2 (graph render in replay) + A6-3 (test blind spot). **Not** A6-1 multi-segment player regression fix.

---

## 1. What this branch fixes

Replay a session that contains an **inserted JSXGraph** (Insert graph on the tutor workspace).

| Surface | URL pattern | Pass criterion |
|---------|-------------|----------------|
| Admin review | `/admin/students/{id}/whiteboard/{sessionId}` | Graph **renders** (axes + curve visible), not a blank embed box |
| Share replay | `/s/{token}/whiteboard/{sessionId}` | Same — graph visible in read-only replay |

**How to verify**

1. Open a **ended** session whose event log includes a `graph` element (or record a short session: Start → Insert graph → add `y=x^2` or similar → End).
2. Open admin review and share replay (if share link exists).
3. Press **Play** (or scrub past the graph insert timestamp).
4. **Pass:** JSXGraph coordinate plane and expressions render inside the embed frame.  
5. **Fail:** Empty/white rectangle where the graph should be (pre-fix symptom).

**Automated gate (local):** `npx jest WhiteboardReplay.a6-slice.dom.test.tsx` — pins `audioSegments[]` production path + `renderEmbeddable` / `readOnly` graph wiring.

---

## 2. A6 regression characterization (Andrew — NOT fixed on this branch)

Use this checklist to decide whether prod/master vs preview regressions are **hypothesis #1 (multi-segment custom player)** vs **hypothesis #2 (graphs blank)**. This branch only addresses #2.

### Setup

- Pick the **same ended session** on:
  - **Prod / master** preview or production deploy
  - **`v1-redesign`** (or this branch) preview
- Prefer a **pause → resume → draw → end** session with **2+ audio segments** and at least one whiteboard stroke after resume.

### Compare player chrome

| Check | Master / prod | Preview |
|-------|---------------|---------|
| Audio UI | Note: native `<audio controls>` vs custom **Play** + range scrubber | |
| `GET /api/whiteboard/{id}/events` | 200 + JSON (not HTML error page) | Same |
| Browser console | Note Excalidraw dynamic-import / chunk errors | Same |

### Multi-segment playback repro

1. Record (or reuse): **Pause** mid-session → **Resume** → draw additional strokes → **End** (≥2 `SessionRecording` rows / segments).
2. Open replay on both builds.
3. **Segment 2 audio:** Does second-segment audio play when timeline crosses the boundary?
4. **Segment 2 strokes:** Do strokes drawn after resume appear at the correct time (not only at end)?
5. **Stroke animation:** Press **Play** at t=0 — do strokes **animate during** audio, or only pop in at the end?

### Record findings (template)

```
Session ID: 
Master URL: 
Preview URL: 
Segments (count): 
Events API: 200 JSON? Y/N
Console errors: 
Audio UI: native / custom
Seg-2 audio plays: Y/N
Seg-2 strokes timed: Y/N
Strokes animate during play: Y/N
Graph renders (if session has graph): Y/N
Primary hypothesis: #1 multi-segment player / #2 graphs / other: ___
```

### Out of scope on this branch (TODO — do not expect fixes)

| ID | Item |
|----|------|
| A6-1 | Multi-segment custom player regression (needs hardware symptom characterization above) |
| A6-6 | Multi-page / board-tabs replay hole |
| A6-7 | Roughness / roundness canonical-log extension |
| A6-8 | Session timer in replay |
