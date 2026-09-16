export type IcsAccessAction = "feed_served" | "denied" | "error";

/** Structured ICS feed access log — never pass student names or VEVENT bodies. */
export function logIcsAccess(args: {
  tokenPrefix: string;
  action: IcsAccessAction;
  adminUserId?: string;
}): void {
  const adminPart =
    args.adminUserId != null ? ` adminUserId=${args.adminUserId}` : "";
  console.log(
    `[ics] ics=${args.tokenPrefix} action=${args.action}${adminPart}`
  );
}
