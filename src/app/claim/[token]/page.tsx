import { hashToken } from "@/lib/crypto/session-tokens";
import { db } from "@/lib/db";
import { getAccountHolderSessionFromHeaders } from "@/lib/server-session";
import { MynkWordmark } from "@/components/auth/MynkWordmark";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ClaimAuthGate } from "./ClaimAuthGate";
import { ClaimInterstitial } from "./ClaimInterstitial";

export const dynamic = "force-dynamic";

type ClaimState = "INVALID" | "EXPIRED" | "REVOKED" | "COMPLETE" | "PENDING";

interface InviteData {
  id: string;
  studentName: string;
  tutorName: string | null;
  tutorAdminUserId: string;
  expiresAt: Date;
  state: ClaimState;
}

async function resolveInvite(rawToken: string): Promise<InviteData | null> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const invite = await db.studentClaimInvite.findUnique({
    where: { tokenHash },
    include: {
      student: { select: { name: true } },
      adminUser: { select: { displayName: true } },
    },
  });

  if (!invite) return null;

  let state: ClaimState;
  if (invite.claimedAt) {
    state = "COMPLETE";
  } else if (invite.revokedAt) {
    state = "REVOKED";
  } else if (invite.expiresAt < now) {
    console.log(`[clm] clm=${invite.id} action=expired_on_read`);
    state = "EXPIRED";
  } else {
    console.log(`[clm] clm=${invite.id} action=viewed`);
    state = "PENDING";
  }

  return {
    id: invite.id,
    studentName: invite.student.name,
    tutorName: invite.adminUser.displayName ?? null,
    tutorAdminUserId: invite.adminUserId,
    expiresAt: invite.expiresAt,
    state,
  };
}

function ClaimShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[440px]">
        <div className="mb-6 flex justify-center">
          <MynkWordmark />
        </div>
        {children}
      </div>
    </main>
  );
}

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = await params;

  const invite = await resolveInvite(rawToken);

  // INVALID
  if (!invite) {
    return (
      <ClaimShell>
        <Card className="border-border shadow-sm">
          <CardHeader className="gap-2 pb-0">
            <CardTitle className="heading text-2xl font-normal">Link not found</CardTitle>
            <CardDescription className="text-base">
              This claim link is invalid or has already been used.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Ask your tutor to send a new claim link if you haven&apos;t connected yet.
            </p>
          </CardContent>
        </Card>
      </ClaimShell>
    );
  }

  // EXPIRED
  if (invite.state === "EXPIRED") {
    return (
      <ClaimShell>
        <Card className="border-border shadow-sm">
          <CardHeader className="gap-2 pb-0">
            <CardTitle className="heading text-2xl font-normal">Link expired</CardTitle>
            <CardDescription className="text-base">
              {"This claim link for "}
              <strong>{invite.studentName}</strong>
              {" is no longer valid."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              {`Claim links are valid for 7 days. Ask${invite.tutorName ? ` ${invite.tutorName}` : " your tutor"} to send a fresh one.`}
            </p>
          </CardContent>
        </Card>
      </ClaimShell>
    );
  }

  // REVOKED
  if (invite.state === "REVOKED") {
    return (
      <ClaimShell>
        <Card className="border-border shadow-sm">
          <CardHeader className="gap-2 pb-0">
            <CardTitle className="heading text-2xl font-normal">Link no longer valid</CardTitle>
            <CardDescription className="text-base">
              This claim link has been cancelled.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              {`If you still need to connect ${invite.studentName}'s account, ask${invite.tutorName ? ` ${invite.tutorName}` : " your tutor"} for a new link.`}
            </p>
          </CardContent>
        </Card>
      </ClaimShell>
    );
  }

  // COMPLETE
  if (invite.state === "COMPLETE") {
    return (
      <ClaimShell>
        <Card className="border-border shadow-sm">
          <CardHeader className="gap-2 pb-0">
            <CardTitle className="heading text-2xl font-normal">Already connected</CardTitle>
            <CardDescription className="text-base">
              {`${invite.studentName}'s account has already been claimed.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              {"Sign in to your parent account to manage "}
              <strong>{invite.studentName}</strong>.
            </p>
            <a
              href="/account/login"
              className="mt-4 inline-block text-sm text-brand underline-offset-2 hover:underline"
            >
              {"Sign in to your account \u2192"}
            </a>
          </CardContent>
        </Card>
      </ClaimShell>
    );
  }

  // PENDING -- check for existing session (identity interstitial path).
  const ahSession = await getAccountHolderSessionFromHeaders();

  let signedInEmail: string | null = null;
  let ownedProfiles: Array<{ id: string; displayName: string; isSelfLearner: boolean }> = [];

  if (ahSession) {
    const ah = await db.accountHolder.findUnique({
      where: { id: ahSession.accountHolderId },
      select: {
        email: true,
        tombstonedAt: true,
        isSelfLearner: true,
        learnerProfiles: {
          where: { tombstonedAt: null },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            displayName: true,
            isSelfLearner: true,
            // IAC-3: filter out profiles already connected to this tutor's student
            students: {
              where: { adminUserId: invite.tutorAdminUserId },
              select: { id: true },
            },
          },
        },
      },
    });
    if (ah && !ah.tombstonedAt) {
      signedInEmail = ah.email;
      // IAC-3: only show profiles NOT already linked to this tutor
      ownedProfiles = ah.learnerProfiles
        .filter((p) => p.students.length === 0)
        .map((p) => ({ id: p.id, displayName: p.displayName, isSelfLearner: p.isSelfLearner }));
    }
  }

  return (
    <ClaimShell>
      <Card className="border-border shadow-sm">
        <CardHeader className="gap-2 pb-0">
          <CardTitle className="heading text-2xl font-normal">
            {"Connect "}
            {invite.studentName}
          </CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            {invite.tutorName
              ? `${invite.tutorName} invited you to connect ${invite.studentName}'s tutoring account.`
              : `You've been invited to connect ${invite.studentName}'s tutoring account.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {signedInEmail ? (
            // Case C: already signed in -- IDENTITY INTERSTITIAL (IAC-3 HARD requirement)
            <ClaimInterstitial
              rawToken={rawToken}
              studentName={invite.studentName}
              tutorName={invite.tutorName}
              signedInEmail={signedInEmail}
              ownedProfiles={ownedProfiles}
            />
          ) : (
            // Case A/B: not signed in -- show signup or login
            <ClaimAuthGate
              rawToken={rawToken}
              studentName={invite.studentName}
              tutorName={invite.tutorName}
            />
          )}
        </CardContent>
      </Card>
    </ClaimShell>
  );
}
