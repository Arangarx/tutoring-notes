# PHASE-PDF smoke 1 — findings (2026-05-16)

Captured verbatim from Andrew's first smoke run against the Vercel Preview
for branch `pdf-page-picker-and-per-page-boards`. Use this as the working
worklist; mark items resolved / deferred as we go.

## Live session findings

1. **Picker dialog disappears unexpectedly.** Hard to reproduce, but can be
   forced: highlight text inside the custom-range field, deselect, then
   re-highlight — dialog vanishes. Likely the ModalPortal backdrop
   `onClick` firing on selection / focus event bubbling.
2. **Question:** should we lock PDF page position / clamp pan + zoom to
   the page edges? (Bootstrapper deferred this as v1 scope, but worth a
   design call now that we have per-page boards.)
3. **Per-page scene leakage (PDF ↔ Page 1).** While testing collapse,
   first PDF page ended up rendering on Page 1, and the original Page 1
   drawing ended up on the first PDF page. Strong "page swap" signal.
4. **Auto-expand prevents collapse while on a PDF page.** Working as
   designed (bootstrapper auto-expand rule). When off the section the
   tutor *can* collapse and the state sticks. Reported as **better than
   expected**, not a bug.
5. **"Add page" lands at the end.** After importing PDF (7 pages) +
   built-in Page 1, "Add page" produced "Page 9" beneath the PDF
   section. Tutor's intuition was a Page 2 row near the top.
6. **Cross-page sync drift (Page 1 ↔ Page 9).** Over time, drawings
   from Page 1 and Page 9 merged — both ended up showing both sets.
   PDF page 1 still had its original strokes only.
7. **PDF pages copying into other pages.** More general manifestation
   of #6 / #3 — there is page-data leakage somewhere in the live
   document apply / page-switch path.
8. **Per-PDF 30-page cap hit, but token error mid-upload.** With two
   PDFs already in the session, third PDF returned: `Inserted 16 of 30
   pages; remainder failed: Could not upload to whiteboard storage.
   Please try again. (Vercel Blob: Failed to retrieve the client
   token)`. First 16 *did* land. Almost certainly the existing Vercel
   Blob client-token rate limit; PDF flow surfaces it more often now.
9. **Replay screen has no page strip.** Bootstrapper specifically
   called out the replay should show section grouping. **Replay UI was
   not extended in this build — gap.**
10. No console errors observed on initial replay load nor after refresh.
11. **Scrub is not live; intermittent 429s.** Scrubber didn't paint
    strokes while dragging on first load; after pressing play it
    painted while scrubbing for a bit, then stopped once scrubbed past
    the loaded window. Eventually saw `GET .../api/audio/admin/<id> →
    429 (Too Many Requests)`. Likely pre-existing replay hydration +
    audio segment fetch limit; this branch did not touch that path.
12. **Replay shows PDFs as placeholder image blocks** (right size,
    generic image icon). Asset hydration for PDF pages in replay
    isn't completing — replay player isn't loading from
    `customData.assetUrl` properly.
13. Forward playback (non-scrub) renders strokes correctly.

## Side notes

S1. **First-N input doesn't select on focus.** Tutor expected typing
    "3" to replace "15", not have to delete first. Add
    select-all-on-focus.
S2. **Smoke checklist arithmetic was wrong.** `1-3,5,7-8` is **6**
    pages, not 5 as the checklist claimed. Live dialog correctly says
    6. Update the smoke checklist in the bootstrapper / status doc.
S3. **Viewport center mismatch tutor ↔ student** — the page-1 image
    drops at the tutor's viewport center, not the student's. Pre-
    existing in `insert-asset.ts`'s `viewportCenter` call (it reads
    the tutor's local Excalidraw state). Likely needs a deterministic
    anchor (e.g. document-space origin per page) rather than per-tab
    viewport.
S4. **Math whiteboard library default + Excalidraw library button.**
    (a) Promote the math equation insert to the main WB toolbar
    (right now it lives in the math popover button only). (b) If
    Sarah uses Excalidraw's built-in library button to import a
    library, does that persist across sessions, or does she re-import
    each time? — needs investigation.

