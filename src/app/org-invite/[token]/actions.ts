"use server";

import { redirect } from "next/navigation";
import { acceptOrgInvite } from "@/lib/org-scope";

export async function acceptOrgInviteAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const result = await acceptOrgInvite(token);
  if (!result.ok) redirect("/org-invite/unavailable");
  redirect(result.refreshSession ? "/org-invite/accepted?refresh=1" : "/org-invite/accepted");
}
