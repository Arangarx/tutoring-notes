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
> **Revision 2 (2026-05-27 evening):** original premise that "students don't draw"
> was incorrect — students have full bidirectional editing in the current production
> system (`StudentWhiteboardClient.tsx` mounts a real Excalidraw with `UndoRedoButtons`
> and broadcasts on every `onChange`; the on-screen copy reads "What you draw is
> visible live"; BACKLOG entry "Whiteboard undo (mark removal)" is marked SHIPPED
> for both tutor + student). Sections §4, §5.1, §5.6, §5.7, §6, §7, §9 revised to
> reflect symmetric authoring. Diagnosis (§1), library matrix data (§2), and relay
> evaluation data (§3) remain valid; some §2/§3 verdicts updated. The tutor's
> existing `applyRemoteToCanvas` (`WhiteboardWorkspaceClient.tsx:491–595`) is the
> reference for the disciplined symmetric apply path Phase 1 brings to the student
> side. See [Revision 2 changelog](#revision-2-changelog) at end of doc for the
> diff summary, and the [Revision 1 → Revision 2 verdict reconciliation](#revision-1--revision-2-verdict-reconciliation)
> section (immediately below the TOC) for the direct answer to "if Revision 1
> said bidirectional ⇒ Yjs, why does Revision 2 stay on Excalidraw?"
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

- [Revision 1 → Revision 2 verdict reconciliation](#revision-1--revision-2-verdict-reconciliation) *(added 2026-05-27 evening in response to Andrew's clarification question)*
1. [Diagnosis of current architecture](#1-diagnosis-of-current-architecture)
2. [Library evaluation matrix](#2-library-evaluation-matrix)
3. [Relay evaluation](#3-relay-evaluation)
4. [Recommendation with rationale](#4-recommendation-with-rationale)
5. [Sync architecture for the recommended stack](#5-sync-architecture-for-the-recommended-stack)
6. [5-axis adversarial review](#6-5-axis-adversarial-review)
7. [Sequenced implementation plan](#7-sequenced-implementation-plan)
8. [What carries forward from current code](#8-what-carries-forward-from-current-code)
9. [Open questions for Andrew](#9-open-questions-for-andrew)
- [Revision 2 changelog](#revision-2-changelog)

---

## Revision 1 → Revision 2 verdict reconciliation

> **Reader: this section was added 2026-05-27 evening in response to Andrew's direct
> question after first read of Revision 2.** It addresses an apparent contradiction
> between Revision 1's §5.6 ("if students draw, Yjs becomes the right answer") and
> Revision 2's §4 verdict (stay on Excalidraw + `reconcileElements` even now that
> the bidirectional premise is confirmed). Read this before re-reading §4.

### The apparent contradiction

Revision 1 §5.6 stated, verbatim:

> *"If students are eventually allowed to draw (a future Wave 3+ feature), the
> conflict model must be revisited. At that point, Yjs + y-excalidraw becomes the
> right answer (see § 2 Option C)."*

Revision 2 confirms the antecedent — students DO draw bidirectionally in production
today, and have since the Apr 24 student-undo ship. By Revision 1's own
"if X then Y" framing, the recommendation should flip to Yjs + y-excalidraw.
But §4's revised verdict stays on Excalidraw + `reconcileElements` + excalidraw-room.
Andrew flagged this as a sharp inconsistency. The honest reconciliation has three
factors that compound; none of them alone is the whole answer.

### Factor 1 (biggest): Revision 1's conditional was methodologically lazy

The "if students draw → Yjs" claim was an aside, not a vetted conclusion. R1 was
authored under time pressure and the §5.6 statement reflected conventional wisdom
("bidirectional collaboration → CRDT") without rigorous investigation of what
Excalidraw's `reconcileElements` actually does under bidirectional editing.
Concretely, R1 did not:

- Read the `reconcileElements` source at the pinned version (`^0.18.1`) to verify
  what its merge semantics actually are
- Examine the tutor's `applyRemoteToCanvas` (`WhiteboardWorkspaceClient.tsx:491–595`),
  which has been running `reconcileElements`-based bidirectional applies in production
  since the Apr 24 student-undo PR
- Account for the empirical observation that student → tutor strokes have been
  reliable through all three rounds of B1–B4 smokes — direct production evidence
  that the per-element LWW model handles the workload at our scale
- Verify the maintenance state of `y-excalidraw` itself (it described it as
  "official Excalidraw-team binding" — **factually wrong**, see Factor 2 below)

Under R2's deeper investigation, the conditional turns out to be directionally
suggestive but factually overstated. "Bidirectional ⇒ CRDT" is a heuristic that
holds at scales R1 didn't characterize; at our actual scale, per-element LWW with
deterministic tiebreak is genuinely sufficient. R2 caught this; R1 missed it.

### Factor 2: What `reconcileElements` actually does (cited from source)

Now grounded in the actual implementation at
`node_modules/@excalidraw/excalidraw/dist/dev/index.js:32859–32890` (pinned
`^0.18.1`), the merge predicate at line 32825–32838:

```js
// shouldDiscardRemoteElement: true ⇒ keep local
local.id === localAppState.editingTextElement?.id ||
local.id === localAppState.resizingElement?.id ||
local.id === localAppState.newElement?.id ||
local.version > remote.version ||
(local.version === remote.version && local.versionNonce < remote.versionNonce)
```

And the merge loop at lines 32859–32890 — iterates remote first applying the
predicate; then iterates local for ids not yet added; then `orderByFractionalIndex`
+ `syncInvalidIndices` to deterministically resolve z-order via Excalidraw's
fractional-indexing scheme. This gives us:

| Scenario | `reconcileElements` behavior | Verdict for our pilot |
|---|---|---|
| Concurrent edits to DIFFERENT elements (95%+ of our load) | Both survive (set-based merge by id) | ✅ Fully correct |
| Concurrent strokes from both peers | Both survive (different ids) | ✅ Fully correct |
| Tombstones (`isDeleted: true`) | Higher-version tombstone wins | ✅ Deletes propagate correctly |
| Sequential edits to the same element | Per-peer-monotonic version wins | ✅ Fully correct |
| **Concurrent edits to the SAME element at the same instant** | LWW: higher version, then LOWER versionNonce wins; loser's edit dropped | ⚠️ Known LWW degeneracy. **Not exercised by our workload** (Sarah and student aren't dragging the same PDF simultaneously) |
| User actively editing/resizing/drawing — `editingTextElement` etc. | **Local ALWAYS wins regardless of version** — protects in-progress edits from being yanked | ✅ Crucial UX safety net I'd been unaware of in R1 |
| Concurrent z-order moves of same element | Fractional indexing + `orderByFractionalIndex` deterministically resolves; both peers converge | ✅ Correct in common case; edge cases possible but rare |
| Multi-character text edit in same text element by both peers | Excalidraw doesn't expose multi-user text editing at all | N/A — feature not present |

**What I had slightly wrong in R2's first pass** (caught during this reconciliation
research and now corrected in §2 + §5.6): the `versionNonce` tiebreak picks the
LOWER nonce, not the higher one. And `y-excalidraw` is community-maintained
(single contributor, 27 weekly downloads, last release Aug 2025 — ~9 months
stale at time of writing) — **not** the "official Excalidraw-team binding" R1
described. R2 §2 and §5.6 are now corrected.

### Factor 3: What y-excalidraw genuinely adds above `reconcileElements`

The honest list, with our pilot workload in mind:

| y-excalidraw advantage | Does it matter for our pilot? |
|---|---|
| Delta-based wire payloads (sends what changed, not full scene per broadcast) | **Probably yes, eventually.** Currently unmeasured. Full-scene broadcasts at every stroke could become a mobile-data cost issue for long sessions on flaky networks. Worth measuring in Phase 1 smoke. |
| Offline editing with later merge | **No, not today.** Our pilot is real-time; both peers are online by design (the recorder pauses when student disconnects). If "students do homework on the train and merge later" enters the roadmap, this changes. |
| Multi-peer (3+) consistent merge | **No, not today.** 1 tutor + 1 student per session. Phase 4 adds at most 1 observer. With 2 LWW peers same-element races are rare; with 5 peers they'd be common. |
| Same-element concurrent-edit determinism without loser-drop | **Theoretically nicer, but not a real complaint today.** When this case fires, the loser sees their drag "snap" to the winner; user just repeats the action. Not silent corruption. |
| Causal ordering / vector clocks for cross-peer events | **No, not today.** Our event-log replay derives ordering from the tutor's session-time clock, which is the authoritative timeline. |
| Built-in awareness (presence) | **No** — we already have our own `WhiteboardWirePresence`. |

There IS a genuine y-excalidraw win — **delta wire payloads** — that R1 didn't
characterize and R2 also doesn't quantify yet. This is the strongest argument for
the Yjs path and the one place R2's verdict has acknowledged uncertainty. Phase 1
smoke should include wire-bandwidth measurement on a real Sarah session; if it's
problematic, that becomes a real trigger.

### Factor 4 (NEW under R2's deeper investigation): The y-excalidraw maintenance situation is materially weaker than R1 represented

R1 described `y-excalidraw` as "maintained by the Excalidraw team as
`@excalidraw/excalidraw`'s official Yjs binding." This is **wrong**, and Andrew
deserves to know this changes the calculus. The actual situation as of
2026-05-27 from npm registry:

- Package name: `@mizuka-wu/y-excalidraw` (a republish of Rahul Badenkal's
  `y-excalidraw` repo)
- Latest version: `2.0.16`, published 2025-08-16 (~9 months stale)
- Weekly downloads: 27
- Single maintainer
- Listed Excalidraw peer dep: `^0.18.0` (our 0.18.1 is in range, but the
  compatibility hasn't been formally verified by the maintainer at 0.18.1
  specifically; a pre-migration compatibility spike is mandatory)

This is real bus-factor / supply-chain risk. A community fork by one person with
no recent activity is fundamentally different from a first-party binding. If we
migrate to Yjs we're effectively also taking on co-maintenance of this binding
package (or vendoring its source). That's a non-trivial commitment beyond the
2-3 weeks of migration work itself.

### Cost-of-being-wrong analysis (the practical kill-shot for "just do Yjs now")

The clean question: **if we ship Phase 1 (Excalidraw + symmetric apply discipline)
and it turns out we should have done Yjs instead, what's the migration cost from
"shipped Phase 1" to "Yjs"?**

**Most of Phase 1's work transfers verbatim.** Phase 1 builds the discipline
patterns: `pageSwitchProgrammaticRef`, on-target read/write-time gates, render-timing
contract (rAF retries, viewport-align fallback), per-page invariants P1–P8, the
bidirectional test suite, `author=`/`wba=` log infrastructure, on-connect-after-
disconnect re-broadcast latch. **None of this discipline goes away under Yjs** —
Yjs has its own version of "I read from the wrong page's Y.Doc at the wrong time"
and "the canvas re-render races the Y.Doc apply" and "the relay reconnect needs to
flush local edits." A Yjs implementation re-writes the discipline against Y.Doc
instead of `pageDataRef`, but the discipline itself is identical in shape.

So:

| Path | Phase 1 cost | If wrong, migration to Yjs cost | Total worst case |
|---|---|---|---|
| **A: Phase 1 first, escalate to Yjs only if needed** | 5–7h Composer 2.5 | ~2 weeks Sonnet + Composer (most discipline work transfers from Phase 1; new substrate + relay + schema) | 5–7h to ~2 weeks |
| **B: Skip Phase 1, jump to Yjs now** | 0 | ~3–4 weeks (Phase-1-equivalent discipline against Y.Doc + Yjs substrate + new relay + schema + y-excalidraw co-maintenance) | ~3–4 weeks |

Path A dominates Path B unless we're highly confident Phase 1 will fail. We are
NOT highly confident it will fail: we have direct production evidence (the tutor's
`applyRemoteToCanvas`) that the same discipline pattern works for one direction
of bidirectional traffic in our workload. Phase 1 mirrors that pattern to the
student.

If Path A's Phase 1 ships and is right, we saved ~3 weeks. If Path A's Phase 1
ships and we have to migrate anyway, we lose ~5–7h of "throwaway" Composer dispatch
— but most of that work (discipline patterns, tests, log infra) carries forward
into the Yjs implementation. Net loss: ~1–2 days of code that gets re-written
against a different API.

If Path B ships Yjs unnecessarily, we spent ~3 weeks on infrastructure we didn't
need + took on `y-excalidraw` co-maintenance burden + added a new relay (y-websocket
or CF DO) to our PLATFORM-ASSUMPTIONS surface for no marginal user-visible gain.
Net loss: 2–3 weeks plus durable maintenance overhead.

The asymmetry strongly favors Path A. R2's verdict stands.

### Triggers for re-evaluation (when Yjs becomes the right answer after all)

We commit to migrating to Yjs + y-excalidraw + y-websocket if **any** of these
becomes an observed reality:

1. **Sarah reports a "PDF snap-back" / "where did my edit go" complaint** rooted
   in same-element concurrent editing. One report: file it. Two reports: escalate.
2. **The session model grows to 3+ concurrent bidirectional editors.** With 3+
   LWW peers, race-to-version-and-versionNonce becomes substantially more likely
   to produce visible edit loss.
3. **Offline editing enters the roadmap.** `reconcileElements` requires both peers
   online; Yjs naturally handles delayed merges via update buffering.
4. **Phase 1 ships to spec and Sarah smokes still find sync bugs** that are NOT
   apply-path discipline failures. Evidence the substrate (not the implementation)
   is wrong.
5. **Phase 1 smoke measures wire bandwidth on a real session and it's a measured
   problem** for mobile data plans or perceived lag. Yjs delta-based payloads
   would help. (This is the genuine y-excalidraw advantage R2 has NOT quantified;
   measuring it is a Phase 1 add-on.)
6. **`y-excalidraw` maintenance situation improves** such that taking it on isn't
   a co-maintenance burden — e.g., Excalidraw team officially adopts a Yjs binding,
   or a well-funded fork emerges with predictable release cadence.

Any one of these is sufficient. If none materialize within ~6 months of Phase 1
ship, the Excalidraw + discipline path is validated and Yjs stays a documented
contingency we never need to invoke.

### Was the §4 verdict changed by this reconciliation pass?

**No, the §4 verdict still stands at Option A (Excalidraw + symmetric apply
discipline + excalidraw-room).** What changed is the rigor of the reconciliation
itself. §4 made the right call but presented it as a forward-looking decision
without directly engaging the R1 contradiction. This section makes the engagement
explicit, with cited source, named uncertainty (wire-bandwidth not yet measured),
named corrections to R2's own first-pass errors (`versionNonce` tiebreak direction,
y-excalidraw maintainership), and a concrete trigger list.

The biggest correction this pass surfaces is methodological, not architectural:
**don't ship "if X then Y" conditionals in design docs without verifying X and Y.**
R1's "bidirectional ⇒ Yjs" passed the heuristic test but failed factual verification.
R2's first pass made smaller versions of the same mistake (wrong tiebreak direction,
wrong maintainership claim). This reconciliation pass catches and fixes those.
Phase 1's executor brief should include explicit instructions to verify any
"if X then Y" claims against the actual source — both for `reconcileElements`
behavior and for Excalidraw API contracts more broadly.

### Honest residual uncertainty

Three things this pass does NOT have evidence for, called out explicitly so the
next pass knows what's still open:

1. **Wire bandwidth under realistic load.** Full-scene broadcasts may or may not
   be a problem on Sarah's actual sessions. Measure during Phase 1 smoke.
2. **`reconcileElements` z-order edge cases.** Fractional-indexing collisions
   between concurrent peer moves of the same element are theoretically possible
   but not observed. Worth a targeted unit test in Phase 1.
3. **`y-excalidraw` 0.18.1 compatibility.** The peer dep is `^0.18.0`; whether it
   works in practice against 0.18.1 needs a spike before any migration decision.
   Documented as a Q1-option-B prerequisite if Andrew picks option B.

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
| Collaboration architecture | Last-write-wins with `reconcileElements()` (per-element version vector + `versionNonce` tiebreaker — **LOWER versionNonce wins on tie**, deterministic per `shouldDiscardRemoteElement` at `dist/dev/index.js:32834` in pinned `^0.18.1`). No native CRDT, but per-element merge is deterministic and handles concurrent edits to different elements losslessly. **In-progress local edits (`editingTextElement`, `resizingElement`, `newElement`) ALWAYS win over remote regardless of version** — a critical UX protection so a remote update doesn't yank your active drag. **Revision 2 verification:** the tutor's `applyRemoteToCanvas` in `WhiteboardWorkspaceClient.tsx:491` already runs this reconcile path against student broadcasts in production and has been reliable for the bidirectional surface we exercise (tutor + 1 student, both drawing). Concurrent edits to the SAME element are LWW-by-version with deterministic tiebreak; that's a known LWW limitation but not one our workload exercises (Sarah and the student aren't dragging the same PDF at the same instant). Multi-user collaboration is built in; the sync layer is left to the application. |
| TypeScript/React fit | Excellent. First-class TypeScript, React component. |
| Mobile UX quality | Good for drawing; Excalidraw's touch events are well-tested. Safari quirks (no `timeslice`, MP4 mime) are already handled. |
| Customization | Rich customization API: `renderTopRightUI`, `renderBottomRightUI`, `UIOptions.tools` to hide/show tools, `initialData.appState` for defaults. Sarah's toolbar-reorder + default-draw-type requests are satisfiable with ~1 day of work. |
| License/cost | MIT. $0 for production. |
| Ecosystem velocity | Active; Excalidraw.com is the primary consumer. Upstream breaking changes are infrequent but happen on major versions. Pin to minor. |
| Integration cost | Zero migration. Everything we've built (recorder adapter, event log, PDF insert, math, Desmos, per-page strip, join token flow) stays. |
| Recorder-integration risk | Zero. The recorder and Excalidraw are decoupled at the `excalidraw-adapter.ts` boundary. |
| **Verdict** | **Best choice for Wave 1, re-affirmed under Revision 2's bidirectional premise.** Architecture redesign is in how WE build the *student-side* apply path — the tutor already shows the discipline works. `reconcileElements` handles the bidirectional surface we actually exercise. Library migration would not eliminate the apply-path discipline work; it would just move it onto a different substrate. |

**Key constraint:** Excalidraw exposes exactly ONE canvas at a time. Our multi-page
architecture is built on top of this single canvas. This is a mismatch — but it's a
mismatch we've been living with since Phase 1, and the tutor's `applyRemoteToCanvas`
(WhiteboardWorkspaceClient.tsx:491) is concrete proof we can model it correctly.
The correct fix is to make the *student* sync layer match that discipline, not to
migrate libraries.

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
| Collaboration architecture | Yjs is a CRDT (Y.Doc with Y.Map/Y.Array). `y-excalidraw` (**community-maintained by a single individual — Rahul Badenkal — NOT an official Excalidraw-team package; corrected from Revision 1's incorrect claim**) maps Excalidraw elements into a Yjs Y.Map, giving true CRDT merging where applicable. No more `reconcileElements` version-vector conflicts. |
| TypeScript/React fit | Yjs has TypeScript types. `y-excalidraw` is a thin React hook. |
| Mobile UX quality | Inherits Excalidraw's mobile UX (good). The Yjs layer doesn't change the rendering surface. |
| Customization | Same as Excalidraw — Yjs only touches the sync layer, not the UI. Sarah's customization requests remain satisfiable. |
| License/cost | Yjs: MIT. `y-excalidraw`: MIT. Relay: y-websocket (MIT) self-hosted ~$5/mo, or Cloudflare Durable Objects ~$5/mo base. $0 library license. |
| Ecosystem velocity | Yjs is very active and has become the de-facto CRDT standard in the web collaboration space. `y-excalidraw` is community-maintained: latest version `2.0.16` was published August 16, 2025 (~9 months stale at time of writing); 27 weekly downloads on npm; single maintainer; lists `@excalidraw/excalidraw ^0.18.0` as peer dep so 0.18.1 is supported in principle. **Real bus-factor / maintenance risk that R1 understated.** Compatibility with Excalidraw ^0.18.1 specifically still needs a spike before any migration commitment — a 9-month maintenance gap during a period when Excalidraw shipped 0.18 with substantial API changes is non-trivial. |
| Integration cost | Significant refactor. The `pageDataRef` + v3 wire apply path on BOTH tutor and student is replaced by a Yjs Y.Doc per page. The relay changes from excalidraw-room to y-websocket (or Cloudflare Durable Objects). The recorder adapter stays (Yjs state maps through the same `ExcalidrawLikeElement` shape). ~2-3 weeks of Sonnet + Composer dispatches. **Caveat:** the page-bleed/timing/state-authority discipline still has to be built — Yjs doesn't fix "I read from the wrong source of truth"; it only fixes "two writers concurrently modified the same field." |
| Recorder-integration risk | Low. Yjs state changes are observable via `Y.Doc.observe`. The recorder adapter can listen to Yjs changes instead of Excalidraw's `onChange`. |
| **Verdict (revised under Revision 2)** | **Escalation contingency, not Wave 1.** The original §5.6 conditional ("if students draw, flip to Yjs") was the right *shape* of decision rule but had the wrong threshold. Bidirectional editing with two peers does NOT structurally require CRDT — `reconcileElements`'s per-element version vectors handle it deterministically, AND the tutor already runs that path in production today. Yjs becomes the right answer when: (a) Phase 1 (disciplined symmetric LWW apply path) still produces regressions after one well-designed implementation attempt, (b) the workload grows to 3+ simultaneous concurrent editors on the same element, or (c) we need offline editing with later sync. Defer to Wave 3 contingency. |

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
| **Excalidraw (current)** | **Recommended for Wave 1 (Revision 2 re-affirms)** | Architecture redesign is in the STUDENT sync layer — the tutor's `applyRemoteToCanvas` already shows the discipline works. No migration cost. Sarah's customization requests are satisfiable. `reconcileElements` handles the bidirectional workload deterministically. |
| tldraw | Eliminated | $6k/year production license. |
| Yjs + Excalidraw | Wave 3 escalation contingency | Structural CRDT improvement, moderate integration cost. **Revision 2:** not flipped to as the Wave 1 answer because the bidirectional bugs we've seen are state-authority/timing, not concurrent-edit conflict resolution. Yjs would not fix those; the apply discipline still has to be built. |
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
| **excalidraw-room/Fly.io** | **Keep (Wave 1 and beyond)** | Proven, $2/mo, E2E encryption is excellent. Bidirectional broadcasts already flow through it correctly today. |
| PartyKit/CF DO | Future upgrade | Global edge, stateful welcome packets, ~$5-15/mo |
| Liveblocks | Not recommended | Encryption model weaker, cost jumps |
| y-websocket | Wave 3 escalation contingency (paired with Yjs library verdict) | Correct relay if/when Yjs migration is triggered. Not promoted to Wave 1 because Yjs itself isn't. |

---

## 4. Recommendation with rationale

> **Revision 2 note:** The Revision 1 §4 was written under the incorrect premise
> that "the tutor is the only author." Under the corrected bidirectional premise,
> the verdict shape stays the same (Option A — Excalidraw + excalidraw-room + LWW)
> but the *rationale* is genuinely different, and the §5/§6/§7 specs that follow
> are meaningfully revised. This section is fully rewritten.
>
> **If you're reading §4 to evaluate "should we have flipped to Yjs?" — read the
> [Revision 1 → Revision 2 verdict reconciliation](#revision-1--revision-2-verdict-reconciliation)
> section first.** It addresses that question head-on with source citations, cost-of-being-wrong
> analysis, and the concrete trigger conditions under which we WOULD migrate to
> Yjs.

### The three plausible verdicts, evaluated under the corrected bidirectional premise

**Option A — Excalidraw + disciplined symmetric apply layer + excalidraw-room (recommended).**
Mirror the tutor's already-working `applyRemoteToCanvas` discipline onto the student's
`runV3Apply`. Keep `reconcileElements`. Keep excalidraw-room. The bidirectional model
is already shipping; what's missing is consistent apply-path discipline on the student
side.

**Option B — Yjs + y-excalidraw + y-websocket (rejected for Wave 1, retained as escalation contingency).**
Migrate both sides to a CRDT. Would deliver structurally deterministic merge across
all peers. Cost: 2-3 weeks. Rejected because the bugs we've seen are NOT concurrent-edit
conflicts — they are state-authority/timing bugs in the apply path. A CRDT migration
does not eliminate the need to write the disciplined apply layer; it just changes the
substrate the discipline is written against. We'd pay the migration cost AND still
have to do the apply-path work.

**Option C — Excalidraw + LWW + an explicit symmetric apply protocol (effectively Option A).**
This is what Option A actually is once the spec is written. Listing it separately would
be artificial; the apply-path spec in §5 below IS the explicit symmetric protocol.
Treat C as a notational variant of A, not a distinct option.

### Recommendation: Option A (Excalidraw + symmetric apply layer + excalidraw-room)

**In one sentence:** Keep Excalidraw, keep `reconcileElements`, keep excalidraw-room;
redesign the *student-side* apply path to match the tutor's existing symmetric-authoring
discipline (`activePageIdRef` + `pageSwitchProgrammaticRef`-equivalent guard + read
from `pageDataRef[targetId]` when off-target, from canvas only when on-target and no
switch in flight).

**The decisive evidence:**

1. **The tutor's `applyRemoteToCanvas` already implements the correct symmetric pattern**
   (`WhiteboardWorkspaceClient.tsx:491–595`). It receives student broadcasts, runs
   `mergeScenesReconciled` with `localForMerge` resolved from `pageDataRef[targetId]`
   when off-target or mid-page-switch, writes the merged result to `pageDataRef[targetId]`
   unconditionally, and updates the live canvas only when STILL on-target at write
   time. Returns `{ record: "skip" }` for off-page peer broadcasts so the recording
   event log doesn't pick up phantom diffs. This pattern has been reliable in production
   for the entire pilot.

2. **`reconcileElements` IS sufficient for the bidirectional surface we exercise.** It
   merges by per-element `version` with `versionNonce` tiebreaker. Concurrent edits
   to *different* elements both survive. Tombstones (`isDeleted: true`) propagate
   correctly. Same-element simultaneous edits resolve LWW (one wins deterministically) —
   a known LWW limitation, but not one our workload exercises (Sarah and the student
   are not dragging the same PDF at the same instant in the pilot).

3. **All three rounds of B1-B4 fixes were state-authority/timing bugs, not concurrent-edit failures.**
   Round 1 was a smoke-on-wrong-branch artifact. Round 2 broke when `runV3Apply`
   read `api.getSceneElements()` for the leaving tab after `activePageIdRef` had
   already advanced. Round 3 added "freeze leaving tab, prefetch incoming tab" but
   missed the equivalent of the tutor's `pageSwitchProgrammaticRef` and didn't extend
   `viewport-align.ts`'s contract for missing `viewportWidth/Height`. None of these
   failures are what a CRDT would fix — Yjs would inherit the same class of
   `activePageIdRef`-vs-canvas race if the apply discipline isn't written.

4. **Student → tutor strokes have been reliable across all three rounds.** Andrew's
   explicit "reverse direction" verification passed every smoke. This is empirical
   evidence that `reconcileElements`'s bidirectional handling works for our workload —
   when the apply path is correctly disciplined (as it is on the tutor side, where
   inbound = student broadcasts).

**What we lose vs the current implementation:**
- v2-on-student inbound (rare; only matters if a stale tab cached an old protocol — log-and-drop instead of crashing)
- Uncontrolled flexibility to read from the canvas mid-apply (trading away intentionally; the tutor pattern shows the controlled equivalent)

**What we gain:**
- Symmetric apply discipline across both peers (the student catches up to where the tutor already lives)
- No page-switch bleed (structurally impossible when `pageSwitchProgrammaticRef`-equivalent guard is in place)
- No viewport-timing race (`viewport-align.ts` contract closes the missing `viewportWidth/Height` gap from round 3)
- Shorter B1-B4 fix: one focused Composer dispatch with the apply-path spec in hand

**On the original conditional in §5.6 ("if students draw, flip to Yjs"):**

The conditional was directionally right (CRDT is a stronger model than LWW) but had
the wrong threshold. Two peers exchanging non-overlapping element edits do NOT need
CRDT — they need disciplined per-element LWW with consistent local-state reads. We
already have that on the tutor side. Yjs is the right answer when (a) the disciplined
LWW apply path STILL produces regressions, (b) the workload grows to 3+ simultaneous
editors on the same element, or (c) we need offline editing with later sync. None
of those apply today.

**Comparison with the RELIABILITY-REDESIGN call:**

The prior Sonnet pass called B1-B4 "application bugs" and recommended "one focused
Composer dispatch to target the sync surface holistically." This pass agrees that one
Composer dispatch IS the right execution vehicle, but escalates the scope diagnosis:
the bugs are structural (asymmetric apply discipline between tutor and student) and
the fix is to bring the student to parity with the tutor's already-working pattern.
Same Composer dispatch — different spec it's given.

**On library migration (tldraw):**

tldraw 4.0 (Sep 2025) requires a $6k/year production commercial license. This directly
violates Andrew's stated constraint. Do not evaluate tldraw further at any timeline.

**On Yjs + Excalidraw (held as escalation contingency):**

Yjs is the structurally correct long-term path IF the disciplined Excalidraw sync
layer still produces regressions after one well-designed implementation attempt under
the Revision 2 spec. The `y-excalidraw` binding maps Excalidraw elements into a Yjs
Y.Doc and gets true CRDT merging. The cost is a meaningful refactor (2-3 weeks) and
a new relay (y-websocket or Cloudflare DO). **Defer to Wave 3 as a contingency.**
Do not start the Yjs migration before the Excalidraw apply-discipline fix is validated
in Sarah's sessions.

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

### 5.1 Canonical state owners under symmetric authoring

> **Revision 2 note:** Revision 1's "NEVER read back from canvas" rule was a
> hard-line generalization of a more nuanced principle the tutor's already-shipping
> `applyRemoteToCanvas` actually follows. Under bidirectional authoring, BOTH peers
> have local edits that must be preserved across remote applies — so `pageDataRef`
> IS a canonical *local-state* cache that's read during merge, kept in sync with
> the canvas via `onChange`. The forbidden read is from `api.getSceneElements()`
> mid-apply when off-target or during a programmatic page switch, NOT all canvas
> reads always.

The root cause of all three rounds is that the student-side `runV3Apply` had no clear
answer to "where do MY local edits for page X live right now, given that Excalidraw
exposes one canvas and I may not be on page X right now?" — even though the tutor's
`applyRemoteToCanvas` already had a precise answer to the same question.

The new architecture spec inherits the tutor's discipline, made symmetric:

```
Local edits  →  pageDataRef[activePageId]  (synced via onChange, gate-guarded by applyingRemoteRef)
                              ↓
Remote wire arrives  →  reconcileElements(pageDataRef[targetPageId], remote.pages[targetPageId])
                              ↓
                      pageDataRef[targetPageId]  (always written)
                              ↓
                      canvas (only if STILL on-target AND no programmatic page switch in flight)
```

**Canonical owners (both peers, symmetric):**

| State type | Canonical owner | Who reads it | Who writes it |
|---|---|---|---|
| **Per-page elements (any peer)** | `pageDataRef[pageId]` | Apply path (merge input); broadcast snapshot builder; page-switch hydration | `onCanvasChange` (local edits, when not applying remote); `runV3Apply` / `applyRemoteToCanvas` (after `reconcileElements` merge) |
| Active page id | `activePageIdRef.current` | All apply paths; broadcast snapshot builder | `runV3Apply` (page-change detection); tutor page-strip click handler; student page-strip click handler |
| **Mid-page-switch flag (NEW on student)** | `pageSwitchProgrammaticRef` (counter) | Apply path (read-at-write-time check before touching canvas) | Page-strip click handlers; rev-reset re-hydration helper |
| Tutor's viewport (for follow) | `lastTutorFollowRef.current` | `applyTutorFollow()`; `snapToTutorView()` | v3 wire apply on receive |
| Page list | `pageListRef.current` | Page strip UI; broadcast snapshot builder | v3 wire apply on receive (student); page-create/rename actions (tutor) |
| Apply-in-flight gate | `applyingRemoteRef.current` | `onCanvasChange` (suppress local broadcast during remote apply) | Apply path (try/finally) |

**The invariants that eliminate the page-bleed bug (replaces Revision 1's "never read back"):**

> **I1 (gate the canvas read by on-target-AND-no-switch).** `api.getSceneElements()`
> is read inside the student's `runV3Apply` only when BOTH (a) the targetPageId of
> the current merge equals `activePageIdRef.current` AND (b) `pageSwitchProgrammaticRef.current === 0`.
> When EITHER condition fails, the merge's local input MUST come from
> `pageDataRef[targetPageId]` (which is the canonical local-edit cache for that page).
> This mirrors `WhiteboardWorkspaceClient.tsx:554` (tutor's `onTargetReadTime`).
>
> **I2 (gate the canvas write by on-target-AND-no-switch at WRITE time, re-checked).**
> After `mergeScenesReconciled` resolves (which does a microtask hop for the dynamic
> import of `reconcileElements`), re-check the on-target-AND-no-switch condition
> before calling `api.updateScene({ elements: merged })`. If the tutor/student page
> moved during the await, write only to `pageDataRef[targetPageId]` and let the next
> page-switch hydrate surface the change visually. This mirrors
> `WhiteboardWorkspaceClient.tsx:576` (tutor's `stillOnTargetWriteTime`).
>
> **I3 (page-switch is a separate operation from apply).** Page-change detection
> (`previous !== followTarget` in `runV3Apply`) MUST freeze the leaving page's
> elements from `pageDataRef[previous]`, NOT from `api.getSceneElements()` — because
> by the time `runV3Apply` is examining `details.page.activePageId`, Excalidraw may
> not yet have re-rendered the leaving page's canvas state. The
> `pageDataRef[previous]` value is the most recent local truth (synced via the
> `onCanvasChange` snapshot at the moment of the last local edit).
>
> **I4 (broadcast snapshot honors the same rules).** When the student or tutor
> builds the outbound broadcast snapshot, the per-page element arrays come from
> `pageDataRef[pageId]` for non-active pages and from the canvas only for the
> current active page (gated by the same on-target check). The tutor's
> `getTutorDocumentPagesSnapshot` already follows this pattern; the student's
> `onCanvasChange` (which broadcasts the active-page elements directly) does too —
> the change is to ensure `pageDataRef[activePageId]` is updated BEFORE the
> broadcast call inside `onCanvasChange`, which it already is on line 596 of
> `useStudentWhiteboardCanvas.ts`.

**Where Revision 1's rule was wrong, and what it should have said:**

Revision 1's "NEVER read back from canvas" would have BROKEN student-side local-edit
preservation: the student types a stroke → `onChange` fires and writes to
`pageDataRef` and broadcasts → almost simultaneously the tutor's v3 message arrives →
without reading the student's local edit during merge, the student's stroke is wiped
on next render. The fix is reading the local edit from `pageDataRef[targetPageId]`,
which IS kept in sync with the canvas via the synchronous `onChange` handler at
`useStudentWhiteboardCanvas.ts:596`.

The principle is: **`pageDataRef` is the symmetric canonical local-state cache for
both peers; the canvas is read only when it definitely belongs to the page being
merged AND no async re-render is in flight; otherwise reads come from the cache.**

**Why the tutor side already works — and what changes on the student:**

The tutor's `applyRemoteToCanvas` already enforces I1+I2 via `onTargetReadTime` +
`stillOnTargetWriteTime`, and has `pageSwitchProgrammaticRef` as the in-flight switch
counter. The student's `runV3Apply` lacks an equivalent. Phase 1 adds it. Same data
shape, same merge function, same rules — symmetric apply discipline.

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

**The contract (revised under Revision 2 for symmetric authoring):**

```
Rule 1 (revised): Reading api.getSceneElements() inside the apply path is gated
         by I1 from §5.1: ALLOWED only when targetPageId === activePageIdRef.current
         AND pageSwitchProgrammaticRef.current === 0. Otherwise, read local
         elements from pageDataRef[targetPageId]. This matches the tutor's
         existing onTargetReadTime pattern in WhiteboardWorkspaceClient.tsx:554.

Rule 2 (revised): The canvas (api.updateScene with elements) is written EXACTLY
         ONCE per apply, ONLY when the I2 write-time re-check from §5.1 passes
         (still-on-target AND no programmatic switch in flight). pageDataRef
         is written for the targetPageId regardless. The on-active-page invariant
         (P5 in §5.5) ensures pageDataRef[activePageId] tracks the canvas.

Rule 3: Page-switch detection happens BEFORE any per-page merge work runs.
         The "freeze leaving tab" pattern must freeze from pageDataRef[leaving],
         not from api.getSceneElements() (which may belong to either the
         leaving or the incoming page depending on Excalidraw's re-render timing).
         The freeze-to-pageDataRef is a no-op when pageDataRef[leaving] is
         already current via onCanvasChange — which is the common case.

Rule 4: Viewport alignment applies AFTER Rule 2's updateScene resolution.
         Only apply if the student's container has non-zero dimensions
         (read from api.getAppState().width/height). If zero, retry on next
         requestAnimationFrame (max ~2 retries, then fall back to raw scroll).
         DO NOT read DOM (.excalidraw-container.getBoundingClientRect()) —
         the round-3 DOM fallback was a workaround for the zero-dimension
         race; rAF retry handles it more reliably across browsers.

Rule 5 (revised): The waitDoubleRaf() call in updateSceneMergingWithRemote
         (apply-reconciled-remote-scene.ts:30-40, currently called by the
         TUTOR's recorder path via updateSceneMergingWithRemote) MAY be
         retained ONLY for the tutor's tutor→tutor-recorder-canvas merge
         path where local elements come directly from the live canvas
         (rather than pageDataRef). For the STUDENT's runV3Apply and the
         TUTOR's applyRemoteToCanvas (both of which now route through
         mergeScenesReconciled with pageDataRef-resolved local input),
         waitDoubleRaf is NOT needed and SHOULD NOT be inserted. If
         testing reveals it is needed somewhere, that's a sign the I1/I2
         gates are being bypassed — fix the gate, not the timing.
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

These invariants must hold after every `runV3Apply` (student) and `applyRemoteToCanvas`
(tutor) completes. The executor implementing Phase 1 MUST include a test for each on
the student side; corresponding tutor-side coverage already exists for P1-P5.

1. **No cross-page contamination:** `pageDataRef["p1"]` contains only elements that
   belong to page p1 after the reconcile merge — i.e., elements whose ownership is
   determined by the incoming wire's `pages["p1"]` array plus any local elements
   already in `pageDataRef["p1"]` before the apply. An element's `id` never appears
   in more than one page bucket after an apply. (This invariant is what round 2 broke.)

2. **Active page matches canvas:** After `runV3Apply` completes AND the I2 write-time
   re-check passed, `pageDataRef[activePageIdRef.current]` is exactly what was passed
   to `api.updateScene({ elements })`. If the I2 check failed (page moved during
   merge), `pageDataRef[targetPageId]` is updated but the canvas write is skipped —
   in which case `pageDataRef[activePageIdRef.current]` reflects whatever the
   CURRENT active page's prior state was, and the canvas is unchanged.

3. **Frozen leaving page:** When `runV3Apply` detects a page change (new
   `page.activePageId !== old activePageId`), `pageDataRef[old activePageId]` is NOT
   updated by reading from the canvas. It retains its value from the previous
   `onCanvasChange` snapshot. If `pageDataRef[old activePageId]` is `undefined` (the
   student never visited that page locally), it is initialized from the wire's
   `docV3.pages[old activePageId]` if present, otherwise left undefined.

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

7. **Local-edit preservation across remote apply (NEW under Revision 2):** When a
   remote v3 message arrives while the student has local elements in
   `pageDataRef[targetPageId]` that are NOT in the tutor's `docV3.pages[targetPageId]`
   (e.g., a student stroke drawn between the tutor's last broadcast and the current
   one), those local-only elements MUST survive the merge. `reconcileElements`
   preserves elements present only on one side; the test must assert this with a
   scenario where the student adds an element, the tutor broadcasts without it, and
   the merged page bucket contains BOTH sets of elements after the apply. (This is
   what the original Revision 1 §5.1 "never read back" rule would have broken.)

8. **No echo loop (NEW under Revision 2):** When the student broadcasts via
   `onCanvasChange` (line 600 of `useStudentWhiteboardCanvas.ts`), the broadcast
   travels to the tutor and is filtered against the student's own peerId on the
   tutor's `onRemoteScene` callback (already correct in sync-client). The student
   does NOT receive its own broadcast back. Conversely, when the student applies an
   incoming tutor broadcast and writes via `api.updateScene`, `applyingRemoteRef`
   is set to `true` so the resulting `onCanvasChange` early-returns (line 595) and
   does NOT re-broadcast the merged result back to the tutor. The test must assert
   `sync.broadcastScene` is NOT called during a `runV3Apply`.

### 5.6 Conflict resolution (revised — symmetric bidirectional authoring)

> **Revision 2 note:** Revision 1's "tutor wins on all scene state" was incorrect.
> Both peers author. The conflict model is symmetric per-element LWW via
> Excalidraw's `reconcileElements` — already in production on the tutor side via
> `applyRemoteToCanvas`, and confirmed working for student → tutor across all three
> rounds of B1-B4 smokes.

**The data-model rule:**

> **Per-element LWW with deterministic tiebreak. Both peers are authors.**
>
> `reconcileElements(local, remote, appState)` is called on both peers' apply
> paths. For each element id present in both local and remote: keep the one with
> the higher `version`; if `version` ties, keep the one with the LOWER
> `versionNonce` (Excalidraw's pseudo-random nonce assigned at create/edit time —
> verified at `node_modules/@excalidraw/excalidraw/dist/dev/index.js:32834`,
> the `shouldDiscardRemoteElement` predicate: `local.version === remote.version &&
> local.versionNonce < remote.versionNonce` ⇒ keep local).
> Elements present in only one side are kept as-is. Tombstoned elements
> (`isDeleted: true`) propagate via the same merge — the tombstone with higher
> version wins, ensuring deletes are not silently reverted. **Additional protection:**
> if the local element is currently being edited (`editingTextElement`,
> `resizingElement`, or `newElement` in `localAppState`), the local element wins
> regardless of version — so a remote update never yanks the user's active drag.

**The concrete bidirectional cases — verified:**

1. **Concurrent edits to DIFFERENT elements (most common case).**
   Tutor draws element A on page P; student draws element B on page P. Both
   elements live in different ids → `reconcileElements` keeps both. After both
   broadcasts have round-tripped, both peers see {A, B}. **Verified empirically:**
   this is the workload student → tutor has been running reliably across all three
   rounds; the asymmetry has been only in TUTOR → STUDENT reliability, which is
   apply-path discipline, not data-model semantics.

2. **Concurrent edits to the SAME element (rare for our workload).**
   Both peers grab the same PDF and drag it at the same instant. Each edit bumps
   `version` and emits a new `versionNonce`. `reconcileElements` picks one
   deterministically (higher version, then LOWER versionNonce). The losing edit
   is dropped — the user whose edit was "lost" sees the element snap to the winner's
   position. **Known LWW limitation; acceptable because:** (a) the workload doesn't
   exercise this (Sarah and the student are not dragging the same PDF simultaneously);
   (b) when it does happen, the resolution is deterministic and visible, not silent
   corruption; (c) the loser can simply repeat the action and their edit becomes
   the latest version, which then wins. If this becomes a real problem in pilot,
   the escalation is Yjs (CRDT), not a custom OT layer.

3. **Concurrent moves of different elements.** Same as case 1 — independent ids,
   both survive.

4. **Concurrent inserts (different ids).** Same as case 1.

5. **Concurrent deletes vs edits on the same element.** Excalidraw represents
   deletes as `isDeleted: true` with bumped `version`. If peer A deletes while peer
   B edits, the higher `version` wins. If peer B's edit was later, the element
   "comes back" with the edit applied (and the delete is reverted). If peer A's
   delete was later, the element stays deleted. This is correct LWW and matches
   user expectation ("the most recent action wins").

6. **PDF/image insert colliding with a page change.** The insert is one or more
   elements with new ids on `pageDataRef[insertPageId]`. The page-change updates
   `activePageIdRef`. These commute (the insert lands in its target page's bucket
   regardless of which page is currently active). The peer that performed the
   insert remains on its own active page; the other peer sees the insert when
   they next visit (or merge into) the insert's target page. **Verified by the
   tutor's `applyRemoteToCanvas` which already handles this — `targetId =
   details.scenePageId` is independent of the tutor's local `activePageIdRef`.**

7. **Mobile peer on flaky network, broadband peer rapid-broadcasts.**
   Socket.io's websocket transport delivers in-order over a single TCP connection.
   On a reconnect, the flaky peer's `lastTutorV3RevRef` is reset (per the
   tutor-disappear-from-peers-map detection on `useStudentWhiteboardCanvas.ts:475`)
   and the broadband peer's `onNewRemotePeer` callback fires, triggering a fresh
   full-document broadcast. The flaky peer's local edits made during the disconnect
   are NOT lost because they live in `pageDataRef` (and on the canvas) — when the
   peer reconnects, its first `onCanvasChange` broadcast carries them; the
   broadband peer's apply path merges them back in via `reconcileElements`. The
   round-trip "fully heals" within ~2 broadcast cycles after reconnect.

**What `reconcileElements` does NOT handle (intentional; not in scope):**

- **Operational transformation of text within a single element.** Excalidraw doesn't
  support multi-user simultaneous text editing inside one text element at all —
  text edit is single-author at the Excalidraw layer. We inherit this constraint.
- **Atomic group operations (e.g., transactionally moving a group of 10 elements as
  one).** Each element's move is an independent per-element LWW. Two peers moving
  overlapping groups can produce a partial-merge where some elements moved and
  others didn't. Not exercised by Sarah's workload (groups are inserted by one
  peer at a time, e.g., a PDF insert is one peer's action).
- **Causal ordering across peers.** Two edits made independently by different peers
  have no enforced ordering. `version` is per-element-monotonic on a single peer
  but does NOT establish a global timeline. For most edits this is invisible; for
  same-element conflicts it's the LWW limitation from case 2 above.

**Why CRDT is not required for Wave 1:**

A CRDT (Yjs Y.Map/Y.Array via `y-excalidraw`) would: (a) replace LWW with
mathematically-mergeable operations, eliminating case 2's lose-an-edit behavior;
(b) provide a global causal order via vector clocks; (c) handle offline editing
with eventual convergence. The cost is a 2-3 week migration. The trigger to pay
that cost is: case 2 becomes a real pilot complaint, OR a third concurrent editor
joins (e.g., a parent observing), OR offline-editing is added to the roadmap.
None of these apply today. Documented as Wave 3 escalation contingency.

### 5.7 Failure modes and recovery (revised under Revision 2 for bidirectional authoring)

| Failure | Detection | Recovery |
|---|---|---|
| Relay disconnect mid-session | `onDisconnect` fires → `sync-disconnect` marker in event log | Auto-reconnect (socket.io backoff: 500ms → 10s max). Tutor recording continues. Tutor sees "Reconnecting to student…" banner after 3s. |
| Initial hydration races first broadcast | Student hook buffers `pendingV3Ref` for the canvas-not-ready case | `excalidrawApiRef.current` watcher effect flushes buffer when API arrives |
| Page-switch during remote apply (the round-2 bug class) | Detected by `page.activePageId !== activePageIdRef.current` BEFORE any pageDataRef write; ALSO by `pageSwitchProgrammaticRef.current > 0` for student-initiated switches mid-apply | Freeze old page's state from `pageDataRef[old]`. Update `activePageIdRef`. For the merge, use `pageDataRef[targetPageId]` as local input (per I1). Canvas write gated by I2 re-check. |
| **Student page-switch races tutor broadcast (NEW under R2)** | Student clicks a page tab; this bumps `pageSwitchProgrammaticRef.current`. A tutor v3 broadcast arrives in the same frame | Apply path reads I1 ⇒ off-target ⇒ reads from `pageDataRef[targetPageId]`. Merge result written to `pageDataRef[targetPageId]`. Canvas write gated by I2; if the student's switch finished and the target page matches, canvas is updated; otherwise the merge is silently absorbed into the bucket and surfaces on the student's next visit to that page. |
| **Student local edit races inbound tutor broadcast (NEW under R2)** | Student draws stroke ⇒ `onChange` ⇒ `pageDataRef[active]` updated + `broadcastScene` fired (filtered by `applyingRemoteRef`). Inbound tutor v3 arrives micro-task later | Apply path reads local from `pageDataRef[active]` which now includes the student's just-drawn stroke. `reconcileElements` merges: both elements survive (different ids). Result written to `pageDataRef[active]` AND canvas. Student's stroke is NOT clobbered. (Invariant P7 in §5.5.) |
| **Bidirectional echo loop suppression (NEW under R2)** | During `runV3Apply`, `applyingRemoteRef.current = true`. Excalidraw's `updateScene` triggers `onCanvasChange`; the handler early-returns at line 595 | No echo broadcast back to the tutor. Tutor sees ONE broadcast per real edit, not 2-N from a feedback loop. (Invariant P8 in §5.5.) |
| Student on mobile, network flutter | Socket.io reconnects transparently | Same as relay disconnect. The rev guard resets on tutor-peer re-detection so a missed rev doesn't stall the student permanently. **NEW under R2:** local edits made during the disconnect window remain in `pageDataRef[active]` and on the canvas; on reconnect, the first `onCanvasChange` broadcast carries them; the tutor's `applyRemoteToCanvas` merges them in via `reconcileElements`. Heals within 2 broadcast cycles. |
| **Student loses connection while drawing mid-stroke (NEW under R2)** | Stroke completion fires `onChange`; broadcast attempt fails silently (socket.io buffers) | Stroke stays in `pageDataRef[active]` and on canvas. When socket reconnects, the next `onCanvasChange` (could be a no-op tick or any subsequent edit) will broadcast the full active-page elements including the dropped stroke. **Mitigation:** explicitly re-broadcast the active page's elements on `sync.onConnect` (after a disconnect) — Phase 1 should add this. Without it, a student stroke can sit in `pageDataRef[active]` unbroadcasted until the next local edit. |
| Tutor page refresh mid-session | Tutor sync client disconnects, reconnects, resets rev counter | Rev reset: the student hook detects the tutor peer disappearing from `onRoomPeersChange` → sets `lastTutorV3RevRef.current = 0`. On next tutor broadcast, the full page-document arrives and the student applies cleanly. **R2 nuance:** the tutor's fresh page load reads its OWN state from the server's saved snapshot (per `getBoardDocumentForCheckpoint`), so any student-only edits made before the refresh are visible to the tutor only via the student's next broadcast — which fires on the student's first post-tutor-reconnect canvas change. The rev-reset path covers this. |
| Welcome packet missing (student joins before tutor draws) | Canvas blank; student sees "Waiting for tutor" indicator | Tutor's `onNewRemotePeer` callback fires; tutor re-broadcasts the full v3 document; student's buffered `pendingV3Ref` applies on canvas mount. **R2:** if the student starts drawing BEFORE the welcome packet arrives, their strokes are on `pageDataRef[active]` and on canvas. The welcome packet's merge via `reconcileElements` preserves them. |
| Relay restart | All rooms evicted; all clients disconnect | Same as relay disconnect. After reconnect, `new-user` fires; tutor re-broadcasts welcome packet. Same student-local-edit preservation as above. |
| Viewport dimensions zero on follow-apply | `api.getAppState().width === 0` | Schedule `requestAnimationFrame` retry (Rule 4). At most 1-2 retries before the canvas is laid out. If still zero after 500ms, fall back to raw scroll (no center-align). |
| Asset hydration fails (private blob URL 403) | `hydrateRemoteImageFilesForScene` returns with `giveUpFileIds` populated | Elements stored in pageDataRef without the resolved asset (broken image tile). Future applies with the same asset skip re-fetch (giveUpFileIds guard). Not a blocking failure. |
| **Student tab crash mid-session (NEW under R2)** | Tab process killed; sync socket drops | Student must re-open via the same join link. On re-open, the encryption key is in localStorage (per `readKeyFromHash`), `pageDataRef` is empty (fresh hook), and the tutor's `onNewRemotePeer` callback fires a fresh welcome packet. **Pre-crash local edits made by the student that hadn't broadcast yet are LOST.** Acceptable for the pilot (students don't author lesson-defining content); if this changes, the escalation is IndexedDB-backed `pageDataRef` for the student (analogous to the tutor's IDB-backed outbox). Captured as a follow-up, not a Phase 1 BLOCKER. |

---

## 6. 5-axis adversarial review (revised under Revision 2 for bidirectional authoring)

Per `../../agenticPipeline/.cursor/rules/reliability-bar.mdc`: BLOCKERs folded into
Phase-1 acceptance criteria, not deferred. Under the corrected bidirectional premise,
the failure surface is roughly 2x what Revision 1 considered — both peers author,
both run apply paths, both can race.

### Axis 1 — Data durability

**What survives a tab crash:**
- Tutor: `handleEndSession` persists the events.json to Blob and the audio segment to
  IDB outbox. A crash before End-session loses the current recording segment (BACKLOG
  BLOCKER-PROD #1 — IDB partial-segment persistence — pre-existing, out of this redesign's scope).
- **Student (NEW under R2):** Student's `pageDataRef` is in-memory only. On tab
  crash, all student-authored elements that have NOT yet been broadcast (or that
  the tutor's `applyRemoteToCanvas` hasn't yet merged into the tutor's own
  `pageDataRef`) are lost. The vast majority of student edits ARE broadcast within
  ~50ms of the local edit and merged on the tutor side immediately; the window for
  loss is small but nonzero. **Not a Phase-1 BLOCKER** (the pilot's student
  workload is annotation/exploration, not lesson-defining authoring), captured
  as a follow-up. Escalation path: IndexedDB-backed student `pageDataRef`
  analogous to the tutor's audio IDB outbox.

**What survives a mid-session network drop:**
- Tutor recording: continues via the audio outbox; `sync-disconnect` markers land in
  the event log. The whiteboard visual on the tutor side stays intact (Excalidraw canvas
  is local).
- **Tutor's view of student edits (NEW under R2):** Student edits made during the
  tutor's disconnect window are NOT visible to the tutor in real time. When the
  tutor reconnects, the student's next `onCanvasChange` broadcast carries the
  active-page elements (including any edits made during the disconnect), and the
  tutor's `applyRemoteToCanvas` merges them in. **BLOCKER (folded into Phase 1):**
  the student MUST re-broadcast the active-page elements on `sync.onConnect`
  (after a prior disconnect detected by a `sawDisconnectSinceLastConnectRef`-style
  latch). Without this, a student stroke made during the tutor's disconnect can
  sit unbroadcasted until the student makes another edit (which may be hours
  later or never in the session).
- Student: canvas freezes for inbound. When the student reconnects (socket.io
  auto-reconnect), the tutor's `onNewRemotePeer` fires and re-broadcasts the full
  v3 document. Student canvas restores. Local edits made during the disconnect
  remain in `pageDataRef[active]` and on the canvas, and the welcome-packet
  merge preserves them via `reconcileElements`.

**What survives a relay restart:**
- Same as mid-session drop. All clients disconnect → auto-reconnect → welcome packet.
- Risk: if the relay restarts while a v3 broadcast in EITHER direction is in-flight,
  one update may be missed. The rev guard + reconnect re-broadcast covers tutor→student.
  The student-side `onConnect` re-broadcast (BLOCKER above) covers student→tutor.

**BLOCKER folded into Phase-1 acceptance:**
1. The tutor's `getPagesSnapshot()` must capture the current canvas state for the
   active page BEFORE `broadcastDocument`. If the snapshot captures a stale
   `pageDataRef[activePageId]` that hasn't been updated since the last `onChange`
   event, the wire payload is stale by up to 50ms (the throttle interval). This is
   acceptable (50ms stale is invisible) but the executor MUST ensure the tutor's
   `onChange` → `pageDataRef` update is synchronous (no async gap in the tutor path).
2. **NEW under R2:** The student MUST re-broadcast `pageDataRef[active]` on a
   `sync.onConnect` event that follows a `sync.onDisconnect` event (using a
   `sawDisconnectSinceLastConnectRef` latch, mirroring the existing pattern at
   `StudentWhiteboardClient.tsx:239–272` for mesh.restart). Without this, student
   edits made during a tutor or relay outage can be silently lost from the tutor's
   view.

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

**Per-element `version`/`versionNonce` ordering (NEW under R2 — symmetric authoring):**
Excalidraw bumps `version` on every element mutation and assigns a fresh `versionNonce`.
Under bidirectional authoring, both peers independently bump their elements'
versions. For elements with disjoint ids, this is fine (no conflict). For elements
with shared ids (the same-element-concurrent-edit case from §5.6 case 2),
`reconcileElements` resolves deterministically — higher version, then higher
versionNonce. **Cross-peer version comparison is sound** because both peers receive
each other's broadcasts and merge them in; the loser's version becomes the
"previous" version and any subsequent edit by the loser bumps PAST the winner's
version (per-element-monotonic). **BLOCKER test:** simulate two concurrent edits
to the same element from both peers; assert that after both broadcasts have
round-tripped, both peers see the same element (no divergence).

**Clock drift between peers:** Wire payloads do NOT carry wall-clock timestamps.
The session timer is anchored to `bothConnectedAt` from the server, so clock drift
between peers is irrelevant to the timer. **`version`/`versionNonce` are NOT
wall-clock-based** — they're per-element monotonic counters with pseudo-random
tiebreaker. Clock drift between peers does NOT affect merge outcomes.

**Timestamp drift:** The student's session timer is anchored to `bothConnectedAt`
from the server — unaffected by this redesign. No additional clock drift risk.

### Axis 3 — Race conditions

**Page-switch-during-apply race:** Addressed by the render-timing contract (§ 5.3)
and invariants I1+I2 (§ 5.1). The key rule: `activePageIdRef.current` is updated only
after the leaving page's state is preserved from `pageDataRef[leaving]`. The merge's
local input is `pageDataRef[targetPageId]`, NOT the canvas — so the canvas's actual
contents during the switch don't matter.

**Student local-edit race vs inbound tutor broadcast (NEW under R2):** Student
draws stroke → `onChange` writes to `pageDataRef[active]` and broadcasts (filtered
by `applyingRemoteRef`). Microtask later, tutor v3 arrives → `runV3Apply` reads
`pageDataRef[active]` (which includes the student's stroke) → merges with tutor's
elements → both survive. **BLOCKER test:** simulate a tutor broadcast arriving
within 1ms after the student's `onCanvasChange`; assert the student's element
survives the merge.

**Echo-loop suppression (NEW under R2):** During `runV3Apply`, `api.updateScene` is
called inside `applyingRemoteRef.current = true`. The resulting `onCanvasChange`
early-returns at line 595 → no echo broadcast. **BLOCKER test:** assert
`sync.broadcastScene` is NOT called during a `runV3Apply` execution (mock the
broadcast and assert call count).

**Mount/unmount race:** The student hook subscribes to `sync.onRemoteScene` in a
`useEffect`. If the tutor broadcasts a v3 message before the student's `useEffect` has
run (possible on cold mount), the `pendingV3Ref` buffer catches it. On mount, the effect
flushes `pendingV3Ref`. This pattern is already in the codebase and is correct.

**Recorder-pause-during-disconnect:** When the student disconnects (FSM → `paused`
state), the tutor's recording pauses. The whiteboard sync client disconnects too. On the
student side, the canvas freezes for inbound; local edits persist. On reconnect, the FSM
resumes recording; the sync client reconnects; the welcome packet restores the
student canvas; the student re-broadcasts active-page elements (per Axis 1 BLOCKER).
The recorder and sync are independent flows — no race between them.

**Initial hydration vs first broadcast:** The student's `excalidrawApiRef` is null until
Excalidraw mounts (lazy-loaded via `next/dynamic`). The `pendingV3Ref` buffer holds any
broadcast that arrives before the API. The hook's `useEffect` watches `excalidrawAPI`
and flushes the buffer on non-null transition. **BLOCKER test case:** The first broadcast
arrives while Excalidraw is still loading (network-slow student). The test must assert
that the student canvas shows the tutor's scene after Excalidraw finishes loading. If
the student also makes a local edit BEFORE the API mounts (impossible today since
the canvas isn't on screen yet, but worth a regression guard), the local edit lives
in `pageDataRef` and survives the welcome merge.

**applyingRemoteRef guard:** The student hook sets `applyingRemoteRef.current = true`
during applies. This is used by the student's `onChange` handler to suppress local
"dirty" events during remote applies. **BLOCKER:** Verify that `applyingRemoteRef.current`
is always reset to `false` even when `runV3Apply` throws (it must be in a `finally` block).
Currently it IS in a `try/finally` in the codebase — confirm this stays intact.

**`pageSwitchProgrammaticRef`-equivalent NEW on student (BLOCKER under R2):** The
tutor has `pageSwitchProgrammaticRef` (a counter incremented during programmatic
page switches initiated by tutor clicks, used in I1/I2 read-time/write-time gates).
The student must introduce the same counter and use it in `runV3Apply`'s I1/I2
checks. Without it, the student's page-strip click can race with an inbound tutor
broadcast and the round-2 page-bleed class of bugs returns through a slightly
different door.

### Axis 4 — Cross-platform parity

**Desktop tutor + mobile student (drawing on mobile, NEW emphasis under R2):**
The primary production scenario, and under bidirectional authoring the mobile peer
is doing real authoring — not just receiving. Touch-stroke broadcasts at mobile-typical
frame rates (could be 30-60Hz at low end), each carrying a full active-page scene
snapshot. The bandwidth of student → tutor on mobile drawing is non-trivial. **BLOCKER
test:** smoke a student-on-iPhone-Safari drawing a long continuous stroke; verify
that (a) the stroke broadcasts and renders on the tutor canvas in real time
(< 200ms perceived lag is acceptable), (b) the tutor's recorder event log shows
the strokes correctly attributed to the student peer, (c) no socket throttling /
buffer-overflow errors in either console.

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
- **Touch + stylus pressure (NEW under R2):** Student drawing with iOS Pencil
  produces pressure-sensitive strokes. These are Excalidraw-internal element
  attributes that travel through `reconcileElements` like any other element data.
  No special sync handling needed; just verify the smoke includes a pressure-sensitive
  stroke from a stylus-capable mobile student.

**Chrome vs Safari:** The `waitDoubleRaf()` removal from `runV3Apply` and
`applyRemoteToCanvas` (under Revision 2: retained ONLY in the tutor-recorder's
`updateSceneMergingWithRemote` path if still needed there) removes a Safari-friendly
timing hack. Before removing, verify that the new approach (gated canvas reads via
I1/I2) works on Safari. The unit tests should cover this; a real smoke on Safari iOS
is required as a Phase-1 smoke gate.

**Color palette dismiss on click-away (I7, Sarah's bug):** This is an Excalidraw
behavior not related to the sync redesign. Excalidraw's `onPointerDown` dismisses the
toolbar panel on outside click — this may require a custom `onPointerDown` handler or an
Excalidraw config option. Out of scope for this redesign; keep in BACKLOG.

### Axis 5 — Observability

**Current `wbsid` coverage in sync-client.ts:** The sync client logs every state
transition with `wbsync=${roomId.slice(0, 8)}`. This is good but partial — it doesn't
log the v3 `rev` number on receives, the `pageId` being applied, or (under R2) the
*author* of each event so we can distinguish tutor-originated from student-originated
work in the logs.

**Required log additions for this redesign (all `wbsid=<id>` format per AGENTS.md,
with new `wba=<id>` apply-path prefix and `author=<role>` tag NEW under R2):**

```
[student-apply] wbsid=<id> wba=<applyId> author=tutor action=apply-v3-start rev=<n> activePageId=<pid> pageIds=[...]
[student-apply] wbsid=<id> wba=<applyId> author=tutor action=page-switch from=<pid> to=<pid>
[student-apply] wbsid=<id> wba=<applyId> author=tutor action=apply-v3-complete rev=<n> elementsOnActiveTab=<N>
[student-apply] wbsid=<id> wba=<applyId> action=rev-drop reason=stale rev=<n> last=<m>
[student-apply] wbsid=<id> wba=<applyId> action=rev-reset reason=tutor-reconnect
[student-apply] wbsid=<id> action=viewport-align-defer reason=zero-dimensions retry=<N>
[student-apply] wbsid=<id> action=viewport-align-applied panX=<x> panY=<y> zoom=<z>
[student-broadcast] wbsid=<id> author=student action=broadcast-v2 page=<pid> elements=<N> reason=onChange|reconnect
[tutor-apply]    wbsid=<id> wba=<applyId> author=student action=apply-v2-start page=<pid> elements=<N>
[tutor-apply]    wbsid=<id> wba=<applyId> author=student action=apply-v2-complete page=<pid> mergedCount=<N> writeToCanvas=true|false
[tutor-wire]     wbsid=<id> author=tutor action=broadcast-v3 rev=<n> pages=[<pid>,...] activePageId=<pid>
```

The `author=` tag is the key R2 addition: when debugging "where did that element come
from", `grep author=student wb-logs` immediately surfaces student-originated work.
Conversely `grep author=tutor wb-logs` shows tutor-originated work. Without this
tag, the bidirectional log stream is much harder to read.

These logs MUST be present in the Phase-1 implementation. Without them, debugging a
Sarah production issue is impossible without a screen recording.

**BLOCKER:** The `pvs` prefix (per-page view state, per AGENTS.md) should be used for
all viewport-state events. The `wbsid` prefix is session-level. The new `wba` prefix
(apply-path-level) MUST be registered in AGENTS.md § Conventions alongside `wbsid`,
`pvs`, and the other 3-letter prefixes. All three are co-emitted when relevant:
`pvs=<pageId> wba=<applyId> wbsid=<sessionId>` on viewport-align events that occur
during an apply.

---

## 7. Sequenced implementation plan

### Phase 1 — Disciplined symmetric apply layer (Wave 1, highest priority)

> **Revision 2 scope expansion:** Phase 1 still primarily rewrites the student's
> `runV3Apply` to match the tutor's `applyRemoteToCanvas` discipline (the bulk of
> the work), but now also adds (a) the new `pageSwitchProgrammaticRef`-equivalent
> on the student side, (b) the student-side `onConnect-after-disconnect` re-broadcast
> latch, (c) the new bidirectional invariant tests (P7+P8), and (d) the `author=`
> log tag everywhere. Effort estimate updated from 3-4h to 5-7h Composer 2.5
> dispatch.

**Scope:**
1. Rewrite `useStudentWhiteboardCanvas.ts` `runV3Apply` to comply with the
   canonical state authority rules (§ 5.1: I1/I2/I3/I4), render-timing contract
   (§ 5.3 revised), and per-page invariants (§ 5.5: P1-P8).
2. Add `pageSwitchProgrammaticRef` (counter) to `useStudentWhiteboardCanvas.ts`,
   mirroring the tutor's pattern. Increment in the student's page-strip click
   handler; decrement after Excalidraw confirms the re-render. Use in I1/I2
   gates within `runV3Apply`.
3. Add `viewportWidth`/`viewportHeight` to the tutor's `WhiteboardWireFollow`
   wire payload and to the tutor's `getFollow()`. Update `viewport-align.ts`
   to require these fields for center-align (fall back to raw scroll without).
4. Add rAF-retry fallback and 500ms timeout backstop to `viewport-align.ts`'s
   apply-viewport path.
5. Add the student-side `onConnect-after-disconnect` re-broadcast: when the
   student's sync client reconnects following a disconnect, re-broadcast
   `pageDataRef[activePageIdRef.current]` so any local edits made during the
   outage reach the tutor.
6. Add the new `author=<role>` and `wba=<applyId>` log tags to every apply-path
   log line (student and tutor).
7. Retire the v2 INBOUND apply path on the student (`runV2Apply`) — drop with
   a warn log if v2 inbound arrives. The student's OUTBOUND v2 `broadcastScene`
   STAYS (it's how the tutor receives student edits).
8. Add unit tests for all per-page invariants (P1-P8) and the new failure modes
   in § 5.7 (bidirectional race cases).
9. Register the new `wba` prefix in `AGENTS.md` § Conventions.

**Files changed (rough list):**
- `src/hooks/useStudentWhiteboardCanvas.ts` — primary changes: `runV3Apply` to mirror
  tutor's `applyRemoteToCanvas`; add `pageSwitchProgrammaticRef`; add
  onConnect-after-disconnect re-broadcast; replace v2-inbound with drop-and-warn
- `src/lib/whiteboard/viewport-align.ts` — rAF-retry fallback + 500ms timeout
  backstop; require `viewportWidth`/`viewportHeight` from tutor wire
- `src/lib/whiteboard/sync-client.ts` — extend `WhiteboardWireFollow` type with
  `viewportWidth?: number; viewportHeight?: number`
- `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx` —
  include `viewportWidth`/`viewportHeight` in `getWireBroadcastExtras` follow payload
- `src/app/w/[joinToken]/StudentWhiteboardClient.tsx` — wire the page-strip click
  to bump `pageSwitchProgrammaticRef`; ensure the on-connect re-broadcast is wired
- `src/__tests__/whiteboard/use-student-canvas.test.ts` — add test cases for
  invariants P1-P8 and bidirectional race failure modes in § 5.7
- `AGENTS.md` § Conventions — register `wba` prefix
- `docs/WHITEBOARD-STATUS.md` — update phase status

**What NOT to change (carries forward unchanged):**
- `sync-client.ts` socket/crypto/subscription logic (it's correct and well-tested)
- `apply-reconciled-remote-scene.ts` `mergeScenesReconciled` (the merge logic is
  correct; the change is in HOW the student's `runV3Apply` calls it)
- `apply-reconciled-remote-scene.ts` `updateSceneMergingWithRemote` and its
  `waitDoubleRaf()` (still used by the tutor's recorder path, may stay)
- `useTutorLiveDocumentWire.ts` (tutor broadcast path is correct)
- `WhiteboardWorkspaceClient.tsx` `applyRemoteToCanvas` (already implements the
  pattern the student is being brought to; do not modify other than the new
  `wba`+`author` log tags)
- Encryption, join token flow, room policy, recorder integration, Phase 0 brand
  tokens (see § 8 for the full list)

**Acceptance criteria (all must pass before Sarah smoke):**

1. [ ] Student applies tutor strokes on page 1 while tutor is drawing: strokes appear < 100ms
2. [ ] Tutor switches from page 1 → page 2: student canvas switches to page 2; page 1 content unchanged
3. [ ] Tutor inserts PDF (multi-page): all pages populate on student; strokes on page 1 don't appear on pages 2-3
4. [ ] Tutor moves a PDF element: student sees the move without page change
5. [ ] Student loads in on a blank canvas then tutor draws: student sees the strokes (welcome packet path)
6. [ ] Tutor refreshes mid-session: student canvas freezes, then restores after tutor reconnects (rev-reset + welcome packet)
7. [ ] Student on iPhone Safari: viewport-align applies correctly (center matches tutor's view)
8. [ ] **NEW (R2):** Student draws a stroke while tutor is broadcasting a different stroke; both peers see both strokes (P7 — local-edit preservation across remote apply)
9. [ ] **NEW (R2):** During a student `runV3Apply`, `sync.broadcastScene` is NOT called (P8 — echo loop suppression)
10. [ ] **NEW (R2):** Student draws a stroke while tutor is disconnected; on tutor reconnect, the stroke appears on tutor canvas within 2 broadcast cycles (Axis 1 BLOCKER — onConnect re-broadcast)
11. [ ] **NEW (R2):** Student clicks a page tab in the same frame as an inbound tutor broadcast for a DIFFERENT page; no element bleed (page-switch race + bidirectional)
12. [ ] **NEW (R2):** Both peers concurrently edit the same element; both peers converge on the same final state (per-element LWW determinism)
13. [ ] All per-page invariants (§ 5.5 items 1-8) pass as unit tests
14. [ ] All required log lines (§ 6 Axis 5, with `author=` and `wba=` tags) appear in the test suite's logger

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
- [ ] **NEW (R2):** Bidirectional concurrent stroke: tutor draws on P1, student draws on P1 simultaneously → both peers see both strokes
- [ ] **NEW (R2):** Student-during-tutor-disconnect: tutor disconnects (close relay tab), student draws on P1, tutor reconnects → tutor sees student's stroke within 2 seconds
- [ ] **NEW (R2):** Student-on-iPhone bidirectional: student draws on iPhone Safari while tutor draws on desktop → tutor sees student's pressure-sensitive stroke; student sees tutor's stroke; recorder event log attributes correctly

**Rollback plan:** `git revert <commit>`. The Phase 1 changes are in the student hook,
viewport-align, and the wire-type extension. Rolling back restores round-3's behavior
(page-bleed fixed, lag bug present, viewport-align partially wrong). The lag bug is
less severe than the page-bleed was; rollback is safe.

**Honest effort estimate (revised under R2):** 5-7 hours Composer 2.5 dispatch. The
scope is broader than Revision 1 estimated (the bidirectional test surface roughly
doubles, and `pageSwitchProgrammaticRef`-equivalent + onConnect re-broadcast are
new). Architecture is explicit (this doc); no design ambiguity. Risk: Composer may
need a second pass if a bidirectional race surfaces in iPhone smoke that the unit
tests didn't catch — budget a follow-up 2-3 hour dispatch if the smoke finds a
regression. **Total worst case:** 10 hours Composer 2.5 across one design-correct
pass + one targeted regression pass. Still well inside the budget envelope; far
under the 2-3 week Yjs migration alternative.

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

## 9. Open questions for Andrew (revised under Revision 2)

These decisions are required before the Phase 1 Composer dispatch can be written.
Each has 2-3 viable answers and a clear recommendation. **Q1 (the Excalidraw-vs-Yjs
escalation decision) is now Wave-1-relevant under the corrected bidirectional premise
— promoted to first position.**

---

**Q1 (NEW under Revision 2, promoted to position 1): Commit to "Excalidraw + symmetric apply discipline" for Wave 1, or jump directly to Yjs + y-excalidraw?**

Context: Revision 1 said "students don't draw, so Yjs is a future contingency."
Revision 2 confirms students DO draw bidirectionally today. That means the
Excalidraw-vs-Yjs decision is no longer a "future Wave 3 thing" — it's the actual
Wave 1 architectural choice. The doc's §4 verdict, §5 spec, and §7 plan all assume
Option A (Excalidraw + symmetric LWW apply). If Andrew wants to escalate to Yjs
NOW, much of the doc is still valid for diagnosis but §5 needs a parallel CRDT spec
and §7 needs a longer Phase 1.

- Option A: Excalidraw + symmetric apply discipline (this doc's recommendation).
  3-4 hr dispatch under R1's estimate; 5-7 hr under R2's expanded scope. Relies on
  `reconcileElements`'s per-element LWW being sufficient for the actual workload.
- Option B: Jump directly to Yjs + y-excalidraw + y-websocket (or CF DO).
  2-3 weeks of Sonnet design + multiple Composer dispatches. Structurally
  conflict-free. Migration cost is real but predictable. Pays off if the
  same-element concurrent edit case (§ 5.6 case 2) is a real problem in pilot.
- Option C: Pre-build the Excalidraw fix AND book a Yjs migration as a planned
  Wave 3 deliverable regardless of Phase 1 outcome. Defensive but pays twice.
- **Recommendation: Option A.** The decisive evidence is in §4 — the tutor's
  `applyRemoteToCanvas` already implements the discipline this doc proposes, and
  student → tutor strokes have been reliable through it the entire pilot.
  Bidirectional editing is not what's been broken; the asymmetric apply discipline
  on the student side is. Fix the asymmetry first; escalate to Yjs only if Phase 1
  validates and still produces regressions. The cost of Option A is ~5-7 hours;
  the cost of being wrong about Option A is one more Composer dispatch. The cost
  of Option B is 2-3 weeks; the cost of being wrong about B is the same plus the
  migration overhead.

---

**Q2 (was Q1): Retire the v2 INBOUND apply path on the student?**

Context: The student receives v2 only in degenerate cases (very old browser tab
caching a pre-v3 protocol, or the tutor's recorder emitting v2 in a legacy code path).
The student CONTINUES to broadcast v2 outbound (that's how the tutor receives student
edits — see Q3 below). The question is only about the v2 INBOUND handler on the
student.

- Option A: Keep `runV2Apply` — defensive, handles any v2 sender. Marginal cost.
- Option B: Drop `runV2Apply` — log-and-return on v2 inbound. Tighter surface.
- **Recommendation: Option B.** No one broadcasts v2 to the student in production
  (the tutor uses v3 via `broadcastDocument`; the student doesn't broadcast to
  itself). The v2 inbound code path is dead. Drop it with a warn log; reduces
  bidirectional surface area.

---

**Q3 (NEW under Revision 2): Keep the student's OUTBOUND `broadcastScene` (v2 from student to tutor) or migrate it to v3?**

Context: Today the student broadcasts via `sync.broadcastScene(elements,
getPageBroadcastExtras())` (v2 with scenePageId). The tutor's `applyRemoteToCanvas`
receives this as a v2 inbound and routes by `scenePageId`. The v3 protocol
(`broadcastDocument`) sends a full multi-page document; the student's broadcast is
only for the active page, which is what v2 carries.

- Option A: Keep student outbound on v2. The tutor's `applyRemoteToCanvas` already
  handles it correctly. No protocol change. Phase 1 only touches v2 inbound on the
  student (Q2).
- Option B: Migrate student outbound to v3 (full multi-page document). Symmetric
  with tutor. But: the student's `pageDataRef` only contains pages the student
  has visited; sending it as v3 would be incomplete (missing pages the student
  hasn't visited yet). Could backfill from the tutor's v3 the student has received,
  but this adds complexity.
- Option C: Add a new student-specific wire kind (e.g., `student-page-update`)
  that carries one page's elements with explicit page identity. Cleaner than
  reusing v2 for student → tutor; less complex than full v3.
- **Recommendation: Option A.** The v2 outbound from student is working in
  production; the tutor's `applyRemoteToCanvas` handles it correctly with the
  same `reconcileElements` discipline as v3. Changing it adds risk without clear
  benefit. The "asymmetric protocol" (tutor v3 outbound, student v2 outbound) is
  ugly but stable; the asymmetric APPLY discipline (which Phase 1 fixes) is what
  was actually broken.

---

**Q4 (was Q2): `viewportWidth`/`viewportHeight` on `WhiteboardWireFollow` or per-page?**

(Unchanged from Revision 1.)

- Option A: Add to `WhiteboardWireFollow` — one pair of numbers for the currently-active
  page's viewport. Simple.
- Option B: Add per-page to the `pageList` rows (alongside `viewState`) — allows
  different viewport sizes per page.
- **Recommendation: Option A.** The follow viewport is the tutor's active window size.
  It doesn't change per-page (the browser window is the same size regardless of page).
  The tutor's per-page zoom is already in `viewState`. The student's center-alignment
  only needs the tutor's current window size.

---

**Q5 (was Q3): Fix the eraser cursor mismatch in Phase 1 or defer?**

(Unchanged from Revision 1.)

- Option A: Fix in Phase 1 — determine if it's sync-related or rendering-related and fix it.
- Option B: Defer to a separate BACKLOG entry — keep Phase 1 scope tight.
- **Recommendation: Option B.** Keep Phase 1 tightly scoped to the sync state-flow issues.
  Add the eraser cursor mismatch to BACKLOG with priority "before next Sarah session."
  If it turns out to be a sync artifact (i.e., it disappears after Phase 1), close the
  backlog entry without a separate fix.

---

**Q6 (was Q4, repointed under R2): Yjs as Wave 3 contingency timeline?**

Context: If Q1's verdict is Option A (Excalidraw), Yjs becomes the documented
escalation path. The question is whether to formalize a timeline for it (defensive)
or genuinely contingent on Phase 1 results.

- Option A: Commit to Yjs for Wave 3 regardless of Phase 1 results — ensures we have a
  clear path off the current architecture.
- Option B: Defer Yjs contingent on Phase 1 results — do Phase 1, validate with Sarah,
  only begin Yjs design if Phase 1 still produces regressions or if the workload
  grows (3+ peers, same-element concurrent edits become common, offline editing).
- **Recommendation: Option B.** The Phase 1 redesign is architecturally sound (mirrors
  the tutor's already-working pattern). Do not commit to a 10-14 day migration before
  proving we need it. "If Phase 1 regressions appear, escalate to Yjs" is the right
  contingency plan.

---

**Q7 (was Q5): Migrate relay to PartyKit/Cloudflare DOs in Phase 2 or stay on fly.io?**

(Unchanged from Revision 1.)

- Option A: Stay on Fly.io — relay works, don't fix what isn't broken.
- Option B: Migrate to PartyKit/CF DO — better global latency, relay observability,
  stateful welcome packets. ~$5/mo vs ~$2/mo.
- **Recommendation: Option A for now; revisit when: (a) a non-US tutor/student reports
  latency issues, or (b) the welcome-packet race causes a production incident.** The
  $3/mo saving over PartyKit is not the reason to stay — the reason is "relay is not the
  fragility source."

---

**Q8 (was Q6): New `wba` prefix or extend `wbsid` for apply-path logging?**

(Unchanged from Revision 1; under R2 the `wba` prefix is paired with a new `author=`
tag — see § 6 Axis 5.)

- Option A: Use `wba` (whiteboard apply) for apply-path events.
- Option B: Continue using `wbsid` with additional action tags.
- **Recommendation: Option A.** Keeps the grep-ability clean: `grep wba= logs` shows only
  apply events; `grep wbsid= logs` shows session lifecycle events. Register `wba` in
  AGENTS.md § Conventions. **Under R2:** combine with `author=tutor`/`author=student`
  to distinguish bidirectional event origins.

---

## Revision 2 changelog

- **2026-05-27 evening (reconciliation pass — third pass on this doc):** Andrew
  flagged an apparent contradiction: Revision 1 §5.6 said "if students draw,
  Yjs becomes the right answer"; Revision 2 confirmed students draw but kept
  the Excalidraw recommendation. This pass added the
  [Revision 1 → Revision 2 verdict reconciliation](#revision-1--revision-2-verdict-reconciliation)
  section immediately below the TOC, answering the question with cited source
  for `reconcileElements` (from `node_modules/@excalidraw/excalidraw/dist/dev/index.js:32825–32890`
  at pinned version `^0.18.1`), a corrected understanding of what
  `reconcileElements` actually does (including the in-progress-edit-protection
  predicate I'd been unaware of in R1), an honest enumeration of what
  `y-excalidraw` adds above it (with delta-wire-payloads called out as a real
  win we haven't measured), a corrected `y-excalidraw` maintenance assessment
  (R1's "official Excalidraw-team binding" claim was factually wrong — it's a
  community fork at 27 weekly downloads, ~9 months stale, single maintainer),
  cost-of-being-wrong analysis showing Path A (Phase 1 first) dominates Path B
  (Yjs now), and a concrete trigger list for when to escalate to Yjs after all.
  Two factual errors in R2's first pass also caught and fixed: (1) `versionNonce`
  tiebreak picks LOWER not higher (corrected in §2 Excalidraw row + §5.6 wire
  rule + §5.6 case 2); (2) `y-excalidraw` maintainership claim (corrected in
  §2 Option C row + ecosystem-velocity row). §4 verdict UNCHANGED; only rigor
  of the rationale improved.

- **2026-05-27 evening (Revision 2):** Authored by Sonnet 4.6 subagent (resumed from
  Revision 1 by the same Opus orchestrator) after Andrew flagged a foundational
  premise error in Revision 1's §5.6: "tutor is the only author" was incorrect;
  students have full bidirectional editing in production today.

  **Premise verification (concrete evidence):**
  - `src/app/w/[joinToken]/StudentWhiteboardClient.tsx` mounts a full Excalidraw via
    `ExcalidrawDynamic` (no `viewModeEnabled` flag) with `<UndoRedoButtons />`; the
    on-screen copy at line 519 reads literally "What you draw is visible live"; the
    `handleExcalidrawChange` handler at line 414 calls `syncClient?.broadcastScene`
    at line 451 with full element payload + page extras.
  - `src/hooks/useStudentWhiteboardCanvas.ts:600` calls `sync.broadcastScene` from
    `onCanvasChange` on every local edit (gated by `applyingRemoteRef`).
  - `docs/BACKLOG.md` line 261: "Whiteboard undo (mark removal) — touch + visible
    button (Sarah, Apr 24). ✅ Tutor + student shipped" with explicit student-side
    Excalidraw mount notation.
  - The tutor's `applyRemoteToCanvas` (`WhiteboardWorkspaceClient.tsx:491–595`)
    already runs `mergeScenesReconciled` against student broadcasts in production
    with proper `pageSwitchProgrammaticRef` + `onTargetReadTime`/`stillOnTargetWriteTime`
    discipline — the working reference for the symmetric pattern Phase 1 brings
    to the student.

  **Sections revised:**
  - **Top banner:** Added Revision 2 note (lines ~12-20) with premise correction
    and cross-reference to this changelog.
  - **§2 Library matrix:**
    - Excalidraw row updated: collaboration-architecture cell adds verification
      that `reconcileElements` handles the bidirectional workload via tutor
      `applyRemoteToCanvas`; verdict cell re-affirms Wave 1 under bidirectional.
    - Yjs+Excalidraw row updated: verdict cell explicitly addresses the original
      §5.6 conditional ("if students draw, flip to Yjs") and explains why the
      threshold was wrong; Yjs remains Wave 3 escalation contingency.
    - Summary table updated.
  - **§3 Relay matrix summary:** y-websocket row noted as paired with Yjs (Wave 3
    only because Yjs is); excalidraw-room verdict notes bidirectional traffic
    already flows correctly.
  - **§4 Recommendation (FULL REDO):** Now presents three options (A/B/C) and
    grounds Verdict A in four evidence points; references the tutor's working
    pattern as the model for the student's Phase 1 spec; explicitly addresses
    the original §5.6 conditional that triggered this revision.
  - **§5.1 (FULL REDO):** "NEVER read back from canvas" replaced with the more
    nuanced I1/I2/I3/I4 invariants. `pageDataRef` is articulated as the symmetric
    canonical local-state cache; canvas reads are gated by on-target + no-
    programmatic-switch (mirroring the tutor's existing `onTargetReadTime` and
    `stillOnTargetWriteTime` checks). Adds `pageSwitchProgrammaticRef` to the
    canonical-owners table.
  - **§5.3 Render-timing contract:** Rule 1 revised from "never call
    getSceneElements" to "gated by I1/I2". Rule 2 revised symmetrically.
    Rule 5 revised: `waitDoubleRaf()` removal scoped to apply paths that route
    through `pageDataRef`; retained for the tutor-recorder's
    `updateSceneMergingWithRemote` path if still needed.
  - **§5.5 Per-page invariants:** Adds P7 (local-edit preservation across remote
    apply) and P8 (no echo loop). P1 and P3 wording clarified for bidirectional.
  - **§5.6 Conflict resolution (FULL REDO):** Replaces "tutor wins" with
    symmetric per-element LWW via `reconcileElements`. Enumerates 7 concrete
    bidirectional cases with the resolution model for each. Explains what
    `reconcileElements` does NOT handle (intentional non-scope) and articulates
    why CRDT is not required for Wave 1.
  - **§5.7 Failure modes:** Adds 4 new bidirectional rows (page-switch races
    inbound; local edit races inbound; echo-loop suppression; student-during-
    tutor-disconnect; student tab crash mid-session). Existing rows annotated
    for R2 nuances.
  - **§6 5-axis adversarial review (FULL REDO under bidirectional):** Each axis
    re-examined with both peers as authors. Adds BLOCKER #2 under Axis 1
    (student onConnect-after-disconnect re-broadcast). Adds per-element
    `version`/`versionNonce` cross-peer-ordering analysis under Axis 2. Adds
    bidirectional race tests under Axis 3 (local-edit vs inbound, echo-loop,
    page-switch race). Adds mobile-student-as-author emphasis under Axis 4
    (touch + stylus pressure smoke). Adds `author=<role>` and `wba=<applyId>`
    log tags throughout Axis 5; registers `wba` prefix.
  - **§7 Implementation plan:** Phase 1 scope expanded to include
    `pageSwitchProgrammaticRef`-equivalent on student, onConnect-after-disconnect
    re-broadcast, P7/P8 invariant tests, `author=` log tags. Effort estimate
    revised from 3-4h to 5-7h (worst case 10h with one regression pass).
    Acceptance criteria gains 5 new R2-specific items. Smoke checklist gains
    3 new bidirectional scenarios.
  - **§9 Open questions (RESTRUCTURED):** Q1 (was deferred Yjs decision) promoted
    to position 1 as a Wave-1-relevant choice under bidirectional. New Q3
    (student outbound v2 vs v3 vs new wire kind). Q2/Q4/Q5/Q6/Q7/Q8 renumbered
    accordingly. All recommendations grounded in the bidirectional premise.

  **Sections unchanged (per Andrew's "don't redo" guidance):**
  - **§1 Diagnosis:** Round-by-round timeline, four state authorities, four
    fragility hypothesis verifications. All factually correct under either premise.
  - **§3 Relay evaluation data:** Per-relay comparison data is fine; only verdict
    annotations updated.
  - **§8 What carries forward:** Unchanged. The list of preserved components is
    the same under both premises (encryption, join token flow, room policy,
    recorder integration boundary, Phase 0 tokens, page-UI affordances,
    undo/redo, `sync-client.ts`, `apply-reconciled-remote-scene.ts`,
    `hydrate-remote-files.ts`, `board-document-snapshot.ts`, Excalidraw version,
    relay, CSP). Under R2 the table's "minor change" rows expand slightly to
    cover the bidirectional-specific additions (the `viewportWidth/Height`
    wire fields, the new `wba`+`author=` log tags, the new
    `pageSwitchProgrammaticRef` on student) — these are documented in §7's
    files-changed list rather than restated in §8.

  **Sections that hold up well under R2 despite premise change:**
  - The diagnosis of the 4 state authorities (§1.2) is correct under either
    premise — the authorities exist and conflict regardless of who's authoring.
  - The verification of the 4 structural fragility hypotheses (§1.3) is correct
    — these are structural patterns in the code, not premise-dependent.
  - The library elimination of tldraw on the $6k license is correct under any
    premise.
  - The relay verdict (keep excalidraw-room) is correct under any premise; the
    relay forwards encrypted bytes and doesn't care about authoring topology.

- **2026-05-27:** Initial pass (Revision 1). Authored by Sonnet 4.6 subagent during
  Opus orchestrator redesign session. Code read: 4 source files + 3 git diffs.
  External research: tldraw SDK 4.0 license change confirmed ($6k/year); PartyKit
  acquisition by Cloudflare confirmed (now CF DOs). Recommendation: keep Excalidraw
  + excalidraw-room; redesign client sync layer with single canonical state
  authority. **Premise error subsequently identified by Andrew** (Revision 1
  assumed "students don't draw" — incorrect; bidirectional editing has been
  shipping in production since the Apr 24 student-undo PR). Revision 2 (above)
  corrects this.
