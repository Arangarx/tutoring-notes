/**
 * Tutor email confirm — consume/replay/expiry against the real test DB.
 * Independent oracle: hashed token rows + AdminUser.emailVerifiedAt, not
 * constants derived from admin-email-verify internals beyond hashToken
 * (the same helper password-reset / AH tokens already use).
 */
import { db } from "@/lib/db";
import { hashToken, EMAIL_TOKEN_TTL_MS_24H } from "@/lib/crypto/session-tokens";
import { createAdmin } from "@/lib/auth-db";
import {
  consumeTutorSignupVerifyToken,
  resendTutorSignupVerifyEmail,
  sendTutorSignupVerifyEmail,
} from "@/lib/admin-email-verify";
import { setPlatformMailSenderForTests } from "@/lib/email";
import { requestPasswordReset } from "@/lib/password-reset";
import { POST as resendVerification } from "@/app/api/auth/tutor/resend-verification/route";
import { GET as verifyEmailGET } from "@/app/verify-email/route";
import { teachingSignInHref } from "@/lib/teaching-account-href";
import { NextRequest } from "next/server";

const FIXTURE_EMAILS = [
  "tutor-evf-consume@test.com",
  "tutor-evf-replay@test.com",
  "tutor-evf-expired@test.com",
  "tutor-evf-used@test.com",
  "tutor-pwd-reset-fail@test.com",
  "tutor-pwd-reset-ok@test.com",
  "tutor-evf-resend-unknown@test.com",
  "tutor-evf-resend-verified@test.com",
  "tutor-evf-resend-unverified@test.com",
  "tutor-evf-resend-route-a@test.com",
  "tutor-evf-resend-route-b@test.com",
  "tutor-evf-return-path@test.com",
  "tutor-evf-resend-return@test.com",
  "tutor-evf-signin-href@test.com",
] as const;

async function cleanup() {
  for (const email of FIXTURE_EMAILS) {
    await db.passwordResetToken.deleteMany({ where: { email } });
    const admin = await db.adminUser.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!admin) continue;
    await db.adminUserEmailToken.deleteMany({ where: { adminUserId: admin.id } });
    await db.adminUser.delete({ where: { id: admin.id } });
  }
}

beforeEach(async () => {
  await cleanup();
  setPlatformMailSenderForTests(null);
});

afterAll(async () => {
  await cleanup();
  setPlatformMailSenderForTests(null);
  await db.$disconnect();
});

test("consumeTutorSignupVerifyToken sets emailVerifiedAt and consumes the token", async () => {
  const admin = await createAdmin("tutor-evf-consume@test.com", "Sunrise-Kangaroo-Pluto-47!");
  expect(admin.emailVerifiedAt).toBeNull();

  const raw = "raw-verify-token-consume-1";
  await db.adminUserEmailToken.create({
    data: {
      adminUserId: admin.id,
      tokenHash: hashToken(raw),
      purpose: "SIGNUP_VERIFY",
      expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS_24H),
    },
  });

  const result = await consumeTutorSignupVerifyToken(raw);
  expect(result).toEqual({ ok: true, adminUserId: admin.id, replay: false });

  const refreshed = await db.adminUser.findUnique({ where: { id: admin.id } });
  expect(refreshed?.emailVerifiedAt).toBeInstanceOf(Date);

  const token = await db.adminUserEmailToken.findUnique({
    where: { tokenHash: hashToken(raw) },
  });
  expect(token?.consumedAt).toBeInstanceOf(Date);
});

test("consumeTutorSignupVerifyToken is idempotent within TTL after a successful consume", async () => {
  const admin = await createAdmin("tutor-evf-replay@test.com", "Sunrise-Kangaroo-Pluto-47!");
  const raw = "raw-verify-token-replay-1";
  const now = new Date();
  await db.adminUserEmailToken.create({
    data: {
      adminUserId: admin.id,
      tokenHash: hashToken(raw),
      purpose: "SIGNUP_VERIFY",
      expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS_24H),
      consumedAt: now,
    },
  });
  await db.adminUser.update({
    where: { id: admin.id },
    data: { emailVerifiedAt: now },
  });

  const result = await consumeTutorSignupVerifyToken(raw);
  expect(result).toEqual({ ok: true, adminUserId: admin.id, replay: true });
});

test("consumeTutorSignupVerifyToken rejects expired unused tokens", async () => {
  const admin = await createAdmin("tutor-evf-expired@test.com", "Sunrise-Kangaroo-Pluto-47!");
  const raw = "raw-verify-token-expired-1";
  await db.adminUserEmailToken.create({
    data: {
      adminUserId: admin.id,
      tokenHash: hashToken(raw),
      purpose: "SIGNUP_VERIFY",
      expiresAt: new Date(Date.now() - 1000),
    },
  });

  const result = await consumeTutorSignupVerifyToken(raw);
  expect(result).toEqual({ ok: false, reason: "expired" });

  const refreshed = await db.adminUser.findUnique({ where: { id: admin.id } });
  expect(refreshed?.emailVerifiedAt).toBeNull();
});

