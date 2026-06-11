/**
 * Server-side access guard for share-link (/s/[token]) pages and APIs.
 *
 * When NOTES_AUTH_WALL=true (wall on):
 *   - Resolves ShareLink.token → studentId → learnerProfileId
 *   - AccountHolder session: asserts assertOwnsLearnerProfile
 *   - Learner session: asserts learnerProfileId matches
 *   - Unclaimed student (learnerProfileId null): "claim required" — no anonymous path
 *   - No session: redirects to /account/login?returnTo=...&source=notes_email
 *
 * When NOTES_AUTH_WALL=false (wall off, grace window):
 *   - Returns student data on any valid (non-revoked) token with no auth check.
 *   - Preserves today's anonymous /s/* behavior exactly.
 *
 * Log prefix: sal= (share access log — AGENTS.md § Conventions)
 *   [sal] sal=<token:8> action=access_granted principal=account_holder|learner studentId=<id>
 *   [sal] sal=<token:8> action=access_granted_anon_grace studentId=<id>
 *   [sal] sal=<token:8> action=access_denied_redirect studentId=<id> reason=no_session
 *   [sal] sal=<token:8> action=claim_required studentId=<id> reason=unclaimed
 *   [sal] sal=<token:8> action=ownership_denied principal=account_holder accountHolderId=<id>
 *   [sal] sal=<token:8> action=ownership_denied principal=learner learnerProfileId=<id>
 *
 * SERVER-ONLY: never import on the client.
 */

