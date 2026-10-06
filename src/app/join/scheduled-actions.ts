"use server";

import { redirect } from "next/navigation";
import { createActionCorrelationId } from "@/lib/action-correlation";
import {
  getAccountHolderSessionFromHeaders,
  getLearnerSessionFromHeaders,
} from "@/lib/server-session";
import {
  getOrCreateWhiteboardForSchedule,
  type ScheduleBridgeResult,
} from "@/lib/whiteboard/schedule-bridge";

export type JoinScheduledSessionError = {
  error: "not_signed_in" | "not_yet" | "not_available";
};

/**
 * Learner dashboard Join: a signed-in learner, self learner, or parent (as
 * their child) enters the scheduled appointment's live room without a link.
 * The learner cookie is tried first, then the account-holder session, the
 * same principal order as /join/[sessionId].
 */
export async function joinScheduledSession(
  scheduledSessionId: string
): Promise<JoinScheduledSessionError> {
  const rid = createActionCorrelationId();

  let result: ScheduleBridgeResult | null = null;
  const learner = await getLearnerSessionFromHeaders();
  if (learner) {
    result = await getOrCreateWhiteboardForSchedule(
      scheduledSessionId,
      { kind: "learner", learnerProfileId: learner.learnerProfileId },
      rid
    );
  }
  if (!result || (!result.ok && result.reason === "not_found")) {
    const ah = await getAccountHolderSessionFromHeaders();
    if (ah) {
      result = await getOrCreateWhiteboardForSchedule(
        scheduledSessionId,
        { kind: "account_holder", accountHolderId: ah.accountHolderId },
        rid
      );
    }
  }

  if (!result) return { error: "not_signed_in" };
  if (result.ok) redirect(`/join/${result.whiteboardSessionId}`);
  return { error: result.reason === "not_yet" ? "not_yet" : "not_available" };
}