test("consumeTutorSignupVerifyToken rejects consumed tokens when the account is still unverified", async () => {
  const admin = await createAdmin("tutor-evf-used@test.com", "Sunrise-Kangaroo-Pluto-47!");
  const raw = "raw-verify-token-used-1";
  await db.adminUserEmailToken.create({
    data: {
      adminUserId: admin.id,
      tokenHash: hashToken(raw),
      purpose: "SIGNUP_VERIFY",
      expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS_24H),
      consumedAt: new Date(),
    },
  });

  const result = await consumeTutorSignupVerifyToken(raw);
  expect(result).toEqual({ ok: false, reason: "already_used" });
});

test("requestPasswordReset keeps the unused token when platform mail succeeds", async () => {
  const admin = await createAdmin("tutor-pwd-reset-ok@test.com", "Sunrise-Kangaroo-Pluto-47!");
  setPlatformMailSenderForTests(async () => ({ sent: true }));

  const { emailed } = await requestPasswordReset(admin.email);
  expect(emailed).toBe(true);

  const leftover = await db.passwordResetToken.findMany({
    where: { email: admin.email, usedAt: null },
  });
  expect(leftover).toHaveLength(1);
});

test("requestPasswordReset deletes the unused token and logs when platform mail fails", async () => {
  const admin = await createAdmin("tutor-pwd-reset-fail@test.com", "Sunrise-Kangaroo-Pluto-47!");
  setPlatformMailSenderForTests(async () => ({
    sent: false,
    error: "Platform SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.",
  }));

  const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  const { emailed } = await requestPasswordReset(admin.email);
  expect(emailed).toBe(false);

  const leftover = await db.passwordResetToken.findMany({
    where: { email: admin.email, usedAt: null },
  });
  expect(leftover).toHaveLength(0);
  expect(errorSpy).toHaveBeenCalledWith("[pwd] action=reset_send_fail");
  errorSpy.mockRestore();
});

const RESEND_BASE = "https://localhost:3000";

test("resendTutorSignupVerifyEmail does not send for an unknown email", async () => {
  const sent = jest.fn().mockResolvedValue({ sent: true });
  setPlatformMailSenderForTests(sent);

  const result = await resendTutorSignupVerifyEmail({
    email: "tutor-evf-resend-unknown@test.com",
    baseUrl: RESEND_BASE,
  });

  expect(result).toEqual({ attempted: false });
  expect(sent).not.toHaveBeenCalled();
  expect(
    await db.adminUser.findUnique({
      where: { email: "tutor-evf-resend-unknown@test.com" },
    })
  ).toBeNull();
});

test("resendTutorSignupVerifyEmail does not send for an already-verified tutor", async () => {
  const admin = await createAdmin(
    "tutor-evf-resend-verified@test.com",
    "Sunrise-Kangaroo-Pluto-47!"
  );
  await db.adminUser.update({
    where: { id: admin.id },
    data: { emailVerifiedAt: new Date("2026-01-01") },
  });
  const sent = jest.fn().mockResolvedValue({ sent: true });
  setPlatformMailSenderForTests(sent);

  const result = await resendTutorSignupVerifyEmail({
    email: admin.email,
    baseUrl: RESEND_BASE,
  });

  expect(result).toEqual({ attempted: false });
  expect(sent).not.toHaveBeenCalled();
  expect(
    await db.adminUserEmailToken.count({ where: { adminUserId: admin.id } })
  ).toBe(0);
});

test("resendTutorSignupVerifyEmail sends and persists a token for an unverified tutor", async () => {
  const admin = await createAdmin(
    "tutor-evf-resend-unverified@test.com",
    "Sunrise-Kangaroo-Pluto-47!"
  );
  expect(admin.emailVerifiedAt).toBeNull();
  const sent = jest.fn().mockResolvedValue({ sent: true });
  setPlatformMailSenderForTests(sent);

  const result = await resendTutorSignupVerifyEmail({
    email: admin.email,
    baseUrl: RESEND_BASE,
  });

  expect(result).toEqual({ attempted: true });
  expect(sent).toHaveBeenCalledTimes(1);
  expect(sent.mock.calls[0][0]).toEqual(
    expect.objectContaining({
      to: "tutor-evf-resend-unverified@test.com",
      subject: "Confirm your Mynk tutor email",
    })
  );
  expect(String(sent.mock.calls[0][0].text)).toMatch(
    /\/verify-email\?type=admin&token=/
  );

  const tokens = await db.adminUserEmailToken.findMany({
    where: { adminUserId: admin.id, purpose: "SIGNUP_VERIFY", consumedAt: null },
  });
  expect(tokens).toHaveLength(1);
});

function resendRequest(email: string, returnTo?: string): NextRequest {
  return new NextRequest("https://localhost/api/auth/tutor/resend-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "localhost" },
    body: JSON.stringify(returnTo === undefined ? { email } : { email, returnTo }),
  });
}

function mailedReturnTo(text: string): string | null {
  const link = text.match(/https?:\/\/\S+/)?.[0] ?? "";
  return new URL(link).searchParams.get("returnTo");
}

