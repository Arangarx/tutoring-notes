/**
 * /join — Learner landing (no active session context).
 *
 * Shown when a logged-in learner arrives at /join without a session ID
 * (e.g. the default login returnTo). The real mutual waiting room lives at
 * /join/<sessionId>#k= — students reach it by following the link their
 * tutor shares. This page gives an honest, non-misleading message; it does
 * NOT show a fake camera preview or imply a tutor will "let them in".
 *
 * A child learner's home is this page: upcoming sessions (including the
 * empty state), their own past notes and replays, PIN change, and the
 * four consent switches they can only turn off.
 *
 * [WB-JOIN-ADULT-LEARNER]: Also accepts an account-holder session so a
 * self-learner who lands here after login doesn't get bounced to /students/login.
 */

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LearnerSignOutButton } from "@/components/student/LearnerSignOutButton";
import { PageShell } from "@/components/PageShell";
import {
  getLearnerSessionFromHeaders,
  getAccountHolderSessionFromHeaders,
} from "@/lib/server-session";
import { UpcomingSessionsCard } from "@/components/scheduling/UpcomingSessionsCard";
import { ParentShareNoteCard } from "@/components/notes/ParentShareNoteCard";
import { ChildConsentSettings } from "@/components/consent/ChildConsentSettings";
import { ChangePinForm } from "@/app/account/children/[id]/ChangePinForm";
import { db } from "@/lib/db";
import { listUpcomingForLearnerProfiles } from "@/lib/scheduling/upcoming-sessions";
import { loadLearnerHomeNotes } from "@/lib/learner-home-notes";
import { readChildConsentFacing } from "@/lib/child-consent";

export default async function JoinPage() {
  // Path A: standard learner session.
  const learnerSession = await getLearnerSessionFromHeaders();
  if (learnerSession) {
    const learnerProfileId = learnerSession.learnerProfileId;
    const [profile, upcomingSessions, homeNotes, consent] = await Promise.all([
      db.learnerProfile.findUnique({
        where: { id: learnerProfileId },
        select: { displayName: true, isSelfLearner: true },
      }),
      listUpcomingForLearnerProfiles([learnerProfileId]),
      loadLearnerHomeNotes(learnerProfileId),
      readChildConsentFacing(learnerProfileId),
    ]);
    const childHome = profile?.isSelfLearner === false;
    return (
      <JoinNoSessionCard
        displayName={profile?.displayName ?? "Student"}
        actions={<LearnerSignOutButton />}
        upcomingSessions={upcomingSessions}
        notes={homeNotes.notes}
        extra={
          childHome ? (
            <>
              <Card className="w-full rounded-[10px] border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-[15px] font-semibold">Your PIN</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ChangePinForm learnerProfileId={learnerProfileId} requireCurrentPin />
                </CardContent>
              </Card>
              <Card className="w-full rounded-[10px] border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-[15px] font-semibold">Privacy</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ChildConsentSettings
                    ceiling={consent.ceiling}
                    effective={consent.effective}
                    restoredByParent={consent.restoredByParent}
                  />
                </CardContent>
              </Card>
            </>
          ) : null
        }
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
  notes,
  extra,
}: {
  displayName: string;
  actions?: ReactNode;
  upcomingSessions?: Awaited<ReturnType<typeof listUpcomingForLearnerProfiles>>;
  notes?: Awaited<ReturnType<typeof loadLearnerHomeNotes>>["notes"];
  extra?: ReactNode;
}) {
  return (
    <PageShell realm="student" actions={actions}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-8">
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
        <UpcomingSessionsCard
          mode="family"
          realm="student"
          sessions={upcomingSessions}
          description="Join opens shortly before each scheduled start."
        />
        {notes ? (
          <Card className="w-full rounded-[10px] border-border" data-testid="child-session-notes">
            <CardHeader className="pb-2">
              <CardTitle className="text-[15px] font-semibold">Session notes</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No session notes yet.</p>
              ) : (
                <div className="grid gap-3">
                  {notes.map((note) => (
                    <ParentShareNoteCard
                      key={note.id}
                      token={note.token}
                      replaySessionIds={note.replaySessionIds}
                      replayHref={(whiteboardSessionId) =>
                        `/join/notes/${whiteboardSessionId}/whiteboard`
                      }
                      dateLabel={note.dateLabel}
                      note={note.note}
                      isNew={false}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
        {extra}
      </div>
    </PageShell>
  );
}
