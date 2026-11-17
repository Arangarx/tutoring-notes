# Consent copy for approval

**Fact-checked 2026-11-17.**

This is the consent wording for the release. You are approving sentences, not code.
Part 1 has to be right before release: privacy and terms that are wrong today, plus the lines a person needs while starting, joining, or looking at a replay.
Part 2 can wait until during the pilot: the settings descriptions, and deleting duplicate wording.
Read Part 1 top to bottom. If a sentence is wrong, write the replacement under that item.
Silence is not approval. Part 1 ships only after you reply "Approve all of Part 1" or send notes.

Branch `launch/consent-copy`. Copy waves C7 (product screens) and C8 (privacy and terms) type these sentences in. They do not invent new ones.

**Do not contradict these**

- A recording switch that is on allows that kind of saving. Off means it is not saved, except online audio: the student's voice is left out, and the tutor's voice can still be saved. The online-sessions switch is not a recording switch.
- The choice freezes when the tutor presses Start. A change applies to a session that has not started, including a room that is open and not started. A session that has started keeps what it started with.
- No saved privacy preferences means a session cannot start, online or in person. A saved record with a switch off does not block in person.
- The online-sessions switch blocks online only. In person follows the recording switches.
- Whiteboard off: the board still works, and it is not kept for replay. After the session ends, that session's board is deleted from our servers. A failed delete is tried again. An earlier session's board stays. Deletion is not instant.
- Notes off: no transcript and no drafted notes, even if audio was saved. Transcription is for English speech. The app does not yet lock the language in code, so the sentence says what we support. It does not say other languages are blocked.
- Replay shows what was recorded. Audio can play with no board. The tutor can share that replay with the family and no notes. The button already says "Share session".
- Do not say an idle session ends on its own. The idle-session job's default is to scan and log only. Do not give a number of days for database backups or for how long a deleted file can still be recovered.

Voice: "student" on tutor screens. "Your child" for a parent. "You" for the child and for a self-learner. "Online sessions" and "in person". Short sentences.

Privacy and terms edits below are product-specific sentences. Do not rewrite umbrella-verbatim sections (no-sale, Google limited use, disclaimers). Do not change the "SYNCED FROM … 2026-09-10" line. Do bump the on-page "Last updated" date and the product note at the top of each file.

---

## Part 1 — Launch

Item 40, at the end of this part, is the deletion-request sentence added on 2026-11-17. Items 1–39 keep their numbers.

### 1. Next session

**Where:** Under the switches on the parent privacy page (`src/app/account/children/[id]/consent/ParentConsentEditor.tsx`), the child privacy page (`src/components/consent/ChildConsentSettings.tsx`), and the self-learner privacy page (`src/components/consent/SelfLearnerConsentSettings.tsx`).
**Who sees it:** Parent, child, self-learner.
**Current:** none
**Proposed:** "A change applies to a session that has not started, including one whose room is already open. A session that has started keeps what it started with."
**Why:** The switches freeze when the tutor presses Start. A room that is open but not started still uses the latest settings.

**Your change:**

### 2. Waiting room, online sessions off

**Where:** Tutor waiting room, under Session type (`src/components/whiteboard/chrome/WaitingRoomOverlay.tsx`). Words from `ENTRY_BLOCK_COPY.live_off` and `ENTRY_IN_PERSON_STILL_OPEN` in `src/lib/scheduling/session-entry.ts`. The family line of that same entry is item 3. The scheduler line is in this item so the three stay in one table.
**Who sees it:** Tutor. The short form is the organization scheduler, on a blocked booking.
**Current:** Tutor: "Live sessions are off in {name}'s privacy settings. You can still open the room in person." The Start button already says "Start in person" when online is blocked. Scheduler: "Live sessions are off".
**Proposed:** Tutor: "Online sessions are off in {name}'s privacy settings. You can still meet in person." Keep the button "Start in person". Do not add a second "you can still open the room" sentence. Scheduler: "Online sessions are off".
**Why:** This switch blocks online only. "Live sessions" sounds like in person is blocked too.

**Your change:**

### 3. Join page, online sessions off

**Where:** `/join`, under the heading "Session not available" (`src/app/join/[sessionId]/page.tsx`). The heading stays. The body is the family line of `ENTRY_BLOCK_COPY.live_off`.
**Who sees it:** Child, a parent who joined as the child, self-learner.
**Current:** "Live sessions are off in privacy settings."
**Proposed:** "Online sessions are off in privacy settings."
**Why:** This page is the online door. Do not tell them they can meet in person here. That choice is the tutor's Start button.

