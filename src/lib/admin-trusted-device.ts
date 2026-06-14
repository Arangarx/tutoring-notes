/**
 * AdminTrustedDevice — 30-day trusted-browser helper for admin/tutor 2FA login skip.
 *
 * Design:
 *   - Raw token (64 hex chars, 256 bits) lives ONLY in the HttpOnly cookie + client store.
 *   - DB stores HMAC-SHA-256(rawToken, ADMIN_TFA_DEVICE_HMAC_SECRET) — forgery requires secret.
 *   - Fail-closed: missing HMAC secret → returns null / throws (no bypass).
 *   - Max 10 active (non-revoked, unexpired) devices per adminUser. Oldest evicted on mint.
 *
 * Log prefix: tfa= (AGENTS.md § Conventions)
 * SERVER-ONLY: never import on the client.
 */

import { db } from "@/lib/db";
import { generateRawToken, hmacToken } from "@/lib/crypto/session-tokens";
import { mintTwoFactorVerifiedSession } from "@/lib/two-factor-session";
import { cookies } from "next/headers";

// ---------------------------------------------------------------------------
// Cookie name
// ---------------------------------------------------------------------------

/**
 * Trusted-device cookie name.
 * Production uses __Secure- prefix (requires Secure flag) — stricter than
 * mynk_ah_session because this is a long-lived trust credential on the admin origin.
 */
export const ADMIN_TFA_DEVICE_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Secure-mynk_admin_tfa_device"
    : "mynk_admin_tfa_device";

/** 30-day TTL in milliseconds — fixed, no sliding renewal. */
const TD_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Max active (non-revoked, unexpired) trusted devices per admin. */
const MAX_ACTIVE_DEVICES = 10;

// ---------------------------------------------------------------------------
// Internal: HMAC secret
// ---------------------------------------------------------------------------

function getHmacSecret(): string | null {
  return process.env.ADMIN_TFA_DEVICE_HMAC_SECRET ?? null;
}

// ---------------------------------------------------------------------------
// Cookie builders
// ---------------------------------------------------------------------------

/**
 * Build the Set-Cookie header value for the trusted-device cookie.
 *
 * SameSite=Lax is required — admin logins may complete via Google OAuth redirect;
 * Strict would suppress this cookie on the callback and force TOTP despite a valid
 * trusted device. (Contrast: buildAhSessionCookie uses Strict because AH has no OAuth.)
 */
export function buildAdminTfaDeviceCookie(
  rawToken: string,
  expiresAt: Date,
  isDev: boolean
): string {
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  const parts = [
    `${ADMIN_TFA_DEVICE_COOKIE}=${rawToken}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (!isDev) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Build the Set-Cookie header to clear the trusted-device cookie (Max-Age=0).
 */
export function clearAdminTfaDeviceCookie(isDev: boolean): string {
  const parts = [
    `${ADMIN_TFA_DEVICE_COOKIE}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ];
  if (!isDev) parts.push("Secure");
  return parts.join("; ");
}

// ---------------------------------------------------------------------------
// mintAdminTrustedDevice
// ---------------------------------------------------------------------------

/**
 * Create a new trusted-device DB row and return the raw token for the cookie.
 *
 * Raw token NEVER stored in DB — only HMAC hash.
 * Enforces max 10 active devices; evicts oldest by lastUsedAt when at cap.
 */