import { notFound, redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { db, withDbRetry } from "@/lib/db";
import { getAccountHolderSession } from "@/lib/account-holder-session";
import { getLearnerSession } from "@/lib/learner-session";
import {
  getAccountHolderSessionFromHeaders,
  getLearnerSessionFromHeaders,
} from "@/lib/server-session";

export interface ShareAccessResult {
  studentId: string;
  learnerProfileId: string | null;
}

/**
 * Returns true when the notes auth wall is active.
 * Read once per request; never memoize across requests.
 */
export function isNotesAuthWallEnabled(): boolean {
  const val = process.env.NOTES_AUTH_WALL;
  return val === "true" || val === "1";
}

/**
 * Assert access to the share page for the given token.
 * FOR USE IN SERVER COMPONENTS (pages) — reads sessions from request headers.
 *
 * On success: returns { studentId, learnerProfileId } from the resolved ShareLink.
 * On revoked/missing token: calls notFound() (unchanged behavior, all modes).
 * On wall=off: always returns without auth check (anonymous grace mode).
 * On wall=on + no session: redirects to /account/login with returnTo.
 * On wall=on + unclaimed student: redirects to /account/login with source=claim_required.
 * On wall=on + wrong owner/learner: calls notFound() (deny, anti-enumeration).
 *
 * @param token         The raw share token from the URL.
 * @param sharePagePath The full path of the share page for returnTo (e.g. "/s/<token>").
 */
export async function assertCanAccessShareLink(
  token: string,
  sharePagePath: string
): Promise<ShareAccessResult> {
  const shortToken = token.slice(0, 8);

  // Resolve the share link first — revocation check applies in ALL modes.
  const link = await withDbRetry(
    () =>
      db.shareLink.findUnique({
        where: { token },
        select: {
          revokedAt: true,
          studentId: true,
          student: { select: { learnerProfileId: true } },
        },
      }),
    { label: "assertCanAccessShareLink.shareLink" }
  );

  if (!link || link.revokedAt) {
    // Revoked or missing — 404 regardless of wall state (unchanged behavior).
    notFound();
  }

  const studentId = link.studentId;
  const learnerProfileId = link.student.learnerProfileId;

  // -------------------------------------------------------------------------
  // Wall OFF (grace window): anonymous access — preserve today's behavior.
  // -------------------------------------------------------------------------
  if (!isNotesAuthWallEnabled()) {
    console.log(
      `[sal] sal=${shortToken} action=access_granted_anon_grace studentId=${studentId}`
    );
    return { studentId, learnerProfileId };
  }

  // -------------------------------------------------------------------------
  // Wall ON: require authentication.
  // -------------------------------------------------------------------------

  // Check AccountHolder (parent) session first — email links go to parents.
  const ahSession = await getAccountHolderSessionFromHeaders();
  if (ahSession) {
    if (!learnerProfileId) {
      // Unclaimed student: the AccountHolder has no LearnerProfile to assert against.
      console.log(
        `[sal] sal=${shortToken} action=claim_required studentId=${studentId} reason=unclaimed principal=account_holder`
      );
      redirect(
        `/account/login?returnTo=${encodeURIComponent(sharePagePath)}&source=claim_required`
      );
    }

    // Check ownership inline so we can emit sal= log before deny.
    const profile = await withDbRetry(
      () =>
        db.learnerProfile.findUnique({
          where: { id: learnerProfileId },
          select: { accountHolderId: true, tombstonedAt: true },
        }),
      { label: "assertCanAccessShareLink.learnerProfile.ah" }
    );

    if (
      !profile ||
      profile.accountHolderId !== ahSession.accountHolderId ||
      profile.tombstonedAt !== null
    ) {
      console.error(
        `[sal] sal=${shortToken} action=ownership_denied principal=account_holder accountHolderId=${ahSession.accountHolderId} studentId=${studentId}`
      );
      notFound();
    }

    console.log(
      `[sal] sal=${shortToken} action=access_granted principal=account_holder studentId=${studentId}`
    );
    return { studentId, learnerProfileId };
  }

  // Check Learner session.
  const learnerSession = await getLearnerSessionFromHeaders();
  if (learnerSession) {
    if (!learnerProfileId) {
      // Unclaimed student: no learnerProfileId to match against.
      console.log(
        `[sal] sal=${shortToken} action=claim_required studentId=${studentId} reason=unclaimed principal=learner`
      );
      redirect(
        `/students/login?returnTo=${encodeURIComponent(sharePagePath)}`
      );
    }

    if (learnerSession.learnerProfileId !== learnerProfileId) {
      console.error(
        `[sal] sal=${shortToken} action=ownership_denied principal=learner learnerProfileId=${learnerSession.learnerProfileId} studentId=${studentId}`
      );
      notFound();
    }

    console.log(
      `[sal] sal=${shortToken} action=access_granted principal=learner studentId=${studentId}`
    );
    return { studentId, learnerProfileId };
  }

  // No session at all → redirect to parent login with returnTo.
  console.log(
    `[sal] sal=${shortToken} action=access_denied_redirect studentId=${studentId} reason=no_session`
  );
  redirect(
    `/account/login?returnTo=${encodeURIComponent(sharePagePath)}&source=notes_email`
  );
}

/**
 * Variant for API route handlers (route.ts).
 *
 * API routes cannot use redirect() (which throws a Next.js navigation signal
 * designed for Server Components). Instead, this variant returns a structured
 * verdict so the caller can return the appropriate NextResponse.
 *
 * On wall=off: returns { allowed: true, studentId, learnerProfileId }.
 * On wall=on + authenticated + authorized: returns { allowed: true, ... }.
 * On wall=on + no/wrong session: returns { allowed: false, status, redirectTo? }.
 * On revoked/missing token: returns { allowed: false, status: 403 }.
 */
export type ApiShareAccessResult =
  | { allowed: true; studentId: string; learnerProfileId: string | null }
  | { allowed: false; status: number; redirectTo?: string };

export async function checkApiShareAccess(
  req: Request,
  token: string,
  sharePagePath: string
): Promise<ApiShareAccessResult> {
  const shortToken = token.slice(0, 8);

  const link = await withDbRetry(
    () =>
      db.shareLink.findUnique({
        where: { token },
        select: {
          revokedAt: true,
          studentId: true,
          student: { select: { learnerProfileId: true } },
        },
      }),
    { label: "checkApiShareAccess.shareLink" }
  );

  if (!link || link.revokedAt) {
    return { allowed: false, status: 403 };
  }

  const studentId = link.studentId;
  const learnerProfileId = link.student.learnerProfileId;

  if (!isNotesAuthWallEnabled()) {
    console.log(
      `[sal] sal=${shortToken} action=access_granted_anon_grace studentId=${studentId}`
    );
    return { allowed: true, studentId, learnerProfileId };
  }

  const ahSession = await getAccountHolderSession(req);
  if (ahSession) {
    if (!learnerProfileId) {
      console.log(
        `[sal] sal=${shortToken} action=claim_required studentId=${studentId} reason=unclaimed principal=account_holder`
      );
      return {
        allowed: false,
        status: 401,
        redirectTo: `/account/login?returnTo=${encodeURIComponent(sharePagePath)}&source=claim_required`,
      };
    }

    const profile = await withDbRetry(
      () =>
        db.learnerProfile.findUnique({
          where: { id: learnerProfileId },
          select: { accountHolderId: true, tombstonedAt: true },
        }),
      { label: "checkApiShareAccess.learnerProfile" }
    );

    if (
      !profile ||
      profile.accountHolderId !== ahSession.accountHolderId ||
      profile.tombstonedAt !== null
    ) {
      console.error(
        `[sal] sal=${shortToken} action=ownership_denied principal=account_holder accountHolderId=${ahSession.accountHolderId} studentId=${studentId}`
      );
      return { allowed: false, status: 403 };
    }

    console.log(
      `[sal] sal=${shortToken} action=access_granted principal=account_holder studentId=${studentId}`
    );
    return { allowed: true, studentId, learnerProfileId };
  }

  const learnerSession = await getLearnerSession(req);
  if (learnerSession) {
    if (!learnerProfileId) {
      console.log(
        `[sal] sal=${shortToken} action=claim_required studentId=${studentId} reason=unclaimed principal=learner`
      );
      return {
        allowed: false,
        status: 401,
        redirectTo: `/students/login?returnTo=${encodeURIComponent(sharePagePath)}`,
      };
    }

    if (learnerSession.learnerProfileId !== learnerProfileId) {
      console.error(
        `[sal] sal=${shortToken} action=ownership_denied principal=learner learnerProfileId=${learnerSession.learnerProfileId} studentId=${studentId}`
      );
      return { allowed: false, status: 403 };
    }

    console.log(
      `[sal] sal=${shortToken} action=access_granted principal=learner studentId=${studentId}`
    );
    return { allowed: true, studentId, learnerProfileId };
  }

  console.log(
    `[sal] sal=${shortToken} action=access_denied_redirect studentId=${studentId} reason=no_session`
  );
  return {
    allowed: false,
    status: 401,
    redirectTo: `/account/login?returnTo=${encodeURIComponent(sharePagePath)}&source=notes_email`,
  };
}
