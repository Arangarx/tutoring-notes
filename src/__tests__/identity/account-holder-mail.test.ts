/**
 * @jest-environment node
 *
 * Account-holder + claim platform mail — independent oracles (mock sender, DB rows).
 */

import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashAccountHolderPassword } from "@/lib/account-holder-auth";
import {
  sendAccountHolderEmail,
  sendClaimInviteEmail,
  resendAccountHolderSignupVerifyEmail,
} from "@/lib/account-holder-email";
import {
  setPlatformMailSenderForTests,
  type PlatformMailSender,
} from "@/lib/email";
import { POST as signupPOST } from "@/app/api/auth/account-holder/signup/route";
import { POST as forgotPasswordPOST } from "@/app/api/auth/account-holder/forgot-password/route";
import { POST as resendVerificationPOST } from "@/app/api/auth/account-holder/resend-verification/route";

const STRONG_PASSWORD = "Horse-Battery!Staple42";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@ah-mail.test`;
}

function capturePlatformSender(): {
  calls: Array<{ to: string; subject: string; text: string }>;
  sender: PlatformMailSender;
} {
  const calls: Array<{ to: string; subject: string; text: string }> = [];
  const sender: PlatformMailSender = async (opts) => {
    calls.push(opts);
    return { sent: true };
  };
  return { calls, sender };
}

afterAll(async () => {
  setPlatformMailSenderForTests(null);
  await db.$disconnect();
});

afterEach(() => {
  setPlatformMailSenderForTests(null);
});

describe("account-holder platform mail", () => {
  it("new AH signup sends verify URL with type=ah and persists one SIGNUP_VERIFY token", async () => {
    const email = uniqueEmail("signup-new");
    const { calls, sender } = capturePlatformSender();
    setPlatformMailSenderForTests(sender);

    const req = new NextRequest("https://app.example.com/api/auth/account-holder/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json", host: "app.example.com" },
      body: JSON.stringify({ email, password: STRONG_PASSWORD }),
    });

    const res = await signupPOST(req);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toMatch(/\/verify-email\?token=/);
    expect(calls[0].text).toMatch(/type=ah/);

    const holder = await db.accountHolder.findUnique({ where: { email } });
    expect(holder).not.toBeNull();
    const tokens = await db.accountHolderEmailToken.findMany({
      where: { accountHolderId: holder!.id, purpose: "SIGNUP_VERIFY", consumedAt: null },
    });
    expect(tokens).toHaveLength(1);

    await db.accountHolderEmailToken.deleteMany({ where: { accountHolderId: holder!.id } });
    await db.accountHolder.delete({ where: { id: holder!.id } });
  });

  it("duplicate existing AH email sends already-have-account notice without new row", async () => {
    const email = uniqueEmail("signup-dup");
    const passwordHash = await hashAccountHolderPassword(STRONG_PASSWORD);
    const existing = await db.accountHolder.create({
      data: { email, passwordHash, emailVerifiedAt: new Date() },
    });

    const { calls, sender } = capturePlatformSender();
    setPlatformMailSenderForTests(sender);

    const req = new NextRequest("https://app.example.com/api/auth/account-holder/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: STRONG_PASSWORD }),
    });

    const res = await signupPOST(req);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].subject).toMatch(/account already exists/i);
    expect(calls[0].text).toMatch(/already have a mynk account/i);
    expect(await db.accountHolder.count({ where: { email } })).toBe(1);

    await db.accountHolder.delete({ where: { id: existing.id } });
  });

  it("forgot-password unknown email does not call platform sender", async () => {
    const { calls, sender } = capturePlatformSender();
    setPlatformMailSenderForTests(sender);

    const req = new NextRequest("https://app.example.com/api/auth/account-holder/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: uniqueEmail("forgot-unknown") }),
    });

    const res = await forgotPasswordPOST(req);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("verified AH forgot-password sends reset URL; failing sender deletes unused token", async () => {
    const email = uniqueEmail("forgot-verified");
    const passwordHash = await hashAccountHolderPassword(STRONG_PASSWORD);
    const holder = await db.accountHolder.create({
      data: { email, passwordHash, emailVerifiedAt: new Date() },
    });

    const { calls, sender } = capturePlatformSender();
    setPlatformMailSenderForTests(sender);

    const okReq = new NextRequest("https://app.example.com/api/auth/account-holder/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    await forgotPasswordPOST(okReq);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toMatch(/\/account\/reset-password\?token=/);

    let token = await db.accountHolderEmailToken.findFirst({
      where: { accountHolderId: holder.id, purpose: "PASSWORD_RESET", consumedAt: null },
    });
    expect(token).not.toBeNull();

    setPlatformMailSenderForTests(async () => ({ sent: false, error: "smtp down" }));
    const failReq = new NextRequest("https://app.example.com/api/auth/account-holder/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    await forgotPasswordPOST(failReq);

    token = await db.accountHolderEmailToken.findFirst({
      where: { accountHolderId: holder.id, purpose: "PASSWORD_RESET", consumedAt: null },
    });
    expect(token).toBeNull();

    await db.accountHolderEmailToken.deleteMany({ where: { accountHolderId: holder.id } });
    await db.accountHolder.delete({ where: { id: holder.id } });
  });

  it("claim invite email includes /claim/ in invite URL", async () => {
    const { calls, sender } = capturePlatformSender();
    setPlatformMailSenderForTests(sender);

    const result = await sendClaimInviteEmail(
      "parent@example.com",
      "https://app.example.com/claim/abc123token",
      "Alice"
    );
    expect(result.sent).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain("/claim/");
  });

  it("Gmail independence: AH send uses platform sender only", async () => {
    jest.resetModules();
    const platformCalls: string[] = [];

    jest.doMock("@/lib/gmail-transport", () => ({
      createGmailTransport: jest.fn(() => {
        throw new Error("Gmail transport must not run for AH mail");
      }),
    }));
    jest.doMock("@/lib/gmail-api-send", () => ({
      sendViaGmailApi: jest.fn(() => {
        throw new Error("Gmail API must not run for AH mail");
      }),
      asciiEmailDisplayName: (s: string) => s,
    }));
    jest.doMock("@/lib/db", () => ({
      db: {
        oAuthEmailConnection: {
          findFirst: jest.fn().mockResolvedValue({
            refreshToken: "gmail",
            email: "tutor@gmail.com",
          }),
        },
        emailConfig: {
          findFirst: jest.fn().mockResolvedValue({
            host: "smtp.tutor.test",
            port: 587,
            secure: false,
            user: "u",
            password: "p",
            fromEmail: "tutor@example.com",
          }),
        },
      },
    }));

    const { setPlatformMailSenderForTests: setSender } = await import("@/lib/email");
    setSender(async (opts) => {
      platformCalls.push(opts.to);
      return { sent: true };
    });

    const { sendAccountHolderEmail: sendAh } = await import("@/lib/account-holder-email");
    const mailed = await sendAh({
      to: "parent@example.com",
      subject: "Test",
      text: "body",
      actionUrl: "https://app.example.com/x",
    });
    expect(mailed.sent).toBe(true);
    expect(platformCalls).toEqual(["parent@example.com"]);

    setSender(null);
    jest.dontMock("@/lib/gmail-transport");
    jest.dontMock("@/lib/gmail-api-send");
    jest.dontMock("@/lib/db");
  });

  it("resend: unknown → attempted false, no send; verified → no new token; unverified → send + token", async () => {
    const unknown = uniqueEmail("resend-unknown");
    const verifiedEmail = uniqueEmail("resend-verified");
    const unverifiedEmail = uniqueEmail("resend-unverified");
    const passwordHash = await hashAccountHolderPassword(STRONG_PASSWORD);

    const verified = await db.accountHolder.create({
      data: { email: verifiedEmail, passwordHash, emailVerifiedAt: new Date() },
    });
    const unverified = await db.accountHolder.create({
      data: { email: unverifiedEmail, passwordHash, emailVerifiedAt: null },
    });

    const { calls, sender } = capturePlatformSender();
    setPlatformMailSenderForTests(sender);

    expect(
      await resendAccountHolderSignupVerifyEmail({
        email: unknown,
        baseUrl: "https://app.example.com",
      })
    ).toEqual({ attempted: false });
    expect(calls).toHaveLength(0);

    expect(
      await resendAccountHolderSignupVerifyEmail({
        email: verifiedEmail,
        baseUrl: "https://app.example.com",
      })
    ).toEqual({ attempted: false });
    expect(
      await db.accountHolderEmailToken.count({
        where: { accountHolderId: verified.id, purpose: "SIGNUP_VERIFY" },
      })
    ).toBe(0);

    expect(
      await resendAccountHolderSignupVerifyEmail({
        email: unverifiedEmail,
        baseUrl: "https://app.example.com",
      })
    ).toEqual({ attempted: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toMatch(/type=ah/);
    expect(
      await db.accountHolderEmailToken.count({
        where: {
          accountHolderId: unverified.id,
          purpose: "SIGNUP_VERIFY",
          consumedAt: null,
        },
      })
    ).toBe(1);

    await db.accountHolderEmailToken.deleteMany({
      where: { accountHolderId: { in: [verified.id, unverified.id] } },
    });
    await db.accountHolder.deleteMany({
      where: { id: { in: [verified.id, unverified.id] } },
    });
  });

  it("resend route returns byte-identical JSON for unknown vs unverified; token only for unverified", async () => {
    const unknown = uniqueEmail("route-unknown");
    const unverifiedEmail = uniqueEmail("route-unverified");
    const passwordHash = await hashAccountHolderPassword(STRONG_PASSWORD);
    const unverified = await db.accountHolder.create({
      data: { email: unverifiedEmail, passwordHash, emailVerifiedAt: null },
    });

    setPlatformMailSenderForTests(async () => ({ sent: true }));

    const unknownRes = await resendVerificationPOST(
      new NextRequest("https://app.example.com/api/auth/account-holder/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: unknown }),
      })
    );
    const unverifiedRes = await resendVerificationPOST(
      new NextRequest("https://app.example.com/api/auth/account-holder/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: unverifiedEmail }),
      })
    );

    const unknownBody = await unknownRes.json();
    const unverifiedBody = await unverifiedRes.json();
    expect(JSON.stringify(unknownBody)).toBe(JSON.stringify(unverifiedBody));

    expect(
      await db.accountHolderEmailToken.count({
        where: { accountHolderId: unverified.id, purpose: "SIGNUP_VERIFY", consumedAt: null },
      })
    ).toBe(1);

    await db.accountHolderEmailToken.deleteMany({ where: { accountHolderId: unverified.id } });
    await db.accountHolder.delete({ where: { id: unverified.id } });
  });

  it("new AH signup rolls back AccountHolder when platform sender returns sent:false", async () => {
    const email = uniqueEmail("signup-rollback");
    setPlatformMailSenderForTests(async () => ({
      sent: false,
      error: "Platform SMTP is not configured.",
    }));

    const req = new NextRequest("https://app.example.com/api/auth/account-holder/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: STRONG_PASSWORD, isSelfLearner: true }),
    });

    const res = await signupPOST(req);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/confirmation email|SMTP/i);
    expect(await db.accountHolder.count({ where: { email } })).toBe(0);
  });
});

describe("EMAIL_STUB grep guard", () => {
  it("EMAIL_STUB does not appear anywhere under src/", () => {
    const srcRoot = path.join(process.cwd(), "src");
    const offenders: string[] = [];

    function walk(dir: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "__tests__") continue;
          walk(full);
        } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
          const text = fs.readFileSync(full, "utf8");
          if (text.includes("EMAIL_STUB")) {
            offenders.push(path.relative(process.cwd(), full));
          }
        }
      }
    }

    walk(srcRoot);
    expect(offenders).toEqual([]);
  });
});
