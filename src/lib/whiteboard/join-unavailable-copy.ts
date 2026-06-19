export type JoinUnavailableReason =
  | "session_ended"
  | "token_revoked"
  | "token_expired"
  | "link_invalid";

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
    default:
      return {
        title: "This link isn’t usable anymore",
        body: `The session may have ended, or the link was copied incorrectly. Ask ${tutorName} for a fresh link.`,
      };
  }
}
