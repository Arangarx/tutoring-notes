import { type Page, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import path from "node:path";

import { encryptTotpSecret } from "@/lib/crypto/totp-secret";
import { generateBackupCodes, storeBackupCodes } from "@/lib/two-factor-db";
import { hashEmailOtpCode } from "@/lib/email-otp-challenge";
const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

/** Real (non-harness) tutor with confirmed 2FA enrollment — login→TOTP→land. */
export const TEST_2FA_TUTOR = {
  email: "playwright-tfa-tutor@test.local",
  password: "TwofaTutorPw!789",
  displayName: "Playwright 2FA Tutor",
  /** Fixed base32 secret — only used in local harness DB seed. */
  totpSecret: "JBSWY3DPEHPK3PXP",
} as const;

/** Real tutor without 2FA — enrollment + QR egress assertions. */
export const TEST_2FA_ENROLL = {
  email: "playwright-tfa-enroll@test.local",
  password: "TwofaEnrollPw!789",
  displayName: "Playwright 2FA Enroll",
} as const;

/** Hosts that must never receive TOTP secrets (2026-05-31 hard-won lesson). */
export const KNOWN_EXTERNAL_QR_HOSTS = [
  "api.qrserver.com",
  "chart.googleapis.com",
  "quickchart.io",
] as const;

const TOTP_PARAMS = {
  issuer: "Mynk",
  algorithm: "SHA1" as const,
  digits: 6,
  period: 30,
};

export type NetworkCapture = {
  requests: { url: string; method: string; postData?: string }[];
  start: () => void;
  assertNoSecretEgress: (secret: string, pageOrigin: string) => void;
};

function ensureTotpEncryptionKey(): void {
  // The Playwright webServer forces this key (see wb-regression-local-db.cjs).
  // Reading .env here encrypts fixtures the dev server cannot decrypt
  // ("Unsupported state or unable to authenticate data").
  const { WB_REGRESSION_TOTP_ENCRYPTION_KEY } = require("../../../scripts/wb-regression-local-db.cjs");
  process.env.TOTP_ENCRYPTION_KEY = WB_REGRESSION_TOTP_ENCRYPTION_KEY;
}

/**
 * Drop a tutor's 2FA rows before re-seed. Backup codes and email/SMS
 * challenges reference AdminUser2FA. Delete the children first so a
 * database whose FK is not ON DELETE CASCADE cannot fail the seed with
 * AdminUser2FABackupCode_twoFaId_fkey.
 */
async function deleteTutor2faRows(
  prisma: PrismaClient,
  adminUserId: string
): Promise<void> {
  const rows = await prisma.adminUser2FA.findMany({
    where: { adminUserId },
    select: { id: true },
  });
  const ids = rows.map((row) => row.id);
  if (ids.length > 0) {
    await prisma.adminUser2FABackupCode.deleteMany({ where: { twoFaId: { in: ids } } });
    await prisma.adminUser2FAEmailChallenge.deleteMany({
      where: { twoFaId: { in: ids } },
    });
  }
  await prisma.adminUser2FAEmailChallenge.deleteMany({ where: { adminUserId } });
  await prisma.adminUser2FA.deleteMany({ where: { adminUserId } });
}

/** RFC 6238 code — same `otpauth` lib + params as product verify path. */
export function generateTotpCode(
  secret: string,
  timestampMs: number = Date.now()
): string {
  const totp = new OTPAuth.TOTP({
    ...TOTP_PARAMS,
    label: "test",
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.generate({ timestamp: timestampMs });
}

export async function seedEnrolled2faTutor(): Promise<{
  adminUserId: string;
  totpSecret: string;
}> {
  assertLocalDatabaseUrlForHarness();
  ensureTotpEncryptionKey();

  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(TEST_2FA_TUTOR.password, 10);
  const totpSecret = TEST_2FA_TUTOR.totpSecret;

  try {
    const user = await prisma.adminUser.upsert({
      where: { email: TEST_2FA_TUTOR.email },
      create: {
        email: TEST_2FA_TUTOR.email,
        passwordHash,
        displayName: TEST_2FA_TUTOR.displayName,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        isTestAccount: false,
        emailVerifiedAt: new Date("2026-01-01"),
      },
      update: {
        passwordHash,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        isTestAccount: false,
        emailVerifiedAt: new Date("2026-01-01"),
      },
      select: { id: true },
    });

    await deleteTutor2faRows(prisma, user.id);

    const totpSecretEnc = encryptTotpSecret(totpSecret);
    const twoFa = await prisma.adminUser2FA.create({
      data: {
        adminUserId: user.id,
        method: "TOTP",
        totpSecretEnc,
        enrolledAt: new Date(),
      },
      select: { id: true },
    });

    const backup = await generateBackupCodes();
    await storeBackupCodes(
      twoFa.id,
      backup.map((c) => ({ hash: c.hash }))
    );

    return { adminUserId: user.id, totpSecret };
  } finally {
    await prisma.$disconnect();
  }
}

/** TOTP-enrolled tutor with a seeded LOGIN email OTP challenge (chunk 2 email-alt path). */
export async function seedTotpTutorWithEmailLoginChallenge(): Promise<{
  adminUserId: string;
  totpSecret: string;
  loginCode: string;
}> {
  assertLocalDatabaseUrlForHarness();
  ensureTotpEncryptionKey();

  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(TEST_2FA_TUTOR.password, 10);
  const totpSecret = TEST_2FA_TUTOR.totpSecret;
  const loginCode = "381604";

  try {
    const user = await prisma.adminUser.upsert({
      where: { email: TEST_2FA_TUTOR.email },
      create: {
        email: TEST_2FA_TUTOR.email,
        passwordHash,
        displayName: TEST_2FA_TUTOR.displayName,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        isTestAccount: false,
        emailVerifiedAt: new Date("2026-01-01"),
      },
      update: {
        passwordHash,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        isTestAccount: false,
        emailVerifiedAt: new Date("2026-01-01"),
      },
      select: { id: true },
    });

    await deleteTutor2faRows(prisma, user.id);
    await prisma.authThrottle.deleteMany({
      where: {
        scopeKey: {
          in: [`2fa-otp-send:EMAIL:${user.id}`, `2fa-otp-send:SMS:${user.id}`],
        },
      },
    });

    const totpSecretEnc = encryptTotpSecret(totpSecret);
    const twoFa = await prisma.adminUser2FA.create({
      data: {
        adminUserId: user.id,
        method: "TOTP",
        totpSecretEnc,
        enrolledAt: new Date(),
      },
      select: { id: true },
    });

    const backup = await generateBackupCodes();
    await storeBackupCodes(
      twoFa.id,
      backup.map((c) => ({ hash: c.hash }))
    );

    await prisma.adminUser2FAEmailChallenge.create({
      data: {
        adminUserId: user.id,
        twoFaId: twoFa.id,
        codeHash: hashEmailOtpCode(loginCode),
        purpose: "LOGIN",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    return { adminUserId: user.id, totpSecret, loginCode };
  } finally {
    await prisma.$disconnect();
  }
}

/** Fresh real tutor with no AdminUser2FA row — for enrollment surface tests. */
export async function seedUnenrolled2faTutor(): Promise<string> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(TEST_2FA_ENROLL.password, 10);

  try {
    const user = await prisma.adminUser.upsert({
      where: { email: TEST_2FA_ENROLL.email },
      create: {
        email: TEST_2FA_ENROLL.email,
        passwordHash,
        displayName: TEST_2FA_ENROLL.displayName,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        isTestAccount: false,
        emailVerifiedAt: new Date("2026-01-01"),
      },
      update: {
        passwordHash,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        isTestAccount: false,
        emailVerifiedAt: new Date("2026-01-01"),
      },
      select: { id: true },
    });

    await deleteTutor2faRows(prisma, user.id);
    return user.id;
  } finally {
    await prisma.$disconnect();
  }
}

export async function loginTutorWithPassword(
  page: Page,
  creds: { email: string; password: string }
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto("/login");
    await page.locator("#email").waitFor({ state: "visible", timeout: 30_000 });
    await page.locator("#email").fill(creds.email);
    await page.locator("#password").fill(creds.password);
    await page.getByRole("button", { name: /^(sign in|log in)$/i }).click();
    try {
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 20_000,
      });
      return;
    } catch {
      if (attempt === 1) {
        throw new Error(`Login failed for ${creds.email} — still on /login`);
      }
    }
  }
}

export async function waitFor2faVerifyChallenge(page: Page): Promise<void> {
  await page.waitForURL(
    (url) => url.pathname.startsWith("/admin/settings/2fa/verify"),
    { timeout: 30_000 }
  );
  await expect(
    page.getByRole("heading", { name: "Two-Factor Verification" })
  ).toBeVisible({ timeout: 15_000 });
}

export async function submitTotpOnVerifyPage(
  page: Page,
  code: string
): Promise<void> {
  const input = page.getByPlaceholder("000000");
  await input.fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
}

/** Tutor authed landing — past 2FA gate, on tutor workspace (not challenge UI). */
export async function expectTutorAuthedLanding(page: Page): Promise<void> {
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith("/admin") &&
      !url.pathname.startsWith("/admin/settings/2fa") &&
      url.pathname !== "/admin/pending-approval",
    { timeout: 30_000 }
  );
  const pathname = new URL(page.url()).pathname;
  expect(pathname).toMatch(/^\/admin(\/students)?/);
}

export function attachNetworkCapture(page: Page): NetworkCapture {
  const requests: NetworkCapture["requests"] = [];
  let listening = false;

  const handler = (req: {
    url: () => string;
    method: () => string;
    postData: () => string | null;
  }) => {
    if (!listening) return;
    requests.push({
      url: req.url(),
      method: req.method(),
      postData: req.postData() ?? undefined,
    });
  };

  page.on("request", handler);

  return {
    requests,
    start: () => {
      listening = true;
    },
    assertNoSecretEgress: (secret: string, pageOrigin: string) => {
      const otpauthFragment = secret ? `secret=${secret}` : "";

      for (const req of requests) {
        let host: string;
        try {
          host = new URL(req.url).hostname.toLowerCase();
        } catch {
          continue;
        }

        for (const blocked of KNOWN_EXTERNAL_QR_HOSTS) {
          if (host === blocked || host.endsWith(`.${blocked}`)) {
            throw new Error(`SECURITY RED: request to external QR host ${req.url}`);
          }
        }

        const isSameOrigin = req.url.startsWith(pageOrigin);
        const isDataOrBlob =
          req.url.startsWith("data:") || req.url.startsWith("blob:");

        if (!isSameOrigin && !isDataOrBlob) {
          if (secret && req.url.includes(secret)) {
            throw new Error(
              `SECURITY RED: TOTP secret in outbound URL to ${req.url}`
            );
          }
          if (otpauthFragment && req.url.includes(otpauthFragment)) {
            throw new Error(
              `SECURITY RED: otpauth secret param in outbound URL to ${req.url}`
            );
          }
          const body = req.postData ?? "";
          if (secret && body.includes(secret)) {
            throw new Error(
              `SECURITY RED: TOTP secret in outbound body to ${req.url}`
            );
          }
          if (otpauthFragment && body.includes(otpauthFragment)) {
            throw new Error(
              `SECURITY RED: otpauth secret in outbound body to ${req.url}`
            );
          }
        }
      }
    },
  };
}

export function projectRoot(): string {
  return path.resolve(__dirname, "../../..");
}
