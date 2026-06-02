/**
 * /join — Learner landing page (post-login destination).
 *
 * After a successful student login, the child is redirected here.
 * Full live-session join wiring is a later phase; this is a
 * holding-pattern page that confirms the login worked.
 *
 * Auth: gated by getLearnerSession() — redirects to /students/login
 * if no learner session is present. Middleware does NOT gate /join
 * (the page handles auth itself, keeping middleware minimal).
 */

import { redirect } from "next/navigation";
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

  const displayName = profile?.displayName ?? "learner";

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[420px] space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="heading text-2xl font-normal text-foreground">
            {"You're signed in, "}
            <span className="font-semibold">{displayName}</span>
            {"!"}
          </h1>
          <p className="text-base text-muted-foreground">
            Your tutor will start the session here. Hang tight!
          </p>
        </div>

        <div className="rounded-md border border-border bg-muted/40 px-6 py-5 text-sm text-muted-foreground">
          <p>{"Waiting for your tutor to begin…"}</p>
        </div>
      </div>
    </main>
  );
}
