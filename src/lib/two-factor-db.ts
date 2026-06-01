/**
 * 2FA database helpers — Identity Phase 1.
 *
 * Log prefix: tfa= (registered in AGENTS.md § Conventions and docs/RECORDER-LIFECYCLE.md)
 *
 * Key log lines (all use adminUserId only — NEVER log secrets or plaintext codes):
 *   [tfa] tfa=<id> adminUserId=<id> action=enroll-start
 *   [tfa] tfa=<id> adminUserId=<id> action=enroll-confirm
 *   [tfa] tfa=<id> adminUserId=<id> action=verify-success
 *   [tfa] tfa=<id> adminUserId=<id> action=verify-fail
 *   [tfa] tfa=<id> adminUserId=<id> action=backup-code-used codeId=<id>
 *   [tfa] adminUserId=<id> action=reset-by=<adminId>
 */

import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8; // chars, alphanumeric uppercase
const SALT_ROUNDS = 10;

/** Generate plaintext backup codes and their bcrypt hashes. */
export async function generateBackupCodes(): Promise<
  { plaintext: string; hash: string }[]
> {
  const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // omit 0/O/1/I for readability
  const codes: { plaintext: string; hash: string }[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const bytes = randomBytes(BACKUP_CODE_LENGTH);
    let code = "";
    for (let b = 0; b < BACKUP_CODE_LENGTH; b++) {
      code += CHARSET[bytes[b] % CHARSET.length];
    }
    const hash = await bcrypt.hash(code, SALT_ROUNDS);
    codes.push({ plaintext: code, hash });
  }
  return codes;
}

/**
 * Persist backup codes for a 2FA enrollment row.
 * Each code is bcrypt-hashed; plaintext is never stored.
 */
export async function storeBackupCodes(
  twoFaId: string,
  codes: { hash: string }[]
): Promise<void> {
  await db.adminUser2FABackupCode.createMany({
    data: codes.map((c) => ({ twoFaId, codeHash: c.hash })),
  });
}

/**
 * Find and redeem a backup code for the given 2FA enrollment.
 * Returns the redeemed code row id on success, null if no matching unused code.
 * Marks the code used atomically.
 */
export async function redeemBackupCode(
  twoFaId: string,
  plaintext: string
): Promise<string | null> {
  const unusedCodes = await db.adminUser2FABackupCode.findMany({
    where: { twoFaId, usedAt: null },
    select: { id: true, codeHash: true },
  });
  for (const row of unusedCodes) {
    const match = await bcrypt.compare(plaintext, row.codeHash);
    if (match) {
      await db.adminUser2FABackupCode.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      return row.id;
    }
  }
  return null;
}