**Your change:**

### 4. Disconnected, because online is off

**Where:** The disconnected screen when a device is removed because online sessions are off (`src/lib/whiteboard/join-unavailable-copy.ts`, reason `online_off`). That includes a room that has not started. Title stays "You were disconnected".
**Who sees it:** Child, a parent who joined as the child, or self-learner, on that device.
**Current:** The body reuses the join line: "Live sessions are off in privacy settings."
**Proposed:** "Online sessions are off in privacy settings, so this device has been disconnected."
**Why:** This is not the join page. The person was in a room and then removed. The room may not have started, so do not say the session is happening in person.

**Your change:**

### 5. Recording-off lines during the session

**Where:** The banner in the whiteboard workspace (`WhiteboardWorkspaceClient.tsx`, `audioConsentBannerMessage`, shown at `wb-audio-consent-banner`). Same lines in the waiting room, before Start. Today the banner is tutor-only and talks only about audio.
**Who sees it:** Tutor, and the person on the student side (child, parent joined as the child, or self-learner).
**Current:** Tutor only. No snapshot: "Recording & notes off — no audio consent on file for this student. Whiteboard and live conversation continue. Parent setup may be required before audio can be saved." Audio off: "Audio not recorded — this student's parent has not allowed session audio. Whiteboard and live conversation continue." Online, student voice off: "Student audio not recorded — only your microphone is included in the recording and notes." No whiteboard line. No notes line. The student sees nothing.
**Proposed:** Drop the "no audio consent on file" line. No saved preferences is the blocked Start, not this banner. Do not say "your parent". Do not say notes are included unless notes are on. Show one line per switch that is off.

Tutor:

- Audio off, online: "This student's voice is not being saved. Your microphone can still be saved."
- Audio off, in person: "Session audio is not being saved."
- Whiteboard off: "The board is not being saved. It still works during this session. After the session ends, we delete the saved board from our servers."
- Notes off: "Notes are off for this session. Nothing is transcribed."

Student side:

- Audio off, online: "Your voice is not being saved. Your tutor's microphone can still be saved."
- Audio off, in person: "Session audio is not being saved."
- Whiteboard off and notes off: the same two sentences as the tutor.

Use the online sentence only when the student's voice is left out and the tutor's voice can still be saved. When no audio is saved at all, use "Session audio is not being saved." That includes in person, the waiting room before a type is chosen, and an older session that has no saved preferences. Do not say the tutor's voice can still be saved in those cases. When online sessions are already off, the room is in person, so use that same sentence. Whiteboard and notes do not depend on that choice.

**Why:** Both people need to see what this session is not saving. The old audio line claims notes, and it blames a parent when a child or a self-learner turned it off. Before a session type is chosen, no audio is saved.

**Your change:**

### 6. Empty board on review and replay

**Where:** Tutor review (`SessionReviewMode.tsx`, `ReviewBoardThumbnail.tsx`, `ReplayBoardNotSavedNotice.tsx`). Family and student replay (`WhiteboardReplayPageShell.tsx`, `WhiteboardReplayInFrame.tsx`).
**Who sees it:** Tutor on review. Parent, child, and self-learner on replay.
**Current:** When whiteboard recording was off, review and the replay page already say "The board was not saved because whiteboard recording was off." When the board was saved but nothing was drawn, the review thumbnail says "No board strokes recorded." The replay player also has "No whiteboard activity was recorded for this session." and "No board content to replay."
**Proposed:** Keep "The board was not saved because whiteboard recording was off." Use it only when the saved choice says the board was not kept. When the board was saved and nothing was drawn, say "Nothing was drawn." Do not put "No whiteboard activity was recorded" on top of the not-saved sentence.
**Why:** "No strokes recorded" reads as "nobody drew." An unsaved board and a blank board are different.

**Your change:**

### 7. Parent "always block" switches