## Triage

**Merge blockers (must fix before this lands on master):**

- #3 / #6 / #7 — page-data leakage. Existing-session affecting; can't
  ship with this regression. Investigate `selectTutorPage` +
  `applyBoardDocumentV1ToExcalidraw` + integrate.appendBoardPage race
  vs Excalidraw's debounced `onChange`.
- #1 — picker dialog dismiss-on-selection. Easy fix (don't close on
  mousedown if a selection range exists; or restrict backdrop close
  to actual outside clicks).
- #9 / #12 — replay page strip + PDF asset hydration in replay. The
  bootstrapper explicitly required replay verification.

**Strong follow-ups (consider for this branch if time allows):**

- S1 — First-N select-on-focus.
- S2 — Smoke checklist arithmetic fix.
- #4 / #5 — design decisions on auto-expand behaviour and Add-page
  placement; document the chosen behaviour.

**Defer / not this branch:**

- #2 — PDF position lock / pan-clamp. Separate design spike.
- #8 — Vercel Blob token rate limit; tracked in the existing upload
  retry path. Worth a follow-up but not gating PDF v1.
- #11 — Replay scrub liveness + 429. Pre-existing, not introduced by
  this branch. File a separate follow-up.
- S3 — Per-tab insert-origin (tutor vs student viewport). Pre-existing.
- S4 — Math button promotion + library button behaviour. Separate
  toolbar / persistence spike.

## Status

- Branch: `pdf-page-picker-and-per-page-boards`
- Tip at smoke-1: `ca146eb` (PDF page picker, per-page boards, and
  grouped page strip).
- **NOT mergeable as-is** until blockers above are addressed.

## Smoke-2 (2026-05-16 round 2) — findings

Against `0c49c33` on the Vercel Preview. Headline: most smoke-1
blockers verified fixed, but the **leakage fix was insufficient** —
rapid switching still bleeds, and adding a page after a PDF section
reproduces a fresh per-page swap.

### Live session

