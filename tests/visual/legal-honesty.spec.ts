import { expect, test } from "@playwright/test";

/**
 * Public privacy and terms must state who in an organization can see a learner,
 * what remains after an account is deleted, and the consent facts Part 1
 * approved on 2026-11-17. They must not claim a retention clock, a fingerprint,
 * org features this release does not offer, or that every session transcribes,
 * drafts notes, or keeps the board.
 */

const ORGANIZATION_SENTENCE =
  "An organization owner, admin, or scheduler can see learners that organization entered, including learners they did not personally teach. The organization enters the learner. A scheduler sees the name, a short brief, and a short reason when a booking is blocked, and does not see parent email, consent choices, or notes. A private tutor still sees only their own students.";

const DELETION_SENTENCE =
  "After an account is deleted, we keep a record of the consent choices that were made: which options were on or off, and when. That record does not include the person’s name or email.";

const WHAT_MYNK_IS =
  "It helps private tutors run a shared whiteboard session, record what the privacy settings allow, and draft notes when notes are on. When the tutor saves, the parent and student can see what was recorded. That save can be notes and a replay, or a replay with no notes.";

const GMAIL_SAVE =
  "The parent or student already sees what was recorded, when you save.";

const DELETE_REQUEST =
  "To ask Mynk to delete a recording or other personal information, email arangarx+tutoringnotes@gmail.com. Mynk completes that request within 30 days.";

const PRIVACY_CONSENT =
  "When a parent or a self-learner has finished account setup, consent is recorded in that Mynk account before a session can start. That is true online and in person. A parent records it for a child. A self-learner records it for themselves. Without that record, a session cannot start. The online-sessions switch controls online sessions only. In person, the recording switches decide what is saved.";

const TERMS_CONSENT =
  "When a parent or a self-learner has finished account setup, consent is recorded in that Mynk account before a session can start, online or in person. A parent records it for a child. A self-learner records it for themselves. Without that record, a session cannot start.";

const BOARD_DELETION =
  "We do delete one kind of data on its own: when whiteboard recording is off, the board from that session is deleted from our servers after the session ends. A later pass removes anything still uploading, and a failed pass is tried again. That is not a general retention schedule for audio, transcripts, or notes. Those stay until the tutor deletes that session, or you ask Mynk to delete them. Turning whiteboard recording off does not delete a board already saved from an earlier session.";

const ABSENT_BOTH = [
  "24 months",
  "automatically deleted",
  "fingerprint of the account email",
  "self-serve",
  "guest room",
  "cutoff switch",
  "before a live session",
  "record it, and draft the notes",
  "When a note is finalized",
  "when you finalize a note",
  "transcribed by OpenAI and the notes are drafted automatically",
  "Automated retention schedules may be introduced in the future",
  "idle for a day",
  "the sync server does not store",
] as const;

