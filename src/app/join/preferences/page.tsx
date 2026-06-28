/**
 * /join/preferences — Learner sub-options (visual-first).
 *
 * Display name preview, device defaults, accessibility toggles.
 * Persistence wiring is a follow-up once learner-profile prefs land.
 *
 * [WB-JOIN-ADULT-LEARNER]: Also accepts an account-holder session so a
 * self-learner who lands here after login doesn't get bounced to /students/login.
 */

import { redirect } from "next/navigation";
import { StudentPreferencesClient } from "@/components/student/StudentPreferencesClient";
import {
  getLearnerSessionFromHeaders,
  getAccountHolderSessionFromHeaders,
} from "@/lib/server-session";
import { db } from "@/lib/db";

export default async function StudentPreferencesPage() {
  // Path A: standard learner session.
  const learnerSession = await getLearnerSessionFromHeaders();
  if (learnerSession) {
    const profile = await db.learnerProfile.findUnique({
      where: { id: learnerSession.learnerProfileId },
      select: { displayName: true },
    });
    return (
      <StudentPreferencesClient initialDisplayName={profile?.displayName ?? "Student"} />
    );
  }

  // Path B: account-holder session (self-learner path — [WB-JOIN-ADULT-LEARNER]).
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
    return <StudentPreferencesClient initialDisplayName={displayName} />;
  }

  redirect("/students/login?returnTo=/join/preferences");
}
