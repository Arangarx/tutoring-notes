"use server";

import { db } from "@/lib/db";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";
import { getAccountHolderSessionFromHeaders } from "@/lib/server-session";
import {
  ConsentAlreadySavedError,
  createVersionedConsentRecord,
} from "@/lib/consent-write";

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
};

export type SaveParentConsentInput = {
  tutors: SaveTutorConsentInput[];
  restrictions: SaveConsentRestrictionInput;
};

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
  const ahSession = await getAccountHolderSessionFromHeaders();
  if (!ahSession) return { ok: false, error: "unauthorized" };

  const profile = await assertOwnsLearnerProfile(
    ahSession.accountHolderId,
    learnerProfileId
  );

  if (profile.isSelfLearner) {
    return { ok: false, error: "self_learner" };
  }

  if (!input.tutors.length) {
    return { ok: false, error: "no_tutors" };
  }

  const linkedTutorIds = new Set(
    (
      await db.student.findMany({
        where: { learnerProfileId },
        select: { adminUserId: true },
      })
    )
      .map((s) => s.adminUserId)
      .filter((id): id is string => Boolean(id))
  );

  for (const tutor of input.tutors) {
    if (!linkedTutorIds.has(tutor.adminUserId)) {
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
          flags: {
            allowLiveSession: tutor.allowLiveSession,
            allowAudioRecording: tutor.allowAudioRecording,
            allowWhiteboardRecording: tutor.allowWhiteboardRecording,
            allowNoteSending: tutor.allowNoteSending,
          },
          logAction: "consent_set",
        });

        tutorVersions[tutor.adminUserId] = nextVersion;
      }

      await tx.consentRestriction.upsert({
        where: { learnerProfileId },
        create: {
          learnerProfileId,
          restrictAudioRecording: input.restrictions.restrictAudioRecording,
          restrictWhiteboardRecording:
            input.restrictions.restrictWhiteboardRecording,
          restrictNoteSending: input.restrictions.restrictNoteSending,
        },
        update: {
          restrictAudioRecording: input.restrictions.restrictAudioRecording,
          restrictWhiteboardRecording:
            input.restrictions.restrictWhiteboardRecording,
          restrictNoteSending: input.restrictions.restrictNoteSending,
        },
      });
    });
  } catch (err) {
    if (err instanceof ConsentAlreadySavedError) {
      return { ok: false, error: "consent_already_saved" };
    }
    throw err;
  }

  return { ok: true, tutorVersions };
}
