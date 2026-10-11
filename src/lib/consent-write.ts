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
  setByAccountHolderId: string;
  flags: ConsentFlags;
  logAction?: ConsentLogAction;
  captureMethod?: "electronic" | "presumed";
} & (
  | { adminUserId: string; organizationId?: undefined }
  | { organizationId: string; adminUserId?: undefined }
);

/** Thrown when a concurrent write wins the version unique race. */
export class ConsentAlreadySavedError extends Error {
  readonly code = "consent_already_saved" as const;

  constructor() {
    super("consent_already_saved");
    this.name = "ConsentAlreadySavedError";
  }
}

function consentOwner(input: CreateVersionedConsentRecordInput):
  | { adminUserId: string; organizationId: null }
  | { adminUserId: null; organizationId: string } {
  const adminUserId = "adminUserId" in input ? input.adminUserId : undefined;
  const organizationId = "organizationId" in input ? input.organizationId : undefined;
  if (adminUserId && !organizationId) {
    return { adminUserId, organizationId: null };
  }
  if (organizationId && !adminUserId) {
    return { adminUserId: null, organizationId };
  }
  throw new Error("consent_owner_required");
}

/**
 * Create the next monotonic ConsentRecord version.
 * Tutor rows version on (learnerProfileId, adminUserId).
 * Organization rows version on (learnerProfileId, organizationId).
 * Caller owns auth, ownership asserts, and HTTP/action envelopes.
 */
export async function createVersionedConsentRecord(
  client: ConsentWriteDbClient,
  input: CreateVersionedConsentRecordInput
): Promise<{ version: number }> {
  const { learnerProfileId, setByAccountHolderId, flags, logAction } = input;
  const owner = consentOwner(input);
  const where = owner.organizationId
    ? { learnerProfileId, organizationId: owner.organizationId }
    : { learnerProfileId, adminUserId: owner.adminUserId };

  const maxVersion = await client.consentRecord.aggregate({
    where,
    _max: { version: true },
  });
  const nextVersion = (maxVersion._max.version ?? 0) + 1;

  try {
    await client.consentRecord.create({
      data: {
        learnerProfileId,
        adminUserId: owner.adminUserId,
        organizationId: owner.organizationId,
        version: nextVersion,
        allowLiveSession: flags.allowLiveSession,
        allowAudioRecording: flags.allowAudioRecording,
        allowWhiteboardRecording: flags.allowWhiteboardRecording,
        allowNoteSending: flags.allowNoteSending,
        setByAccountHolderId,
        captureMethod: input.captureMethod ?? "electronic",
      },
    });
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ConsentAlreadySavedError();
    }
    throw err;
  }

  if (logAction) {
    const ownerField = owner.organizationId
      ? `org=${owner.organizationId}`
      : `adminUserId=${owner.adminUserId}`;
    console.log(
      `[cns] learnerProfileId=${learnerProfileId} ${ownerField} action=${logAction} version=${nextVersion} accountHolderId=${setByAccountHolderId}`
    );
  }

  return { version: nextVersion };
}
