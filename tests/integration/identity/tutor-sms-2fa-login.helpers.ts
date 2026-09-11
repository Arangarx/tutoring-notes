import { type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { hashOtpCode } from "@/lib/otp-challenge";
import { maskE164 } from "@/lib/sms";
import {
  attachNetworkCapture,
  expectTutorAuthedLanding,
  generateTotpCode,
  loginTutorWithPassword,
  seedUnenrolled2faTutor,
  submitTotpOnVerifyPage,
  waitFor2faVerifyChallenge,
} from "./tutor-2fa-login.helpers";

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

export const TEST_SMS_2FA_TUTOR = {
  email: "playwright-sms-2fa@test.local",
  password: "Sms2faTutorPw!789",
  displayName: "Playwright SMS 2FA Tutor",
  phoneE164: "+15551234567",
} as const;

/** Expected mask for TEST_SMS_2FA_TUTOR.phoneE164 per maskE164() in src/lib/sms.ts */
export const TEST_SMS_2FA_MASKED_PHONE = maskE164(TEST_SMS_2FA_TUTOR.phoneE164);

const KNOWN_SMS_OTP = "739104";
const KNOWN_EMAIL_FALLBACK_OTP = "582103";

export async function seedSmsOtpEnrolledTutor(): Promise<{
  adminUserId: string;
  loginCode: string;
}> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(TEST_SMS_2FA_TUTOR.password, 10);

  try {
    const user = await prisma.adminUser.upsert({
      where: { email: TEST_SMS_2FA_TUTOR.email },
      create: {
        email: TEST_SMS_2FA_TUTOR.email,
        passwordHash,
        displayName: TEST_SMS_2FA_TUTOR.displayName,
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

    await prisma.adminUser2FAEmailChallenge.deleteMany({ where: { adminUserId: user.id } });
    await prisma.adminUser2FA.deleteMany({ where: { adminUserId: user.id } });

    const twoFa = await prisma.adminUser2FA.create({
      data: {
        adminUserId: user.id,
        method: "SMS_OTP",
        phoneE164: TEST_SMS_2FA_TUTOR.phoneE164,
        totpSecretEnc: null,
        enrolledAt: new Date(),
      },
      select: { id: true },
    });

    await prisma.adminUser2FAEmailChallenge.create({
      data: {
        adminUserId: user.id,
        twoFaId: twoFa.id,
        codeHash: hashOtpCode(KNOWN_SMS_OTP),
        purpose: "LOGIN",
        channel: "SMS",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    return { adminUserId: user.id, loginCode: KNOWN_SMS_OTP };
  } finally {
    await prisma.$disconnect();
  }
}

export async function seedSmsOtpEnrolledTutorWithEmailFallback(): Promise<{
  adminUserId: string;
  smsLoginCode: string;
  emailFallbackCode: string;
}> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(TEST_SMS_2FA_TUTOR.password, 10);

  try {
    const user = await prisma.adminUser.upsert({
      where: { email: TEST_SMS_2FA_TUTOR.email },
      create: {
        email: TEST_SMS_2FA_TUTOR.email,
        passwordHash,
        displayName: TEST_SMS_2FA_TUTOR.displayName,
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

    await prisma.adminUser2FAEmailChallenge.deleteMany({ where: { adminUserId: user.id } });
    await prisma.adminUser2FA.deleteMany({ where: { adminUserId: user.id } });

    const twoFa = await prisma.adminUser2FA.create({
      data: {
        adminUserId: user.id,
        method: "SMS_OTP",
        phoneE164: TEST_SMS_2FA_TUTOR.phoneE164,
        totpSecretEnc: null,
        enrolledAt: new Date(),
      },
      select: { id: true },
    });

    await prisma.adminUser2FAEmailChallenge.create({
      data: {
        adminUserId: user.id,
        twoFaId: twoFa.id,
        codeHash: hashOtpCode(KNOWN_SMS_OTP),
        purpose: "LOGIN",
        channel: "SMS",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    await prisma.adminUser2FAEmailChallenge.create({
      data: {
        adminUserId: user.id,
        twoFaId: twoFa.id,
        codeHash: hashOtpCode(KNOWN_EMAIL_FALLBACK_OTP),
        purpose: "LOGIN",
        channel: "EMAIL",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    return {
      adminUserId: user.id,
      smsLoginCode: KNOWN_SMS_OTP,
      emailFallbackCode: KNOWN_EMAIL_FALLBACK_OTP,
    };
  } finally {
    await prisma.$disconnect();
  }
}

export async function submitSmsOtpOnVerifyPage(page: Page, code: string): Promise<void> {
  const input = page.getByPlaceholder("000000");
  await input.fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
}

export {
  attachNetworkCapture,
  expectTutorAuthedLanding,
  generateTotpCode,
  loginTutorWithPassword,
  seedUnenrolled2faTutor,
  submitTotpOnVerifyPage,
  waitFor2faVerifyChallenge,
};
