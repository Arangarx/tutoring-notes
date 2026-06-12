/**
 * /join — Learner waiting room (Gate A2, visual-first).
 *
 * After student login, the child lands here until the tutor admits them.
 * Presence/admit polling and whiteboard entry are live-AV follow-ups.
 */

import { redirect } from "next/navigation";
import {
  LearnerWaitingRoom,
  type LearnerWaitingRoomState,
} from "@/components/student/LearnerWaitingRoom";
import { getLearnerSessionFromHeaders } from "@/lib/server-session";
import { db } from "@/lib/db";

type JoinPageProps = {
  searchParams: Promise<{ preview?: string }>;
};

export default async function JoinPage({ searchParams }: JoinPageProps) {
  const session = await getLearnerSessionFromHeaders();
  if (!session) {
    redirect("/students/login?returnTo=/join");
  }

  const profile = await db.learnerProfile.findUnique({
    where: { id: session.learnerProfileId },
    select: { displayName: true },
  });

  const displayName = profile?.displayName ?? "Student";
  const params = await searchParams;

  // Dev/preview only — toggles admitted visual without live wiring.
  const previewState: LearnerWaitingRoomState =
    params.preview === "admitted" ? "admitted" : "waiting";

  return <LearnerWaitingRoom displayName={displayName} state={previewState} />;
}
