import Link from "next/link";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireAccountHolderSession } from "@/lib/server-session";
import { AccountPageShell } from "@/components/account/AccountPageShell";
import { AccountSectionCard } from "@/components/account/AccountSectionCard";
import { CopyableLearnerHandle } from "@/components/account/CopyableLearnerHandle";
import { Button } from "@/components/ui/button";
import { formatLearnerLoginHandle } from "@/lib/family-id";

export const dynamic = "force-dynamic";

export default async function AccountDashboardPage() {
  const session = await requireAccountHolderSession("/account/dashboard");

  const accountHolder = await db.accountHolder.findUnique({
    where: { id: session.accountHolderId },
    select: {
      email: true,
      displayName: true,
      isSelfLearner: true,
      familyId: true,
      learnerProfiles: {
        where: { tombstonedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          displayName: true,
          accessMode: true,
          isSelfLearner: true,
          createdAt: true,
          credential: { select: { username: true } },
          students: { select: { name: true }, take: 1 },
        },
      },
    },
  });

  if (!accountHolder) {
    redirect("/account/login");
  }

  const { email, displayName, isSelfLearner, familyId, learnerProfiles } = accountHolder;
  const greeting = displayName ? `Welcome back, ${displayName}` : "Your account";

  // IAC-12: show guardian/child framing only when the account has child learner profiles.
  // Fresh accounts and self-learner-only accounts get neutral copy.
  const childProfiles = learnerProfiles.filter((p) => !p.isSelfLearner);
  const hasChildren = childProfiles.length > 0;

  const sectionTitle = hasChildren ? "Your learners" : (isSelfLearner ? "Your learner profile" : "Learners");
  const sectionDescription = hasChildren
    ? `${learnerProfiles.length} ${learnerProfiles.length !== 1 ? "learners" : "learner"} linked to your account.`
    : isSelfLearner
    ? "You are set up as a learner on this account."
    : "No learners linked yet. Your tutor will send you a link to connect.";

  return (
    <AccountPageShell
      title={greeting}
      description={hasChildren ? "Manage your learners' tutoring access." : "Your account."}
      userEmail={email}
    >
      <AccountSectionCard
        title={sectionTitle}
        description={sectionDescription}
      >
        {learnerProfiles.length === 0 ? (
          <div className="py-4 text-sm text-muted-foreground">
            <p>
              When your tutor sends you a claim link, click it to connect a learner
              to your account. You&apos;ll then be able to manage their login and session access
              from here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border" role="list">
            {learnerProfiles.map((profile) => (
              <li key={profile.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {profile.displayName}
                      {profile.isSelfLearner ? (
                        <span className="ml-2 text-xs text-muted-foreground font-normal">(you)</span>
                      ) : null}
                    </p>
                    {profile.credential && familyId ? (
                      <CopyableLearnerHandle
                        className="mt-2"
                        loginHandle={formatLearnerLoginHandle(
                          profile.credential.username,
                          familyId
                        )}
                        label="Login handle"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {profile.credential
                          ? profile.credential.username
                          : "No login set up yet"}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-muted-foreground">
                      {profile.accessMode === "child_pin_required"
                        ? "Uses own PIN"
                        : "Account holder selects"}
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

      {/* IAC-11-I / IAC-12: child login independence copy — only shown when child learners have credentials */}
      {childProfiles.some((p) => p.credential) ? (
        <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <p>
            {"Your child signs in on their own device using "}
            <strong>{"username@" + (familyId ?? "familyid")}</strong>
            {" + PIN — it's a completely separate login from yours. No need to log out."}
          </p>
          <p className="mt-1">
            {"Go to "}
            <a
              href="/students/login"
              className="text-brand underline-offset-2 hover:underline"
            >
              the student login page
            </a>
            {"."}
          </p>
        </div>
      ) : null}

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
