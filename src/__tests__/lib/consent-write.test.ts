import {
  ALL_OFF_CONSENT_FLAGS,
  ConsentAlreadySavedError,
  createVersionedConsentRecord,
  type ConsentWriteDbClient,
} from "@/lib/consent-write";

function prismaP2002(): Error & { code: string } {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

function makeMockClient(opts?: {
  maxVersion?: number | null;
  createRejects?: unknown;
}): ConsentWriteDbClient {
  const aggregate = jest.fn().mockResolvedValue({
    _max: { version: opts?.maxVersion ?? null },
  });
  const create = opts?.createRejects
    ? jest.fn().mockRejectedValue(opts.createRejects)
    : jest.fn().mockResolvedValue({ id: "record-1" });

  return {
    consentRecord: { aggregate, create },
  } as unknown as ConsentWriteDbClient;
}

describe("createVersionedConsentRecord", () => {
  const baseInput = {
    learnerProfileId: "lp-1",
    adminUserId: "tutor-1",
    setByAccountHolderId: "ah-1",
    flags: {
      allowLiveSession: true,
      allowAudioRecording: false,
      allowWhiteboardRecording: true,
      allowNoteSending: false,
    },
  };

  it("assigns version 1 when no prior records exist", async () => {
    const client = makeMockClient({ maxVersion: null });

    const result = await createVersionedConsentRecord(client, baseInput);

    expect(result).toEqual({ version: 1 });
    expect(client.consentRecord.aggregate).toHaveBeenCalledWith({
      where: { learnerProfileId: "lp-1", adminUserId: "tutor-1" },
      _max: { version: true },
    });
    expect(client.consentRecord.create).toHaveBeenCalledWith({
      data: {
        learnerProfileId: "lp-1",
        adminUserId: "tutor-1",
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: false,
        allowWhiteboardRecording: true,
        allowNoteSending: false,
        setByAccountHolderId: "ah-1",
        captureMethod: "electronic",
      },
    });
  });

  it("increments from aggregate max version", async () => {
    const client = makeMockClient({ maxVersion: 3 });

    const result = await createVersionedConsentRecord(client, baseInput);

    expect(result).toEqual({ version: 4 });
    expect(client.consentRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 4 }),
      })
    );
  });

  it("persists ALL_OFF_CONSENT_FLAGS for decline path", async () => {
    const client = makeMockClient();

    await createVersionedConsentRecord(client, {
      ...baseInput,
      flags: ALL_OFF_CONSENT_FLAGS,
      logAction: "consent_declined",
    });

    expect(client.consentRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        allowLiveSession: false,
        allowAudioRecording: false,
        allowWhiteboardRecording: false,
        allowNoteSending: false,
        captureMethod: "electronic",
      }),
    });
  });

  it("maps P2002 on create to ConsentAlreadySavedError", async () => {
    const client = makeMockClient({ createRejects: prismaP2002() });

    await expect(createVersionedConsentRecord(client, baseInput)).rejects.toBeInstanceOf(
      ConsentAlreadySavedError
    );
  });

  it("rethrows non-P2002 create errors", async () => {
    const other = new Error("connection lost");
    const client = makeMockClient({ createRejects: other });

    await expect(createVersionedConsentRecord(client, baseInput)).rejects.toBe(other);
  });

  it("emits [cns] log when logAction is provided", async () => {
    const client = makeMockClient();
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await createVersionedConsentRecord(client, {
      ...baseInput,
      logAction: "consent_set",
    });

    expect(logSpy).toHaveBeenCalledWith(
      "[cns] learnerProfileId=lp-1 adminUserId=tutor-1 action=consent_set version=1 accountHolderId=ah-1"
    );

    logSpy.mockRestore();
  });

  it("works with a transaction client (aggregate + create on same client)", async () => {
    const client = makeMockClient({ maxVersion: 1 });

    const result = await createVersionedConsentRecord(client, baseInput);

    expect(result.version).toBe(2);
    expect(client.consentRecord.aggregate).toHaveBeenCalledTimes(1);
    expect(client.consentRecord.create).toHaveBeenCalledTimes(1);
  });
});
