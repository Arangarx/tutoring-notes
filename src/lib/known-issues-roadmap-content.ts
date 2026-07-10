/** Sarah-facing copy for Settings → Known issues & roadmap (draft @ 6815c4f). */

export const KNOWN_ISSUES_ROADMAP_PAGE_TITLE = "Known issues & roadmap";

export const recentlyImprovedIntro =
  "What you'll notice in the app after this update wave.";

export type RecentlyImprovedSection = {
  title: string;
  items: readonly string[];
};

export const recentlyImprovedSections: readonly RecentlyImprovedSection[] = [
  {
    title: "Session notes & replay",
    items: [
      "Your session notes are ready almost immediately when you end a session, instead of taking a while.",
      "Session replays now play back smoothly as one continuous recording.",
      "Replays start from the beginning when you open them.",
      "You can scrub through a replay and land where you drop the playhead — it no longer jumps back to the start on longer recordings.",
    ],
  },
  {
    title: "Recording & ending sessions",
    items: [
      "Ending a session from your sessions list or the resume screen now saves your full recording, the same as ending from inside a live session.",
      "When you mute yourself, your voice stays muted in the session recording too.",
      "Your recording is better protected if you accidentally close the browser tab mid-session and come back to finish.",
    ],
  },
  {
    title: "Live audio & microphones",
    items: [
      "The app remembers your microphone choice more reliably, including when a device was briefly unavailable.",
      "Students can boost their own microphone volume when they need to be heard more clearly.",
    ],
  },
  {
    title: "Waiting room & session flow",
    items: [
      "You can cancel or leave from the waiting room if plans change before a session starts.",
    ],
  },
  {
    title: "Billing & time alerts",
    items: [
      "Billable time is rounded to your chosen increment and locked in when a session ends; you can set your defaults under billing settings.",
      "Time-alert controls use clearer labels so you know what the alert does.",
    ],
  },
  {
    title: "Whiteboard tools",
    items: [
      "Drawing style controls now show only the options that apply to the tool you're using — no more sliders that don't change pencil strokes.",
      "When you have more board tabs than fit on screen, you can scroll to reach the rest.",
    ],
  },
  {
    title: "Reliability & clearer messaging",
    items: [
      "Friendlier messages throughout — clearer saving status, reconnection text, error screens with a way forward, and plain-language notes when something is still preparing.",
      "If the app hits a loading glitch after an update, it tries to recover on its own instead of leaving you stuck.",
    ],
  },
  {
    title: "Identity, consent & privacy",
    items: [
      "Parent or guardian consent is now required and recorded before a minor joins a live session, with clear consent choices during account setup.",
      "Parents can set up a learner's own login through a guided claim flow.",
      "You can request deletion of a student's data, with a grace period before it's permanently removed.",
    ],
  },
] as const;

export const knownIssuesIntro =
  "Honest, low-alarm notes on things that may still come up. We're on it.";

export type KnownIssueItem = {
  title: string;
  body: string;
};

export const knownIssuesItems: readonly KnownIssueItem[] = [
  {
    title: "PDF boards — occasional stray mark",
    body: "Very rarely, after importing a PDF onto the whiteboard, a pen stroke from another board can appear on the new page. It's intermittent and we're working on a fix; refreshing or undoing usually clears it for now.",
  },
  {
    title: "Children without their own login can't join live sessions yet",
    body: "If a learner doesn't have their own username + PIN, a parent signed in on the family account can't open the session join link as that child yet (a learner picker is coming). For live sessions today, set up the child's own login under Manage, or have the child sign in on the student login page. Parents can still view notes and share links.",
  },
  {
    title: "Student microphone boost — final check",
    body: "Students can adjust their own mic volume in the app; we're doing one more round of real two-device testing to make sure tutors consistently hear the boost before we call this fully done.",
  },
  {
    title: "Empty review screen",
    body: "If a session ended with little or no saved audio or notes, the review screen can look blank even though nothing is \"broken\" — we're improving that empty state so it's clear what happened.",
  },
];

export const roadmapIntro =
  "Direction, not dates — we'll share more as pieces land.";

export type RoadmapItemPart = { text: string; emphasis?: boolean };

export type RoadmapItem = readonly RoadmapItemPart[];

export const roadmapItems: readonly RoadmapItem[] = [
  [
    { text: "A " },
    { text: "tutor settings", emphasis: true },
    {
      text: " area where you can set defaults once (time alerts, billing rounding, drawing preferences, and similar) instead of hunting for each control.",
    },
  ],
  [
    { text: "Smoother automatic updates", emphasis: true },
    {
      text: " so you're always on the latest version without hard-refreshing — including gentle prompts between sessions, without interrupting a recording in progress.",
    },
  ],
  [
    { text: "Richer billing options", emphasis: true },
    { text: " per session and clearer billing summaries where parents see session time." },
  ],
  [
    { text: "Continued polish on " },
    { text: "session review", emphasis: true },
    { text: ", " },
    { text: "waiting-room", emphasis: true },
    { text: ", and " },
    { text: "error recovery", emphasis: true },
    { text: " flows so you never feel trapped or unsure what to do next." },
  ],
];