**Where:** Parent privacy page, the two block checkboxes (`ParentConsentEditor.tsx`). Not shown to a self-learner.
**Who sees it:** Parent.
**Current:** Audio: "Always block audio recording. Applies to every tutor. If checked, session audio cannot be recorded even when a tutor's setting above is on." Whiteboard: "Always block whiteboard replay. Applies to every tutor. If checked, you cannot replay saved whiteboard sessions even when a tutor's setting above is on."
**Proposed:** Audio label stays "Always block audio recording." Audio text: "Applies to every tutor, including an organization's instructors. Online, your child's voice is left out; the tutor's voice can still be saved. In person, no audio is saved. The whiteboard follows its own setting." Whiteboard label: "Always block whiteboard recording." Whiteboard text: "Applies to every tutor, including an organization's instructors. The board still works during the session. After it ends, the saved board is deleted from our servers." Under both: "A block applies to sessions that have not started yet. A session that has started keeps what it started with. A recording already saved stays until the tutor deletes that session, or you ask Mynk to delete it."
**Why:** The block is a limit for this child, on top of each tutor's or organization's own setting. It does not stop a session from starting. The whiteboard block stops saving. It does not hide a board that was already saved. A parent cannot delete a saved recording in the app.

**Your change:**

### 8. Privacy — what we collect

**Where:** Privacy policy, "What data we collect" (`src/app/privacy/page.tsx` lines 81, 82, and 92).
**Who sees it:** Tutor, parent, child, self-learner, and anyone else who opens the page.
**Current:** Audio is listed with no "only when it is on." Line 82: "Whiteboard session data: timestamped stroke logs, optional PDF / image inserts, and a session snapshot used for the parent replay surface." Line 92: "Session transcripts automatically generated from session audio by the OpenAI transcription service."
**Proposed:** Audio bullet: "Session audio recordings, when any of that audio is saved (stored in Vercel Blob — see below). Online, if audio recording is off, the tutor's voice can still be saved. In person, audio recording off saves no audio." Board bullet: "Whiteboard session data, when whiteboard recording is on: timestamped stroke logs, optional PDF or image inserts, and a session snapshot for replay. When whiteboard recording is off, the board is deleted from our servers after the session ends." Transcript bullet: "Session transcripts, only when session notes are on, made from the saved audio by OpenAI (see below). If notes are off, there is no transcript, even if audio was saved."
**Why:** The page currently reads as if every session keeps the board and always makes a transcript.

**Your change:**

### 9. Privacy — where whiteboard files are stored

**Where:** Privacy policy, subprocessors list (`src/app/privacy/page.tsx` line 132).
**Who sees it:** Same as item 8.
**Current:** "Vercel Blob — object storage for session audio and whiteboard snapshots (US region)."
**Proposed:** "Vercel Blob — object storage for session audio and for whiteboard snapshots, when those are saved (US region)."
**Why:** A snapshot is not stored when whiteboard recording is off.

**Your change:**

### 10. Privacy — when notes are drafted

**Where:** Privacy policy, "AI note generation (OpenAI)" (`src/app/privacy/page.tsx` lines 248–249).
**Who sees it:** Same as item 8.
**Current:** "When a session is recorded, the audio is transcribed by OpenAI and the notes are drafted automatically. That is part of the session."
**Proposed:** "When session notes are on, the saved audio is transcribed by OpenAI and the notes are drafted from it. Transcription is for English speech. If notes are off, the audio is not transcribed and no notes are drafted, even if audio was saved."
**Why:** Recording audio does not, by itself, turn on transcription or notes.

**Your change:**

### 11. Privacy — when audio is sent to OpenAI

**Where:** Privacy policy, "Session audio recordings" (`src/app/privacy/page.tsx` lines 271–276). Keep the sentences that OpenAI does not train on API data and that audio is not shared with any other third party.
**Who sees it:** Same as item 8.
**Current:** "Recordings are sent to OpenAI via the /v1/audio/transcriptions endpoint for transcription as part of the note generation flow."
**Proposed:** "When session notes are on, those recordings are sent to OpenAI via the /v1/audio/transcriptions endpoint so the notes can be drafted. The student's voice is included only if audio recording saved it. If notes are off, the recording is not sent for transcription."
**Why:** Notes off means we do not send the audio to OpenAI.

**Your change:**

### 12. Privacy — audio off, online and in person

**Where:** Same section (`src/app/privacy/page.tsx` lines 281–286).
**Who sees it:** Same as item 8.
**Current:** "Online, if audio recording is off, the child's voice is left out of the saved recording. The tutor's microphone can still be saved and transcribed. In person, audio recording off saves nothing, because one microphone would catch everyone in the room."
**Proposed:** Keep the online fact that the child's voice is left out. Replace "saved and transcribed" and the in-person sentence with: "The tutor's microphone can still be saved. It is transcribed only when session notes are on. In person, audio recording off saves no audio, because one microphone would catch everyone. The whiteboard follows its own setting."
**Why:** Tutor audio can be saved while notes are off. It is not transcribed in that case. "Saves nothing" would sound like the board is deleted by the audio switch.

