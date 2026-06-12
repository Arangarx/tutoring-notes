/**
 * /join/preferences — Learner sub-options (visual-first).
 *
 * Display name preview, device defaults, accessibility toggles.
 * Persistence wiring is a follow-up once learner-profile prefs land.
 */

import { redirect } from "next/navigation";
import { StudentPreferencesClient } from "@/components/student/StudentPreferencesClient";
import { getLearnerSessionFromHeaders } from "@/lib/server-session";
import { db } from "@/lib/db";

export default async function StudentPreferencesPage() {
  const session = await getLearnerSessionFromHeaders();
  if (!session) {
    redirect("/students/login?returnTo=/join/preferences");
  }

  const profile = await db.learnerProfile.findUnique({
    where: { id: session.learnerProfileId },
    select: { displayName: true },
  });

  const displayName = profile?.displayName ?? "Student";

  return <StudentPreferencesClient initialDisplayName={displayName} />;
}
