/** Sarah-facing copy for Settings → Known issues & roadmap (draft @ 6815c4f). */

export const KNOWN_ISSUES_ROADMAP_PAGE_TITLE = "Known issues & roadmap";

export const recentlyImprovedIntro =
  "What you'll notice in the app after this update wave.";

export const recentlyImprovedItems = [
  "Your session notes are ready almost immediately when you end a session, instead of taking a while.",
  "Session replays now play back smoothly as one continuous recording.",
  "Replays start from the beginning when you open them.",
  "You can scrub through a replay and land where you drop the playhead — it no longer jumps back to the start on longer recordings.",
  "Ending a session from your sessions list or the resume screen now saves your full recording, the same as ending from inside a live session.",
  "You can cancel or leave from the waiting room if plans change before a session starts.",
  "The app remembers your microphone choice more reliably, including when a device was briefly unavailable.",
  "Students can boost their own microphone volume when they need to be heard more clearly.",
  "When you mute yourself, your voice stays muted in the session recording too.",
  "Billable time is rounded to your chosen increment and locked in when a session ends; you can set your defaults under billing settings.",
  "Time-alert controls use clearer labels so you know what the alert does.",
  "Drawing style controls now show only the options that apply to the tool you're using — no more sliders that don't change pencil strokes.",
  "When you have more board tabs than fit on screen, you can scroll to reach the rest.",
  "Friendlier messages throughout — clearer saving status, reconnection text, error screens with a way forward, and plain-language notes when something is still preparing.",
  "If the app hits a loading glitch after an update, it tries to recover on its own instead of leaving you stuck.",
  "Your recording is better protected if you accidentally close the browser tab mid-session and come back to finish.",
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
    title: "Student microphone boost — final check",
    body: "Students can adjust their own mic volume in the app; we're doing one more round of real two-device testing to make sure tutors consistently hear the boost before we call this fully done.",
  },
  {
    title: "Status badge during a session",
    body: "The top bar can still say \"LIVE\" even when you're waiting for a student or paused — we're wiring it to show the real session state.",
  },
  {
    title: "Connection status visibility",
    body: "When sync is having trouble, the indicator can be hard to see; we're making that more obvious so you're not left guessing.",
  },
  {
    title: "In-person sessions — waiting message",
    body: "Starting an in-person session can still show copy meant for waiting on a remote student; we're fixing that wording.",
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