**Your change:**

### 13. Privacy — "live sessions" on the self-learner sentence

**Where:** Same section (`src/app/privacy/page.tsx` lines 289–291).
**Who sees it:** Same as item 8. The sentence is about a self-learner.
**Current:** "A self-learner agrees to session recording when they set up their account, and can turn live sessions, audio recording, whiteboard recording, or notes off later in their settings. Audio recording off works the same way as for a child."
**Proposed:** "A self-learner agrees to session recording when they set up their account, and can turn online sessions, audio recording, whiteboard recording, or notes off later in their settings. Audio recording off works the same way as for a child."
**Why:** The switch is named online sessions. In person is separate.

**Your change:**

### 14. Privacy — what replay plays

**Where:** Same section (`src/app/privacy/page.tsx` lines 293–295).
**Who sees it:** Same as item 8.
**Current:** "If a whiteboard session was recorded, the signed-in parent or student can play that audio with the notes. There is no separate switch for including the audio."
**Proposed:** "The signed-in parent or student can play back what was recorded: the audio, the board, or both. Replay does not need notes to be on. There is no separate switch that adds the audio back. If the board was not saved, replay says so."
**Why:** Audio-only replay is real, and a shared session can have no notes.

**Your change:**

### 15. Privacy — saving is not only a finished note

**Where:** "What Mynk is" (lines 69–71) and the Gmail paragraph (line 165).
**Who sees it:** Same as item 8.
**Current:** "It helps private tutors run a shared whiteboard session, record it, and draft the notes. When a note is finalized, the parent and student can see the notes and the lesson replay in their account." The Gmail paragraph says they already see the notes and the lesson replay "when you finalize a note."
**Proposed:** "It helps private tutors run a shared whiteboard session, record what the privacy settings allow, and draft notes when notes are on. When the tutor saves, the parent and student can see what was recorded. That save can be notes and a replay, or a replay with no notes." In the Gmail paragraph, replace "the notes and the lesson replay … when you finalize a note" with "what was recorded, when you save."
**Why:** A "Share session" save releases the replay and writes no notes. Recording and notes are not always on.

**Your change:**

### 16. Privacy — consent before a session can start

**Where:** Privacy policy, "Children" (`src/app/privacy/page.tsx` lines 367–370).
**Who sees it:** Same as item 8.
**Current:** "When a parent or a self-learner has finished account setup, consent is recorded in that Mynk account before a live session. A parent records it for a child. A self-learner records it for themselves. A student who has not finished setup does not have that record yet."
**Proposed:** "When a parent or a self-learner has finished account setup, consent is recorded in that Mynk account before a session can start. That is true online and in person. A parent records it for a child. A self-learner records it for themselves. Without that record, a session cannot start. The online-sessions switch controls online sessions only. In person, the recording switches decide what is saved."
**Why:** "Before a live session" skips in person, and it never says a missing record blocks Start.

**Your change:**

### 17. Privacy — children's data list

**Where:** "Children's data and parental rights" (`src/app/privacy/page.tsx` lines 396–403). The audio bullet (lines 396–399) is already true. Keep it.
**Who sees it:** Same as item 8. This list is about a student under 13.
**Current:** "Session transcripts automatically derived from audio via OpenAI (subprocessor) for note generation and session history." The board is not in the list.
**Proposed:** Transcript bullet: "Session transcripts, only when session notes are on, made from the saved audio via OpenAI (subprocessor) for note generation. If notes are off, there is no transcript." Add: "Whiteboard drawings, when whiteboard recording is on. When it is off, the board is deleted from our servers after the session ends."
**Why:** Transcripts are not automatic, and the board is children's data when it is saved.

**Your change:**

### 18. Privacy — children's audio sent to OpenAI

**Where:** Same section, subprocessors paragraph (`src/app/privacy/page.tsx` lines 412–414). Keep the "not used to train" sentence.
**Who sees it:** Same as item 8.
**Current:** "Session audio is transmitted to OpenAI via the /v1/audio/transcriptions endpoint for transcription only."
**Proposed:** "When session notes are on, session audio is transmitted to OpenAI via the /v1/audio/transcriptions endpoint for transcription only. It is not sent for transcription when notes are off."
**Why:** Same gap as item 11, in the children's section.

**Your change:**

### 19. Privacy — how children's data is used

