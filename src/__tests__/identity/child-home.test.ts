/**
 * @jest-environment node
 *
 * Child home consent + PIN. The child may only tighten ConsentRestriction.
 * The parent ceiling is the latest ConsentRecord. Clearing a restriction is
 * the parent's turn-back-on, and the child-facing read says so.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

jest.mock("@/lib/server-session", () => ({
  getAccountHolderSessionFromHeaders: jest.fn(),
  requireAccountHolderSession: jest.fn(),
  hasAccountHolderSessionCookie: jest.fn(),
  getLearnerSessionFromHeaders: jest.fn(),
  hasLearnerSessionCookie: jest.fn(),
}));

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashLearnerPin, verifyLearnerPin } from "@/lib/account-holder-auth";
import { createAccountHolderSession } from "@/lib/account-holder-session";
import { setPlatformMailSenderForTests } from "@/lib/email";
import { getAccountHolderSessionFromHeaders, getLearnerSessionFromHeaders } from "@/lib/server-session";
import { saveParentConsentAction } from "@/app/account/children/[id]/consent/actions";
import { PATCH as credentialPatchHandler } from "@/app/api/learner-profiles/[id]/credentials/route";
import {
  changeOwnLearnerPinAction,
  saveChildConsentAction,
} from "@/app/join/child-home-actions";
import { readChildConsentFacing } from "@/lib/child-consent";
import { uniq } from "../helpers/unique-test-token";

const ALL_ON = {
  allowLiveSession: true,
  allowAudioRecording: true,
  allowWhiteboardRecording: true,
  allowNoteSending: true,
};

const NO_RESTRICTIONS = {
  restrictLiveSession: false,
  restrictAudioRecording: false,
  restrictWhiteboardRecording: false,
  restrictNoteSending: false,
};

afterEach(() => {
  setPlatformMailSenderForTests(null);
});

afterAll(async () => {
  await db.$disconnect();
});

async function seedChild(ceiling: Partial<typeof ALL_ON> = {}) {
  const tutor = await db.adminUser.create({
    data: { email: `${uniq("tutor")}@example.com`, role: "TUTOR" },
  });
  const ah = await db.accountHolder.create({
    data: {
      email: `${uniq("ah")}@example.com`,
      emailVerifiedAt: new Date(),
    },
  });
  const profile = await db.learnerProfile.create({
    data: { accountHolderId: ah.id, displayName: "Child", isSelfLearner: false },
  });
  await db.student.create({
    data: { name: "Child", adminUserId: tutor.id, learnerProfileId: profile.id },
  });
  await db.consentRecord.create({
    data: {
      learnerProfileId: profile.id,
      adminUserId: tutor.id,
      version: 1,
      setByAccountHolderId: ah.id,
      captureMethod: "electronic",
      ...ALL_ON,
      ...ceiling,
    },
  });
  return { tutor, ah, profile };
}

function asLearner(profileId: string, accountHolderId: string) {
  (getLearnerSessionFromHeaders as jest.Mock).mockResolvedValue({
    learnerProfileId: profileId,
    accountHolderId,
    sessionId: "learner-session",
  });
}

describe("child consent tightening", () => {
  it("rejects a learner with no session and does not write a restriction", async () => {
    const { profile } = await seedChild();
    (getLearnerSessionFromHeaders as jest.Mock).mockResolvedValue(null);

    const result = await saveChildConsentAction({
      ...ALL_ON,
      allowAudioRecording: false,
    });

    expect(result).toEqual({ ok: false, error: "unauthorized" });
    const row = await db.consentRestriction.findUnique({
      where: { learnerProfileId: profile.id },
    });
    expect(row).toBeNull();
  });

  it("does not let the child turn a switch on above the parent ceiling", async () => {
    const { ah, profile } = await seedChild({ allowLiveSession: false });
    asLearner(profile.id, ah.id);

    const result = await saveChildConsentAction(ALL_ON);

    expect(result).toEqual({ ok: false, error: "above_ceiling" });
    const facing = await readChildConsentFacing(profile.id);
    expect(facing.ceiling.allowLiveSession).toBe(false);
    expect(facing.effective.allowLiveSession).toBe(false);
    const row = await db.consentRestriction.findUnique({
      where: { learnerProfileId: profile.id },
    });
    expect(row).toBeNull();
  });

  it("lets the child turn one switch off and leaves the others on", async () => {
    const { ah, profile } = await seedChild();
    asLearner(profile.id, ah.id);

    const result = await saveChildConsentAction({
      ...ALL_ON,
      allowAudioRecording: false,
    });

    expect(result).toEqual({ ok: true });
    const facing = await readChildConsentFacing(profile.id);
    expect(facing.effective).toEqual({ ...ALL_ON, allowAudioRecording: false });
    const row = await db.consentRestriction.findUnique({
      where: { learnerProfileId: profile.id },
    });
    expect(row?.restrictAudioRecording).toBe(true);
    expect(row?.restrictLiveSession).toBe(false);
    expect(row?.restrictWhiteboardRecording).toBe(false);
    expect(row?.restrictNoteSending).toBe(false);
    expect(row?.childSetAudioRecording).toBe(true);
    expect(row?.childSetLiveSession).toBe(false);
    expect(row?.childSetWhiteboardRecording).toBe(false);
    expect(row?.childSetNoteSending).toBe(false);
  });

  it("does not let the child turn a switch back on after they turned it off", async () => {
    const { ah, profile } = await seedChild();
    asLearner(profile.id, ah.id);

    const tightened = await saveChildConsentAction({
      ...ALL_ON,
      allowAudioRecording: false,
    });
    expect(tightened).toEqual({ ok: true });

    const result = await saveChildConsentAction(ALL_ON);

    expect(result).toEqual({ ok: false, error: "stricter_only" });
    const row = await db.consentRestriction.findUnique({
      where: { learnerProfileId: profile.id },
    });
    expect(row?.restrictAudioRecording).toBe(true);
    const facing = await readChildConsentFacing(profile.id);
    expect(facing.effective.allowAudioRecording).toBe(false);
  });

  it("does not change another child's restriction", async () => {
    const mine = await seedChild();
    const other = await seedChild();
    asLearner(mine.profile.id, mine.ah.id);

    const result = await saveChildConsentAction({
      ...ALL_ON,
      allowNoteSending: false,
    });

    expect(result).toEqual({ ok: true });
    const otherRow = await db.consentRestriction.findUnique({
      where: { learnerProfileId: other.profile.id },
    });
    expect(otherRow).toBeNull();
  });

  it("parent clearing the restriction turns it back on and the child-facing read says the parent restored it", async () => {
    const { tutor, ah, profile } = await seedChild();
    asLearner(profile.id, ah.id);
    const tightened = await saveChildConsentAction({
      ...ALL_ON,
      allowWhiteboardRecording: false,
    });
    expect(tightened).toEqual({ ok: true });

    (getAccountHolderSessionFromHeaders as jest.Mock).mockResolvedValue({
      accountHolderId: ah.id,
    });
    const cleared = await saveParentConsentAction(profile.id, {
      tutors: [{ adminUserId: tutor.id, ...ALL_ON }],
      restrictions: NO_RESTRICTIONS,
    });
    expect(cleared.ok).toBe(true);

    const facing = await readChildConsentFacing(profile.id);
    expect(facing.effective.allowWhiteboardRecording).toBe(true);
    expect(facing.restoredByParent.allowWhiteboardRecording).toBe(true);
    expect(facing.restoredByParent.allowAudioRecording).toBe(false);
    expect(facing.restoredByParent.allowLiveSession).toBe(false);
    expect(facing.restoredByParent.allowNoteSending).toBe(false);
    const row = await db.consentRestriction.findUnique({
      where: { learnerProfileId: profile.id },
    });
    expect(row?.parentRestoredWhiteboardRecording).toBe(true);
    expect(row?.childSetWhiteboardRecording).toBe(false);
  });

  it("does not treat a parent always-off limit as the child's choice when the child turns off another switch", async () => {
    const { tutor, ah, profile } = await seedChild();
    (getAccountHolderSessionFromHeaders as jest.Mock).mockResolvedValue({
      accountHolderId: ah.id,
    });
    const blocked = await saveParentConsentAction(profile.id, {
      tutors: [{ adminUserId: tutor.id, ...ALL_ON }],
      restrictions: { ...NO_RESTRICTIONS, restrictAudioRecording: true },
    });
    expect(blocked.ok).toBe(true);

    asLearner(profile.id, ah.id);
    const tightened = await saveChildConsentAction({
      ...ALL_ON,
      allowAudioRecording: false,
      allowNoteSending: false,
    });
    expect(tightened).toEqual({ ok: true });

    const row = await db.consentRestriction.findUnique({
      where: { learnerProfileId: profile.id },
    });
    expect(row?.restrictAudioRecording).toBe(true);
    expect(row?.childSetAudioRecording).toBe(false);
    expect(row?.restrictNoteSending).toBe(true);
    expect(row?.childSetNoteSending).toBe(true);
  });

  it("does not tell the child a parent restored a switch the child never turned off", async () => {
    const { tutor, ah, profile } = await seedChild();
    (getAccountHolderSessionFromHeaders as jest.Mock).mockResolvedValue({
      accountHolderId: ah.id,
    });

    const blocked = await saveParentConsentAction(profile.id, {
      tutors: [{ adminUserId: tutor.id, ...ALL_ON }],
      restrictions: { ...NO_RESTRICTIONS, restrictAudioRecording: true },
    });
    expect(blocked.ok).toBe(true);

    const cleared = await saveParentConsentAction(profile.id, {
      tutors: [{ adminUserId: tutor.id, ...ALL_ON }],
      restrictions: NO_RESTRICTIONS,
    });
    expect(cleared.ok).toBe(true);

    const facing = await readChildConsentFacing(profile.id);
    expect(facing.effective.allowAudioRecording).toBe(true);
    expect(facing.restoredByParent.allowAudioRecording).toBe(false);
    const row = await db.consentRestriction.findUnique({
      where: { learnerProfileId: profile.id },
    });
    expect(row?.restrictAudioRecording).toBe(false);
    expect(row?.parentRestoredAudioRecording).toBe(false);
    expect(row?.childSetAudioRecording).toBe(false);
  });
});

describe("child PIN change", () => {
  const currentPin = "482916";
  const nextPin = "159357";
  const wrongPin = "739184";
  const parentResetPin = "999888";

  async function seedPinChild() {
    const ah = await db.accountHolder.create({
      data: {
        email: `${uniq("pin-ah")}@example.com`,
        emailVerifiedAt: new Date(),
      },
    });
    const profile = await db.learnerProfile.create({
      data: {
        accountHolderId: ah.id,
        displayName: "Pin Child",
        accessMode: "child_pin_required",
      },
    });
    await db.learnerCredential.create({
      data: {
        learnerProfileId: profile.id,
        accountHolderId: ah.id,
        username: uniq("kid").slice(0, 20).replace(/-/g, "").slice(0, 12) || "kidpin",
        secretHash: await hashLearnerPin(currentPin),
      },
    });
    return { ah, profile };
  }

  it("rejects a wrong current PIN and leaves the hash unchanged", async () => {
    const { ah, profile } = await seedPinChild();
    asLearner(profile.id, ah.id);
    const before = await db.learnerCredential.findUnique({
      where: { learnerProfileId: profile.id },
    });

    const result = await changeOwnLearnerPinAction({
      currentPin: wrongPin,
      newPin: nextPin,
    });

    expect(result).toEqual({ ok: false, error: "wrong_pin" });
    const after = await db.learnerCredential.findUnique({
      where: { learnerProfileId: profile.id },
    });
    expect(after?.secretHash).toBe(before?.secretHash);
    expect(await verifyLearnerPin(currentPin, after!.secretHash)).toBe(true);
  });

  it("changes the PIN after the current one and the parent can still reset", async () => {
    const { ah, profile } = await seedPinChild();
    asLearner(profile.id, ah.id);
    const sent: Array<{ to: string; subject: string; text: string }> = [];
    setPlatformMailSenderForTests(async (options) => {
      sent.push(options);
      return { sent: true };
    });

    const changed = await changeOwnLearnerPinAction({
      currentPin,
      newPin: nextPin,
    });
    expect(changed).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(ah.email);
    expect(sent[0]?.text).toContain(`/account/children/${profile.id}`);
    expect(sent[0]?.text).not.toContain(nextPin);

    const afterChild = await db.learnerCredential.findUnique({
      where: { learnerProfileId: profile.id },
    });
    expect(await verifyLearnerPin(nextPin, afterChild!.secretHash)).toBe(true);
    expect(await verifyLearnerPin(currentPin, afterChild!.secretHash)).toBe(false);

    const { rawToken } = await createAccountHolderSession(ah.id);
    const req = new NextRequest(
      new URL(`https://localhost/api/learner-profiles/${profile.id}/credentials`),
      {
        method: "PATCH",
        headers: {
          cookie: `mynk_ah_session=${rawToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newPin: parentResetPin }),
      }
    );
    const res = await credentialPatchHandler(req, {
      params: Promise.resolve({ id: profile.id }),
    });
    expect(res.status).toBe(200);
    const afterParent = await db.learnerCredential.findUnique({
      where: { learnerProfileId: profile.id },
    });
    expect(await verifyLearnerPin(parentResetPin, afterParent!.secretHash)).toBe(true);
    expect(await verifyLearnerPin(nextPin, afterParent!.secretHash)).toBe(false);
  });
});
