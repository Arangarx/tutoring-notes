"use server";

import { db } from "@/lib/db";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";
import { getAccountHolderSessionFromHeaders } from "@/lib/server-session";
import { isPrismaUniqueViolation } from "@/lib/db/prisma-errors";

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
        const maxVersion = await tx.consentRecord.aggregate({
          where: {
            learnerProfileId,
            adminUserId: tutor.adminUserId,
          },
          _max: { version: true },
        });
        const nextVersion = (maxVersion._max.version ?? 0) + 1;

        await tx.consentRecord.create({
          data: {
            learnerProfileId,
            adminUserId: tutor.adminUserId,
            version: nextVersion,
            allowLiveSession: tutor.allowLiveSession,
            allowAudioRecording: tutor.allowAudioRecording,
            allowWhiteboardRecording: tutor.allowWhiteboardRecording,
            allowNoteSending: tutor.allowNoteSending,
            setByAccountHolderId: ahSession.accountHolderId,
            captureMethod: "electronic",
          },
        });

        tutorVersions[tutor.adminUserId] = nextVersion;

        console.log(
          `[cns] learnerProfileId=${learnerProfileId} adminUserId=${tutor.adminUserId} action=consent_set version=${nextVersion} accountHolderId=${ahSession.accountHolderId}`
        );
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
    if (isPrismaUniqueViolation(err)) {
      return { ok: false, error: "consent_already_saved" };
    }
    throw err;
  }

  return { ok: true, tutorVersions };
}
