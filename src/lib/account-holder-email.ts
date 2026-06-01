/**
 * AccountHolder realm email stubs — P2a ships with stubbed send.
 *
 * P2a STUB: emails are NOT sent to a real provider. Instead, the link is
 * logged with [ahx] or [clm] prefix so developers can click it in server
 * logs during smoke testing. The TODO below marks the P2b wiring point.
 *
 * TODO P2b: replace stubSendAccountHolderEmail with real Resend/Postmark send.
 *   See docs/handoff/identity-phase2-auth-session-design-2026-06-01.md §3.3 (Q-9).
 *   Wrap in the same sendable interface so call sites are unchanged.
 */

export interface AccountHolderEmailPayload {
  to: string;
  subject: string;
  /** Plain-text email body. */
  text: string;
  /** The clickable link to include in the email (also logged). */
  actionUrl: string;
}

/**
 * Stub email sender for AccountHolder realm (P2a).
 * Logs the link to server console instead of sending real email.
 * Returns { sent: true } so call sites don't need to special-case the stub.
 */
export async function stubSendAccountHolderEmail(
  payload: AccountHolderEmailPayload
): Promise<{ sent: boolean }> {
  console.log(
    `[ahx] EMAIL_STUB to=${payload.to} subject="${payload.subject}" link=${payload.actionUrl}`
  );
  return { sent: true };
}

/**
 * Stub email sender for claim-flow emails.
 * Logs the invite link so the tutor (developer in P2a) can test the flow.
 */
export async function stubSendClaimInviteEmail(
  to: string,
  inviteUrl: string,
  studentName: string
): Promise<{ sent: boolean }> {
  console.log(
    `[clm] EMAIL_STUB to=${to} student="${studentName}" inviteLink=${inviteUrl}`
  );
  return { sent: true };
}
