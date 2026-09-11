/**
 * Tutor email confirm — consume/replay/expiry against the real test DB.
 * Independent oracle: hashed token rows + AdminUser.emailVerifiedAt, not
 * constants derived from admin-email-verify internals beyond hashToken
 * (the same helper password-reset / AH tokens already use).
 */
import { db } from "@/lib/db";
import { hashToken, EMAIL_TOKEN_TTL_MS_24H } from "@/lib/crypto/session-tokens";
import { createAdmin } from "@/lib/auth-db";
import { consumeTutorSignupVerifyToken } from "@/lib/admin-email-verify";
import { setPlatformMailSenderForTests } from "@/lib/email";
import { requestPasswordReset } from "@/lib/password-reset";

const FIXTURE_EMAILS = [
  "tutor-evf-consume@test.com",
  "tutor-evf-replay@test.com",
  "tutor-evf-expired@test.com",
  "tutor-evf-used@test.com",
  "tutor-pwd-reset-fail@test.com",
  "tutor-pwd-reset-ok@test.com",
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