**Where:** Same section (`src/app/privacy/page.tsx` lines 426–430).
**Who sees it:** Same as item 8.
**Current:** Children's data is used to "deliver the tutoring session recording, transcription, and note-generation service" and, "when a note is finalized," to show "the notes and the lesson replay."
**Proposed:** "Children's personal information is used to run the tutoring session and, when the matching switch is on, to save that part of it, transcribe it, and draft notes. Online, if audio recording is off, the child's voice is left out. When the tutor saves, the parent or student can see what was recorded — notes, a replay, or both — in their signed-in account. We do not use children's personal information for advertising, profiling, or any purpose unrelated to the child's tutoring sessions."
**Why:** Transcription, notes, and a notes block are not part of every session.

**Your change:**

### 20. Privacy — retention, and what "deleted" means

**Where:** "Data retention and deletion" (lines 328–329) and the children's retention paragraph (lines 445–447). Keep "We do not retain children's personal information indefinitely," "a reasonable period," and "honored promptly." Keep "Turning a consent off does not delete an earlier recording" wherever it already says that (items 21 and 27).
**Who sees it:** Same as item 8.
**Current:** Both places say "Automated retention schedules may be introduced in the future; this policy will be updated when they take effect."
**Proposed:** Replace that sentence, in both places, with: "We do delete one kind of data on its own: when whiteboard recording is off, the board from that session is deleted from our servers after the session ends. A later pass removes anything still uploading, and a failed pass is tried again. That is not a general retention schedule for audio, transcripts, or notes. Those stay until the tutor deletes that session, or you ask Mynk to delete them. Turning whiteboard recording off does not delete a board already saved from an earlier session." Add, once, in the retention section: "While a session runs, the tutor's browser keeps a recovery copy of the board on that device so a dropped connection does not lose the drawing. That copy is removed when the session ends on that device. If the session ended somewhere else, it is removed the next time the tutor opens that student's workspace on that device." And: "Our database keeps backup history for a limited period. A file removed from storage can remain recoverable for a limited period. This policy does not state a number of days for either."
**Why:** A board-deletion job exists, so "maybe someday" is false. It is not a clock for everything else. Backup and storage delays are real and the length is not confirmed. The device copy is real, so "deleted" has to say "from our servers."

**Your change:**

### 21. Privacy — turning a switch off

**Where:** Parental rights (lines 457–460), "Consent revocation and data already collected" (lines 470–475), and "Educational use by the tutor" (lines 484–490).
**Who sees it:** Same as item 8. These sentences address a parent.
**Current:** "Turning a consent off stops that new collection." The rights bullet adds only "Online, if audio recording is off, the tutor's microphone can still be saved." The revocation paragraph says turning consent off "does not automatically delete content already created under your prior consent." Educational use lists "session recordings, transcripts, and notes" and says turning consent off "does not remove content the tutor already has."
**Proposed:** Keep both "does not delete / does not remove what was already kept" sentences. Add to the rights bullet and the revocation paragraph: "A change applies to a session that has not started. A session that has started keeps what it started with. Online, if audio recording is off, the tutor's microphone can still be saved. It is transcribed only when notes are on. In person, audio recording off saves no audio. When whiteboard recording is off, the board from that session is deleted from our servers after the session ends. A board saved from an earlier session is not deleted by turning the switch off." In educational use, add whiteboard drawings, when they were saved, to the list. Keep "It does not remove content the tutor already has."
**Why:** The "already collected stays" sentences are true. They need the one exception spelled out so board deletion does not sound retroactive, and so tutor audio is not described as always transcribed.

**Your change:**

### 22. Privacy — what each switch does, and that both people can see it

**Where:** New short section on the privacy page, after the session-audio section. The in-session lines in item 5 are the short form of these same facts.
**Who sees it:** Same as item 8.
**Current:** none
**Proposed:**

"Online sessions. On, the student can join an online session with video and audio. Off, an online session cannot be started or joined. In person is not controlled by this switch."

"Audio. On, session audio is saved. Off, online, the student's voice is left out and the tutor's microphone can still be saved. Off, in person, no audio is saved, because one microphone would catch everyone. The whiteboard follows its own setting. Saved audio is transcribed only when notes are on."

"Whiteboard. On, the board is saved and can be replayed. Off, the board still works during the session. After the session ends, the saved board is deleted from our servers, as described under Data retention and deletion."

"Notes. On, notes are drafted from the saved audio. Transcription is for English speech. Off, nothing is transcribed and no notes are drafted, even if audio was saved."

