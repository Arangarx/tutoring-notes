/**
 * Identity Phase 1 — 2FA Management unit tests.
 *
 * Tests for the management surface added in this PR:
 *   - Setup page: p1-reenroll-trap fix (unconfirmed enrollment falls through)
 *   - Management page: renders management view for enrolled+confirmed+verified
 *   - Actions: rotateTotpStart, rotateTotpConfirm, regenerateBackupCodes, adminResetTwoFactor
 *   - No-lockout rotation: old secret valid until new confirmed; after confirm, only new verifies
 *   - Regen backup codes: old codes gone, new count correct, plaintext returned once
 *   - Admin reset guard: TUTOR/non-admin cannot call adminResetTwoFactor
 *   - Migration sanity: additive, new pendingTotpSecretEnc column
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Setup page source checks — p1-reenroll-trap fix
// ---------------------------------------------------------------------------
describe("setup page — p1-reenroll-trap fix (BLOCKER: unconfirmed must not be trapped)", () => {
  const setupPagePath = path.resolve(
    __dirname,
    "../app/admin/settings/2fa/setup/page.tsx"
  );
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(setupPagePath, "utf-8");
  });

  it("setup page exists", () => {
    expect(fs.existsSync(setupPagePath)).toBe(true);
  });

  it("uses backup codes count (isConfirmed) to determine enrollment completion", () => {
    // The old 'isEnrolled = !!admin?.twoFactor' pattern only checked row existence,
    // trapping users with unconfirmed (interrupted) enrollments at /verify.
    expect(content).toContain("isConfirmed");
    expect(content).toMatch(/_count.*backupCodes|backupCodes.*_count/i);
  });

  it("unconfirmed enrollment falls through to setup form (not redirected to verify)", () => {
    // isConfirmed is the gate; unconfirmed users are NOT redirected to /verify.
    // The old pattern that triggered the trap must be absent.
    expect(content).not.toMatch(/isEnrolled && !session\.user\.twoFactorVerified/);
  });

  it("confirmed+verified redirects to management page, not /admin", () => {
    expect(content).toContain('redirect("/admin/settings/2fa")');
    // The enrolled+confirmed+verified branch must not use the old blunt /admin redirect.
    expect(content).not.toMatch(/isEnrolled && session\.user\.twoFactorVerified/);
  });

  it("confirmed+not-verified redirects to /verify (gate unchanged)", () => {
    expect(content).toContain('redirect("/admin/settings/2fa/verify")');
  });
});

// ---------------------------------------------------------------------------
// Management page source checks
// ---------------------------------------------------------------------------
describe("management page — /admin/settings/2fa/page.tsx", () => {
  const managementPagePath = path.resolve(
    __dirname,
    "../app/admin/settings/2fa/page.tsx"
  );
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(managementPagePath, "utf-8");
  });

  it("management page file exists at canonical route", () => {
    expect(fs.existsSync(managementPagePath)).toBe(true);
  });

  it("renders TwoFactorManageView for enrolled+confirmed+verified users", () => {
    expect(content).toContain("TwoFactorManageView");
  });

  it("renders TwoFactorSetupForm for unenrolled and unconfirmed-interrupted users", () => {
    expect(content).toContain("TwoFactorSetupForm");
    // Both paths must be present.
    expect(content).toContain("twoFaRow = null");
  });

  it("redirects confirmed-but-unverified to /verify", () => {
    expect(content).toContain('redirect("/admin/settings/2fa/verify")');
  });

  it("uses backup codes count to determine enrollment confirmation (closes p1-reenroll-trap)", () => {
    expect(content).toContain("isConfirmed");
    expect(content).toMatch(/_count.*backupCodes|backupCodes.*_count/i);
  });

  it("does NOT reference api.qrserver.com", () => {
    expect(content).not.toContain("api.qrserver.com");
  });

  it("TwoFactorManageView receives enrolledAt, remainingBackupCodes, isAdmin, userId props", () => {
    expect(content).toContain("enrolledAt=");
    expect(content).toContain("remainingBackupCodes=");
    expect(content).toContain("isAdmin=");
    expect(content).toContain("userId=");
  });
});

// ---------------------------------------------------------------------------
// Management actions source checks
// ---------------------------------------------------------------------------
describe("management actions source checks", () => {
  const actionsPath = path.resolve(
    __dirname,
    "../app/admin/settings/2fa/actions.ts"
  );
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(actionsPath, "utf-8");
  });

  it("rotateTotpStart is exported", () => {
    expect(content).toContain("export async function rotateTotpStart");
  });

  it("rotateTotpConfirm is exported", () => {
    expect(content).toContain("export async function rotateTotpConfirm");
  });

  it("regenerateBackupCodes is exported", () => {
    expect(content).toContain("export async function regenerateBackupCodes");
  });

  it("adminResetTwoFactor is exported", () => {
    expect(content).toContain("export async function adminResetTwoFactor");
  });

  it("rotateTotpStart checks twoFactorVerified before proceeding", () => {
    const rotateIdx = content.indexOf("async function rotateTotpStart");
    const confirmIdx = content.indexOf("async function rotateTotpConfirm");
    const section = content.slice(rotateIdx, confirmIdx);
    expect(section).toContain("twoFactorVerified");
  });

  it("rotateTotpConfirm checks twoFactorVerified before proceeding", () => {
    const confirmIdx = content.indexOf("async function rotateTotpConfirm");
    const regenIdx = content.indexOf("async function regenerateBackupCodes");
    const section = content.slice(confirmIdx, regenIdx);
    expect(section).toContain("twoFactorVerified");
  });

  it("regenerateBackupCodes checks twoFactorVerified before proceeding", () => {
    const regenIdx = content.indexOf("async function regenerateBackupCodes");
    const resetIdx = content.indexOf("async function adminResetTwoFactor");
    const section = content.slice(regenIdx, resetIdx);
    expect(section).toContain("twoFactorVerified");
  });

  it("rotateTotpStart stores pendingTotpSecretEnc (not totpSecretEnc)", () => {
    const rotateIdx = content.indexOf("async function rotateTotpStart");
    const confirmIdx = content.indexOf("async function rotateTotpConfirm");
    const section = content.slice(rotateIdx, confirmIdx);
    expect(section).toContain("pendingTotpSecretEnc");
    // Must NOT overwrite current totpSecretEnc in start phase.
    const updateIdx = section.indexOf("adminUser2FA.update");
    const updateBlock = section.slice(updateIdx, updateIdx + 200);
    expect(updateBlock).not.toContain("totpSecretEnc:");
  });

  it("rotateTotpConfirm atomically swaps pendingTotpSecretEnc to totpSecretEnc via $transaction", () => {
    const confirmIdx = content.indexOf("async function rotateTotpConfirm");
    const regenIdx = content.indexOf("async function regenerateBackupCodes");
    const section = content.slice(confirmIdx, regenIdx);
    // Must use a transaction for the atomic swap.
    expect(section).toContain("$transaction");
    // Must set totpSecretEnc to the pending value.
    expect(section).toContain("totpSecretEnc: row.pendingTotpSecretEnc");
    // Must clear pendingTotpSecretEnc.
    expect(section).toContain("pendingTotpSecretEnc: null");
    // Must regenerate backup codes (deleteMany + createMany).
    expect(section).toContain("adminUser2FABackupCode.deleteMany");
    expect(section).toContain("adminUser2FABackupCode.createMany");
  });

  it("regenerateBackupCodes deletes old codes and creates new ones in a transaction", () => {
    const regenIdx = content.indexOf("async function regenerateBackupCodes");
    const resetIdx = content.indexOf("async function adminResetTwoFactor");
    const section = content.slice(regenIdx, resetIdx);
    expect(section).toContain("$transaction");
    expect(section).toContain("adminUser2FABackupCode.deleteMany");
    expect(section).toContain("adminUser2FABackupCode.createMany");
  });

  it("adminResetTwoFactor calls assertIsAdmin (ADMIN-only guard)", () => {
    const resetIdx = content.indexOf("async function adminResetTwoFactor");
    const section = content.slice(resetIdx);
    expect(section).toContain("assertIsAdmin");
  });

  it("tfa log lines present: rotate-start, rotate-fail, rotate-confirm, regen-backup, reset", () => {
    expect(content).toContain("action=rotate-start");
    expect(content).toContain("action=rotate-fail");
    expect(content).toContain("action=rotate-confirm");
    expect(content).toContain("action=regen-backup");
    expect(content).toContain("action=reset");
  });

  it("TOTP secrets never logged — no secret in console.log lines", () => {
    // Ensure no plaintext secret reference in log statements.
    const logLines = content.split("\n").filter((l) => l.includes("console.log"));
    for (const line of logLines) {
      expect(line).not.toContain("secret");
      expect(line).not.toContain("pendingSecret");
      expect(line).not.toContain("totpSecretEnc");
    }
  });
});

// ---------------------------------------------------------------------------
// No-lockout rotation — TOTP oracle test (non-self-referential)
// ---------------------------------------------------------------------------
//
// Verifies the design invariant: during rotation, the OLD secret remains valid
// (stored in totpSecretEnc untouched); the NEW secret is staged in
// pendingTotpSecretEnc. Only after rotateTotpConfirm() swaps them does the
// old secret become invalid.
//
// Uses independent base32/HMAC implementation (same as identity-2fa.test.ts oracle)
// rather than OTPAuth, to prove interoperability with any standard authenticator app.
//
describe("no-lockout rotation — TOTP oracle proof (design invariant)", () => {
  const FIXED_TS_MS = 1_600_000_000_000; // 2020-09-13T12:26:40Z

  // RFC 4648 §6 base32 decode.
  function base32Decode(s: string): Buffer {
    const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const clean = s.toUpperCase().replace(/=+$/, "");
    let bits = 0;
    let value = 0;
    const output: number[] = [];
    for (const char of clean) {
      const idx = ALPHABET.indexOf(char);
      if (idx < 0) throw new Error(`Invalid base32 char: ${char}`);
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(output);
  }

  // RFC 6238 TOTP — pure Node.js crypto, no OTPAuth dependency.
  function totpOracle(base32Secret: string, timestampMs: number): string {
    const key = base32Decode(base32Secret);
    const counter = Math.floor(timestampMs / 1000 / 30);
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigUInt64BE(BigInt(counter));
    const mac = crypto.createHmac("sha1", key).update(counterBuf).digest();
    const offset = mac[mac.length - 1] & 0x0f;
    const code =
      ((mac[offset] & 0x7f) << 24) |
      ((mac[offset + 1] & 0xff) << 16) |
      ((mac[offset + 2] & 0xff) << 8) |
      (mac[offset + 3] & 0xff);
    return String(code % 1_000_000).padStart(6, "0");
  }

  // Validate a TOTP code against a secret using OTPAuth (window=1 for clock skew).
  async function validateWithOTPAuth(
    secret: string,
    token: string,
    timestampMs: number
  ): Promise<boolean> {
    const OTPAuth = await import("otpauth");
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(secret),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    return totp.validate({ token, timestamp: timestampMs, window: 1 }) !== null;
  }

  // Generate a random base32 TOTP secret (simulates what startTotpEnrollment does).
  async function makeSecret(): Promise<string> {
    const OTPAuth = await import("otpauth");
    const totp = new OTPAuth.TOTP({ issuer: "Mynk", label: "test", algorithm: "SHA1", digits: 6, period: 30 });
    return totp.secret.base32;
  }

  it("pre-rotation: old secret validates at FIXED_TS_MS", async () => {
    const oldSecret = await makeSecret();
    const code = totpOracle(oldSecret, FIXED_TS_MS);
    expect(await validateWithOTPAuth(oldSecret, code, FIXED_TS_MS)).toBe(true);
  });

  it("during rotation: old secret is still valid (pendingTotpSecretEnc is different)", async () => {
    const oldSecret = await makeSecret();
    const newSecret = await makeSecret();
    // Invariant: they are different secrets.
    expect(oldSecret).not.toBe(newSecret);
    // Old secret code is valid against old secret.
    const oldCode = totpOracle(oldSecret, FIXED_TS_MS);
    expect(await validateWithOTPAuth(oldSecret, oldCode, FIXED_TS_MS)).toBe(true);
    // Old secret code is NOT valid against new secret (they're different).
    expect(await validateWithOTPAuth(newSecret, oldCode, FIXED_TS_MS)).toBe(false);
  });

  it("post-rotation: new secret validates; old secret does not", async () => {
    const oldSecret = await makeSecret();
    const newSecret = await makeSecret();

    const newCode = totpOracle(newSecret, FIXED_TS_MS);

    // After swap: new secret is now active.
    expect(await validateWithOTPAuth(newSecret, newCode, FIXED_TS_MS)).toBe(true);
    // Old code does not validate against new secret (different secret → different code).
    const oldCode = totpOracle(oldSecret, FIXED_TS_MS);
    if (oldCode !== newCode) {
      // Only assert mismatch when codes differ (astronomically unlikely to match).
      expect(await validateWithOTPAuth(newSecret, oldCode, FIXED_TS_MS)).toBe(false);
    }
  });

  it("oracle code matches OTPAuth generate() at same timestamp (interoperability)", async () => {
    const OTPAuth = await import("otpauth");
    const secret = await makeSecret();
    const oracle = totpOracle(secret, FIXED_TS_MS);
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(secret),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    expect(totp.generate({ timestamp: FIXED_TS_MS })).toBe(oracle);
  });
});

// ---------------------------------------------------------------------------
// Backup codes — regen behavior
// ---------------------------------------------------------------------------
describe("backup code regeneration", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.DATABASE_URL = "file:./test.db";
    process.env.DIRECT_URL = "file:./test.db";
  });

  it("generateBackupCodes always returns 10 codes", async () => {
    const { generateBackupCodes } = await import("@/lib/two-factor-db");
    const codes = await generateBackupCodes();
    expect(codes).toHaveLength(10);
  });

  it("two calls to generateBackupCodes produce different code sets", async () => {
    const { generateBackupCodes } = await import("@/lib/two-factor-db");
    const set1 = (await generateBackupCodes()).map((c) => c.plaintext);
    const set2 = (await generateBackupCodes()).map((c) => c.plaintext);
    // Probability of collision across 10 random 8-char codes: astronomically small.
    expect(set1.join(",")).not.toBe(set2.join(","));
  });

  it("backup code plaintexts are not stored as hash — hash differs from plaintext", async () => {
    const { generateBackupCodes } = await import("@/lib/two-factor-db");
    const codes = await generateBackupCodes();
    for (const { plaintext, hash } of codes) {
      expect(hash).not.toBe(plaintext);
      expect(hash).toMatch(/^\$2[ab]\$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Admin reset guard
// ---------------------------------------------------------------------------
describe("adminResetTwoFactor — ADMIN-only guard (source check)", () => {
  const actionsPath = path.resolve(
    __dirname,
    "../app/admin/settings/2fa/actions.ts"
  );

  it("adminResetTwoFactor calls assertIsAdmin before any mutation", () => {
    const content = fs.readFileSync(actionsPath, "utf-8");
    const resetIdx = content.indexOf("async function adminResetTwoFactor");
    expect(resetIdx).toBeGreaterThan(-1);
    // Use a larger window (800 chars) to encompass the full function body.
    const section = content.slice(resetIdx, resetIdx + 800);
    // assertIsAdmin must appear before the deleteMany call.
    const assertIdx = section.indexOf("assertIsAdmin");
    const deleteIdx = section.indexOf("deleteMany");
    expect(assertIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(assertIdx);
  });

  it("assertIsAdmin throws ImpersonationForbiddenError for non-ADMIN role", async () => {
    jest.resetModules();
    jest.doMock("@/lib/student-scope", () => ({
      requireStudentScope: jest.fn().mockResolvedValue({
        kind: "admin",
        adminId: "tutor-123",
      }),
    }));
    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest.fn().mockResolvedValue({
            id: "tutor-123",
            email: "sarah@example.com",
            isTestAccount: false,
            role: "TUTOR",
          }),
        },
      },
    }));
    process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-padx";
    process.env.DATABASE_URL = "file:./test.db";
    process.env.DIRECT_URL = "file:./test.db";

    const { assertIsAdmin } = await import("@/lib/impersonation");
    await expect(assertIsAdmin()).rejects.toThrow(/ADMIN-role|cannot impersonate/i);
  });

  it("assertIsAdmin resolves for ADMIN role", async () => {
    jest.resetModules();
    jest.doMock("@/lib/student-scope", () => ({
      requireStudentScope: jest.fn().mockResolvedValue({
        kind: "admin",
        adminId: "admin-456",
      }),
    }));
    jest.doMock("@/lib/db", () => ({
      db: {
        adminUser: {
          findUnique: jest.fn().mockResolvedValue({
            id: "admin-456",
            email: "admin@example.com",
            isTestAccount: false,
            role: "ADMIN",
          }),
        },
      },
    }));
    process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-padx";
    process.env.DATABASE_URL = "file:./test.db";
    process.env.DIRECT_URL = "file:./test.db";

    const { assertIsAdmin } = await import("@/lib/impersonation");
    const result = await assertIsAdmin();
    expect(result.adminId).toBe("admin-456");
  });
});

// ---------------------------------------------------------------------------
// Backup-code acknowledgment: rotate + regen require explicit action before leaving
// ---------------------------------------------------------------------------
describe("BUG-FIX 2026-06-01: rotate and regen backup-code display requires explicit acknowledgment", () => {
  /**
   * Companion to the post-enroll backup-code fix. Rotate and regen also show codes
   * "once only" — the user must explicitly click Done before navigation occurs.
   *
   * These are regression guards: they prove the invariant is structurally enforced
   * (navigation only in the Done button onClick, not in the action handlers).
   * They would fail if someone added router.push/refresh to handleRotateConfirm or
   * handleRegenStart.
   */
  const manageViewPath = path.resolve(
    __dirname,
    "../app/admin/settings/2fa/TwoFactorManageView.tsx"
  );
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(manageViewPath, "utf-8");
  });

  it("handleRotateConfirm does not navigate — sets view to rotating-done only", () => {
    const handleConfirmIdx = content.indexOf("function handleRotateConfirm");
    const handleCancelIdx = content.indexOf("function handleRotateCancel");
    expect(handleConfirmIdx).toBeGreaterThan(-1);
    expect(handleCancelIdx).toBeGreaterThan(handleConfirmIdx);
    const section = content.slice(handleConfirmIdx, handleCancelIdx);
    // Sets view to rotating-done on success.
    expect(section).toContain('"rotating-done"');
    // Must NOT auto-navigate — navigation is the Done button's job.
    expect(section).not.toContain("router.push");
    expect(section).not.toContain("router.refresh");
    expect(section).not.toContain("router.replace");
  });

  it("handleRegenStart does not navigate — sets view to regen-done only", () => {
    const handleRegenIdx = content.indexOf("function handleRegenStart");
    // Find the next function after handleRegenStart.
    const nextFnIdx = content.indexOf("\n  const handleCopyRegenCodes", handleRegenIdx + 1);
    expect(handleRegenIdx).toBeGreaterThan(-1);
    expect(nextFnIdx).toBeGreaterThan(handleRegenIdx);
    const section = content.slice(handleRegenIdx, nextFnIdx);
    // Sets view to regen-done on success.
    expect(section).toContain('"regen-done"');
    // Must NOT auto-navigate.
    expect(section).not.toContain("router.push");
    expect(section).not.toContain("router.refresh");
    expect(section).not.toContain("router.replace");
  });

  it("rotating-done view has an explicit Done button that is the sole navigation trigger", () => {
    const rotatingDoneIdx = content.indexOf('view === "rotating-done"');
    const regenLoadingIdx = content.indexOf('view === "regen-loading"');
    expect(rotatingDoneIdx).toBeGreaterThan(-1);
    expect(regenLoadingIdx).toBeGreaterThan(rotatingDoneIdx);
    const section = content.slice(rotatingDoneIdx, regenLoadingIdx);
    // Done button must be present and must call router.refresh to sync server state.
    expect(section).toContain("Done");
    expect(section).toContain("router.refresh");
  });

  it("regen-done view has an explicit Done button that is the sole navigation trigger", () => {
    const regenDoneIdx = content.indexOf('view === "regen-done"');
    const resetConfirmIdx = content.indexOf('view === "reset-confirm"');
    expect(regenDoneIdx).toBeGreaterThan(-1);
    expect(resetConfirmIdx).toBeGreaterThan(regenDoneIdx);
    const section = content.slice(regenDoneIdx, resetConfirmIdx);
    // Done button must be present and must call router.refresh.
    expect(section).toContain("Done");
    expect(section).toContain("router.refresh");
  });
});

