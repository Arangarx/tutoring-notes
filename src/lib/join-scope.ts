/**
 * Authorization helpers for the authenticated /join/[sessionId] path.
 *
 * The /join path accepts two principals:
 *   1. Learner session (mynk_learner_session) — all learner types.
 *   2. Account-holder session (mynk_ah_session) — when the AccountHolder owns the
 *      session's LearnerProfile: the adult self learner, or the parent of a child
 *      profile joining as that child (Andrew 2026-10-06, WB-PARENT-JOIN-AS-CHILD).
 *
 * One rule (`decideAhJoin`) serves the page and every API route.
 * Page handlers pair it with assertIsSessionParticipant; API routes use
 * `resolveAhJoinLearnerProfileId` then verifyIsSessionParticipant.
 *
 * Log prefixes:
 *   wjg= (whiteboard join gate)
 *   lpr= (learner profile)
 *
 * SERVER-ONLY: never import on the client.
 */

import { redirect } from "next/navigation";
import { db, withDbRetry } from "@/lib/db";

/** Neutral denial page for authenticated wrong principal on /join/[sessionId]. */
export const NOT_MY_SESSION_PATH = "/account/not-my-session" as const;

/** Redirect helper — use only when an authenticated AH is the wrong principal. */
export function redirectJoinWrongPrincipal(): never {
  redirect(NOT_MY_SESSION_PATH);
}

/** Principal an account holder joins as. */
export type AhJoinPrincipal = "self_learner" | "parent_for_child";

export type AhJoinDecision =
  | { ok: true; learnerProfileId: string; principal: AhJoinPrincipal }
  | { ok: false; reason: "no_profile" | "not_owner" };

export type AhJoinProfile = {
  id: string;
  isSelfLearner: boolean;
  accountHolderId: string;
  tombstonedAt: Date | null;
};

/**
 * The account holder must own the session's learner profile. Another
 * family's profile, a tombstoned profile, or an unclaimed student is denied.
 */
export function decideAhJoin(
  profile: AhJoinProfile | null,
  accountHolderId: string
): AhJoinDecision {
  if (!profile) return { ok: false, reason: "no_profile" };
  if (profile.tombstonedAt !== null || profile.accountHolderId !== accountHolderId) {
    return { ok: false, reason: "not_owner" };
  }
  return {
    ok: true,
    learnerProfileId: profile.id,
    principal: profile.isSelfLearner ? "self_learner" : "parent_for_child",
  };
}

/** Emits the canonical wjg=/lpr= lines for an AH join decision. */
export function logAhJoinDecision(
  sessionId: string,
  accountHolderId: string,
  decision: AhJoinDecision,
  profileId: string | null
): void {
  const shortId = sessionId.slice(0, 8);
  if (decision.ok) {
    console.info(
      `[lpr] lpr=${decision.learnerProfileId} action=session_join_granted principal=${decision.principal} sessionId=${sessionId}`
    );
    console.info(
      `[wjg] wjg=${shortId} wbsid=${sessionId} action=ah_join_granted principal=${decision.principal} accountHolderId=${accountHolderId} lpr=${decision.learnerProfileId}`
    );
    return;
  }
  if (decision.reason === "not_owner") {
    console.error(
      `[lpr] lpr=${profileId} action=assert_owns_denied accountHolderId=${accountHolderId}`
    );
  }
  console.error(
    `[wjg] wjg=${shortId} wbsid=${sessionId} action=ah_join_denied reason=${decision.reason} accountHolderId=${accountHolderId}${profileId ? ` lpr=${profileId}` : ""}`
  );
}

/**
 * Resolve the learnerProfileId for an account-holder join attempt, for **API
 * route handlers** (which cannot use notFound() / redirect()). Returns null on
 * any denial.
 *
 * Does NOT check SessionParticipant — callers must run verifyIsSessionParticipant
 * after receiving a non-null result.
 */
export async function resolveAhJoinLearnerProfileId(
  sessionId: string,
  accountHolderId: string
): Promise<{ learnerProfileId: string } | null> {
  const sessionRow = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: {
          student: {
            select: {
              learnerProfile: {
                select: {
                  id: true,
                  isSelfLearner: true,
                  accountHolderId: true,
                  tombstonedAt: true,
                },
              },
            },
          },
        },
      }),
    { label: "resolveAhJoinLearnerProfileId.session" }
  );

  const lp = sessionRow?.student?.learnerProfile ?? null;
  const decision = decideAhJoin(lp, accountHolderId);
  logAhJoinDecision(sessionId, accountHolderId, decision, lp?.id ?? null);
  return decision.ok ? { learnerProfileId: decision.learnerProfileId } : null;
}