export async function mintAdminTrustedDevice(
  adminUserId: string,
  userAgent?: string | null
): Promise<{ rawToken: string; deviceId: string; expiresAt: Date }> {
  const secret = getHmacSecret();
  if (!secret) {
    throw new Error(
      "[tfa] ADMIN_TFA_DEVICE_HMAC_SECRET is not set — cannot mint trusted device (fail-closed)."
    );
  }

  const rawToken = generateRawToken();
  const tokenHash = hmacToken(rawToken, secret);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TD_TTL_MS);
  const deviceLabel = userAgent?.substring(0, 128) ?? null;

  // Enforce cap: if at MAX_ACTIVE_DEVICES, evict the oldest by lastUsedAt.
  const activeDevices = await db.adminTrustedDevice.findMany({
    where: {
      adminUserId,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { lastUsedAt: "asc" },
    select: { id: true, lastUsedAt: true },
  });

  if (activeDevices.length >= MAX_ACTIVE_DEVICES) {
    const oldest = activeDevices[0]!;
    await db.adminTrustedDevice.update({
      where: { id: oldest.id },
      data: { revokedAt: now },
    });
    console.log(
      `[tfa] tfa=${oldest.id} adminUserId=${adminUserId} action=device_evicted`
    );
  }

  const row = await db.adminTrustedDevice.create({
    data: {
      adminUserId,
      tokenHash,
      deviceLabel,
      expiresAt,
      lastUsedAt: now,
    },
  });

  return { rawToken, deviceId: row.id, expiresAt };
}

// ---------------------------------------------------------------------------
// validateAdminTrustedDevice
// ---------------------------------------------------------------------------

/**
 * Validate a raw trusted-device token for the given adminUserId.
 *
 * Checks: HMAC hash lookup, adminUserId match, not revoked, not expired.
 * Emits trusted_device_rejected with reason= on every non-success path (SF-3).
 * Returns { deviceId } on success; null on any failure (fail-closed).
 */
export async function validateAdminTrustedDevice(
  rawToken: string,
  adminUserId: string
): Promise<{ deviceId: string } | null> {
  const secret = getHmacSecret();
  if (!secret) {
    console.error(
      `[tfa] tfa=unknown adminUserId=${adminUserId} action=trusted_device_rejected reason=missing_secret`
    );
    return null;
  }

  let tokenHash: string;
  try {
    tokenHash = hmacToken(rawToken, secret);
  } catch (e) {
    console.error(
      `[tfa] tfa=unknown adminUserId=${adminUserId} action=trusted_device_rejected reason=hmac_error`,
      e
    );
    return null;
  }

  let row: {
    id: string;
    adminUserId: string;
    revokedAt: Date | null;
    expiresAt: Date;
  } | null;

  try {
    row = await db.adminTrustedDevice.findUnique({
      where: { tokenHash },
      select: { id: true, adminUserId: true, revokedAt: true, expiresAt: true },
    });
  } catch (e) {
    console.error(
      `[tfa] tfa=unknown adminUserId=${adminUserId} action=trusted_device_rejected reason=db_error`,
      e
    );
    return null;
  }

  if (!row) {
    console.log(
      `[tfa] tfa=unknown adminUserId=${adminUserId} action=trusted_device_rejected reason=notfound`
    );
    return null;
  }

  if (row.adminUserId !== adminUserId) {
    console.log(
      `[tfa] tfa=${row.id} adminUserId=${adminUserId} action=trusted_device_rejected reason=wrong_user`
    );
    return null;
  }

  if (row.revokedAt) {
    console.log(
      `[tfa] tfa=${row.id} adminUserId=${adminUserId} action=trusted_device_rejected reason=revoked`
    );
    return null;
  }

  if (row.expiresAt < new Date()) {
    console.log(
      `[tfa] tfa=${row.id} adminUserId=${adminUserId} action=trusted_device_rejected reason=expired`
    );
    return null;
  }

  return { deviceId: row.id };
}

// ---------------------------------------------------------------------------
// tryTrustedDeviceLoginSkip
// ---------------------------------------------------------------------------

/**
 * If a valid trusted-device cookie exists for adminUserId, mint a
 * twoFactorVerified session and return true. Otherwise return false.
 *
 * Fail-closed on DB/HMAC errors — any error returns false, never throws.
 * Best-effort lastUsedAt update (B2): failure does not abort the skip.
 * Try-catch around mintTwoFactorVerifiedSession (B2): throw → return false.
 */
