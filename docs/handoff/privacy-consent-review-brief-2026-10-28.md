# Privacy / consent review brief — feat/org-qol (2026-10-28)

Prepared for Andrew's privacy review. Item 60 (child replay hidden) is ON HOLD until these decisions are made. Read-only investigation; file/line refs are on `feat/org-qol` at time of writing.

Review format (Andrew 2026-10-29): talk through each decision in chat. The multiple-choice widget was too cramped. Record the answer under that decision once he gives it.

## Summary

Families see **four** switches on this branch (live, audio, whiteboard, notes); `master` shows only live + audio. Whiteboard and notes were hidden on 2026-06-30 because they were not enforced (`eafb1927`, `77dde18b`) and came back with the org-learner work (2026-10-11).

Storage: versioned `ConsentRecord` (owner = tutor `adminUserId`, or org `organizationId` with `adminUserId` null). A child can only tighten, via `ConsentRestriction`. `SessionConsentSnapshot` freezes values at session creation.

## The four switches

| Switch | Who sets | Default |
|---|---|---|
| Live sessions | Parent or adult self-learner (never tutor/org) | Claim form starts off; no row until Save / "review later"; Decline = all off; self-learners backfilled all-on 2026-10-11 (`presumed`) |
| Audio | Same | Same; parent "always block audio" checkbox |
| Whiteboard | Same | Same; parent checkbox worded "Always block whiteboard replay" |
| Notes | Same | Same; no parent always-off checkbox |

Copy: `src/lib/consent-toggle-copy.ts`. Claim setup: `ConsentSetupForm.tsx` 36–41. Parent editor: `ParentConsentEditor.tsx` 65–82.

## What each switch actually does today

- **A consent row must exist** before any whiteboard session (`create-session-core.ts` 149–160).
- **Live off:** blocks Online Start (`actions.ts` 297–333) and child entry (`schedule-bridge.ts` 106–112, `join/[sessionId]/page.tsx` 206–217). Tutor can still run an **in-person** board (waiting room switches to In person, `WaitingRoomOverlay.tsx` 167–172). Self-learner skips the `/join` live check (line 206).
- **Audio off:** matches help text (`audio-capture-policy.ts` 15–32). Online: tutor mic still saved; learner voice excluded. In person: nothing saved.
- **Whiteboard off:** strokes are **still saved** (`audio-capture-policy.ts` 36–67). Replay hidden only on child home and parent notes page (`loadWhiteboardReplayIdsForNotes.ts` 246–258; `account/children/[id]/notes/page.tsx` 120).
- **Notes off:** does **nothing** — `triggerNotesGenerationAction` (`notes-actions.ts` 107–136) never reads it; transcription + draft notes still happen.
- **Share link `/s/[token]`:** ignores the whiteboard switch (`s/[token]/page.tsx` 60–62; replay page 25–44).

## Contradictions

