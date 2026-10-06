/**
 * @jest-environment node
 *
 * Claim complete only works for the account the invite was sent to.
 * Spec: the invite stores the intended email when sent; completion requires
 * the signed-in account's email to match; a mismatch refuses and does not
 * link. The stored target kind decides self-connect vs child-connect.
 * Legacy invites (no stored email) fall back to Student.parentEmail.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(),
  redirect: jest.fn(),
}));

import { NextRequest } from "next/server";
import type { ClaimInviteTargetKind } from "@prisma/client";
import { db } from "@/lib/db";
import { createAccountHolderSession } from "@/lib/account-holder-session";
import { generateRawToken, hashToken, CLAIM_INVITE_TTL_MS } from "@/lib/crypto/session-tokens";
import { POST as completePostHandler } from "@/app/api/claim/[token]/complete/route";
import { uniq } from "../helpers/unique-test-token";

const TEST_HMAC_SECRET_AH = "test-ah-session-secret-minimum-32-bytes-xxxx";

beforeAll(() => {
  process.env.AH_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_AH;
});
beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => {
  await db.$disconnect();
});

async function seedPendingInvite(opts: {
  signedInEmail?: string;
  studentParentEmail: string | null;
  intendedEmail?: string | null;
  inviteTargetKind?: ClaimInviteTargetKind | null;
}) {
  const tutor = await db.adminUser.create({
    data: { email: `${uniq("tutor")}@example.com`, role: "TUTOR" },
  });
  const ah = await db.accountHolder.create({
    data: {
      email: opts.signedInEmail ?? `${uniq("ah")}@example.com`,
      emailVerifiedAt: new Date(),
    },
  });
  const student = await db.student.create({
    data: {
      name: opts.studentParentEmail ?? "Kid",
      parentEmail: opts.studentParentEmail,
      adminUserId: tutor.id,
    },
  });
  const rawToken = generateRawToken();
  await db.studentClaimInvite.create({
    data: {
      studentId: student.id,
      adminUserId: tutor.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + CLAIM_INVITE_TTL_MS),
      intendedEmail: opts.intendedEmail ?? null,
      inviteTargetKind: opts.inviteTargetKind ?? null,
    },
  });
  const { rawToken: ahSessionToken } = await createAccountHolderSession(ah.id);
  return { rawToken, ahSessionToken, studentId: student.id };
}

async function postComplete(
  rawToken: string,
  ahSessionToken: string,
  action: "connect_self" | "create_child" = "connect_self"
) {
  const req = new NextRequest(
    new URL(`https://localhost/api/claim/${rawToken}/complete`, "https://localhost"),
    {
      method: "POST",
      headers: {
        cookie: `mynk_ah_session=${ahSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action }),
    }
  );
  return completePostHandler(req, { params: Promise.resolve({ token: rawToken }) });
}

async function linked(studentId: string) {
  const s = await db.student.findUniqueOrThrow({ where: { id: studentId } });
  return s.learnerProfileId;
}

describe("POST /api/claim/[token]/complete — intended account only", () => {
  it("legacy invite: mismatch against the student's parent email is refused", async () => {
    const fx = await seedPendingInvite({ studentParentEmail: `${uniq("intended")}@example.com` });
    const res = await postComplete(fx.rawToken, fx.ahSessionToken);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "invite_email_mismatch" });
    expect(await linked(fx.studentId)).toBeNull();
  });

  it("stored intended email wins even if the student's parent email now matches the signer", async () => {
    const signer = `${uniq("signer")}@example.com`;
    const fx = await seedPendingInvite({
      signedInEmail: signer,
      studentParentEmail: signer,
      intendedEmail: `${uniq("original")}@example.com`,
      inviteTargetKind: "self_learner",
    });
    const res = await postComplete(fx.rawToken, fx.ahSessionToken);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "invite_email_mismatch" });
    expect(await linked(fx.studentId)).toBeNull();
  });

  it("stored intended email matches case-insensitively and links the self learner", async () => {
    const signer = `${uniq("signer")}@example.com`;
    const fx = await seedPendingInvite({
      signedInEmail: signer,
      studentParentEmail: signer,
      intendedEmail: signer.toUpperCase(),
      inviteTargetKind: "self_learner",
    });
    const res = await postComplete(fx.rawToken, fx.ahSessionToken);
    expect(res.status).toBe(200);
    expect(await linked(fx.studentId)).not.toBeNull();
  });

  it("a self-learner invite cannot be completed as a child", async () => {
    const signer = `${uniq("signer")}@example.com`;
    const fx = await seedPendingInvite({
      signedInEmail: signer,
      studentParentEmail: signer,
      intendedEmail: signer,
      inviteTargetKind: "self_learner",
    });
    const res = await postComplete(fx.rawToken, fx.ahSessionToken, "create_child");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "invite_target_mismatch" });
    expect(await linked(fx.studentId)).toBeNull();
  });

  it("a child invite cannot link the parent's own self-learner profile", async () => {
    const signer = `${uniq("parent")}@example.com`;
    const fx = await seedPendingInvite({
      signedInEmail: signer,
      studentParentEmail: signer,
      intendedEmail: signer,
      inviteTargetKind: "child_learner",
    });
    const res = await postComplete(fx.rawToken, fx.ahSessionToken, "connect_self");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "invite_target_mismatch" });
    expect(await linked(fx.studentId)).toBeNull();
  });

  it("a child invite completes for the intended parent as a child", async () => {
    const signer = `${uniq("parent")}@example.com`;
    const fx = await seedPendingInvite({
      signedInEmail: signer,
      studentParentEmail: signer,
      intendedEmail: signer,
      inviteTargetKind: "child_learner",
    });
    const res = await postComplete(fx.rawToken, fx.ahSessionToken, "create_child");
    expect(res.status).toBe(200);
    const lpId = await linked(fx.studentId);
    const lp = await db.learnerProfile.findUniqueOrThrow({ where: { id: lpId! } });
    expect(lp.isSelfLearner).toBe(false);
  });
});
