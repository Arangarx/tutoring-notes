import Link from "next/link";
import { notFound } from "next/navigation";

import { AccountPageShell } from "@/components/account/AccountPageShell";
import { AccountSectionCard } from "@/components/account/AccountSectionCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";
import { requireAccountHolderSession } from "@/lib/server-session";

import { AccountChildNav } from "../AccountChildNav";
import { DeviceRevokeButtons } from "./DeviceRevokeButtons";

export const dynamic = "force-dynamic";

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} ${diffMonths !== 1 ? "months" : "month"} ago`;
}

function parseDeviceInfo(deviceInfo: string | null): string {
  if (!deviceInfo) return "Unknown device";
  if (/iPhone|iPad|iPod/i.test(deviceInfo)) return "Apple iOS device";
  if (/Android/i.test(deviceInfo)) return "Android device";
  if (/Mac/i.test(deviceInfo)) return "Mac";
  if (/Windows/i.test(deviceInfo)) return "Windows PC";
  if (/Linux/i.test(deviceInfo)) return "Linux device";
  return deviceInfo.substring(0, 40);
}

export default async function ChildDevicesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await requireAccountHolderSession(`/account/children/${id}/devices`);

  const accountHolder = await db.accountHolder.findUnique({
    where: { id: session.accountHolderId },
    select: { email: true },
  });

  await assertOwnsLearnerProfile(session.accountHolderId, id);

  const profile = await db.learnerProfile.findUnique({
    where: { id },
    select: {
      displayName: true,
      deviceSessions: {
        where: { revokedAt: null },
        orderBy: { lastSeenAt: "desc" },
        select: {
          id: true,
          deviceInfo: true,
          lastSeenAt: true,
          createdAt: true,
          expiresAt: true,
        },
      },
    },
  });

  if (!profile) notFound();

  return (
    <AccountPageShell
      title={`${profile.displayName}\u2019s devices`}
      description="Devices where your child is currently signed in."
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
      <AccountChildNav learnerId={id} />

      <AccountSectionCard
        title="Active sessions"
        className="rounded-[10px] border-border shadow-sm"
        description={
          profile.deviceSessions.length === 0
            ? "No active device sessions."
            : `${profile.deviceSessions.length} active ${profile.deviceSessions.length !== 1 ? "sessions" : "session"}.`
        }
        actions={
          profile.deviceSessions.length > 1 ? (
            <DeviceRevokeButtons learnerProfileId={id} mode="all" label="Revoke all" />
          ) : profile.deviceSessions.length === 1 ? (
            <Badge className="bg-accent-soft text-accent-text font-mono text-[10px] uppercase">
              1 active
            </Badge>
          ) : null
        }
      >
        {profile.deviceSessions.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            Your child is not signed in on any devices.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[10px] border border-border bg-background">
            <ul role="list">
              {profile.deviceSessions.map((device) => (
                <li
                  key={device.id}
                  className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 last:border-b-0"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-foreground">
                      {parseDeviceInfo(device.deviceInfo)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {`Last seen: ${formatRelativeTime(device.lastSeenAt)} \u00b7 First signed in: ${formatRelativeTime(device.createdAt)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {`Expires: ${device.expiresAt.toLocaleDateString()}`}
                    </p>
                  </div>
                  <DeviceRevokeButtons
                    learnerProfileId={id}
                    sessionId={device.id}
                    mode="one"
                    label="Revoke"
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </AccountSectionCard>

      <Alert className="rounded-[10px] border-l-[3px] border-accent bg-accent-soft">
        <AlertTitle className="text-accent-text">Security tip</AlertTitle>
        <AlertDescription className="text-foreground">
          <p>
            Revoking a device signs your child out immediately. They&apos;ll need to log in
            again with their username and PIN on that device.
          </p>
          <p className="mt-2">
            {"If a device is lost or shared, revoke it right away. If you think the PIN was compromised, also "}
            <Link
              href={`/account/children/${id}`}
              className="font-medium text-accent-text underline-offset-2 hover:underline"
            >
              change the PIN
            </Link>
            .
          </p>
        </AlertDescription>
      </Alert>
    </AccountPageShell>
  );
}
