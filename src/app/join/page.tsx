/**
 * /join — Learner landing (no active session context).
 *
 * Shown when a logged-in learner arrives at /join without a session ID
 * (e.g. the default login returnTo). The real mutual waiting room lives at
 * /join/<sessionId>#k= — students reach it by following the link their
 * tutor shares. This page gives an honest, non-misleading message; it does
 * NOT show a fake camera preview or imply a tutor will "let them in".
 */

import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { StudentPageShell } from "@/components/student/StudentPageShell";
import { getLearnerSessionFromHeaders } from "@/lib/server-session";
import { db } from "@/lib/db";

export default async function JoinPage() {
  const session = await getLearnerSessionFromHeaders();
  if (!session) {
    redirect("/students/login?returnTo=/join");
  }

  const profile = await db.learnerProfile.findUnique({
    where: { id: session.learnerProfileId },
    select: { displayName: true },
  });

  const displayName = profile?.displayName ?? "Student";

  return (
    <StudentPageShell>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
        <Card className="w-full rounded-[10px] border-border">
          <CardContent className="px-6 py-6 text-center space-y-2">
            <p className="text-base font-medium text-foreground">
              Hi, {displayName}
            </p>
            <p
              className="text-sm text-muted-foreground"
              data-testid="join-no-session-message"
            >
              No active session. Open the link your tutor shared to join.
            </p>
          </CardContent>
        </Card>
      </div>
    </StudentPageShell>
  );
}