"During the session, the tutor and the student can both see which of these are off."

**Why:** The page has to say what the switches do, in the same words the product shows.

**Your change:**

### 23. Sentences we will not add

**Where:** Privacy and terms. Nowhere.
**Who sees it:** Nobody. This item is a ban.
**Current:** The pages do not claim that idle sessions end, and they do not describe the sync server.
**Proposed:** Do not add "a session that has been idle for a day is ended automatically." Do not say an idle session ends on its own. The idle-session job's default is to scan and log only. Do not add "the sync server does not store the drawing." That has not been confirmed. If either fact changes, the page changes in the same release as the behavior.
**Why:** The plan's draft idle-session sentence is false on this branch. A relay sentence would be a guess.

**Your change:**

### 24. Privacy and terms — "Last updated"

**Where:** The date under the title (`privacy/page.tsx` line 50, `terms/page.tsx` line 47) and the product-specific note at the top of each file.
**Who sees it:** Anyone on the page sees the date.
**Current:** "Last updated: October 12, 2026."
**Proposed:** The date the edit is published. Add a product-specific line in the file comment. Leave "SYNCED FROM … 2026-09-10" as it is.
**Why:** The on-page date moves when these sentences change. This is not a new sync from the umbrella policy.

**Your change:**

### 25. Terms — what the service does

**Where:** Terms, "The service" (lines 65–67) and the Gmail paragraph (lines 119–121).
**Who sees it:** Same as item 8.
**Current:** Same "record it, and draft the notes" and "when a note is finalized" wording as privacy item 15.
**Proposed:** Use the item 15 sentences.
**Why:** The terms page repeats the same overclaim.

**Your change:**

### 26. Terms — audio and the transcription provider

**Where:** Terms, "Your content" (lines 106–112).
**Who sees it:** Same as item 8. This sentence addresses the tutor.
**Current:** The tutor grants permission to operate the product, including "processing audio through the transcription provider described in the privacy policy."
**Proposed:** Keep the sentence. Change the transcription clause to "and, when session notes are on, processing that audio through the transcription provider described in the privacy policy."
**Why:** We do not send audio for transcription when notes are off.

**Your change:**

### 27. Terms — children and parental consent

**Where:** Terms, "Children and parental consent" (lines 204–220). Leave the acceptable-use bullet at line 99 as it is ("Record session audio or share whiteboard / audio replays without obtaining appropriate consent").
**Who sees it:** Same as item 8. The section addresses a parent or guardian, and a self-learner.
**Current:** Consent is recorded "before a live session." The collected list is "session audio recordings, transcripts, and notes." Turning consent off "stops that new collection." Online, "the tutor's microphone can still be saved." "It does not automatically delete data already collected under prior consent."
**Proposed:** "Including session audio when it is saved, whiteboard drawings when whiteboard recording is on, and transcripts and notes when notes are on." "Consent is recorded in that Mynk account before a session can start, online or in person. Without that record, a session cannot start." Keep "It does not automatically delete data already collected under prior consent." Add: "A change applies to a session that has not started. A session that has started keeps what it started with. Online, if audio recording is off, the tutor's microphone can still be saved, and it is transcribed only when notes are on. In person, audio recording off saves no audio. When whiteboard recording is off, the board from that session is deleted from our servers after the session ends. A board saved from an earlier session is not deleted by turning the switch off."
**Why:** This section mirrors the privacy gaps: "live session," no board, transcription treated as automatic, and no in-person line. The "does not delete what was already collected" sentence stays.

**Your change:**

### 40. Privacy and terms — asking Mynk to delete

**Where:** Privacy, "Data retention and deletion" and the parental-rights contact line (`src/app/privacy/page.tsx`). Terms, "Children and parental consent" (`src/app/terms/page.tsx` lines 212–222). That terms paragraph already says a parent can ask Mynk to delete, and it points at the privacy page for the contact address.
**Who sees it:** Same as item 8.
**Current:** Privacy already names arangarx+tutoringnotes@gmail.com and says a request is honored promptly. It does not say 30 days. Terms do not name the email or a deadline.
**Proposed:** Add this sentence in the privacy retention section and in the terms children section: "To ask Mynk to delete a recording or other personal information, email arangarx+tutoringnotes@gmail.com. Mynk completes that request within 30 days." A parent cannot delete a saved recording in the app. Keep "honored promptly" where item 20 keeps it.
**Why:** Andrew, 2026-11-17. The email is already the privacy contact. The 30 days are not on either page.

