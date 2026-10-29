# Privacy / consent review brief — feat/org-qol (2026-10-28)

Prepared for Andrew's privacy review. Item 60 (child replay hidden) is ON HOLD until these decisions are made. Read-only investigation; file/line refs are on `feat/org-qol` at time of writing.

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

## Also on tomorrow's agenda (non-privacy)

- Where transcription language support (English + Spanish first, safe auto-detect) sits in the release priorities. Context: `docs/handoff/tyson-feedback-2026-10-28.md` decision 12.
- Audience-by-audience wording glossary proposal (`docs/handoff/org-ux-pass-plan.md` § Andrew answers).