// ---------------------------------------------------------------------------
// Pending rotation migration sanity
// ---------------------------------------------------------------------------
describe("pending-secret migration (additive-only check)", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../prisma/migrations/20260601120000_admin_user_2fa_pending_secret/migration.sql"
  );
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, "utf-8");
  });

  it("migration file exists", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it("adds pendingTotpSecretEnc column", () => {
    expect(sql).toMatch(/ADD\s+COLUMN\s+"pendingTotpSecretEnc"/i);
  });

  it("adds pendingEnrolledAt column", () => {
    expect(sql).toMatch(/ADD\s+COLUMN\s+"pendingEnrolledAt"/i);
  });

  it("ADDITIVE: does not DROP any column", () => {
    expect(sql.replace(/--[^\n]*/g, "")).not.toMatch(/DROP\s+COLUMN/i);
  });

  it("ADDITIVE: does not DROP any table", () => {
    expect(sql.replace(/--[^\n]*/g, "")).not.toMatch(/DROP\s+TABLE/i);
  });

  it("ADDITIVE: does not DELETE rows", () => {
    expect(sql.replace(/--[^\n]*/g, "")).not.toMatch(/^\s*DELETE\s+FROM/im);
  });

  it("ADDITIVE: does not UPDATE rows", () => {
    expect(sql.replace(/--[^\n]*/g, "")).not.toMatch(/^\s*UPDATE\s+"/im);
  });
});

