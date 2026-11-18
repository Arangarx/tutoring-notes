// @ts-nocheck — Jest 30 mock factory inference produces `never` return types.
/**
 * Email OTP start actions when mail cannot send.
 *
 * Availability is the real isEmail2faEnrollmentAvailable() result (SMTP unset
 * vs SMTP set, Playwright harness off) — not a stub of that function.
 *
 * RED-BEFORE: delete the isEmail2faEnrollmentAvailable() guard in
 * startEmailOtpEnrollment or startEmailOtpMethodChange. The matching
 * "unavailable" test then returns ok or writes a 2FA row / pendingMethod.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

import { hmacToken } from "@/lib/crypto/session-tokens";

const ORIG_ENV = { ...process.env };
const ADMIN_ID = "email-otp-unavailable-admin";
const GRANT_SECRET = "email-otp-grant-secret-at-least-32-chars";
const ACCOUNT_EMAIL = "email-otp@example.com";

type TwoFaRow = {
  id: string;
  adminUserId: string;
  method: string;
  enrolledAt: Date | null;
  pendingMethod: string | null;
};

function setupAuthMocks(): void {
  jest.mock("next-auth", () => ({
    getServerSession: jest.fn().mockResolvedValue({
      user: { email: ACCOUNT_EMAIL, id: ADMIN_ID, isTestAccount: false },
    }),
  }));
  jest.mock("@/auth-options", () => ({ authOptions: {} }));
  jest.mock("@/lib/student-scope", () => ({
    requireStudentScope: jest.fn().mockResolvedValue({ kind: "admin", adminId: ADMIN_ID }),
  }));
  jest.mock("next/navigation", () => ({
    redirect: jest.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    }),
  }));
}

function applyMailEnv(mailConfigured: boolean): void {
  delete process.env.PLAYWRIGHT_TEST;
  process.env.NEXTAUTH_SECRET = "test-nextauth-secret-must-be-at-least-32-chars-long";
  process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 0xaa).toString("base64url");
  process.env.ADMIN_TFA_DEVICE_HMAC_SECRET = GRANT_SECRET;
  if (mailConfigured) {
    process.env.SMTP_HOST = "smtp.example.test";
    process.env.SMTP_USER = "otp-test";
    process.env.SMTP_PASS = "otp-test-pass";
  } else {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  }
}

async function loadActions(opts: {
  mailConfigured: boolean;
  seed: TwoFaRow | null;
  withGrant: boolean;
}): Promise<{
  startEmailOtpEnrollment: () => Promise<{ ok: boolean; error?: string; maskedEmail?: string }>;
  startEmailOtpMethodChange: () => Promise<{ ok: boolean; error?: string; maskedEmail?: string }>;
  rows: Map<string, TwoFaRow>;
  send: jest.Mock;
  available: () => boolean;
}> {
  applyMailEnv(opts.mailConfigured);
  jest.resetModules();

  const rows = new Map<string, TwoFaRow>();
  if (opts.seed) rows.set(opts.seed.adminUserId, { ...opts.seed });

  const cookieStore = new Map<string, string>();
  if (opts.withGrant) {
    cookieStore.set(
      "tfa-change-grant",
      `${ADMIN_ID}.${hmacToken(ADMIN_ID, GRANT_SECRET)}`
    );
  }

  const send = jest.fn().mockResolvedValue({ ok: true });
  let seq = 0;

  setupAuthMocks();

  jest.mock("@/lib/db", () => ({
    db: {
      adminUser: {
        findUnique: jest.fn().mockImplementation(async ({ where, select }) => {
          if (select?.email) return { email: ACCOUNT_EMAIL };
          return { id: where.id, isTestAccount: false };
        }),
      },
      adminUser2FA: {
        deleteMany: jest.fn().mockImplementation(async ({ where }) => {
          const had = rows.has(where.adminUserId);
          rows.delete(where.adminUserId);
          return { count: had ? 1 : 0 };
        }),
        create: jest.fn().mockImplementation(async ({ data, select }) => {
          seq += 1;
          const row: TwoFaRow = {
            id: `tfa-created-${seq}`,
            adminUserId: data.adminUserId,
            method: data.method,
            enrolledAt: data.enrolledAt ?? null,
            pendingMethod: data.pendingMethod ?? null,
          };
          rows.set(data.adminUserId, row);
          return select ? { id: row.id } : row;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          return rows.get(where.adminUserId) ?? null;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          let row = where.adminUserId ? rows.get(where.adminUserId) : undefined;
          if (!row && where.id) {
            for (const candidate of rows.values()) {
              if (candidate.id === where.id) {
                row = candidate;
                break;
              }
            }
          }
          if (!row) throw new Error(`no 2FA row for ${JSON.stringify(where)}`);
          if (data.pendingMethod !== undefined) row.pendingMethod = data.pendingMethod;
          if (data.method !== undefined) row.method = data.method;
          if (data.enrolledAt !== undefined) row.enrolledAt = data.enrolledAt;
          return row;
        }),
      },
    },
  }));

  jest.mock("@/lib/email-otp-challenge", () => ({
    sendEmailOtpChallenge: send,
    verifyEmailOtpChallenge: jest.fn(),
  }));

  jest.mock("@/lib/two-factor-step-up", () => ({
    verifyTotpStepUp: jest.fn(),
  }));

  jest.mock("next/headers", () => ({
    cookies: jest.fn().mockResolvedValue({
      get: (name: string) => {
        const value = cookieStore.get(name);
        return value ? { value } : undefined;
      },
      set: jest.fn(),
    }),
    headers: jest.fn().mockResolvedValue({ get: jest.fn() }),
  }));

  const enrollment = await import("@/lib/two-factor-enrollment");
  const actions = await import("@/app/admin/settings/2fa/actions");
  return {
    startEmailOtpEnrollment: actions.startEmailOtpEnrollment,
    startEmailOtpMethodChange: actions.startEmailOtpMethodChange,
    rows,
    send,
    available: enrollment.isEmail2faEnrollmentAvailable,
  };
}

const CONFIRMED_TOTP: TwoFaRow = {
  id: "tfa-existing",
  adminUserId: ADMIN_ID,
  method: "TOTP",
  enrolledAt: new Date("2026-01-01T00:00:00Z"),
  pendingMethod: null,
};

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

describe("email OTP start actions when enrollment is unavailable", () => {
  it("startEmailOtpEnrollment returns the unavailable error and creates no 2FA row", async () => {
    const { startEmailOtpEnrollment, rows, send, available } = await loadActions({
      mailConfigured: false,
      seed: null,
      withGrant: false,
    });

    expect(available()).toBe(false);

    const result = await startEmailOtpEnrollment();

    expect(result).toEqual({
      ok: false,
      error: "Email codes are not available right now.",
    });
    expect(rows.size).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("startEmailOtpMethodChange returns the unavailable error and leaves no pending method", async () => {
    const { startEmailOtpMethodChange, rows, send, available } = await loadActions({
      mailConfigured: false,
      seed: CONFIRMED_TOTP,
      withGrant: true,
    });

    expect(available()).toBe(false);

    const result = await startEmailOtpMethodChange();

    expect(result).toEqual({
      ok: false,
      error: "Email codes are not available right now.",
    });
    const row = rows.get(ADMIN_ID);
    expect(row?.method).toBe("TOTP");
    expect(row?.pendingMethod).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("email OTP start actions when enrollment is available", () => {
  it("startEmailOtpEnrollment creates a pending email 2FA row and sends a code", async () => {
    const { startEmailOtpEnrollment, rows, send, available } = await loadActions({
      mailConfigured: true,
      seed: null,
      withGrant: false,
    });

    expect(available()).toBe(true);

    const result = await startEmailOtpEnrollment();

    expect(result.ok).toBe(true);
    expect(result.maskedEmail).toMatch(/@example\.com$/);
    expect(result.maskedEmail).not.toBe(ACCOUNT_EMAIL);
    const row = rows.get(ADMIN_ID);
    expect(row?.method).toBe("EMAIL_OTP");
    expect(row?.enrolledAt).toBeNull();
    expect(row?.pendingMethod).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("startEmailOtpMethodChange sets a pending email method and sends a code", async () => {
    const { startEmailOtpMethodChange, rows, send, available } = await loadActions({
      mailConfigured: true,
      seed: CONFIRMED_TOTP,
      withGrant: true,
    });

    expect(available()).toBe(true);

    const result = await startEmailOtpMethodChange();

    expect(result.ok).toBe(true);
    expect(result.maskedEmail).toMatch(/@example\.com$/);
    expect(result.maskedEmail).not.toBe(ACCOUNT_EMAIL);
    const row = rows.get(ADMIN_ID);
    expect(row?.method).toBe("TOTP");
    expect(row?.pendingMethod).toBe("EMAIL_OTP");
    expect(send).toHaveBeenCalledTimes(1);
  });
});
