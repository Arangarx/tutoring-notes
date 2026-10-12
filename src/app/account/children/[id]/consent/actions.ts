"use server";

import { db } from "@/lib/db";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";
import { getAccountHolderSessionFromHeaders } from "@/lib/server-session";
import {
  ConsentAlreadySavedError,
  createVersionedConsentRecord,
  type ConsentFlags,
} from "@/lib/consent-write";
import { restoredFlagsAfterParentSave } from "@/lib/child-consent";

export type SaveTutorConsentInput = {
  adminUserId: string;
  allowLiveSession: boolean;
  allowAudioRecording: boolean;
  allowWhiteboardRecording: boolean;
  allowNoteSending: boolean;
};

export type SaveConsentRestrictionInput = {
  restrictAudioRecording: boolean;
  restrictWhiteboardRecording: boolean;
  restrictNoteSending: boolean;
  /** Omitted means leave the stored live-session restriction as it is. */
  restrictLiveSession?: boolean;
};

export type SaveOrgConsentInput = {
  organizationId: string;
  allowLiveSession: boolean;
  allowAudioRecording: boolean;
  allowWhiteboardRecording: boolean;
  allowNoteSending: boolean;
};

export type SaveParentConsentInput = {
  tutors: SaveTutorConsentInput[];
  organizations?: SaveOrgConsentInput[];
  restrictions: SaveConsentRestrictionInput;
};

function consentFlags(row: {
  allowLiveSession: boolean;
  allowAudioRecording: boolean;
  allowWhiteboardRecording: boolean;
  allowNoteSending: boolean;
}): ConsentFlags {
  return {
    allowLiveSession: row.allowLiveSession,
    allowAudioRecording: row.allowAudioRecording,
    allowWhiteboardRecording: row.allowWhiteboardRecording,
    allowNoteSending: row.allowNoteSending,
  };
}

type ConsentActor = "parent" | "self_learner";

/**
 * One writer for parent and self-learner consent.
 * A parent also stores the hard limits. A self-learner does not.
 */
async function saveConsentForActor(
  learnerProfileId: string,
  input: SaveParentConsentInput,
  actor: ConsentActor
): Promise<{
  ok: boolean;
  error?: string;
  tutorVersions?: Record<string, number>;
}> {
  const ahSession = await getAccountHolderSessionFromHeaders();
  if (!ahSession) return { ok: false, error: "unauthorized" };

  const profile = await assertOwnsLearnerProfile(
    ahSession.accountHolderId,
    learnerProfileId
  );

  if (actor === "parent" && profile.isSelfLearner) {
    return { ok: false, error: "self_learner" };
  }
  if (actor === "self_learner" && !profile.isSelfLearner) {
    return { ok: false, error: "not_self_learner" };
  }

  const organizations = input.organizations ?? [];
  if (!input.tutors.length && !organizations.length) {
    return { ok: false, error: "no_tutors" };
  }

  const linked = await db.student.findMany({
    where: { learnerProfileId },
    select: { adminUserId: true, organizationId: true },
  });
  const linkedTutorIds = new Set(
    linked.map((s) => s.adminUserId).filter((id): id is string => Boolean(id))
  );
  const linkedOrgIds = new Set(
    linked.map((s) => s.organizationId).filter((id): id is string => Boolean(id))
  );

  for (const tutor of input.tutors) {
    if (!linkedTutorIds.has(tutor.adminUserId)) {
      return { ok: false, error: "forbidden" };
    }
  }
  for (const org of organizations) {
    if (!linkedOrgIds.has(org.organizationId)) {
      return { ok: false, error: "forbidden" };
    }
  }

  const tutorVersions: Record<string, number> = {};

  try {
    await db.$transaction(async (tx) => {
      for (const tutor of input.tutors) {
        const { version: nextVersion } = await createVersionedConsentRecord(tx, {
          learnerProfileId,
          adminUserId: tutor.adminUserId,
          setByAccountHolderId: ahSession.accountHolderId,
          flags: consentFlags(tutor),
          logAction: "consent_set",
        });
        tutorVersions[tutor.adminUserId] = nextVersion;
      }

      for (const org of organizations) {
        await createVersionedConsentRecord(tx, {
          learnerProfileId,
          organizationId: org.organizationId,
          setByAccountHolderId: ahSession.accountHolderId,
          flags: consentFlags(org),
          logAction: "consent_set",
        });
      }

      if (actor === "parent") {
        const prev = await tx.consentRestriction.findUnique({
          where: { learnerProfileId },
        });
        const nextRestrict = {
          restrictLiveSession:
            input.restrictions.restrictLiveSession ?? prev?.restrictLiveSession ?? false,
          restrictAudioRecording: input.restrictions.restrictAudioRecording,
          restrictWhiteboardRecording: input.restrictions.restrictWhiteboardRecording,
          restrictNoteSending: input.restrictions.restrictNoteSending,
        };
        const restored = restoredFlagsAfterParentSave(prev, nextRestrict);
        await tx.consentRestriction.upsert({
          where: { learnerProfileId },
          create: {
            learnerProfileId,
            ...nextRestrict,
            ...restored,
          },
          update: {
            ...nextRestrict,
            ...restored,
          },
        });
      }
    });
  } catch (err) {
    if (err instanceof ConsentAlreadySavedError) {
      return { ok: false, error: "consent_already_saved" };
    }
    throw err;
  }

  return { ok: true, tutorVersions };
}

/**
 * B2 Step 6 — parent updates per-tutor ConsentRecord versions + ConsentRestriction.
 * Mirrors claim setup consent writes; asserts ownership before any mutation.
 */
export async function saveParentConsentAction(
  learnerProfileId: string,
  input: SaveParentConsentInput
): Promise<{
  ok: boolean;
  error?: string;
  tutorVersions?: Record<string, number>;
}> {
  return saveConsentForActor(learnerProfileId, input, "parent");
}

/** Self-learner settings write the same versioned rows. */
export async function saveSelfLearnerConsentAction(
  learnerProfileId: string,
  input: SaveParentConsentInput
): Promise<{ ok: boolean; error?: string }> {
  const result = await saveConsentForActor(learnerProfileId, input, "self_learner");
  return { ok: result.ok, error: result.error };
}