**Your change:**

---

## Part 2 — Later

These can ship during the pilot. They are not required to make the legal pages honest, or to understand a session that is underway. Item 28 corrects a plan sentence that does not match this button. Pull it into Part 1 if you want it before release.

### 28. Decline dialog on account setup

**Where:** Claim setup, the "No consent now, I'll review later" button (`src/app/claim/[token]/setup/ConsentSetupForm.tsx`, text in `CONSENT_DECLINE_WARNING`).
**Who sees it:** Parent, or self-learner.
**Current:** Title "Are you sure?" Parent, no invite: "Until you set preferences, your child cannot participate in live tutoring sessions with this tutor. You can update preferences any time from your account dashboard." Parent, invited: "If you continue without enabling any options, your child will not be able to join the live tutoring session they've already been invited to. You can change these preferences later from your account dashboard." Self-learner: "Consent has not been given yet. You cannot join a session until you give consent. Open Manage, then Privacy." Self-learner, invited: the same, plus the invite they already have.
**Proposed:** Title stays. Confirming this button saves a record with every switch off. It does not leave preferences unset. Parent: "If you continue, every switch is saved off. Online sessions cannot start. You can still meet in person. In person, no audio is saved, and the board is not kept after the session. You can change this later from your account." Parent, invited: add "Your child has already been invited. They cannot join an online session until online sessions are on." Self-learner: "If you continue, every switch is saved off. You cannot join an online session until you turn online sessions on. In person can still happen. Open Manage, then Privacy." Self-learner, invited: add "You have already been invited. You cannot join that online session until online sessions are on."
**Why:** Confirming writes a saved record with every switch off. Online is blocked. In person can still start. No saved record is the case that blocks in person, and this button does not leave the record unset. "Live tutoring" would hide that split.

**Your change:**

### 29. Online-sessions switch

**Where:** `LIVE_SESSION_CONSENT_COPY` in `src/lib/consent-toggle-copy.ts`, once it has a parent, child, and self-learner line. Child page currently replaces it (`ChildConsentSettings.tsx` `CHILD_DESCRIPTION`). Self-learner page shows the parent text today.
**Who sees it:** Parent, child, self-learner.
**Current:** Label "Allow live tutoring sessions." Parent: "Your child can join real-time video and audio with this tutor, and everything drawn on the shared whiteboard during the session is saved for later review. You can also join a live session as your child from your parent account when they need help signing in." Child fork: "You can join live video and audio with your tutor. Everything drawn on the shared whiteboard is saved for later review."
**Proposed:** Label "Allow online sessions." Parent: "Your child can join online sessions with video and audio. In person is not affected by this switch. You can also join an online session as your child from your parent account when they need help signing in." Child and self-learner: "You can join online sessions with video and audio. In person is not affected by this switch." Delete "everything drawn is saved" from this switch.
**Why:** The saved-board sentence is false when whiteboard recording is off. It belongs on the whiteboard switch. The parent-join sentence is true, so it stays. Self-learner must not see "your child."

**Your change:**

### 30. Note under the online switch

**Where:** `LIVE_SESSION_SCHEDULING_NOTE`, shown when online sessions are off.
**Who sees it:** Parent, and anyone else who sees that switch.
**Current:** "Without live sessions, Mynk is effectively just a scheduling calendar — your child cannot join tutoring on the whiteboard. You can decline, but there is little reason to use the app if this stays off."
**Proposed:** "With online sessions off, online sessions cannot be started or joined. In person is not affected."
**Why:** In person still uses the whiteboard. The app is not only a calendar. The same sentence is read by a parent, a child, and a self-learner.

**Your change:**

### 31. Audio switch

**Where:** `AUDIO_RECORDING_CONSENT_COPY`, plus the child fork in `CHILD_DESCRIPTION`.
**Who sees it:** Parent, child, self-learner.
**Current:** Parent text describes audio "for notes and review," and says the child's voice is recorded separately online. It does not say what off does in each mode. Child fork: "Session audio can be saved for notes and review. Live conversation still works when live sessions are on."
**Proposed:** Parent: "Session audio is recorded. If this is off, online sessions save the tutor's voice only, and in person sessions save no audio. The live call still works when online sessions are on. This switch only controls what is saved. The whiteboard follows its own setting." Child and self-learner: "Session audio is recorded. If this is off, online sessions leave your voice out, and your tutor's microphone can still be saved. In person, no audio is saved. The whiteboard follows its own setting."
**Why:** Off does not mean the same thing online and in person. "For notes" implies notes exist whenever audio is on.