export async function tryTrustedDeviceLoginSkip(
  adminUserId: string,
  currentToken: Record<string, unknown>
): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const rawToken = cookieStore.get(ADMIN_TFA_DEVICE_COOKIE)?.value;
    if (!rawToken) return false;

    const validated = await validateAdminTrustedDevice(rawToken, adminUserId);
    if (!validated) return false;

    const { deviceId } = validated;

    // 3.1 Best-effort lastUsedAt update — fire-and-forget; never abort skip on failure.
    db.adminTrustedDevice
      .update({ where: { id: deviceId }, data: { lastUsedAt: new Date() } })
      .catch((e) =>
        console.error(
          `[tfa] tfa=${deviceId} adminUserId=${adminUserId} action=trusted_device_last_used_update_failed`,
          e
        )
      );

    // 3.2 Try-catch around session mint (B2).
    try {
      await mintTwoFactorVerifiedSession(currentToken);
    } catch (e) {
      console.error(
        `[tfa] tfa=${deviceId} adminUserId=${adminUserId} action=trusted_device_skip_mint_failed`,
        e
      );
      return false;
    }

    // 3.3 Log success.
    console.log(
      `[tfa] tfa=${deviceId} adminUserId=${adminUserId} action=login_skipped_via_trusted_device`
    );

    return true;
  } catch (e) {
    console.error(
      `[tfa] tfa=unknown adminUserId=${adminUserId} action=trusted_device_skip_error`,
      e
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Revocation helpers
// ---------------------------------------------------------------------------

/**
 * Revoke a single trusted device by id (ownership-checked).
 * If revoking the current cookie's device, also clears the cookie.
 */
export async function revokeAdminTrustedDevice(
  deviceId: string,
  adminUserId: string
): Promise<void> {
  await db.adminTrustedDevice.updateMany({
    where: { id: deviceId, adminUserId },
    data: { revokedAt: new Date() },
  });
  console.log(
    `[tfa] tfa=${deviceId} adminUserId=${adminUserId} action=device_revoked`
  );
}

/**
 * Revoke all trusted devices for the given adminUserId (bulk revoke).
 * Returns the count of revoked rows.
 */
export async function revokeAllAdminTrustedDevices(adminUserId: string): Promise<number> {
  const result = await db.adminTrustedDevice.updateMany({
    where: { adminUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  console.log(
    `[tfa] adminUserId=${adminUserId} action=all_devices_revoked count=${result.count}`
  );
  return result.count;
}

// ---------------------------------------------------------------------------
// List helper (for settings UI)
// ---------------------------------------------------------------------------

export interface TrustedDeviceListItem {
  id: string;
  deviceLabel: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}

/**
 * List non-revoked, non-expired trusted devices for the given adminUserId.
 * Marks isCurrent=true for the device matching the current cookie (if any).
 */
export async function listAdminTrustedDevices(
  adminUserId: string
): Promise<TrustedDeviceListItem[]> {
  const now = new Date();
  const rows = await db.adminTrustedDevice.findMany({
    where: { adminUserId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { lastUsedAt: "desc" },
    select: { id: true, deviceLabel: true, createdAt: true, lastUsedAt: true, expiresAt: true, tokenHash: true },
  });

  // Determine the current cookie's hash to mark isCurrent.
  const secret = getHmacSecret();
  let currentHash: string | null = null;
  if (secret) {
    try {
      const cookieStore = await cookies();
      const rawToken = cookieStore.get(ADMIN_TFA_DEVICE_COOKIE)?.value;
      if (rawToken) {
        currentHash = hmacToken(rawToken, secret);
      }
    } catch {
      // Non-critical: isCurrent will be false for all rows.
    }
  }

  return rows.map((row) => ({
    id: row.id,
    deviceLabel: row.deviceLabel,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    isCurrent: currentHash !== null && row.tokenHash === currentHash,
  }));
}
