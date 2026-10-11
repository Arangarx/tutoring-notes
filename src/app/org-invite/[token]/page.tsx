import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { OrgInviteCard } from "@/components/org/OrgInviteCard";
import { authOptions } from "@/auth-options";
import { normalizeEmail } from "@/lib/normalize-email";
import { readOrgInviteForHolder } from "@/lib/org-scope";

export const dynamic = "force-dynamic";

export default async function OrgInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await readOrgInviteForHolder(token);
  if (view.kind === "unavailable") redirect("/org-invite/unavailable");

  const session = await getServerSession(authOptions);
  const sessionEmail = session?.user?.email ? normalizeEmail(session.user.email) : null;

  return <OrgInviteCard token={token} view={view} sessionEmail={sessionEmail} />;
}