**Your change:**

### 32. Whiteboard switch

**Where:** `WHITEBOARD_RECORDING_CONSENT_COPY`. The child page already falls through to this text.
**Who sees it:** Parent, child, self-learner.
**Current:** "The shared whiteboard can be saved and replayed."
**Proposed:** "The board is saved and can be replayed. If this is off, the board still works during the session. After the session ends, the saved board is deleted from our servers."
**Why:** The current line never says what off does.

**Your change:**

### 33. Notes switch

**Where:** `SESSION_NOTES_CONSENT_COPY`.
**Who sees it:** Parent, child, self-learner.
**Current:** "Mynk can draft session notes from the session."
**Proposed:** "Session notes are drafted from the audio. Transcription is for English speech. If this is off, nothing is transcribed and no notes are drafted, even if audio was saved."
**Why:** Off has to say that audio can still exist with no transcript and no notes.

**Your change:**

### 34. Self-learner audio help

**Where:** The paragraph above the switches on the self-learner page (`SELF_LEARNER_AUDIO_HELP`).
**Who sees it:** Self-learner.
**Current:** "Off means your voice is left out of the saved recording. Online, your tutor's microphone can still be saved. In person, nothing is saved."
**Proposed:** "Off means your voice is left out of the saved recording. Online, your tutor's microphone can still be saved. In person, no audio is saved. The whiteboard follows its own setting. Nothing is transcribed if notes are off."
**Why:** The two-mode sentence already says "you." "Nothing is saved" would sound like the board is included. Notes still need their own sentence.

**Your change:**

### 35. Self-learner agreement

**Where:** The checkbox at setup and on the self-learner page (`SELF_LEARNER_AGREEMENT`).
**Who sees it:** Self-learner.
**Current:** "I agree that my tutoring sessions may be recorded — the shared whiteboard and the audio — and that Mynk drafts session notes from them. I can turn any of this off later. Open Manage, then Privacy."
**Proposed:** "I agree that my tutoring sessions may be recorded — the shared whiteboard and the audio — and that Mynk may draft session notes from them. I can turn any of this off later. Open Manage, then Privacy."
**Why:** "May" has to cover notes as well as recording. The switch lines and the not-yet-started sentence carry the detail. Do not add deletion language to the checkbox.

**Your change:**

### 36. "Most families keep this on"

**Where:** `RECOMMENDED_CONSENT_NOTE`, under a recommended switch (audio).
**Who sees it:** Parent, and the child page when a parent has turned that switch back on uses a different line ("Your parent turned this back on.").
**Current:** "You can turn this off, but most families keep it on so sessions are useful after class ends."
**Proposed:** Keep it.
**Why:** It does not describe a behavior. It is still fair.

**Your change:**

### 37. One description per switch

**Where:** `ChildConsentSettings.tsx` lines 11–16, `CHILD_DESCRIPTION`.
**Who sees it:** Child.
**Current:** Its own live and audio sentences, including "Everything drawn on the shared whiteboard is saved for later review."
**Proposed:** Delete the fork. The child page uses the child lines in items 29 and 31. Keep the intro: "You can turn any of these off. A parent can turn one back on." The next-session sentence is item 1, on this page too.
**Why:** Two descriptions for one switch will drift. The forked board sentence is already false.

**Your change:**

### 38. "Your child turned this off"

**Where:** The rows a parent uses to turn a child's choice back on (`ParentConsentEditor.tsx` lines 84–112).
**Who sees it:** Parent.
**Current:** Labels "Live tutoring sessions," "Session audio recording," "Whiteboard recording," "Session notes." Each says "Your child turned this off. Turn it back on to allow it again."
**Proposed:** Label the first row "Online sessions." Keep the other three labels. Keep the sentence.
**Why:** The sentence is true. Only the online label still says "live."

**Your change:**

### 39. "Share session" on review

**Where:** Tutor review, when notes are off (`TutorNotesSection.tsx`). The line is `NOTES_SKIPPED_COPY` in `src/lib/recording/transcript-types.ts`.
**Who sees it:** Tutor.
**Current:** "Notes are off for this session." The button says "Share session."
**Proposed:** Keep both.
**Why:** The button already releases the replay to the family and does not claim that notes were drafted. Do not rename it to a save-notes label.

**Your change:**

---

## Approve

Approve all of Part 1

**Notes** (item number and the sentence you want, if any):
