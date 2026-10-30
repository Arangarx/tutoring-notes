/**
 * Consent wave — relay harness: audio, notes, whiteboard-live rows (plus the two relay-backed entry rows E15 and E19).
 *
 * C0 SKELETON (docs/handoff/consent-wave-plan.md § 6, § 8 C0): every row below is `test.fixme` and is filled in by the wave that
 * owns its behavior. Titles state the rule; each row's oracle is quoted in the comment above it. A row is un-fixme'd only together
 * with its red-before / green-after evidence (exhaustive-testing-mandate.mdc).
 *
 * Run (after un-fixme): npx playwright test tests/integration/wb-consent-matrix.spec.ts --project=wb-regression --workers=1 --retries=0
 */

import { test } from "@playwright/test";
import { TAG } from "../test-tags";

// E15 runs the student on `devices["iPhone 13"]` (studentBrowser: "webkit"); E19 runs for both a join-token learner and a signed-in learner (SF-I).

// ---------------------------------------------------------------------------
// 6a. Entry (online switch)
// ---------------------------------------------------------------------------
test.describe("consent 6a: Entry (online switch)", {
  tag: [TAG.WB_CONSENT, TAG.WB_PRESENCE],
}, () => {
  // Oracle: Student on 'devices["iPhone 13"]'; redirect + copy text
  test.fixme(
    "E15: online off: a WebKit (iPhone 13) student at /join is refused with the one-line reason",
    async () => {
      // pending: wave that owns E15
    }
  );
  // Oracle: Q9, B4 channel. Run for both client branches (SF-I): a join-token learner and a signed-in learner session, because each has its own 'JoinUnavailableReason' map ('WhiteboardWorkspaceClient.tsx' 1446–1454 and 1516–1521) an …
  test.fixme(
    "E19: online off: a learner already connected during PENDING is disconnected with a message when the tutor Starts in person",
    async () => {
      // pending: wave that owns E19
    }
  );
});

// ---------------------------------------------------------------------------
// 6c. Audio
// ---------------------------------------------------------------------------
test.describe("consent 6c: Audio", {
  tag: [TAG.WB_CONSENT, TAG.WB_RECORDING],
}, () => {
  // Oracle: 'TranscriptChunk' rows by 'streamId'
  test.fixme(
    "A1: audio on: tutor and learner voices are both saved and transcribed (online)",
    async () => {
      // pending: wave that owns A1
    }
  );
  // Oracle: No 'speaker:*' rows in 'SessionRecording' or 'TranscriptChunk'; no learner upload request observed
  test.fixme(
    "A2: audio off, online: only the tutor's track is saved; learner voice is never transcribed",
    async () => {
      // pending: wave that owns A2
    }
  );
  // Oracle: No lane recorder before the Start response is adopted
  test.fixme(
    "A2b: learner lane is not created before capability is known",
    async () => {
      // pending: wave that owns A2b
    }
  );
  // Oracle: Spy count of audio 'getUserMedia' = 0; no segments
  test.fixme(
    "A3: audio off, in person: no audio is saved and the mic is never opened",
    async () => {
      // pending: wave that owns A3
    }
  );
  // Oracle: Same spy
  test.fixme(
    "A4: audio off, in person: waiting-room mic preview does not open the mic",
    async () => {
      // pending: wave that owns A4
    }
  );
  // Oracle: HTTP status + DB
  test.fixme(
    "A5: audio off: server rejects a learner-lane segment posted by a tampered client",
    async () => {
      // pending: wave that owns A5
    }
  );
  // Oracle: Queue route status; no 'TranscriptChunk'
  test.fixme(
    "A6: audio off: server transcription refuses a learner-lane chunk already in the outbox",
    async () => {
      // pending: wave that owns A6
    }
  );
  // Oracle: Rows
  test.fixme(
    "A7: audio on, in person: voices are captured on the tutor mic and transcribed",
    async () => {
      // pending: wave that owns A7
    }
  );
  // Oracle: Stored 'streamId' / 'speakerId' unchanged after sweep and after 'kickSessionChunksAction'; refused row status terminal
  test.fixme(
    "A8: audio off: a swept or kicked learner chunk keeps its lane and is refused, not relabeled tutor:mic",
    async () => {
      // pending: wave that owns A8
    }
  );
  // Oracle: Unit + DB: re-upsert with default args leaves 'streamId'/'speakerId' as created
  test.fixme(
    "A9: transcript upsert never overwrites a stored lane",
    async () => {
      // pending: wave that owns A9
    }
  );
});

// ---------------------------------------------------------------------------
// 6e. Whiteboard
// ---------------------------------------------------------------------------
test.describe("consent 6e: Whiteboard", {
  tag: [TAG.WB_CONSENT, TAG.WB_SYNC, TAG.WB_STROKES],
}, () => {
  // Oracle: Replay HTTP 200 per principal
  test.fixme(
    "W1: whiteboard on: strokes persist and replay is available to tutor and family",
    async () => {
      // pending: wave that owns W1
    }
  );
  // Oracle: Relay peer state; scene after reload
  test.fixme(
    "W2: whiteboard off: board works live, including a reload and a student rejoin",
    async () => {
      // pending: wave that owns W2
    }
  );
  // Oracle: Audio scrubber 200
  test.fixme(
    "W9: whiteboard off: audio replay still works",
    async () => {
      // pending: wave that owns W9
    }
  );
  // Oracle: Characterization (green before; regression guard). Scrubber max ≈ fixture audio duration (independent oracle: the fixture file's length)
  test.fixme(
    "W20: audio-only replay with the empty placeholder log scrubs to the audio length",
    { tag: [TAG.WB_ASSETS] },
    async () => {
      // pending: wave that owns W20
    }
  );
});

// ---------------------------------------------------------------------------
// 6f. Notes
// ---------------------------------------------------------------------------
test.describe("consent 6f: Notes", {
  tag: [TAG.WB_CONSENT, TAG.WB_RECORDING],
}, () => {
  // Oracle: 'TranscriptChunk' = 0, 'TutorNote' = 0
  test.fixme(
    "N1: notes off: no transcript rows and no drafted notes, even if audio is on",
    async () => {
      // pending: wave that owns N1
    }
  );
  // Oracle: Replay 200
  test.fixme(
    "N2: notes off, audio on: audio replay is still available",
    async () => {
      // pending: wave that owns N2
    }
  );
  // Oracle: Server action result
  test.fixme(
    "N3: notes off: manual generate-notes call is refused",
    async () => {
      // pending: wave that owns N3
    }
  );
  // Oracle: Sweep run; rows
  test.fixme(
    "N4: notes off: the transcribe sweep does not create transcripts",
    async () => {
      // pending: wave that owns N4
    }
  );
  // Oracle: 'TutorNote' = 0 (the 'totalChunks === 0' path)
  test.fixme(
    "N5: audio off in person, notes on: no placeholder note is drafted",
    async () => {
      // pending: wave that owns N5
    }
  );
  // Oracle: Seed more refused rows than the sweep batch; newer eligible rows still processed; refused status terminal; 'notes-worker' does not wait on them
  test.fixme(
    "N6: refused rows reach a terminal state and the sweep is not starved by them",
    async () => {
      // pending: wave that owns N6
    }
  );
  // Oracle: Rows = 0 even with all four toggles on
  test.fixme(
    "N7: org \"no notes\" session (notesForbidden): nothing is transcribed or drafted",
    async () => {
      // pending: wave that owns N7
    }
  );
});
