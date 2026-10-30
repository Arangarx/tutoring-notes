/**
 * Loads the inputs for `sessionEntryState` and builds the state, batched.
 * Also the one place that turns a refused decision into the error a server
 * action throws, so every enforcement site refuses the same way.
 *
 * SERVER-ONLY. The pure rule, copy table and types are in `session-entry.ts`
 * (client-safe); this file reads the database.
 */

import type { Prisma } from "@prisma/client";

import { ConsentError, resolveEffectiveConsentForStudent } from "@/lib/consent-scope";
import { db } from "@/lib/db";
import {
  ErasureAccessSuspendedError,
  isWhiteboardSessionBlockedByErasure,
} from "@/lib/erasure/active-erasure-scope";
import { orgInstructorAdmitted } from "@/lib/org-scope";
import {
  entryBlockCopy,
  sessionEntryState,
  type EntryBlockReason,
  type SessionEntryInputs,
  type SessionEntryMode,
  type SessionEntryState,
} from "@/lib/scheduling/session-entry";

/** What the loader needs to know about one appointment (or one tutor + student pair). */
export type SessionEntrySource = {
  studentId: string;
  /** The tutor or instructor who would run the session (the appointment's adminUserId). */
  adminUserId: string;
  student: {
    adminUserId: string | null;
    organizationId: string | null;
    learnerProfileId: string | null;
    learnerProfile?: { isSelfLearner: boolean } | null;
  };
};

/**
 * Which half of the admission rule failed. Call only after `orgInstructorAdmitted`
 * said no: an inactive (or missing) org is `org_inactive`, otherwise the instructor is out.
 */
export async function orgAdmissionFailureReason(
  client: Pick<Prisma.TransactionClient, "organization">,
  organizationId: string
): Promise<"org_inactive" | "instructor_not_admitted"> {
  const org = await client.organization.findUnique({
    where: { id: organizationId },
    select: { status: true },
  });
  return org?.status === "active" ? "instructor_not_admitted" : "org_inactive";
}

async function loadOrgInput(
  organizationId: string,
  adminUserId: string
): Promise<{ active: boolean; instructorAdmitted: boolean }> {
  // One admission rule (org active + active instructor member). Only when it fails
  // do we read the status again, to say which of the two it was.
  if (await orgInstructorAdmitted(db, organizationId, adminUserId)) {
    return { active: true, instructorAdmitted: true };
  }
  const reason = await orgAdmissionFailureReason(db, organizationId);
  return { active: reason !== "org_inactive", instructorAdmitted: false };
}

async function loadInputs(source: SessionEntrySource): Promise<SessionEntryInputs> {
  const { student } = source;
  const orgOwned = student.organizationId != null && student.adminUserId == null;
  const learnerProfileId = student.learnerProfileId;
  const [erasure, org, consent] = await Promise.all([
    isWhiteboardSessionBlockedByErasure(source.studentId),
    orgOwned
      ? loadOrgInput(student.organizationId as string, source.adminUserId)
      : Promise.resolve(null),
    learnerProfileId
      ? resolveEffectiveConsentForStudent(
          learnerProfileId,
          { adminUserId: student.adminUserId, organizationId: student.organizationId },
          source.adminUserId,
          undefined,
          "sessionEntryState"
        )
      : Promise.resolve(null),
  ]);
  return {
    erasureSuspended: erasure.blocked,
    org,
    claimed: learnerProfileId != null,
    isSelfLearner: student.learnerProfile?.isSelfLearner === true,
    consent: consent ? { allowLiveSession: consent.allowLiveSession } : null,
  };
}

/**
 * Entry state for each source, in input order. One lookup per
 * (student, tutor) pair however many rows share it.
 */
export async function loadSessionEntryStates(
  sources: readonly SessionEntrySource[]
): Promise<SessionEntryState[]> {
  const cache = new Map<string, Promise<SessionEntryState>>();
  return Promise.all(
    sources.map((source) => {
      const key = `${source.studentId}:${source.adminUserId}`;
      let pending = cache.get(key);
      if (!pending) {
        pending = loadInputs(source).then(sessionEntryState);
        cache.set(key, pending);
      }
      return pending;
    })
  );
}

export async function loadSessionEntryState(
  source: SessionEntrySource
): Promise<SessionEntryState> {
  const [state] = await loadSessionEntryStates([source]);
  return state as SessionEntryState;
}

/**
 * The error a server action throws for a refused entry. Consent reasons keep the
 * `ConsentError` shape the tutor UI already formats; erasure keeps its own error.
 */
export function entryRefusalError(reason: EntryBlockReason, learnerName: string): Error {
  switch (reason) {
    case "erasure_pending":
      return new ErasureAccessSuspendedError();
    case "live_off":
      return new ConsentError("allowLiveSession", entryBlockCopy(reason, "tutor", learnerName));
    case "unclaimed":
    case "consent_missing_self":
    case "consent_missing_parent":
      // The same table line the disabled control shows: one source for the words.
      return new ConsentError("consentRecord", entryBlockCopy(reason, "tutor", learnerName));
    default:
      return new Error(entryBlockCopy(reason, "tutor", learnerName));
  }
}

/** Throws `entryRefusalError` when `state` does not allow `mode`. */
export function assertEntryAllowed(
  state: SessionEntryState,
  mode: SessionEntryMode,
  learnerName: string
): void {
  const decision = state[mode];
  if (!decision.allowed) throw entryRefusalError(decision.reason, learnerName);
}
