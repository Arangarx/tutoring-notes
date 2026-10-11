import "server-only";

import { sendPlatformMail } from "@/lib/email";
import { formatOrgRoleList } from "@/lib/org-role-label";
import { normalizeEmail } from "@/lib/normalize-email";
import { isPlaywrightHarnessActive } from "@/lib/playwright-harness";
import { writeHarnessMailUrl } from "@/lib/playwright-harness-mail";
import { getRequestBaseUrlSafeFromHeaders } from "@/lib/public-url";
import type { OrgRole } from "@prisma/client";

/**
 * Staff invite email. The screen calls this after createOrgInvite.
 * Does not log the token or the address.
 */
export async function sendOrgInviteEmail(input: {
  to: string;
  organizationName: string;
  roles: OrgRole[];
  rawToken: string;
}): Promise<{ sent: boolean }> {
  const base = await getRequestBaseUrlSafeFromHeaders();
  const url = `${base.replace(/\/$/, "")}/org-invite/${input.rawToken}`;
  const roleText = formatOrgRoleList(input.roles);
  const subject = `Invitation to ${input.organizationName}`;
  const text = [
    `You are invited to ${input.organizationName} as ${roleText}.`,
    "",
    "Open this link to respond:",
    url,
    "",
    "If you were not expecting this invitation, you can ignore this email.",
  ].join("\n");

  if (isPlaywrightHarnessActive()) {
    writeHarnessMailUrl("org-invite", input.to, url);
    return { sent: true };
  }

  const result = await sendPlatformMail({
    to: normalizeEmail(input.to),
    subject,
    text,
  });
  return { sent: result.sent };
}
