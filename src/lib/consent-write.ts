import { db } from "@/lib/db";
import { isPrismaUniqueViolation } from "@/lib/db/prisma-errors";

/** Prisma client or interactive-transaction client for versioned consent writes. */
export type ConsentWriteDbClient =
  | typeof db
  | Parameters<Parameters<typeof db.$transaction>[0]>[0];

export const ALL_OFF_CONSENT_FLAGS = {
  allowLiveSession: false,
  allowAudioRecording: false,
  allowWhiteboardRecording: false,
  allowNoteSending: false,
} as const;

export type ConsentFlags = {
  allowLiveSession: boolean;
  allowAudioRecording: boolean;
  allowWhiteboardRecording: boolean;
  allowNoteSending: boolean;
};

export type ConsentLogAction = "consent_set" | "consent_declined";

export type CreateVersionedConsentRecordInput = {
  learnerProfileId: string;
  adminUserId: string;
  setByAccountHolderId: string;
  flags: ConsentFlags;
  logAction?: ConsentLogAction;
};

/** Thrown when a concurrent write wins the (learner, tutor, version) unique race. */
export class ConsentAlreadySavedError extends Error {
  readonly code = "consent_already_saved" as const;

  constructor() {
    super("consent_already_saved");
    this.name = "ConsentAlreadySavedError";
  }
}

/**
 * Create the next monotonic ConsentRecord version for a (learner, tutor) pair.
 * Caller owns auth, ownership asserts, and HTTP/action envelopes.
 */
export async function createVersionedConsentRecord(
  client: ConsentWriteDbClient,
  input: CreateVersionedConsentRecordInput
): Promise<{ version: number }> {
  const {
    learnerProfileId,
    adminUserId,
    setByAccountHolderId,
    flags,
    logAction,
  } = input;

  const maxVersion = await client.consentRecord.aggregate({
    where: { learnerProfileId, adminUserId },
    _max: { version: true },
  });
  const nextVersion = (maxVersion._max.version ?? 0) + 1;

  try {
    await client.consentRecord.create({
      data: {
        learnerProfileId,
        adminUserId,
        version: nextVersion,
        allowLiveSession: flags.allowLiveSession,
        allowAudioRecording: flags.allowAudioRecording,
        allowWhiteboardRecording: flags.allowWhiteboardRecording,
        allowNoteSending: flags.allowNoteSending,
        setByAccountHolderId,
        captureMethod: "electronic",
      },
    });
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ConsentAlreadySavedError();
    }
    throw err;
  }

  if (logAction) {
    console.log(
      `[cns] learnerProfileId=${learnerProfileId} adminUserId=${adminUserId} action=${logAction} version=${nextVersion} accountHolderId=${setByAccountHolderId}`
    );
  }

  return { version: nextVersion };
}
