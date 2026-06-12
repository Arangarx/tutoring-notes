import Link from "next/link";
import { notFound } from "next/navigation";

import { AccountPageShell } from "@/components/account/AccountPageShell";
import { AccountSectionCard } from "@/components/account/AccountSectionCard";
import { CopyableLearnerHandle } from "@/components/account/CopyableLearnerHandle";
import { StudentAvatar } from "@/components/admin/StudentAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { formatLearnerLoginHandle } from "@/lib/family-id";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";
import { isCredentialHardLocked } from "@/lib/learner-pin-rate-limit";
import { requireAccountHolderSession } from "@/lib/server-session";

import { AccountChildNav } from "./AccountChildNav";
import { ChangePinForm } from "./ChangePinForm";
import { SetupLoginForm } from "./SetupLoginForm";
import { UnlockPinButton } from "./UnlockPinButton";

export const dynamic = "force-dynamic";

export default async function ChildDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await requireAccountHolderSession(`/account/children/${id}`);

  const accountHolder = await db.accountHolder.findUnique({
    where: { id: session.accountHolderId },
    select: { email: true, familyId: true },
  });

  await assertOwnsLearnerProfile(session.accountHolderId, id);

  const fullProfile = await db.learnerProfile.findUnique({
    where: { id },
    select: {
      id: true,
      displayName: true,
      accessMode: true,
      isSelfLearner: true,
      createdAt: true,
      credential: { select: { id: true, username: true } },
      students: {
        select: {
          id: true,
          name: true,
          adminUser: {
            select: {
              displayName: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!fullProfile) notFound();

  const activeDeviceCount = await db.learnerDeviceSession.count({
    where: { learnerProfileId: id, revokedAt: null },
  });

  let isPinHardLocked = false;
  const familyId = accountHolder?.familyId;
  if (fullProfile.credential && familyId) {
    const credKey = `${familyId}:${fullProfile.credential.username}`;
    isPinHardLocked = await isCredentialHardLocked(credKey);
  }

  const loginHandle =
    fullProfile.credential && familyId
      ? formatLearnerLoginHandle(fullProfile.credential.username, familyId)
      : null;

  return (
    <AccountPageShell
      title={fullProfile.displayName}
      description="Profile, login, and quick links."
      userEmail={accountHolder?.email}
      eyebrow={
        <div className="space-y-2">
          <Link
            href="/account/dashboard"
            className="inline-flex min-h-11 items-center text-brand underline-offset-2 hover:underline"
          >
            {"\u2190"} Dashboard
          </Link>
          <p className="label-mono m-0 text-accent-text">Learner profile</p>
        </div>
      }
      actions={
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button asChild variant="accent" className="min-h-11 w-full sm:w-auto">
            <Link href={`/account/children/${id}/notes`}>Session notes</Link>
          </Button>
          {!fullProfile.isSelfLearner ? (
            <Button
              asChild
              variant="outline"
              className="min-h-11 w-full rounded-full sm:w-auto"
            >
              <Link href={`/account/children/${id}/consent`}>Privacy</Link>
            </Button>
          ) : null}
        </div>
      }
    >
      <AccountChildNav learnerId={id} />

      <div className="flex items-center gap-4 rounded-[10px] border border-accent/25 bg-accent-soft/50 p-4">
        <StudentAvatar name={fullProfile.displayName} size="lg" />
        <div className="min-w-0">
          <p className="heading text-xl font-normal text-foreground">
            {fullProfile.displayName}
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {fullProfile.accessMode === "child_pin_required"
                ? "Own login"
                : "Guardian picks"}
            </Badge>
            {activeDeviceCount > 0 ? (
              <Badge className="bg-accent-soft text-accent-text font-mono text-[10px] uppercase">
                {activeDeviceCount} active{" "}
                {activeDeviceCount !== 1 ? "devices" : "device"}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <AccountSectionCard
        title="Learner details"
        className="rounded-[10px] border-border shadow-sm"
      >
        <dl className="divide-y divide-border rounded-[10px] border border-border bg-background text-sm">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium text-foreground">{fullProfile.displayName}</dd>
          </div>
          {fullProfile.students.length > 0 ? (
            <>
              <div className="px-4 py-2.5">
                <p className="text-sm text-muted-foreground">
                  {`What each tutor calls ${fullProfile.displayName}`}
                </p>
              </div>
              {fullProfile.students.map((student) => {
                const tutorLabel =
                  student.adminUser?.displayName?.trim() ||
                  student.adminUser?.email ||
                  "Tutor";
                return (
                  <div
                    key={student.id}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <dt className="text-muted-foreground">{tutorLabel}</dt>
                    <dd className="text-right font-medium text-foreground">
                      {student.name}
                    </dd>
                  </div>
                );
              })}
            </>
          ) : null}
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-muted-foreground">Login mode</dt>
            <dd className="text-right font-medium text-foreground">
              {fullProfile.accessMode === "child_pin_required"
                ? "Child uses own username + PIN"
                : "Parent/Guardian selects learner (no independent login)"}
            </dd>
          </div>
        </dl>
      </AccountSectionCard>

      <AccountSectionCard
        title="Child login"
        description={
          fullProfile.credential
            ? "Your child signs in with the handle below and their PIN."
            : "No login credentials set up yet."
        }
        className="rounded-[10px] border-border border-l-[3px] border-l-accent shadow-sm"
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-full">
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
            {loginHandle ? (
              <CopyableLearnerHandle loginHandle={loginHandle} label="Login handle" />
            ) : null}
            <p className="text-sm text-muted-foreground">
              {"Your child signs in at "}
              <Link
                href="/students/login"
                className="text-brand underline-offset-2 hover:underline"
              >
                the student login page
              </Link>
              {" using their username and PIN — completely separate from your account."}
            </p>
            {isPinHardLocked ? <UnlockPinButton learnerProfileId={id} /> : null}
            <ChangePinForm learnerProfileId={id} />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {
                "No login set up yet. Set up a username and PIN so your learner can sign in independently on their own device."
              }
            </p>
            <SetupLoginForm
              learnerProfileId={id}
              learnerName={fullProfile.displayName}
            />
          </div>
        )}
      </AccountSectionCard>

      {!fullProfile.isSelfLearner ? (
        <AccountSectionCard
          title="Privacy & consent"
          description="Control what tutors can capture and share."
          className="rounded-[10px] border-border shadow-sm"
          actions={
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link href={`/account/children/${id}/consent`}>Manage privacy</Link>
            </Button>
          }
        >
          <p className="text-sm text-muted-foreground">
            Set per-tutor preferences for live sessions, recordings, and session notes.
            Child restrictions can narrow what you allow.
          </p>
        </AccountSectionCard>
      ) : null}
    </AccountPageShell>
  );
}
