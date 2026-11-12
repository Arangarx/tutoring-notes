import { ENTRY_BLOCK_COPY } from "@/lib/scheduling/session-entry";

export type JoinUnavailableReason =
  | "session_ended"
  | "session_canceled"
  | "token_revoked"
  | "token_expired"
  | "link_invalid"
  /** The family turned online sessions off; this device may not stay in the room. */
  | "online_off"
  /** The server said the room is unavailable for a reason this build does not know. */
  | "unavailable";

const SERVER_REASONS: ReadonlySet<string> = new Set<JoinUnavailableReason>([
  "session_ended",
  "token_revoked",
  "token_expired",
  "online_off",
]);

/**
 * The reason behind a `{ live: false, reason }` join-timer answer. The server says the room is unavailable, so a
 * reason this build does not know is still "unavailable", never a bad link.
 */
export function joinUnavailableReasonFromServer(raw: unknown): JoinUnavailableReason {
  return typeof raw === "string" && SERVER_REASONS.has(raw) ? (raw as JoinUnavailableReason) : "unavailable";
}

export function joinUnavailableCopy(
  reason: JoinUnavailableReason,
  tutorName: string
): { title: string; body: string } {
  switch (reason) {
    case "session_ended":
      return {
        title: "Session has ended",
        body: `Your tutor ended this whiteboard. You can close this tab. If you still need something from the lesson, reach out to ${tutorName}.`,
      };
    case "session_canceled":
      return {
        title: "Session was canceled",
        body: `${tutorName} canceled this session before it started. Close this tab — your tutor will share a new link when ready.`,
      };
    case "token_revoked":
      return {
        title: "This invite link was closed",
        body: `Ask ${tutorName} for a new whiteboard link if you still need the room.`,
      };
    case "token_expired":
      return {
        title: "This invite link has expired",
        body: `Ask ${tutorName} for a new link.`,
      };
    case "online_off":
      return {
        title: "You were disconnected",
        body: ENTRY_BLOCK_COPY.live_off.family,
      };
    case "unavailable":
      return {
        title: ENTRY_BLOCK_COPY.unknown.family,
        body: `Ask ${tutorName} what to do next.`,
      };
    default:
      return {
        title: "This link isn't usable anymore",
        body: `The session may have ended, or the link was copied incorrectly. Ask ${tutorName} for a fresh link.`,
      };
  }
}
