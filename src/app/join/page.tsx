/**
 * /join — Learner landing (no active session context).
 *
 * Shown when a logged-in learner arrives at /join without a session ID
 * (e.g. the default login returnTo). The real mutual waiting room lives at
 * /join/<sessionId>#k= — students reach it by following the link their
 * tutor shares. This page gives an honest, non-misleading message; it does
 * NOT show a fake camera preview or imply a tutor will "let them in".
 *
 * [WB-JOIN-ADULT-LEARNER]: Also accepts an account-holder session so a
 * self-learner who lands here after login doesn't get bounced to /students/login.
 */

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LearnerSignOutButton } from "@/components/student/LearnerSignOutButton";
import { PageShell } from "@/components/PageShell";
import {
  getLearnerSessionFromHeaders,
  getAccountHolderSessionFromHeaders,
} from "@/lib/server-session";
import { UpcomingSessionsCard } from "@/components/scheduling/UpcomingSessionsCard";
import { db } from "@/lib/db";
import { listUpcomingForLearnerProfiles } from "@/lib/scheduling/upcoming-sessions";

export default async function JoinPage() {
  // Path A: standard learner session.
  const learnerSession = await getLearnerSessionFromHeaders();
  if (learnerSession) {
    const profile = await db.learnerProfile.findUnique({
      where: { id: learnerSession.learnerProfileId },
      select: { displayName: true },
    });
    const upcomingSessions = await listUpcomingForLearnerProfiles([
      learnerSession.learnerProfileId,
    ]);
    return (
      <JoinNoSessionCard
        displayName={profile?.displayName ?? "Student"}
        actions={<LearnerSignOutButton />}
        upcomingSessions={upcomingSessions}
      />
    );
  }

  // Path B: account-holder session (self-learner path — [WB-JOIN-ADULT-LEARNER]).
  // An AH who lands on /join/ is already signed in; show the "no active session"
  // message rather than redirecting to /students/login.
  const ahSession = await getAccountHolderSessionFromHeaders();
  if (ahSession) {
    const ahProfile = await db.accountHolder.findUnique({
      where: { id: ahSession.accountHolderId },
      select: { displayName: true, email: true },
    });
    const displayName =
      ahProfile?.displayName?.trim() ||
      ahProfile?.email?.split("@")[0] ||
      "Learner";
    const selfProfiles = await db.learnerProfile.findMany({
      where: {
        accountHolderId: ahSession.accountHolderId,
        isSelfLearner: true,
        tombstonedAt: null,
      },
      select: { id: true },
    });
    const upcomingSessions = await listUpcomingForLearnerProfiles(
      selfProfiles.map((p) => p.id)
    );
    return (
      <JoinNoSessionCard displayName={displayName} upcomingSessions={upcomingSessions} />
    );
  }

  // No session — redirect to child PIN login (default for unauthenticated visitors).
  redirect("/students/login?returnTo=/join");
}

function JoinNoSessionCard({
  displayName,
  actions,
  upcomingSessions = [],
}: {
  displayName: string;
  actions?: ReactNode;
  upcomingSessions?: Awaited<ReturnType<typeof listUpcomingForLearnerProfiles>>;
}) {
  return (
    <PageShell realm="student" actions={actions}>
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-8">
        <Card className="w-full rounded-[10px] border-border">
          <CardContent className="space-y-2 px-6 py-6 text-center">
            <p className="text-base font-medium text-foreground">
              Hi, {displayName}
            </p>
            <p
              className="text-sm text-muted-foreground"
              data-testid="join-no-session-message"
            >
              No active session. Open the link your tutor shared to join, or use
              Join below when your appointment window opens.
            </p>
          </CardContent>
        </Card>
        {upcomingSessions.length > 0 ? (
          <UpcomingSessionsCard
            mode="family"
            realm="student"
            sessions={upcomingSessions}
            description="Join opens shortly before each scheduled start."
          />
        ) : null}
      </div>
    </PageShell>
  );
}