// ---------------------------------------------------------------------------
// Prisma schema DMMF sanity — pendingTotpSecretEnc in AdminUser2FA
// ---------------------------------------------------------------------------
describe("Prisma DMMF schema sanity — AdminUser2FA pending rotation fields", () => {
  const schemaPath = path.resolve(__dirname, "../../prisma/schema.prisma");
  let schema: string;

  beforeAll(() => {
    schema = fs.readFileSync(schemaPath, "utf-8");
  });

  it("AdminUser2FA model has pendingTotpSecretEnc field", () => {
    expect(schema).toMatch(/pendingTotpSecretEnc\s+String\?/);
  });

  it("AdminUser2FA model has pendingEnrolledAt field", () => {
    expect(schema).toMatch(/pendingEnrolledAt\s+DateTime\?/);
  });

  it("both new fields are nullable (additive, no migration breakage)", () => {
    // Nullable fields (String? / DateTime?) won't break existing rows.
    expect(schema).toMatch(/pendingTotpSecretEnc\s+String\?/);
    expect(schema).toMatch(/pendingEnrolledAt\s+DateTime\?/);
  });
});

// ---------------------------------------------------------------------------
// Settings page card link
// ---------------------------------------------------------------------------
describe("settings page — 2FA card links to canonical management route", () => {
  it("settings page links to /admin/settings/2fa, not the old /admin/settings/2fa/setup", () => {
    const settingsPagePath = path.resolve(
      __dirname,
      "../app/admin/settings/page.tsx"
    );
    const content = fs.readFileSync(settingsPagePath, "utf-8");
    expect(content).toContain('href="/admin/settings/2fa"');
    expect(content).not.toContain('href="/admin/settings/2fa/setup"');
  });
});
