import Link from "next/link";
import { redirect } from "next/navigation";

import { AccountPageShell } from "@/components/account/AccountPageShell";
import { SectionCard } from "@/components/SectionCard";
import { CopyableLearnerHandle } from "@/components/account/CopyableLearnerHandle";
import { ParentJoinGapCallout } from "@/components/account/ParentJoinGapCallout";
import { StudentAvatar } from "@/components/admin/StudentAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { formatLearnerLoginHandle } from "@/lib/family-id";
import { requireAccountHolderSession } from "@/lib/server-session";

import { AddLearnerForm } from "./AddLearnerForm";

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

  const childProfiles = learnerProfiles.filter((p) => !p.isSelfLearner);
  const hasChildren = childProfiles.length > 0;
  /** Children who can't join via PIN — parent also can't join as them yet. */
  const childrenWithoutOwnLogin = childProfiles.filter((p) => !p.credential);

  const sectionTitle = hasChildren
    ? "Your learners"
    : isSelfLearner
      ? "Your learner profile"
      : "Learners";
  const sectionDescription = hasChildren
    ? `${learnerProfiles.length} ${learnerProfiles.length !== 1 ? "learners" : "learner"} linked to your account.`
    : isSelfLearner
      ? "You are set up as a learner on this account."
      : "Add a learner, or wait for your tutor to send you a claim link.";

  return (
    <AccountPageShell
      title={greeting}
      eyebrow={
        <p className="label-mono m-0 text-accent-text">Family account</p>
      }
      description={
        hasChildren
          ? "Manage your learners' tutoring access, notes, and privacy."
          : "Your account."
      }
      userEmail={email}
    >
      {childrenWithoutOwnLogin.length > 0 ? (
        <ParentJoinGapCallout />
      ) : null}

      <SectionCard realm="account"
        title={sectionTitle}
        description={sectionDescription}
        className="rounded-[10px] border-border border-l-[3px] border-l-accent bg-accent-soft/35 shadow-sm"
      >
        {learnerProfiles.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            <p>
              {"You haven't added any learners yet. Click "}
              <strong>{"Add learner"}</strong>
              {" to create one, or wait for your tutor to send a claim link."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[10px] border border-border bg-background">
            <ul role="list">
              {learnerProfiles.map((profile) => (
                <li
                  key={profile.id}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40 sm:grid-cols-[auto_1fr_auto_auto]"
                >
                  <StudentAvatar name={profile.displayName} size="sm" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {profile.displayName}
                      </p>
                      {profile.isSelfLearner ? (
                        <Badge variant="outline" className="font-mono text-[10px] uppercase">
                          You
                        </Badge>
                      ) : null}
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] uppercase text-muted-foreground"
                      >
                        {profile.accessMode === "child_pin_required"
                          ? "Own login"
                          : "Guardian picks"}
                      </Badge>
                    </div>
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
                      <p className="mt-1 text-xs text-muted-foreground">
                        {profile.credential
                          ? profile.credential.username
                          : "No login set up yet"}
                      </p>
                    )}
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="shrink-0 rounded-full"
                  >
                    <Link href={`/account/children/${profile.id}`}>Manage</Link>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 border-t border-border pt-4">
          <AddLearnerForm />
        </div>
      </SectionCard>

      {childProfiles.some((p) => p.credential) ? (
        <div className="rounded-[10px] border-l-[3px] border-accent bg-accent-soft px-4 py-3 text-sm text-foreground">
          <p className="text-[10px] font-mono font-semibold uppercase tracking-widest text-accent-text">
            Child sign-in
          </p>
          <p className="mt-2">
            {"Your child signs in on their own device using "}
            <strong>{"username@" + (familyId ?? "familyid")}</strong>
            {" + PIN — it's a completely separate login from yours. No need to log out."}
          </p>
          <p className="mt-2">
            <Link
              href="/students/login"
              className="font-medium text-accent-text underline-offset-2 hover:underline"
            >
              Go to the student login page
            </Link>
          </p>
        </div>
      ) : null}

      <SectionCard realm="account"
        title="Account"
        description="Your email and security settings."
        className="rounded-[10px] border-border shadow-sm"
      >
        <div className="divide-y divide-border rounded-[10px] border border-border bg-background text-sm">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-muted-foreground">Email</span>
            <span className="break-all text-right font-medium text-foreground">{email}</span>
          </div>
          {displayName ? (
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium text-foreground">{displayName}</span>
            </div>
          ) : null}
        </div>
        <div className="mt-4">
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href="/account/forgot-password">Change password</Link>
          </Button>
        </div>
      </SectionCard>
    </AccountPageShell>
  );
}