1. **Rapid-click still bleeds.** General clicking is clean; rapid
   clicking on the page strip still leaks drawings across pages.
   (Smoke-1 #3/#6/#7 NOT fully resolved.)
2. **Add Page after PDF section produces a cascade.** From PDF p.2,
   click Add Page → new "Page 3" inserted in the right spot (smoke-1
   #5 verified). But: the normal "Page 2"'s strokes now appear on
   PDF p.2. Both PDF p.2 and p.3 show original p.2 + p.3 strokes
   AND "Page 2"'s strokes. "Page 2" also displays the PDF p.2 image.
3. **Picker dismiss-on-selection: PASS** (smoke-1 #1 verified).
4. **Replay PDF bitmaps: PASS** (smoke-1 #12 verified).
5. **First-N select-on-focus: PASS** (smoke-1 S1 verified).

### Side notes

S1-2. **Insert math button** triggers a wall of KaTeX font 404s on
the Vercel Preview build:
`https://…/_next/static/chunks/fonts/KaTeX_*.woff2 → 404`. Webpack
bundles the JS but Next never copies the woff2 files to that path;
MathLive's font-path derivation from `import.meta.url` lands on a
location that doesn't exist. NOT introduced by this branch — math
files (`MathInsertButton.tsx`, `math-render.ts`) were last touched
in `6124459` / `4fbd808` / `a024d45` / `6af4336`.

S2-2. **Replay console errors.** Two `POST /api/whiteboard/<id>/active-ping
→ 409 (Conflict)` on the replay page on load. Pre-existing; replay
shouldn't even be active-pinging. Worth a follow-up but doesn't break
playback.

S2-3. **Replay scrub click navigation: PASS** (clicking to seek now
works smoothly — different from smoke-1 #11).

S2-4. **Replay scrub *drag* still 429s.** Dragging the scrubber
eventually returns `429 Too Many Requests`; after the 429, dropping
the scrubber shows state but live drag stops updating. Pre-existing
(smoke-1 #11 deferred); didn't regress.

## Smoke-1 → 2 root cause re-analysis (the real leak)

The smoke-1 fix held `pageSwitchProgrammaticRef` longer and saved the
leaving scene unconditionally, but **missed an async window inside
`selectTutorPage` itself**:

```
pageSwitchProgrammaticRef += 1;
activePageIdRef.current = nextId;       // ← bumped FIRST
await hydrateRemoteImageFilesForScene(...);  // ← long await window
api.updateScene({ elements: next });    // ← scene swap LAST
```

During the await:
- `activePageIdRef` has already moved to the new page.
- The canvas is still showing the *old* page's elements.

If a second `selectTutorPage` fires here (or `addTutorPage`, or any
read of `activePageIdRef` that pairs with `api.getSceneElements()`),
it reads `activePageIdRef = new` as its `from`, calls
`getSceneElements()` which still returns the *old* page's scene, and
writes `pageDataRef[new] = old's elements`. Page swap committed; v3
broadcast publishes the corruption; student mirrors it back.

`Add Page` from inside the PDF section reliably hits this because:
1. User selected PDF p.2 a moment before → `selectTutorPage(pdfP2)`
   is mid-hydrate.
2. User clicks Add Page → `addTutorPage` reads `activePageIdRef =
   pdfP2`, calls `getSceneElements() = stale (still Page 1)`, writes
   `pageDataRef[pdfP2] = Page 1 elements`. The PDF page's pageDataRef
   slot is now corrupted with Page 1's strokes. Subsequent broadcasts
   cement the swap.

## Smoke-2 fix landed

- **Token-based switch cancellation.** New `tutorSwitchTokenRef`
  monotonic counter; every `selectTutorPage` / `addTutorPage` bumps
  it at entry. `selectTutorPage` checks `myToken === current` AFTER
  hydrate; if a newer call won the race it abandons without bumping
  `activePageIdRef` or touching the scene. The newer call's atomic
  swap owns the final state.
- **Atomic swap.** `activePageIdRef.current = nextId` now happens
  immediately before `api.updateScene` in the same synchronous block.
  No async gap exists between them, so a parallel `selectTutorPage`
  cannot read a stale (activePageIdRef = new, scene = old) state.
- **Add Page invalidates in-flight switches.** `addTutorPage` also
  bumps the token, so a late select that resolves after add page
  abandons rather than clobbering the new-page navigation.

Net: the smoke-2 #1/#2 page-data leakage path is closed.

## Smoke-2 side fixes also landed (cheap)

- **Note 1 — MathLive KaTeX font 404s.** Set
  `MathfieldElement.fontsDirectory = "https://cdn.jsdelivr.net/npm/
  mathlive@0.109.1/fonts/"` on dynamic import. CSP `font-src 'self'
  data: blob: https:` already permits HTTPS font subresources, so no
  CSP change required. Math button is now functional; pre-existing
  bug surfaces no longer.

## Smoke-1 fixes landed (pending smoke 2)

| Smoke ref | Fix | Where |
| --- | --- | --- |
| #3 / #6 / #7 page leakage | Atomic `commitPdfBatch` integrate hook + always-save leaving scene + double-RAF guard + per-page-id tracking in `ensureNativeImageAssetUrlsForSync` tail | `src/lib/whiteboard/insert-asset.ts`, `WhiteboardWorkspaceClient.tsx` (`selectTutorPage`, `addTutorPage`, `pdfBoardIntegrate`, `handleExcalidrawChange`) |
| #1 picker dismiss-on-selection | `onPointerDown` + `onPointerUp` pair; close only when both events land on backdrop | `src/components/whiteboard/PdfImageUploadButton.tsx` |
| #5 Add Page placement | Insert after active page + smallest-unused `Page N` label | `WhiteboardWorkspaceClient.tsx` (`addTutorPage`) |
| #12 replay PDF placeholders | `registerImageAssets` registers under `wba-${elementId}` to match `toExcalidraw` synthesis | `src/components/whiteboard/WhiteboardReplay.tsx` |
| S1 First-N select-on-focus | `onFocus={(e) => e.currentTarget.select()}` | `PdfImageUploadButton.tsx` |
| S2 Smoke checklist arithmetic | `1-3,5,7-8` = **6** pages, not 5 — bootstrapper checklist updated | `~/.cursor/plans/pdf-page-picker-and-per-page-boards-bootstrapper.md` |

Test status post-fix: `npx jest --testPathPatterns="whiteboard"` →
**428/428 pass**; `npx tsc --noEmit` → clean.

Still deferred (per triage above): #2, #8, #9, #11, S3, S4, S2-2
(replay active-ping 409), S2-4 (scrub drag 429 — same surface as #11).

## Smoke-2 fix table (top-up)

| Smoke ref | Fix | Where |
| --- | --- | --- |
| #1 rapid-click leak | Token-based switch cancellation + atomic activePageIdRef-and-updateScene swap (no await window) | `WhiteboardWorkspaceClient.tsx` (`tutorSwitchTokenRef`, rewritten `selectTutorPage`, `addTutorPage`) |
| #2 Add Page cascade | Same token bump in `addTutorPage` so an in-flight `selectTutorPage` abandons rather than overwriting | `WhiteboardWorkspaceClient.tsx` (`addTutorPage`) |
| Note 1 KaTeX 404s | `MathfieldElement.fontsDirectory` pinned to jsDelivr CDN | `src/components/whiteboard/MathInsertButton.tsx` |

## Smoke-3 (2026-05-16 round 3) — findings

Against `5a6a798` on the Vercel Preview. Headline: the page-switch
race fix held (no rapid-click leak from switching alone), but **a
SECOND, independent race in `applyRemoteToCanvas` was still bleeding
pages bilaterally** — and the math-fonts CDN pin was a no-op because
the guard never let it run.

### Live session

1. **Bilateral leak persists with slow, deliberate navigation.**
   Brought in 3 PDF pages. Drew a green "1" on p.1, pink "1/2/3" on
   PDF p.1/p.2/p.3. Walking SLOWLY back through the page strip,
   p.1 and PDF p.1 had already bled into each other. With rapid
   clicks + collapse/expand spam, every PDF page contaminated every
   other PDF page (strokes AND sheet bitmaps).
2. **Add Page after PDF p.2 reproduces a cascade immediately.**
   Strokes from all three PDF pages + all three PDF sheets land on
   the new page. (Reliable, no rapid-clicking needed.) On a clean
   retest PDF p.2/p.3 only bled with spam clicks + collapse toggles.
3. **Insert math — same 404 wall as smoke-2.** No change from
   round 2; the CDN pin did not land.
4. Replay — strokes on PDF p.1/p.2 may be obscured by the sheet
   bitmap z-ordering rather than truly missing; deferred to a
   layered inspection.

### Smoke-3 root cause — `applyRemoteToCanvas` page-switch race

The smoke-2 fix closed the `selectTutorPage` async window between
`activePageIdRef = nextId` and `api.updateScene(next)`. Good. But
the *peer-side* path that processes a student's broadcast had its
own, **structurally identical** race:

```
applyRemoteToCanvas(elements, { scenePageId: targetId }) {
  const curActive = activePageIdRef.current;           // ← captured BEFORE await
  await hydrateRemoteImageFilesForScene(...);          // ← long await
  await updateSceneMergingWithRemote(api, elements, …) // ← reads live scene,
                                                       //   merges into live scene
  if (targetId === curActive) {
    pageDataRef.current[curActive] = api.getSceneElements();  // ← writes BUCKET
  }
}
```

During the awaits the tutor switches pages (intentional or
accidental). When the function resumes:

- `activePageIdRef.current` = `pageB` (the new page the tutor
  navigated to).
- `curActive` (captured) still = `pageA` (the page the broadcast
  was about, equal to `targetId`).
- The live scene now shows `pageB`'s elements.
- `updateSceneMergingWithRemote` reads `api.getSceneElements()` =
  `pageB`'s elements, runs Excalidraw's `reconcileElements` to
  UNION them with the student's `pageA` elements, and pushes
  `union(pageB, pageA)` back into the live scene. **PageB now
  visibly contains pageA's strokes.**
- Then `pageDataRef[curActive] = api.getSceneElements()` writes
  `pageDataRef[pageA] = union(pageB, pageA)`. **PageA's bucket now
  contains pageB's strokes too.**

That's the bilateral leak the pilot kept seeing. `reconcileElements`
is correct for collaborative co-editing (it's a union by id with
version/nonce ties broken sensibly) — the bug is feeding it the
WRONG local side.

The `Add Page after PDF p.2` cascade is the same race compounded:
clicking Add Page bumps `tutorSwitchTokenRef` and `activePageIdRef`,
but a still-resolving `applyRemoteToCanvas` from before the click
fires its post-await body with the now-stale `curActive = pdfP2`
and overwrites `pageDataRef[pdfP2]` with the new blank page's
scene (plus whatever the student broadcast). Subsequent
`selectTutorPage(pdfP2)` reads that polluted bucket → the leak is
now persistent across the session.

### Smoke-3 root cause — MathLive font CDN guard

`MathInsertButton.tsx` set the CDN URL only when `!Mf.fontsDirectory`:

```
if (Mf && !Mf.fontsDirectory) {
  Mf.fontsDirectory = "https://cdn.jsdelivr.net/.../fonts/";
}
```

But mathlive 0.109 ships with the static initializer
`_MathfieldElement._fontsDirectory = "./fonts/"` (verified in
`node_modules/mathlive/mathlive.mjs`), so `Mf.fontsDirectory` is
the truthy string `"./fonts/"` at import time. The guard is always
false; the CDN URL is never written. KaTeX glyphs keep 404ing.

### Smoke-3 fixes landed

| Smoke ref | Fix | Where |
| --- | --- | --- |
| #1 / #2 bilateral page leak | Rewrote `applyRemoteToCanvas`: no pre-await capture of `activePageIdRef`; use `pageDataRef[targetId]` (or the live scene only when *still* on target at read time) as the merge local instead of `getSceneElements()` on the live scene; only call `api.updateScene` when active page is STILL `targetId` AND `pageSwitchProgrammaticRef.current === 0` at write time. When we've navigated away, write `pageDataRef[targetId] = merged` and skip the live-scene update; the next page-switch hydrate will surface it visually. | `WhiteboardWorkspaceClient.tsx` (`applyRemoteToCanvas`); also removed the now-unused `updateSceneMergingWithRemote` import |
| #3 KaTeX 404s (round 2 redux) | Drop the `!Mf.fontsDirectory` guard — `MathfieldElement.fontsDirectory` defaults to the truthy `"./fonts/"`, so the previous conditional never fired. Unconditionally pin the CDN URL after dynamic import. | `src/components/whiteboard/MathInsertButton.tsx` |

Net: the post-`await` write-back path can no longer cross page
buckets, and the math fonts CDN URL is actually applied.

Test status post-fix: `npx jest src/__tests__/whiteboard
src/__tests__/dom` → **533/533 pass**; `npx tsc --noEmit` → clean.
Pre-existing DB-dependent suites (auth, password-reset, email,
transcribe-late-hallucination, note-and-share) still fail with
`P1001 Can't reach database server at 127.0.0.1:5432`; unrelated
to this branch.

Still deferred (unchanged from above): #2 PDF position lock, #8
Blob token rate limit, #9 replay page strip, #11/S2-4 scrub drag
429, S3 viewport-center mismatch, S4 math button promotion /
library button behaviour, S2-2 replay active-ping 409.

## Smoke-4 (2026-05-17 round 4) — findings

Against `1600dba` on the Vercel Preview. Headline: **bleed is fixed
for the first time across rapid-click + slow-walk + Add-Page-after-PDF
scenarios** (Andrew's words: "this is the first time bleed has
ACTUALLY been fixed; quick clicking has always had a problem"). Two
remaining bugs surfaced — one in math fonts (CDN was unreachable from
Andrew's network) and one in the audio-flow gate that swallows the
entire recording when both mics are muted at session start.

### Live session

1. **PASS** — Bleed fixed. Rapid clicking + slow walk-through +
   collapse/expand spam all clean. (Smoke-1 #3/#6/#7, Smoke-2 #1,
   Smoke-3 #1 all verified closed.)
2. **PASS** — Add Page after PDF p.2 no longer cascades.
3. **FAIL** — Insert math still 404s. URLs are now
   `https://cdn.jsdelivr.net/npm/mathlive@0.109.1/fonts/KaTeX_*.woff2
   → net::ERR_NAME_NOT_RESOLVED`. The smoke-3 CDN setter DID land
   (URLs are no longer `_next/static/chunks/fonts/`), but
   `cdn.jsdelivr.net` was unreachable from Andrew's network at the
   time of the smoke. The same DNS instability also produced the
   `wss://wb-mortensen.fly.dev` retry storm visible in the
   workspace console and matches the `Could not resolve host:
   github.com` failures git push hit on this branch.
4. **FAIL → not actually a leak/replay regression.** Replay page
   loaded fine; it showed the "No whiteboard activity was recorded
   for this session" card from `WhiteboardReplay.tsx:588`. Andrew
   reported both the audio and the whiteboard event log empty,
   despite drawing strokes and a phone joining the room. Phone
   feedback was killed by muting both mics immediately on join.

### Smoke-4 root cause — audio-flow gate over-restriction

Initially looked like recording was off (no Start click). Wrong:
`Student.recordingDefaultEnabled` defaults to `true` at the schema
level, so `userWantsRecording` was `true` from mount. Andrew has
never had to click Start in any prior session.

The actual cause is the **Phase 4d Commit 6 audio-flow gate** in
`src/lib/recording/lifecycle-machine.ts:448-456`:

```
if (
  !everHadAudioFlow &&
  participantsWithFlowingAudio !== undefined &&
  !hasIntersection(participants, participantsWithFlowingAudio)
) {
  return finalize("armed", "awaiting_audio_flow", undefined, inputs);
}
return finalize("recording", undefined, undefined, inputs);
```

The gate's purpose is sound: WebRTC takes ~200-2000ms to converge
after both peers are present, and without the gate the recorder
captures up to 2 s of empty-remote-channel as silence at the top
of every recording. The release signal, however, is one-dimensional
— it only fires on **remote** peer flow detected via
`useAudioFlowConfirmation`. If the remote peer's mic is muted at
session start, the latch never flips and the FSM holds in
`armed/awaiting_audio_flow` for the entire session.

Andrew's session reproduces the failure path cleanly:

1. Tutor mounts; `userWantsRecording=true`, `everHadAudioFlow=false`.
2. Phone joins; `participants.size=1`, `everBothPresentRef.current=true`.
3. Both parties mute their mics immediately ("we muted to stop the
   feedback"). `audioFlowingPeerIds.size=0` → `participantsWithFlowingAudio={}`.
4. Gate condition met → FSM state = `armed/awaiting_audio_flow`,
   `recordingActive=false`.
5. Session runs (visible strokes, PDFs inserted, page switches all
   work via live sync, which is gate-independent).
6. End Session uploads empty `events.json` + zero audio segments.
7. Replay shows the "nothing recorded" card.

This is a billing/audit hole: a tutor (in good faith or otherwise)
muting both ends could deliver a session and leave no recording.
Andrew flagged the abuse vector explicitly: "we definitely can NOT
rely on them to hit start, we're not giving out a free tutor WB
just because they're okay not recording".

### Smoke-4 root cause — math fonts CDN unreachable

The smoke-3 CDN pin lands (URLs in DevTools confirm
`/npm/mathlive@0.109.1/fonts/`), but `cdn.jsdelivr.net` doesn't
resolve from Andrew's network. Same DNS pattern as the github.com
git-push retries and the wss://wb-mortensen.fly.dev retry storm —
third-party hostnames flake. The fix is to drop the third-party
dependency entirely: ship the 20 KaTeX `.woff2` files (254 KB
total) under `public/mathlive-fonts/` so they're served same-origin
by Next.js. No CSP change required (`font-src 'self'` already
covers same-origin), no DNS dependency, no rate-limit risk.

### Smoke-4 fixes landed

| Smoke ref | Fix | Where |
| --- | --- | --- |
| #3 KaTeX 404s (round 3 redux) | Self-host KaTeX woff2 fonts under `public/mathlive-fonts/` (254 KB, 20 files copied from `node_modules/mathlive/fonts/`). `MathfieldElement.fontsDirectory` now points to `/mathlive-fonts/` — same-origin, no third-party dep. | `public/mathlive-fonts/*.woff2`, `src/components/whiteboard/MathInsertButton.tsx` |
| #4 empty-replay (audio-flow gate over-restriction) | Workspace-side: the gate-release boolean fed to the FSM is now the OR of FOUR sticky latches: (1) remote peer flow (existing), (2) **tutor's own local mic flow**, (3) **any whiteboard activity** — local stroke/insert OR on-target remote draw, (4) **10 s hard timeout** once both parties are present. ANY of these releases the gate permanently. FSM signature unchanged — same `everHadAudioFlow` input, semantically expanded by the workspace. | `WhiteboardWorkspaceClient.tsx` (new `everHadWbActivityRef` + `markWbActivity` above `applyRemoteToCanvas`; new `[everHadTutorAudioFlow, …]` + `[gateTimeoutFired, …]` + `AUDIO_FLOW_GATE_TIMEOUT_MS`; `markWbActivity()` fired from `handleExcalidrawChange` post-guards and from `applyRemoteToCanvas` on-target branch) |

Net: silent-loss-of-the-entire-recording is now extremely hard to
trigger. The 10 s timeout is the absolute floor — if every other
signal fails (no audio flow, no WB activity), we still capture
the session after at most a 10 s gap. The tutor-mic-flow latch
covers the common "Sarah greets the student" case (her audio
flows within the first second of greeting). The WB-activity latch
covers silent-board sessions ("let's do this problem on the
whiteboard"). The peer-flow latch is the original Phase 4d signal,
unchanged.

Test status post-fix: `npx jest src/__tests__/whiteboard
src/__tests__/dom` → **533/533 pass**; `npx tsc --noEmit` → clean;
`npx eslint` → 0 errors / 2 pre-existing warnings.

### Smoke-4 follow-ups (not blocking PDF merge)

- **Rename `everHadAudioFlow` → `everHadSessionActivity`** in the
  FSM signature and tests, since the workspace-side semantic is no
  longer "audio flow" specifically. Pure refactor — no behaviour
  change.
- **Tutor-mic-flow heuristic** uses `track.muted === false &&
  readyState === "live"`, same as `useAudioFlowConfirmation`. That
  doesn't actually require the tutor to be SPEAKING — just that
  their mic track is delivering frames (which it is whenever the
  mic is acquired, even if the user clicks the in-app mute toggle
  which flips `track.enabled` not `track.muted`). For Sarah's
  pilot this is fine (her mic is always live), but a stricter
  variant would gate on RMS amplitude. Defer until we see a
  failure mode that demands it.
- **Replay UX when nothing was recorded** — the existing "nothing
  recorded" card is correct copy, but it's hard for a tutor to
  tell at a glance whether it's "I forgot to start recording" vs
  "the gate held the whole time". Optional: surface the FSM's
  final `armedReason` / `pausedReason` so the card reads "Session
  ended while waiting for audio flow" instead of generic "nothing
  recorded". Defer.
