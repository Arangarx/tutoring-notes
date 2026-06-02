import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { db } from "@/lib/db";
import { getAccountHolderSessionFromHeaders } from "@/lib/server-session";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";
import { AccountPageShell } from "@/components/account/AccountPageShell";
import { AccountSectionCard } from "@/components/account/AccountSectionCard";
import { Button } from "@/components/ui/button";
import { ChangePinForm } from "./ChangePinForm";

export const dynamic = "force-dynamic";

export default async function ChildDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getAccountHolderSessionFromHeaders();
  if (!session) {
    redirect(`/account/login?returnTo=/account/children/${id}`);
  }

  const accountHolder = await db.accountHolder.findUnique({
    where: { id: session.accountHolderId },
    select: { email: true },
  });

  // assertOwnsLearnerProfile will notFound() if not owned or tombstoned
  await assertOwnsLearnerProfile(session.accountHolderId, id);

  const fullProfile = await db.learnerProfile.findUnique({
    where: { id },
    select: {
      id: true,
      displayName: true,
      accessMode: true,
      createdAt: true,
      credential: { select: { id: true, username: true } },
      student: { select: { name: true } },
    },
  });

  if (!fullProfile) notFound();

  const activeDeviceCount = await db.learnerDeviceSession.count({
    where: { learnerProfileId: id, revokedAt: null },
  });

  return (
    <AccountPageShell
      title={fullProfile.displayName}
      userEmail={accountHolder?.email}
      eyebrow={
        <Link
          href="/account/dashboard"
          className="inline-flex min-h-11 items-center text-brand underline-offset-2 hover:underline"
        >
          {"\u2190"} Dashboard
        </Link>
      }
    >
      <AccountSectionCard title="Learner details">
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium text-foreground">{fullProfile.displayName}</dd>
          </div>
          {fullProfile.student ? (
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{"Tutor's name for this student"}</dt>
              <dd className="font-medium text-foreground">{fullProfile.student.name}</dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Login mode</dt>
            <dd className="font-medium text-foreground">
              {fullProfile.accessMode === "child_pin_required"
                ? "Child uses own username + PIN"
                : "Parent selects learner (no independent login)"}
            </dd>
          </div>
        </dl>
      </AccountSectionCard>

      <AccountSectionCard
        title="Child login"
        description={
          fullProfile.credential
            ? `Username: ${fullProfile.credential.username}`
            : "No login credentials set up yet."
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/account/children/${id}/devices`}>
              {activeDeviceCount > 0
                ? `${activeDeviceCount} ${activeDeviceCount !== 1 ? "devices" : "device"}`
                : "Devices"}
            </Link>
          </Button>
        }
      >
        {fullProfile.credential ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {"Your child signs in at "}
              <a
                href="/students/login"
                className="text-brand underline-offset-2 hover:underline"
              >
                the student login page
              </a>
              {" using their username and PIN. You don't need to log out first — your account and your child's are separate."}
            </p>
            <ChangePinForm learnerProfileId={id} />
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            <p>
              {"Set up a username and PIN in the "}
              <Link
                href="/account/dashboard"
                className="text-brand underline-offset-2 hover:underline"
              >
                claim setup flow
              </Link>
              {", or ask your tutor to resend the claim link."}
            </p>
          </div>
        )}
      </AccountSectionCard>
    </AccountPageShell>
  );
}
