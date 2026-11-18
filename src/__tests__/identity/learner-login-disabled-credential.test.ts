/**
 * @jest-environment node
 *
 * BLOCKER B — LearnerCredential.disabled fail-closed learner login.
 *
 * Coverage:
 *   LPR-DIS-1 — disabled=true → invalid_credentials (no enumeration)
 *   LPR-DIS-2 — disabled=false + correct PIN → success
 *
 * DB: tutoring_notes_test via jest.global-setup.ts.
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

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashAccountHolderPassword, hashLearnerPin } from "@/lib/account-holder-auth";
import { POST as learnerLoginPost } from "@/app/api/auth/learner/login/route";
import { LEARNER_SESSION_COOKIE } from "@/lib/learner-session";

const TEST_HMAC_SECRET_LEARNER = "test-learner-session-secret-minimum-32-bytes";

beforeAll(() => {
  process.env.LEARNER_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_LEARNER;
});

afterAll(async () => {
  await db.$disconnect();
});

async function createAccountHolder(familyId: string) {
  const email = `lpr-dis-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await hashAccountHolderPassword("password123");
  return db.accountHolder.create({
    data: {
      email,
      passwordHash,
      displayName: "Disabled Login Parent",
      emailVerifiedAt: new Date(),
      familyId,
    },
  });
}

async function createLearnerWithCredential(
  accountHolderId: string,
  username: string,
  opts?: {
    disabled?: boolean;
    accessMode?: "child_pin_required" | "account_holder_session" | "parent_session_select";
  }
) {
  const lp = await db.learnerProfile.create({
    data: {
      accountHolderId,
      displayName: "Disabled Login Child",
      accessMode: opts?.accessMode ?? "child_pin_required",
    },
  });
  const secretHash = await hashLearnerPin("654321");
  await db.learnerCredential.create({
    data: {
      learnerProfileId: lp.id,
      accountHolderId,
      username,
      secretHash,
      disabled: opts?.disabled ?? false,
    },
  });
  return { lp, username };
}

function buildLoginRequest(handle: string, pin: string): NextRequest {
  return new NextRequest("http://localhost/api/auth/learner/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: handle, pin }),
  });
}

describe("learner login — LearnerCredential.disabled", () => {
  it("rejects disabled credential with invalid_credentials (indistinguishable from wrong PIN)", async () => {
    const familyId = `fam_dis_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const username = `kid_${Math.random().toString(36).slice(2, 8)}`;
    const ah = await createAccountHolder(familyId);
    await createLearnerWithCredential(ah.id, username, { disabled: true });

    const res = await learnerLoginPost(
      buildLoginRequest(`${username}@${familyId}`, "654321")
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_credentials");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("allows login when disabled=false and PIN is correct", async () => {
    const familyId = `fam_ok_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const username = `kid_${Math.random().toString(36).slice(2, 8)}`;
    const ah = await createAccountHolder(familyId);
    const { lp } = await createLearnerWithCredential(ah.id, username, { disabled: false });

    const res = await learnerLoginPost(
      buildLoginRequest(`${username}@${familyId}`, "654321")
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { next: string };
    expect(body.next).toBe("session");
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`${LEARNER_SESSION_COOKIE}=`));

    const sessions = await db.learnerDeviceSession.count({
      where: { learnerProfileId: lp.id, revokedAt: null },
    });
    expect(sessions).toBeGreaterThanOrEqual(1);
  });
});

type LoginOutcome = {
  status: number;
  body: { error?: string; message?: string };
  retryAfter: string | null;
  cookie: string | null;
};

async function postLogin(handle: string, pin: string): Promise<LoginOutcome> {
  const res = await learnerLoginPost(buildLoginRequest(handle, pin));
  const body = (await res.json()) as { error?: string; message?: string };
  return {
    status: res.status,
    body,
    retryAfter: res.headers.get("Retry-After"),
    cookie: res.headers.get("set-cookie"),
  };
}

describe("learner login — parent access mode is not a handle oracle", () => {
  const CORRECT_PIN = "654321";
  // Fat-finger grace is 3 failures; the 4th is the first lockout the caller can see.
  const ATTEMPTS_THROUGH_FIRST_LOCKOUT = 4;

  it.each(["account_holder_session", "parent_session_select"] as const)(
    "%s username gets the same failure as an unknown username, and further probes lock out",
    async (accessMode) => {
      const familyId = `fam_mode_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const username = `kid_${Math.random().toString(36).slice(2, 8)}`;
      const ah = await createAccountHolder(familyId);
      const { lp } = await createLearnerWithCredential(ah.id, username, { accessMode });
      const parentHandle = `${username}@${familyId}`;
      const unknownHandle = `missing_${Math.random().toString(36).slice(2, 8)}@${familyId}`;

      const unknownAttempts: LoginOutcome[] = [];
      for (let i = 0; i < ATTEMPTS_THROUGH_FIRST_LOCKOUT; i++) {
        unknownAttempts.push(await postLogin(unknownHandle, CORRECT_PIN));
      }

      const logs: string[] = [];
      const spy = jest.spyOn(console, "log").mockImplementation((msg?: unknown) => {
        logs.push(String(msg));
      });
      try {
        const parentAttempts: LoginOutcome[] = [];
        for (let i = 0; i < ATTEMPTS_THROUGH_FIRST_LOCKOUT; i++) {
          parentAttempts.push(await postLogin(parentHandle, CORRECT_PIN));
        }

        for (let i = 0; i < ATTEMPTS_THROUGH_FIRST_LOCKOUT; i++) {
          const parent = parentAttempts[i];
          const unknown = unknownAttempts[i];
          expect(parent.status).toBe(unknown.status);
          expect(parent.body.error).toBe(unknown.body.error);
          expect(parent.body).toEqual(unknown.body);
          expect(JSON.stringify(parent.body)).not.toContain("access_mode_mismatch");
          expect(JSON.stringify(parent.body).toLowerCase()).not.toMatch(
            /does not use|doesn't use a pin/
          );
          expect(parent.cookie).toBeNull();
          expect(parent.retryAfter).toBe(unknown.retryAfter);
        }

        const rejectionLines = logs.filter((line) => line.includes("reason=wrong_access_mode"));
        expect(rejectionLines).toHaveLength(ATTEMPTS_THROUGH_FIRST_LOCKOUT);
        for (const line of rejectionLines) {
          expect(line).toContain(
            `[lpr] lpr=${lp.id} action=login_rejected reason=wrong_access_mode`
          );
          expect(line).toContain(`accessMode=${accessMode}`);
          expect(line).not.toContain("handle=");
        }
      } finally {
        spy.mockRestore();
      }
    }
  );
});
