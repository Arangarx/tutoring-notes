/** Plain sentences for organization staff screens. Andrew reviews these in the stage 2 handoff. */

export function orgStaffErrorSentence(code: string): string {
  switch (code) {
    case "no_verified_account":
      return "That person does not have a verified teaching account.";
    case "test_account":
      return "Test accounts cannot own an organization.";
    case "invalid_name":
      return "Enter an organization name.";
    case "role_forbidden":
      return "You cannot assign that role.";
    case "empty_roles":
      return "Choose at least one role.";
    case "last_owner":
      return "This organization needs an owner.";
    case "already_member":
      return "That person is already in this organization.";
    case "daily_invite_cap":
      return "This organization has reached its invite limit for today.";
    case "max_members":
      return "This organization is full.";
    case "not_a_member":
      return "That person is not in this organization.";
    case "mail_failed":
      return "The invitation email could not be sent. Try again.";
    case "invalid_cap":
      return "Enter a daily invite limit, or choose no daily limit.";
    default:
      return "That did not work. Try again.";
  }
}

export function orgInviteReasonSentence(kind: "expired" | "revoked" | "already_used"): string {
  if (kind === "expired") return "This invitation has expired.";
  if (kind === "revoked") return "This invitation was revoked.";
  return "This invitation has already been used.";
}

export function orgStatusSentence(status: "pending" | "active" | "suspended"): string {
  if (status === "active") return "This organization is active.";
  if (status === "suspended") return "This organization is suspended.";
  return "This organization is pending. An operator activates it before new teachers are approved.";
}

export function orgInviteLimitSentence(dailyInviteCap: number | null): string {
  if (dailyInviteCap == null) return "Staff invitations are not limited per day.";
  return `Staff can send ${dailyInviteCap} invitations a day.`;
}