1. Live copy promises the board "is saved for later review"; family replay follows the whiteboard switch; share link ignores it.
2. Live session runs fine with whiteboard off; tutor + share link still have replay.
3. Notes switch is on screen and does nothing.
4. Share link vs child home: two rules for the same family.
5. Org consent is invisible to the student-page Start check (`students/[id]/page.tsx` 115–122 looks for this tutor's `adminUserId`); server create path would accept it. (Item 58 overlap.)
6. Child's screen shows a switch off if **any** tutor/org has it off; sessions with tutors who allowed it still run.
7. Self-learner audio switch label still says "your child's voice".
8. Self-learner with live off can still open `/join`; a child cannot.

## Privacy page (`src/app/privacy/page.tsx`)

- Accurate: online vs in-person audio (281–284, 396–399); record required before live session (361–370); turning audio off doesn't delete saved audio.
- **Overclaims (honesty hard rule — must fix before master):** "turning a consent off stops that new collection" (457–460, 471–474); "notes are created only with consent" (471).
- Omissions: share link vs account replay difference; tutor keeps stroke log with whiteboard off; child can tighten; consent is per tutor / per organization.

## Decisions for the review

1. **Live vs whiteboard.** (a) Live on = board always saved + replayable; drop the whiteboard switch. (b) Keep separate; live copy stops promising later review. (c) Live on saves for tutor only; family replay follows the whiteboard switch; copy says so.
2. **Whiteboard off.** (a) Stop saving strokes. (b) Save for tutor, hide replay everywhere incl. share link. (c) Leave as is.
3. **Share link.** (a) Same replay rule as child home. (b) Link is the full record; say so in product + privacy page.
4. **Notes switch.** (a) Make it stop AI notes + transcription. (b) Hide again until enforced; remove from privacy page. (c) Redefine as "family may see notes" and filter home + share link.
5. **Live off.** (a) Block every whiteboard incl. in-person / Open room. (b) Keep in-person tutor-only; say so in copy. (c) Also block self-learners at `/join`.
6. **Org learners.** (a) Count the org consent row so Start appears. (b) Keep Start hidden until a tutor-owned row exists.

Andrew's stated starting position (2026-10-28): "Allow live session" off means no whiteboard session at all — nothing to record (leans 5a).

## Andrew's principles (2026-10-29, general answer — not yet a lock on 1–6)

1. Anything they have consented to record is recorded.
2. Anything they have not consented to record is not recorded.
3. When a learner has not consented to a type of recording, that is clear to both the learner and the tutor, so neither expects something that will not happen.
4. If anything was recorded, both the tutor and the learner can replay it. Audio-only can be just an audio scrubber.

Reading, pending the gaps below:

- The whiteboard switch stays. It is consent to record the drawings, separate from audio. It does not mean "hide the replay." Off means the drawings are not saved (decision 2a). On means they are saved and both people can replay them.
- The live switch stops promising that the board is saved for later review. Saving the board is the whiteboard switch.
- Tutor-only replay is out (not 1c). A share link shows the same recording the learner and tutor can already open, and nothing that was not recorded (decision 3a).
- The notes switch has to do something. Off means no drafted notes (decision 4a, with the transcript question below).
- Audio stays its own switch.

### Andrew's answers to the follow-ups (2026-10-29 14:26) — LOCKED

1. **Existing data:** almost all test data. Replays that are available today stay as they are. Enforce the new rules going forward only. No migration or cleanup.
2. **Tutor's own voice:** online with learner audio off, the tutor's track is still saved (the tutor's own voice). In person with learner audio off, **no audio at all**, because one microphone hears the learner. Revisit only if we can reliably separate voices inside one stream.
3. **Transcripts:** Andrew's intent was safety — no learner audio consent means no learner audio to transcribe. He does not know where COPPA lands on transcribing audio that is then thrown away. Orchestrator recommendation (not legal advice): transcription of the learner's voice requires audio consent. Never transcribe learner audio that consent says not to keep, even briefly. The kept transcript is lasting personal information. Notes off means no transcript and no drafted notes, while audio on still gives an audio replay. Get a lawyer's read on the COPPA voice rules before unsupervised child pilots.
4. **Board at session end:** while live, keep what the session needs to run, including reloads. With whiteboard consent off, delete the board at session end. That also means no board snapshot image in the notes.
5. **Who gets the replay:** the tutor, plus the self-learner, or the parent and the child learner.

### Decision 5 — LOCKED (Andrew 2026-10-29 14:36): the live switch means online only

- The switch becomes "Allow online sessions." Off means the learner cannot join remotely, and the tutor cannot start an online session. This applies to self-learners too: the `/join` gap is a bug and gets closed.
- In-person sessions are allowed with it off. What is saved follows the audio, whiteboard, and notes switches.
- Rewrite the scheduling-calendar note above the switch to match. It currently says the app is "effectively just a scheduling calendar" with this off, which stops being true.
- **In-person access must be a deliberate, reliable path, not an access fluke.** Today it works only because the waiting room flips to In person. Every entry point to an in-person session (Start, Open room, resume, schedule) gets the same answer for the same consent.
- **Tests must state the decision.** A Playwright matrix: each switch on and off, against online Start, learner join (child, parent, self-learner), in-person Start, what is saved (learner audio, tutor audio, board, transcript, notes, board image), and who can replay (tutor, self-learner, parent, child, share link). Test titles name the rule, e.g. "online sessions off: in-person Start is allowed and saves nothing the family declined."
- **Copy audit:** every consent string (switch labels, help text, notes above the switches, decline warnings, self-learner agreement) and the privacy page must match what the app does after this wave. The privacy-page overclaims listed above get fixed in the same wave.

### Decision 6 — LOCKED (Andrew 2026-10-29 14:40)

- A session the organization scheduled follows the consent the learner (or parent) gave that organization. Start appears when that consent allows it.
- A tutor's private session with the same learner follows the consent given to that tutor personally. Organization consent never covers private work.
- Whenever Start, Open room, or Join is unavailable, a one-line reason says why. Applies to both cases.

**All six decisions are settled.** Item 60 and the organization-consent part of item 58 are off HOLD and go into the consent wave.

## Abandoned sessions — DECIDED (Andrew 2026-10-29 16:17)

A background job ends any session with no activity for 24 hours, through the shared stale/forced End path. It applies to all sessions, and the whiteboard-off purge follows. Andrew: there is never a good reason for a session to run forever with nothing happening. While live, data is acceptable as long as nobody can get at it. Future: an "are you still there?" prompt (Netflix-style) that ends idle sessions sooner — backlog WB-IDLE-STILL-THERE.

## Consent plan Q1 and Q2 — DECIDED (Andrew 2026-10-29 16:20)

- **Q1, notes off:** the tutor keeps the review step, and the review screen ends with a "Share session" save that releases the replay to the family. If the tutor never finalizes the session, the family has nothing to access, the same as today.
- **Q2, when consent counts:** consent changes apply forward only. The consent in force when the tutor presses Start governs that session, and the frozen snapshot is the proof. A change made mid-session or later applies from the next session. Today the snapshot is frozen when the session is created, not at Start, and Start re-reads the live record. A session created before the learner was claimed gets no snapshot at all. The consent wave fixes both (refreeze at Start, written as an upsert). Andrew 16:22: snapshot-less sessions should only be legacy test data plus one or two of Sarah's, and must be impossible before going public. Invariant: every started session has a snapshot. Creating a session for an unclaimed learner still skips the snapshot in today's code, so Start's upsert is what makes the invariant hold, and a test guards it. Legacy rows are left as they are (decision 1). **Andrew 16:23, LOCKED:** if no consent record exists when the tutor presses Start, the session cannot start, online or in person, and no exception. The Start button shows why it is blocked (decision 6). Required Playwright tests: Start is refused with no record in both online and in-person modes, the reason is visible, and the session stays PENDING with no snapshot and no recording.

## Transcription language — DECIDED (Andrew 2026-10-29 15:03)

Release priority #8 in `docs/BACKLOG.md` (TXC-LANG). It comes after the consent wave and the org-leak fix, ahead of calculus. Auto-detect is a later, separate step. The language limit must be disclosed before signup, on a public, up-to-date roadmap and known-limits page. The in-session notice is not enough on its own.

## Also on tomorrow's agenda (non-privacy)

- Where transcription language support (English + Spanish first, safe auto-detect) sits in the release priorities. Context: `docs/handoff/tyson-feedback-2026-10-28.md` decision 12.
- Audience-by-audience wording glossary proposal (`docs/handoff/org-ux-pass-plan.md` § Andrew answers).