async function pageText(page: import("@playwright/test").Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

for (const path of ["/privacy", "/terms"] as const) {
  test(`${path} states organization access, deletion, and honest consent, and omits false claims`, async ({
    page,
  }) => {
    await page.goto(path);
    const text = await pageText(page);

    expect(text).toContain("Last updated: November 17, 2026");
    expect(text).not.toContain("October 12, 2026");
    expect(text).not.toContain("October 6, 2026");
    expect(text).toContain(ORGANIZATION_SENTENCE);
    expect(text).toContain(DELETION_SENTENCE);
    expect(text).toContain(WHAT_MYNK_IS);
    expect(text).toContain(GMAIL_SAVE);
    expect(text).toContain(DELETE_REQUEST);

    for (const phrase of ABSENT_BOTH) {
      expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
    }

    if (path === "/privacy") {
      expect(text).toContain(PRIVACY_CONSENT);
      expect(text).toContain("created after this release");
      expect(text).toContain("created before this release");
      expect(text).toContain(
        "Session audio recordings, when any of that audio is saved (stored in Vercel Blob — see below). Online, if audio recording is off, the tutor's voice can still be saved. In person, audio recording off saves no audio."
      );
      expect(text).toContain(
        "Whiteboard session data, when whiteboard recording is on: timestamped stroke logs, optional PDF or image inserts, and a session snapshot for replay. When whiteboard recording is off, the board is deleted from our servers after the session ends."
      );
      expect(text).not.toContain(
        "timestamped stroke logs, optional PDF / image inserts, and a session snapshot used for the parent replay surface"
      );
      expect(text).not.toContain("the board is always");
      expect(text).not.toContain("always stored");
      expect(text).toContain(
        "Session transcripts, only when session notes are on, made from the saved audio by OpenAI (see below). If notes are off, there is no transcript, even if audio was saved."
      );
      expect(text).not.toContain(
        "automatically generated from session audio by the OpenAI transcription service"
      );
      expect(text).toContain(
        "Vercel Blob — object storage for session audio and for whiteboard snapshots, when those are saved (US region)."
      );
      expect(text).toContain(
        "When session notes are on, the saved audio is transcribed by OpenAI and the notes are drafted from it. Transcription is for English speech. If notes are off, the audio is not transcribed and no notes are drafted, even if audio was saved."
      );
      expect(text).not.toContain("That is part of the session.");
      expect(text).toContain(
        "When session notes are on, those recordings are sent to OpenAI via the /v1/audio/transcriptions endpoint so the notes can be drafted. The student's voice is included only if audio recording saved it. If notes are off, the recording is not sent for transcription."
      );
      expect(text).not.toContain(
        "for transcription as part of the note generation flow"
      );
      expect(text).toContain(
        "The tutor's microphone can still be saved. It is transcribed only when session notes are on. In person, audio recording off saves no audio, because one microphone would catch everyone. The whiteboard follows its own setting."
      );
      expect(text).not.toContain("saved and transcribed");
      expect(text).not.toContain(
        "saves nothing, because one microphone would catch everyone in the room"
      );
      expect(text).toContain(
        "can turn online sessions, audio recording, whiteboard recording, or notes off later"
      );
      expect(text).not.toContain("can turn live sessions");
      expect(text).toContain(
        "The signed-in parent or student can play back what was recorded: the audio, the board, or both. Replay does not need notes to be on. There is no separate switch that adds the audio back. If the board was not saved, replay says so."
      );
      expect(text).not.toContain("play that audio with the notes");
      expect(text).toContain(
        "Online sessions. On, the student can join an online session with video and audio. Off, an online session cannot be started or joined. In person is not controlled by this switch."
      );
      expect(text).toContain(
        "Audio. On, session audio is saved. Off, online, the student's voice is left out and the tutor's microphone can still be saved. Off, in person, no audio is saved, because one microphone would catch everyone. The whiteboard follows its own setting. Saved audio is transcribed only when notes are on."
      );
      expect(text).toContain(
        "Whiteboard. On, the board is saved and can be replayed. Off, the board still works during the session. After the session ends, the saved board is deleted from our servers, as described under Data retention and deletion."
      );
      expect(text).toContain(
        "Notes. On, notes are drafted from the saved audio. Transcription is for English speech. Off, nothing is transcribed and no notes are drafted, even if audio was saved."
      );
      expect(text).toContain(
        "During the session, the tutor and the student can both see which of these are off."
      );
      // Item 22 last sentence ships with the item 5 banner.
      expect(text).toContain(BOARD_DELETION);
      expect(text).toContain(
        "While a session runs, the tutor's browser keeps a recovery copy of the board on that device so a dropped connection does not lose the drawing. That copy is removed when the session ends on that device. If the session ended somewhere else, it is removed the next time the tutor opens that student's workspace on that device."
      );
      expect(text).toContain(
        "Our database keeps backup history for a limited period. A file removed from storage can remain recoverable for a limited period. This policy does not state a number of days for either."
      );
      expect(text).toContain("personal information indefinitely");
      expect(text).toContain("honored promptly");
      expect(text).toContain("a reasonable period");
      expect(text).toContain(
        "Session transcripts, only when session notes are on, made from the saved audio via OpenAI (subprocessor) for note generation. If notes are off, there is no transcript."
      );
      expect(text).not.toContain(
        "automatically derived from audio via OpenAI (subprocessor) for note generation and session history"
      );
      expect(text).toContain(
        "Whiteboard drawings, when whiteboard recording is on. When it is off, the board is deleted from our servers after the session ends."
      );
      expect(text).toContain(
        "When session notes are on, session audio is transmitted to OpenAI via the /v1/audio/transcriptions endpoint for transcription only. It is not sent for transcription when notes are off."
      );
      expect(text).toContain(
        "Children's personal information is used to run the tutoring session and, when the matching switch is on, to save that part of it, transcribe it, and draft notes."
      );
      expect(text).toContain(
        "A change applies to a session that has not started. A session that has started keeps what it started with."
      );
      expect(text).toContain(
        "It does not automatically delete content already created under your prior consent."
      );
      expect(text).toContain("It does not remove content the tutor already has.");
      expect(text).toContain("whiteboard drawings, when they were saved");
      expect(text).toContain("Audio is not shared with any other third party.");
      expect(text).toContain("not used to train");
    }

    if (path === "/terms") {
      expect(text).toContain(TERMS_CONSENT);
      expect(text).toContain(
        "and, when session notes are on, processing that audio through the transcription provider described in the privacy policy"
      );
      expect(text).not.toContain(
        "and processing audio through the transcription provider described in the privacy policy"
      );
      expect(text).toContain(
        "including session audio when it is saved, whiteboard drawings when whiteboard recording is on, and transcripts and notes when notes are on"
      );
      expect(text).not.toContain(
        "including the collection of session audio recordings, transcripts, and notes"
      );
      expect(text).toContain(
        "It does not automatically delete data already collected under prior consent."
      );
      expect(text).toContain(
        "Online, if audio recording is off, the tutor's microphone can still be saved, and it is transcribed only when notes are on. In person, audio recording off saves no audio. When whiteboard recording is off, the board from that session is deleted from our servers after the session ends. A board saved from an earlier session is not deleted by turning the switch off."
      );
      expect(text).not.toMatch(/\bretention schedule\b/i);
      expect(text).toContain(
        "Record session audio or share whiteboard / audio replays without obtaining appropriate consent"
      );
    }
  });
}
