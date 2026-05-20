# Reliability + AI prompt v7 — 2026-05-20 · Orchestrator handoff report

> **For the orchestrator that picks up after this session.** Captures what shipped, what's still open, the lessons worth remembering, and a starter bootstrapper for the next session.

**Session shape.** Two coherent pieces of work landed cleanly on master, with one in-branch revert in between that taught a real lesson. No deferrals — every thread we opened either shipped, got captured in BACKLOG, or had a follow-up entry created.

---

## What shipped

### 1. Reliability #6 — note save vs transcribe race · merged `249327a`

The Sarah-class silent-text-loss bug from the 2026-04-23 adversarial-review audit (BACKLOG axis 3 #6). If a tutor typed into the note form while `transcribeAndGenerateAction` was in-flight (potentially minutes for long recordings), the action's `populate()` callback silently overwrote the typed content when the AI response arrived.

- **Fix shape:** two coordinated changes.
  - `NewNoteForm.populate()` is now **merge-into-empty** for every AI-fillable text field (topics / homework / assessment / plan / links). A non-empty field (per `.trim()`) is never clobbered. AI provenance fields (`aiGenerated`, `promptVersion`, `recordingIds`, `shareRecordingInEmail`) are still always set so saved-note provenance is accurate even when every text field is tutor-typed. `links` added to the `useImperativeHandle` deps so the closure sees latest state.
  - `AiAssistPanel.checkOverwrite()` → `checkOverwriteAndPrepare()`: on confirmed "yes replace," it **clears the form synchronously before dispatching the action**. This honors the tutor's explicit "discard mine, use AI" intent (otherwise merge-into-empty would refuse to fill already-typed fields) AND preserves race protection for content typed during the wait.
- **WhiteboardNotesPanel** also benefits — same `populate()` is used there, but the form remounts fresh per generation so merge-into-empty is a no-op (no behavior change, just safer by construction).
- **Test coverage:** 26 new regression tests across `src/__tests__/dom/NewNoteForm.populate.dom.test.tsx` (19) + `src/__tests__/dom/AiAssistPanel.race.dom.test.tsx` (7). Covers empty/typed/whitespace populate, decline-confirm preserves, confirm clears, race-during-wait scenarios for both text and audio paths, AI provenance fields, time-field regression.
- **Smoke:** passed first try on the Preview (Andrew, 2026-05-20 AM).
- **Files:**
  - `src/app/admin/students/[id]/NewNoteForm.tsx` (populate logic)
  - `src/app/admin/students/[id]/AiAssistPanel.tsx` (checkOverwrite logic)
  - `src/__tests__/dom/NewNoteForm.populate.dom.test.tsx` (new)
  - `src/__tests__/dom/AiAssistPanel.race.dom.test.tsx` (new)
  - `docs/BACKLOG.md` (entry flipped to ✅ SHIPPED)

### 2. AI prompt v7 — reaction-aware Assessment extraction · merged `939b1e3`

Came out of Andrew's first post-#6 observation: a real whiteboard session landed Assessment empty in the AI-generated note, but a scripted recording with similar material populated Assessment fine. Root cause was the v6 prompt's strict-explicit-statements rule (system prompt + assessment field instruction both blocked the LLM from treating in-session reactions like "almost!" / "yes!" / "got it" as assessment signals).

- **Fix shape:** prompt-only change in `src/lib/ai.ts`. No schema, contract, or downstream-code changes.
  - System rule (1): "EXPLICITLY stated" → "supported by the tutor's own words — either explicit statements or clear in-session reactions ... that signal how the student is doing".
  - System rule (2): blanket ban on "encouragement / progress statements" narrowed to "claims about the student that the tutor never made, encouragement aimed at the student that was never said".
  - System rule (5): "do not invent or infer anything" → "do not invent or fabricate" (the old "infer" wording over-blocked grounded interpretation).
  - Assessment field instruction: explicit reaction-to-meaning mappings ("almost!" / "try again" → wrestling; "yes!" / "got it" / "perfect" → has it) + "cluster by topic when possible" output guidance. Empty-string condition tightened to "ONLY if the tutor NEITHER commented on understanding NOR reacted to the student's work."
  - `PROMPT_VERSION` `2026-04-20-v6` → `2026-05-20-v7`. Existing notes stay tagged v6 (provenance feature, not a breaking change).
- **Other fields** (topics / homework / plan / links) intentionally unchanged.
- **Smoke:** text-paste of a representative WB session into the AI Assist Text tab. v7 produced `assessment: "good job on order of operations"` — picked up the reaction phrase, correctly clustered to the right topic, no fabrication, other fields stable.
- **Files:**
  - `src/lib/ai.ts` (prompt + version + comment block)
  - `src/app/admin/students/[id]/transcribe-result.ts` (comment touch — references v7 instead of v6)
  - `docs/BACKLOG.md` (entry rewritten as 🟡 PARTIAL SHIPPED with what's still open)

### 3. BACKLOG status sync · merge `7793b97`

Lightweight follow-up commit to make BACKLOG reflect reality after the merges:

- Top status-as-of line updated for 2026-05-20.
- #6 entry → ✅ SHIPPED with merge ref.
- v7 entry rewritten as 🟡 PARTIAL SHIPPED — what landed vs what's still open from the original v7 spec (input reframe, speaker inference, fixture tests).
- New entry for literal-vs-interpretive Assessment decision (gated on Sarah/parent feedback).
- New entry for Whisper transcription accuracy with four mitigation options when prioritized.

---

## What was attempted and reverted in-branch (the lesson)

### Whisper biasing pair · commit `c084f23` → reverted in `59577fe`

Paired with v7 LLM. Intent: when v7 LLM still couldn't extract Assessment from Andrew's actual WB audio (because Whisper had mistranscribed *"good job on that"* → *"did a term on that"* — there was nothing in the transcript for v7 to extract), bias Whisper toward common tutoring vocabulary by adding a `prompt` parameter to `client.audio.transcriptions.create()`.

**The bias text was a descriptive sentence:** *"Tutoring session: a tutor walks a student through concepts and reacts to their work. The tutor uses reactions like 'good job', 'nice', 'almost', 'try again', 'not quite', 'yes', 'got it', 'perfect', 'exactly', and 'right on' to indicate how the student is doing."*

**Catastrophic outcome on the smoke.** Whisper's `prompt` parameter is interpreted as *the previous transcript text that the audio should flow from*. A descriptive sentence causes Whisper to:

1. **Hallucinate content matching the prompt's framing** — Andrew's re-uploaded audio came back with sentences about a `www.google.com` reference, a bar chart, and made-up content like "we had four areas that we were behind to plan on, that was division, distribution, field service, WMH, and RHC" — none of which was in the audio.
2. **Drop authentic speech** that didn't fit the prompt's flow — "All right, so..." / "Let's see here, okay yeah, did a term on that. Now, ..." all silently disappeared.

This is documented in the OpenAI Whisper cookbook: prompts should be **vocabulary lists or proper nouns**, not descriptive sentences. The descriptive-sentence shape is dangerous in a way that's invisible until real audio hits.

**Reverted within the branch** before merge. The revert commit (`59577fe`) is kept in the branch history (`939b1e3` merge) so the failure is auditable rather than erased. Lesson + future-Whisper-side mitigation options (4 of them) captured in BACKLOG under the new "Whisper transcription accuracy" entry.

---

## What was produced

### Production code

- `src/app/admin/students/[id]/NewNoteForm.tsx` — merge-into-empty populate, links in deps.
- `src/app/admin/students/[id]/AiAssistPanel.tsx` — checkOverwriteAndPrepare clear-on-confirm.
- `src/lib/ai.ts` — v7 prompt + PROMPT_VERSION bump + comment block.
- `src/app/admin/students/[id]/transcribe-result.ts` — comment touch.

### Tests

- `src/__tests__/dom/NewNoteForm.populate.dom.test.tsx` (new, 19 tests).
- `src/__tests__/dom/AiAssistPanel.race.dom.test.tsx` (new, 7 tests).
- Full suite: baseline 1173 passing → after both merges 1200 passing (no regressions; same Postgres-down failing-suites baseline of 7 throughout).

### Docs

- `docs/BACKLOG.md` — three entry updates (#6 SHIPPED, v7 PARTIAL SHIPPED, status-as-of line) + two new entries (literal-vs-interpretive decision rule, Whisper accuracy options).
- `docs/handoff/long-form-transcribe-tier-1-orchestrator-report.md` — SUPERSEDED banner (added earlier in the day before the reliability work).
- `docs/handoff/reliability-and-prompt-v7-2026-05-20-orchestrator-report.md` — this file.

### Merged-but-not-yet-deleted branches

Both can be deleted local + remote at any time; they're fully merged with --no-ff so the merge commits preserve the per-branch history.

- `chore/reliability-note-save-transcribe-race` (1 commit `3636bcc`, merged via `249327a`)
- `chore/ai-prompt-v7-assessment-reactions` (3 commits `da1859c` / `c084f23` / `59577fe`, merged via `939b1e3` — the revert in this branch is part of the audit trail, retain the branch metadata if you want to be able to inspect the failed Whisper-bias attempt as a self-contained reference)

---

## What's still open

### Reliability sprint — same shortlist as before this session (no progress on these today)

Per `docs/BACKLOG.md` § "Recorder & Notes — reliability gaps audit":

- **#1 + #2 paired** — audio data durability (IndexedDB persistence for in-progress chunks + upload-failure cross-navigation hold). Biggest blast radius if untouched. Needs an Opus design pass on the shared IndexedDB layer + recovery-banner UX before execution.
- **#7** — hot-swap mic / unplug silent. Medium scope, FSM integration with Phase 4d's `useAudioFlowConfirmation` machine. Standalone-ish but needs care.
- **#13 + #14** — `rid=` coverage on remaining mutating actions + structured per-recording lifecycle log. Pure-additive observability. BLOCKER-PROD by audit class but zero behavioral risk. Best fit for solo autonomous work or for Sonnet-class execution after a quick Opus design pass on the log shape.
- **#10** — iOS Safari real-hardware test matrix. Andrew has an iPhone; needs a focused session running the matrix from the BACKLOG table.

### v7 partial-ship follow-ups (gated on Sarah feedback)

What's still open under the v7 BACKLOG entry:

- **(a)** Input reframe — currently still says *"Tutor's notes from today's session"*; v7 spec wants *"Whisper transcript of a tutoring session — one tutor, one student, no speaker labels, conversational."*
- **(c)** Speaker-inference hint (adult vocabulary / teaching cadence vs. student questions).
- Fixture-based test suite for ambient transcripts under `src/__tests__/fixtures/ambient-transcripts/` — empirical text-paste smoke is what validated v7 today; a fixture suite would let us iterate without re-smoking each time.
- **Literal-vs-interpretive Assessment phrasing** — explicit decision rule in BACKLOG: don't move toward translation/interpretation until either Sarah or a parent flags the literal phrasing as awkward, OR a fixture suite catches over-interpretation drift. Andrew's framing: *"give AI an inch it might take a mile."*

### Whisper-layer accuracy (separate problem, four options captured)

Per BACKLOG § "Whisper transcription accuracy — known low-accuracy on short common phrases":

1. Word-list-only Whisper bias (cookbook shape, NOT the descriptive-sentence shape that failed today).
2. Show raw transcript in the UI so tutor can spot mistranscriptions during note review (pairs with the audio-playback-during-review entry).
3. Improve audio capture quality at source (mic guidance, gain, noise gate).
4. Accept as known limitation (tutor reviews/edits before save anyway).

Pick one or stack when prioritized. Don't tackle ad-hoc.

### Pre-existing deferrals (unchanged by this session)

- **Long-form transcribe Tier 1 smoke** — 60–90 min real-audio run against Vercel Preview/prod. Code shipped weeks ago (merge `5ccf1c7`). Slated for pre-weekend prep (before Sarah's weekend session). See `docs/handoff/long-form-transcribe-tier-1-orchestrator-report.md` (now banner'd SUPERSEDED — only the smoke remains).
- **v1 design session deferrals** — anchor noun lock, scheduling Y/N, default landing, etc. Gated on Sarah's full 3–10 actions list + scheduling call (target Friday 2026-05-22+). See `docs/handoff/v1-design-session-2026-05-19-pm-orchestrator-report.md` + `docs/SARAH-CALL-PREP.md`.

---

## Git state

Master at `7793b97`. Working tree clean. Both merged feature branches still exist on origin (optional cleanup).

Recent history:

```
7793b97 docs: BACKLOG — v7 prompt SHIPPED + #6 SHIPPED + Whisper-bias lesson + follow-ups
939b1e3 Merge branch 'chore/ai-prompt-v7-assessment-reactions'
59577fe Revert "feat(ai): Whisper biasing for tutoring vocabulary (v7 pair)"
c084f23 feat(ai): Whisper biasing for tutoring vocabulary (v7 pair)
da1859c feat(ai): prompt v7 — reaction-aware Assessment extraction
249327a Merge branch 'chore/reliability-note-save-transcribe-race'
3636bcc fix(reliability): note save vs transcribe race — merge-into-empty populate (#6)
ae3db12 docs: SUPERSEDED banner on long-form transcribe Tier 1 orchestrator handoff
6f0e3a9 docs: flip Tier A security to SHIPPED + clarify /forgot-password was already generic
4118f3e Merge chore/security-tier-a-quick-wins
```

---

## Lessons worth remembering

### 1. Whisper `prompt` is a continuation cue, not a vocabulary hint

The single biggest cost of today's session was the in-branch Whisper-bias revert. The fix is in BACKLOG and in this report: future Whisper-side improvements MUST use the cookbook-recommended shape (vocabulary lists / proper nouns only, no descriptive sentences) AND be smoked against a diverse audio set BEFORE merging. Descriptive prompts cause hallucination in a way that's invisible until real audio hits.

### 2. Text-paste smoke isolates LLM changes cleanly

When Andrew's re-upload of the WB audio gave a mangled result under the (still-attached) Whisper bias, his next move was clever: *"We use the same note generation as from direct test right?"* — and he then pasted a representative transcript directly into the AI Assist Text tab. Both `transcribeAndGenerateAction` (audio path) and `generateNoteFromTextAction` (text path) call the same `generateSessionNote()` in `src/lib/ai.ts`; pasting bypasses Whisper entirely and isolates the LLM change.

**Pattern for future LLM-only prompt iterations:** validate the LLM change with a text-paste smoke first. The audio path is a strict superset of the text path; if the LLM behaves correctly on a clean transcript, the only remaining failure mode is Whisper-layer (which is a different fix). Saves re-recording for every iteration.

### 3. Decision rules > one-time choices for AI behavior

The literal-vs-interpretive Assessment decision (BACKLOG entry) is captured as a **rule** for future agents, not just as a one-time choice. *"Do not move v7 toward translation/interpretation until either (a) Sarah or a parent explicitly flags the literal phrasing as awkward, or (b) we have a fixture-based regression suite that catches over-interpretation drift."*

This prevents the failure mode where a well-intentioned future agent "improves" the literal phrasing unilaterally without the safety net to catch over-interpretation drift. Andrew's framing was *"you give AI an inch it might take a mile"* — capturing the rule, not just the choice, is what makes that wisdom durable.

### 4. Reliability work has a hierarchy of risk-to-Sarah

Pre-session, I had to pick between four BLOCKER-PRODs (#1+#2, #6, #7). The pick that worked: #6 was smallest, cleanest, and zero-recorder-lifecycle-risk, which made it the right standalone-overnight ship. #1+#2 paired and #7 both touch the recorder lifecycle FSM and deserve an Opus design pass + Andrew's eyes before code. **General rule for solo autonomous reliability work: prefer items that don't touch the recorder lifecycle FSM.** When in doubt, ship the small contained one and design the big one with Andrew in the loop.

---

## Next session — starting context

### Open candidates for the next session pick

| Item | Effort | Risk | Best model | When |
|---|---|---|---|---|
| Reliability **#13 + #14** (rid coverage + lifecycle log) | ~60 min mechanical per action × 7 actions | Zero behavioral | Sonnet/Composer | Anytime; great solo autonomous fit |
| Reliability **#7** (hot-swap mic) | ~3 hr | Medium (FSM integration) | Opus design → Sonnet build | When Andrew has 2-hr window for smoke |
| Reliability **#1 + #2 paired** (audio data durability) | ~6 hr over 2 sessions | High (recorder lifecycle) | Opus design pass first, then Sonnet build | When Andrew has design appetite |
| **Long-form transcribe Tier 1 smoke** | ~30-40 min | Zero (smoke only, code shipped) | Andrew solo | Pre-weekend (before Sarah's weekend session) |
| v1 design follow-up | depends on Sarah call | Zero (design work) | Opus | After Sarah's 3–10 + scheduling answer (Friday 2026-05-22+) |
| Whisper accuracy fix | depends on option chosen | Variable | Opus design (must avoid the descriptive-prompt trap) | When prioritized; not ad-hoc |

### Starter bootstrapper for the next session

```
You're picking up after the 2026-05-20 reliability + AI prompt v7 session.
Read this report first:
  docs/handoff/reliability-and-prompt-v7-2026-05-20-orchestrator-report.md

Then read in order:
  AGENTS.md (reliability bar, model usage protocol)
  docs/BACKLOG.md (top status line + § Recorder & Notes reliability gaps audit
    + the new v7 / literal-vs-interpretive / Whisper-accuracy entries near line 274+)
  docs/RECORDER-LIFECYCLE.md (mandatory before any recorder-lifecycle work
    — i.e. before items #1, #2, #7)
  docs/handoff/v1-design-session-2026-05-19-pm-orchestrator-report.md
    (only if Sarah's call landed and we're resuming design)

Then propose a next-item pick with rationale and wait for Andrew's go.
Default recommendation order if Andrew says "your call":
  1. #13 (rid coverage) if no design appetite — small, clean, ships in one session.
  2. #1+#2 paired Opus design pass if design appetite exists — biggest blast
     radius open, deserves Opus on the architecture.
  3. Long-form transcribe smoke if it's the same day as Sarah's weekend session.

Stop conditions:
  - Anything touching src/lib/recording/lifecycle-machine.ts, upload-outbox.ts,
    or the workspace handleEndSession path requires explicit Andrew approval
    on the design before code (per AGENTS.md reliability bar).
  - Don't ship Whisper-side fixes in the same branch as LLM-side fixes.
    Bundling was the wrong call last session; smoke isolation matters more
    than commit-count efficiency.
```

---

## Notes for the orchestrator on this session's quality

- **One revert in-branch is acceptable; one revert on master would not have been.** The Whisper-bias hallucination was caught on the Preview smoke before merge, exactly as the smoke-gate is meant to. If it had landed on master and Sarah had hit it during a real session, the cost would have been measured in tutor trust, not minutes. Keep the smoke gate sacred.
- **Andrew traded merge-count efficiency for smoke-iteration efficiency.** When the Whisper-bias attempt was in trouble, he proposed the text-paste smoke instead of asking for another full audio re-upload cycle. The right reflex; saves a lot of friction.
- **The "follow-up captured as decision rule" pattern is durable.** The literal-vs-interpretive entry isn't just "we picked literal today" — it's a forward-looking rule with explicit unlock conditions. Apply to other AI-behavior calls where the cost of drift is hard to detect (prompt loosening, fallback inference, etc.).
- **BACKLOG status-as-of line is now meaningful.** Was already a convention; today's update made it the actual landing place to see what merged when. Worth keeping current at the end of every session.
