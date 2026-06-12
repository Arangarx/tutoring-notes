import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { hashToken } from "@/lib/crypto/session-tokens";
import { db } from "@/lib/db";
import { getAccountHolderSession } from "@/lib/account-holder-session";
import { isConsentEnforcementEnabled } from "@/lib/consent-scope";
import { MynkWordmark } from "@/components/auth/MynkWordmark";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CredentialSetupForm } from "./CredentialSetupForm";
import { ConsentSetupForm } from "./ConsentSetupForm";

export const dynamic = "force-dynamic";

export default async function ClaimSetupPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = await params;

  const headersList = await headers();
  const cookieHeader = headersList.get("cookie") ?? "";
  const ahSession = await getAccountHolderSession(
    new Request("http://localhost/", { headers: { cookie: cookieHeader } }),
  );

  if (!ahSession) {
    redirect(`/account/login?returnTo=/claim/${rawToken}/setup`);
  }

  const tokenHash = hashToken(rawToken);
  const invite = await db.studentClaimInvite.findUnique({
    where: { tokenHash },
    include: {
      student: {
        include: {
          learnerProfile: {
            include: {
              credential: { select: { id: true } },
            },
          },
        },
      },
      adminUser: { select: { displayName: true, id: true } },
    },
  });

  // Only the AccountHolder who claimed it may see this page
  if (
    !invite ||
    !invite.claimedAt ||
    invite.claimedByAccountHolderId !== ahSession.accountHolderId
  ) {
    redirect("/account/dashboard");
  }

  const profile = invite.student.learnerProfile;
  if (!profile) {
    redirect("/account/dashboard");
  }

  const credentialAlreadySet = !!profile.credential;
  const enforcementEnabled = isConsentEnforcementEnabled();

  // Check if a ConsentRecord already exists for this (learner, tutor) pair
  const existingConsent = await db.consentRecord.findFirst({
    where: {
      learnerProfileId: profile.id,
      adminUserId: invite.adminUserId,
    },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  const consentAlreadySaved = !!existingConsent;

  return (
    <main className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[480px]">
        <div className="mb-6 flex justify-center">
          <MynkWordmark />
        </div>

        {/* Success banner */}
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
          <p className="text-sm font-medium text-green-800 dark:text-green-300">
            {"Account connected! "}
            <strong>{invite.student.name}</strong>
            {" is now linked to your Mynk account."}
          </p>
        </div>

        {/* Panel A: Parental consent preferences (B2) */}
        <Card className="mb-4 border-border shadow-sm">
          <CardHeader className="gap-1 pb-0">
            <CardTitle className="heading text-lg font-normal">
              Privacy preferences
            </CardTitle>
            <CardDescription className="text-sm">
              {consentAlreadySaved
                ? "Your preferences have been saved. You can update them from your account dashboard."
                : `Control what ${invite.student.name}'s tutor may record and share.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {consentAlreadySaved ? (
              <div className="rounded-md border border-border bg-muted/40 p-4">
                <p className="text-sm font-medium text-foreground">
                  ✓ Preferences saved
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  You can update these preferences any time from your account dashboard.
                </p>
              </div>
            ) : (
              <ConsentSetupForm
                rawToken={rawToken}
                studentName={invite.student.name}
                enforcementEnabled={enforcementEnabled}
              />
            )}
          </CardContent>
        </Card>

        {/* Panel B: Child credential setup (username + PIN) */}
        <Card className="border-border shadow-sm">
          <CardHeader className="gap-1 pb-0">
            <CardTitle className="heading text-xl font-normal">
              {"Set up "}
              {invite.student.name}
              {"'s login"}
            </CardTitle>
            <CardDescription className="text-sm">
              {credentialAlreadySet
                ? "Login is already configured for this learner."
                : "Create a username and PIN so your child can sign in on their device."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {credentialAlreadySet ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {`${invite.student.name}'s login is already set up. You can update it from the parent dashboard.`}
                </p>
                <Link
                  href="/account/dashboard"
                  className="inline-block text-sm text-brand underline-offset-2 hover:underline"
                >
                  {"Go to dashboard \u2192"}
                </Link>
              </div>
            ) : (
              <CredentialSetupForm
                rawToken={rawToken}
                learnerProfileId={profile.id}
                studentName={invite.student.name}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
