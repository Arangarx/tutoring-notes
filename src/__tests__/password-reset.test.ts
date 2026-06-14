import { db } from "@/lib/db";
import { createAdmin, verifyPassword } from "@/lib/auth-db";
import {
  completePasswordReset,
  generateRawResetToken,
  getEmailForValidResetToken,
  hashResetToken,
} from "@/lib/password-reset";

// Strong passphrase that passes the zxcvbn threshold enforced by
// validatePasswordStrength (used by completePasswordReset).
const STRONG_PASS = "Sunrise-Kangaroo-Pluto-47!";
const STRONG_PASS_2 = "Velvet-Octopus-Theorem-88!";

beforeEach(async () => {
  await db.passwordResetToken.deleteMany();
  // adminUser cascade-deletes adminTrustedDevice rows (onDelete: Cascade in schema).
  await db.adminUser.deleteMany();
});

afterAll(async () => {
  await db.$disconnect();
});

test("completePasswordReset updates password when token is valid", async () => {
  await createAdmin("tutor-reset@test.com", "oldpassword123");
  const raw = generateRawResetToken();
  await db.passwordResetToken.create({
    data: {
      email: "tutor-reset@test.com",
      tokenHash: hashResetToken(raw),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });

  const result = await completePasswordReset(raw, STRONG_PASS);
  expect(result).toEqual({ ok: true });

  const admin = await db.adminUser.findUnique({ where: { email: "tutor-reset@test.com" } });
  expect(admin).not.toBeNull();
  expect(await verifyPassword(STRONG_PASS, admin!.passwordHash)).toBe(true);
  expect(await verifyPassword("oldpassword123", admin!.passwordHash)).toBe(false);
});

test("completePasswordReset rejects expired token", async () => {
  await createAdmin("tutor-expired@test.com", "pw12345678");
  const raw = generateRawResetToken();
  await db.passwordResetToken.create({
    data: {
      email: "tutor-expired@test.com",
      tokenHash: hashResetToken(raw),
      expiresAt: new Date(Date.now() - 1000),
    },
  });

  const result = await completePasswordReset(raw, STRONG_PASS_2);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toMatch(/expired/i);
});

test("hashResetToken is stable for same input", () => {
  const t = "abc";
  expect(hashResetToken(t)).toBe(hashResetToken(t));
});

// ---------------------------------------------------------------------------
// getEmailForValidResetToken
// ---------------------------------------------------------------------------

test("getEmailForValidResetToken returns email for a valid unused token", async () => {
  await createAdmin("anchor-user@test.com", "pw12345678");
  const raw = generateRawResetToken();
  await db.passwordResetToken.create({
    data: {
      email: "anchor-user@test.com",
      tokenHash: hashResetToken(raw),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });

  const email = await getEmailForValidResetToken(raw);
  expect(email).toBe("anchor-user@test.com");
});

test("getEmailForValidResetToken returns null for an expired token", async () => {
  await createAdmin("anchor-expired@test.com", "pw12345678");
  const raw = generateRawResetToken();
  await db.passwordResetToken.create({
    data: {
      email: "anchor-expired@test.com",
      tokenHash: hashResetToken(raw),
      expiresAt: new Date(Date.now() - 1000),
    },
  });

  const email = await getEmailForValidResetToken(raw);
  expect(email).toBeNull();
});

test("getEmailForValidResetToken returns null for an already-used token", async () => {
  await createAdmin("anchor-used@test.com", "pw12345678");
  const raw = generateRawResetToken();
  await db.passwordResetToken.create({
    data: {
      email: "anchor-used@test.com",
      tokenHash: hashResetToken(raw),
      expiresAt: new Date(Date.now() + 3_600_000),
      usedAt: new Date(),
    },
  });

  const email = await getEmailForValidResetToken(raw);
  expect(email).toBeNull();
});

test("getEmailForValidResetToken returns null for an unknown token", async () => {
  const raw = generateRawResetToken();
  const email = await getEmailForValidResetToken(raw);
  expect(email).toBeNull();
});

// ---------------------------------------------------------------------------
// forgot-password cascade: completePasswordReset revokes trusted devices
// ---------------------------------------------------------------------------

test("completePasswordReset revokes all trusted devices for the admin", async () => {
  await createAdmin("cascade-user@test.com", "OldPass-Cascade-1!");
  const admin = await db.adminUser.findUnique({ where: { email: "cascade-user@test.com" } });
  expect(admin).not.toBeNull();

  // Plant two fake trusted-device rows.
  await db.adminTrustedDevice.createMany({
    data: [
      {
        adminUserId: admin!.id,
        tokenHash: "fake-hash-1",
        expiresAt: new Date(Date.now() + 3_600_000),
        lastUsedAt: new Date(),
      },
      {
        adminUserId: admin!.id,
        tokenHash: "fake-hash-2",
        expiresAt: new Date(Date.now() + 3_600_000),
        lastUsedAt: new Date(),
      },
    ],
  });

  const raw = generateRawResetToken();
  await db.passwordResetToken.create({
    data: {
      email: "cascade-user@test.com",
      tokenHash: hashResetToken(raw),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });

  const result = await completePasswordReset(raw, "Cascade-NewPass-77!");
  expect(result).toEqual({ ok: true });

  // All trusted devices for this admin should now be revoked.
  const active = await db.adminTrustedDevice.findMany({
    where: { adminUserId: admin!.id, revokedAt: null },
  });
  expect(active).toHaveLength(0);
});