test("tutor confirm link keeps a same-site return path", async () => {
  const admin = await createAdmin(
    "tutor-evf-return-path@test.com",
    "Sunrise-Kangaroo-Pluto-47!"
  );
  const sent = jest.fn().mockResolvedValue({ sent: true });
  setPlatformMailSenderForTests(sent);
  const returnTo = "/org-invite/abc123";

  await sendTutorSignupVerifyEmail({
    adminUserId: admin.id,
    email: admin.email,
    baseUrl: "https://preview.example",
    returnTo,
  });

  const text = String(sent.mock.calls[0][0].text);
  const link = text.match(/https:\/\/preview\.example\S+/)?.[0] ?? "";
  const url = new URL(link);
  expect(url.pathname).toBe("/verify-email");
  expect(url.searchParams.get("type")).toBe("admin");
  expect(url.searchParams.get("returnTo")).toBe(returnTo);
  expect(url.searchParams.get("token")).toBeTruthy();
  setPlatformMailSenderForTests(null);
});

test("resend of the tutor confirmation keeps a sanitized return path", async () => {
  const admin = await createAdmin(
    "tutor-evf-resend-return@test.com",
    "Sunrise-Kangaroo-Pluto-47!"
  );
  const sent = jest.fn().mockResolvedValue({ sent: true });
  setPlatformMailSenderForTests(sent);
  const returnTo = "/org-invite/abc123";

  const kept = await resendTutorSignupVerifyEmail({
    email: admin.email,
    baseUrl: RESEND_BASE,
    returnTo,
  });
  expect(kept).toEqual({ attempted: true });
  expect(mailedReturnTo(String(sent.mock.calls[0][0].text))).toBe(returnTo);

  sent.mockClear();
  await resendTutorSignupVerifyEmail({
    email: admin.email,
    baseUrl: RESEND_BASE,
    returnTo: "https://evil.example/phish",
  });
  const hostile = String(sent.mock.calls[0][0].text);
  expect(hostile).not.toContain("evil.example");
  expect(mailedReturnTo(hostile)).toBeNull();

  const routeSent = jest.fn().mockResolvedValue({ sent: true });
  setPlatformMailSenderForTests(routeSent);
  const dropped = await resendVerification(resendRequest(admin.email, "//host"));
  expect(dropped.status).toBe(200);
  expect(mailedReturnTo(String(routeSent.mock.calls[0][0].text))).toBeNull();

  routeSent.mockClear();
  const forwarded = await resendVerification(resendRequest(admin.email, returnTo));
  expect(forwarded.status).toBe(200);
  expect(mailedReturnTo(String(routeSent.mock.calls[0][0].text))).toBe(returnTo);
  setPlatformMailSenderForTests(null);
});

test("admin confirm redirects through the teaching sign-in link plus verified=1", async () => {
  const email = "tutor-evf-signin-href@test.com";
  const admin = await createAdmin(email, "Sunrise-Kangaroo-Pluto-47!");
  const origin = "http://localhost:3000";
  const returnTo = "/org-invite/abc123";

  async function confirmLocation(raw: string, returnToRaw: string): Promise<string | null> {
    await db.adminUserEmailToken.create({
      data: {
        adminUserId: admin.id,
        tokenHash: hashToken(raw),
        purpose: "SIGNUP_VERIFY",
        expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS_24H),
      },
    });
    const params = new URLSearchParams({ type: "admin", token: raw });
    if (returnToRaw) params.set("returnTo", returnToRaw);
    const response = await verifyEmailGET(
      new NextRequest(`${origin}/verify-email?${params.toString()}`)
    );
    return response.headers.get("location");
  }

  function expectedLogin(returnPath: string | null): string {
    const login = new URL(teachingSignInHref(returnPath, email), origin);
    login.searchParams.set("verified", "1");
    return login.toString();
  }

  expect(await confirmLocation("raw-signin-href-return", returnTo)).toBe(
    expectedLogin(returnTo)
  );
  expect(await confirmLocation("raw-signin-href-bare", "")).toBe(expectedLogin(null));
});

test("POST /api/auth/tutor/resend-verification is anti-enumerating: same body for unknown vs unverified", async () => {
  setPlatformMailSenderForTests(async () => ({ sent: true }));
  const unverified = await createAdmin(
    "tutor-evf-resend-route-a@test.com",
    "Sunrise-Kangaroo-Pluto-47!"
  );

  const unknownRes = await resendVerification(
    resendRequest("tutor-evf-resend-route-b@test.com")
  );
  const unverifiedRes = await resendVerification(resendRequest(unverified.email));

  expect(unknownRes.status).toBe(200);
  expect(unverifiedRes.status).toBe(200);
  expect(await unknownRes.json()).toEqual(await unverifiedRes.json());

  expect(
    await db.adminUser.findUnique({
      where: { email: "tutor-evf-resend-route-b@test.com" },
    })
  ).toBeNull();
  expect(
    await db.adminUserEmailToken.count({
      where: { adminUserId: unverified.id, purpose: "SIGNUP_VERIFY", consumedAt: null },
    })
  ).toBe(1);
});
