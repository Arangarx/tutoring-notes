import Link from "next/link";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { getAccountHolderSessionFromHeaders } from "@/lib/server-session";
import { AccountPageShell } from "@/components/account/AccountPageShell";
import { AccountSectionCard } from "@/components/account/AccountSectionCard";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AccountDashboardPage() {
  const session = await getAccountHolderSessionFromHeaders();
  if (!session) {
    redirect("/account/login?returnTo=/account/dashboard");
  }

  const accountHolder = await db.accountHolder.findUnique({
    where: { id: session.accountHolderId },
    select: {
      email: true,
      displayName: true,
      learnerProfiles: {
        where: { tombstonedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          displayName: true,
          accessMode: true,
          createdAt: true,
          credential: { select: { username: true } },
          student: { select: { name: true } },
        },
      },
    },
  });

  if (!accountHolder) {
    redirect("/account/login");
  }

  const { email, displayName, learnerProfiles } = accountHolder;
  const greeting = displayName ? `Welcome back, ${displayName}` : "Your account";

  return (
    <AccountPageShell
      title={greeting}
      description="Manage your children's tutoring access."
      userEmail={email}
    >
      <AccountSectionCard
        title="Your children"
        description={
          learnerProfiles.length === 0
            ? "No children linked yet. Your tutor will send you a link to connect."
            : `${learnerProfiles.length} ${learnerProfiles.length !== 1 ? "children" : "child"} linked to your account.`
        }
      >
        {learnerProfiles.length === 0 ? (
          <div className="py-4 text-sm text-muted-foreground">
            <p>
              When your tutor sends you a claim link, click it to connect your child&apos;s
              tutoring account. You&apos;ll then be able to manage their login and session access
              from here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border" role="list">
            {learnerProfiles.map((profile) => (
              <li key={profile.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{profile.displayName}</p>
                    <p className="text-sm text-muted-foreground">
                      {profile.credential
                        ? `@${profile.credential.username}`
                        : "No login set up yet"}
                      {" \u00b7 "}
                      {profile.accessMode === "child_pin_required"
                        ? "Uses own PIN"
                        : "Parent selects"}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="shrink-0">
                    <Link href={`/account/children/${profile.id}`}>Manage</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AccountSectionCard>

      <AccountSectionCard title="Account" description="Your email and security settings.">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Email</span>
            <span className="break-all font-medium text-foreground">{email}</span>
          </div>
          {displayName ? (
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium text-foreground">{displayName}</span>
            </div>
          ) : null}
        </div>
        <div className="mt-4">
          <Button asChild variant="outline" size="sm">
            <Link href="/account/forgot-password">Change password</Link>
          </Button>
        </div>
      </AccountSectionCard>
    </AccountPageShell>
  );
}
