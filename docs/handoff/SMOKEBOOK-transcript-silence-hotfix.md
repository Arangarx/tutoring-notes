# Transcript silence hallucination — smoke runbook

**Branch:** `fix/transcript-silence-hallucination`
**Tip commit:** [`7632285d`](https://github.com/Arangarx/tutoring-notes/commit/7632285db7976d1475a3858d5e4ab451743bf1df)
**Preview:** [fix/transcript-silence-hallucination preview](https://tutoring-notes-git-fix-transcrip-d22d58-arangarx-5209s-projects.vercel.app)

### 1. Long silence, humming, whistling, and clicking

**Action:** On the **Preview** URL, sign in as a tutor on a desktop browser with a real microphone (not the Playwright fake mic). Open a learner and start a live whiteboard session. Before Start, confirm you are in the waiting room. Start the session and record for several minutes the way Tyson did on 2026-10-28 (`docs/handoff/tyson-feedback-2026-10-28.md` in the main repo): talk a little real tutoring speech, then leave long silences, and also hum, whistle, and click. Draw or pan if you like. End the session and wait until notes finish or the review screen shows a settled note. Read the notes fields and the session transcript on the review screen (Tyson saw the full transcript toward the bottom-left).

**Expect:** The transcript and the notes keep the real speech (in Tyson's second block, that was "trigonometric functions work again, finally. The log of x. OK"). They do not add junk from silence, humming, whistling, or clicking: no "Thanks for watching", "Silence. Exhaling", SKIP runs, YouTube outros, foreign-language filler, millimeter counts, or "Bye" loops that nobody said. A quiet stretch is omitted, not narrated.

**Ignore this run:** Organization scheduling, the org home, and any preview.usemynk.com behavior. This branch is the transcript hotfix off master, not `feat/org-qol`. Small wording differences in an otherwise faithful transcript of real speech.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: needs a real mic and the OpenAI transcription path; Tyson's 2026-10-28 silence/hum/whistle/click repro]`

**Notes:**

### 2. No speech at all

**Action:** Start another live session with the same tutor account and a real microphone. Do not speak, hum, whistle, or play speech. Leave the mic open through a short session (about one to two minutes of room silence is enough), then End and wait for the note to settle.

**Expect:** The note is empty. It does not invent topics, homework, dialogue, or a summary. The transcript does not contain made-up sentences.

**Ignore this run:** A "couldn't detect clear speech" or empty-note state is the pass, as long as it does not invent content. Background room tone that produces no words is in scope; a TV or another person talking is not.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: silence must be a real microphone capture, not the harness tone]`

**Notes:**

### 3. A normal spoken session still transcribes

**Action:** Start a third live session. Speak clearly for a minute or two of ordinary tutoring (a short explanation plus one question and one answer). Avoid long silences. End the session and wait for the note.

**Expect:** The transcript includes essentially everything you said, in order. The notes reflect that speech (topics and what was worked on) and do not drop the session down to an empty note.

**Ignore this run:** Minor mis-hearings of a single word. This item is not the silence case.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: full-speech fidelity needs a real spoken session and the live transcription service]`

**Notes:**

### 4. English-only line in the waiting room

**Action:** On the **Preview** URL, as the tutor, open a live session and stay on the waiting room before Start. On desktop, read the line under the mic and camera controls: "Transcription currently supports English only." Check that Start, the mic, and the camera are still easy to see and that the line does not push them off the card. Repeat on a phone (or a narrow phone-width window): the same line is readable, sits inside the waiting-room card, and is not cut off by the screen. Join as the student in a second browser or device and confirm the student waiting room does not show that line. Then Start and confirm the line is gone from the live session bar for both people.

**Expect:** The tutor sees that exact sentence in the waiting room, under the mic, on desktop and on a phone. It reads as a short helper line and does not crowd Start or the audio controls. The student never sees it. After Start it is not on the live bar.

**Ignore this run:** Theme polish beyond whether the line is readable in the theme you happen to be in. Per-learner language settings (not in this hotfix).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-transcription-language-notice.spec.ts › tutor sees the English-only notice under the mic before recording; student does not]` `[automated: tests/integration/wb-transcription-language-notice.spec.ts › tutor waiting-room notice stays inside the card at phone width]` `[human-only: whether the line reads well and feels uncrowded on a real phone]`

**Notes:**

### 5. Review screen still works

**Action:** From any of the sessions above, after End, stay on the review screen. Confirm the board thumbnail and notes area load. If notes are still generating, wait until they settle or the form is usable. Open the replay from the review screen, scrub or play a few seconds, then return to the notes. If a transcript is shown, open it and close it.

**Expect:** The review screen loads without an error banner. Notes (or the empty note from item 2) are readable. Replay opens and returns. Nothing about this hotfix removes the review screen or traps you on a spinner.

**Ignore this run:** Transcript wording already judged in items 1–3. Replay fidelity of strokes drawn before this branch.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: review-screen layout and replay return after a real ended session]`

**Notes:**

## Cross-branch / post-merge

Run this section after `fix/transcript-silence-hallucination` merges to `master`. Fetch that preview the same way (do not reuse the branch alias above).

**Integration branch:** `master`
**Integration tip commit:** `<after merge>`
**Integration preview:** `<fetch branchAlias for master after the merge>`

**Overall integration result:**

- [ ] PASS
- [ ] FAIL

### 1. Silence hotfix still holds on master

**Action:** On the post-merge `master` preview, repeat item 1 once (a little real speech, then silence, humming, or clicking) and open the review screen.

**Expect:** Same as items 1 and 5: no invented junk, and the review screen still loads.

**Ignore this run:** Organization features that are not on `master` yet.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

## Overall result

- [ ] PASS
- [ ] FAIL

