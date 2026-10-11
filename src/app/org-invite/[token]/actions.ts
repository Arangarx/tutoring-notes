"use server";

import { redirect } from "next/navigation";
import { acceptOrgInvite, readOrgInviteForHolder } from "@/lib/org-scope";

export async function acceptOrgInviteAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const result = await acceptOrgInvite(token);
  if (!result.ok) {
    const view = await readOrgInviteForHolder(token);
    if (view.kind === "expired" || view.kind === "revoked" || view.kind === "already_used") {
      redirect(`/org-invite/${encodeURIComponent(token)}`);
    }
    redirect("/org-invite/unavailable");
  }
  redirect(result.refreshSession ? "/org-invite/accepted?refresh=1" : "/org-invite/accepted");
}
