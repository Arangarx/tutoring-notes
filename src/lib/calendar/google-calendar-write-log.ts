export type GcwAction =
  | "insert_start"
  | "insert_success"
  | "insert_error"
  | "insert_linked"
  | "patch_start"
  | "patch_success"
  | "patch_error"
  | "delete_start"
  | "delete_success"
  | "delete_error"
  | "invalid_grant"
  | "persist_error"
  | "connect_backfill";

/** Structured Google Calendar write log — no student names or event bodies. */
export function logGcw(args: {
  adminUserId: string;
  sessionId: string;
  action: GcwAction;
  googleEventId?: string | null;
  detail?: string;
}): void {
  const eventPart =
    args.googleEventId != null && args.googleEventId !== ""
      ? ` googleEventId=${args.googleEventId}`
      : "";
  const detailPart = args.detail ? ` detail=${args.detail.replace(/\s+/g, "_")}` : "";
  console.log(
    `[gcw] adminUserId=${args.adminUserId} sessionId=${args.sessionId} action=${args.action}${eventPart}${detailPart}`
  );
}
