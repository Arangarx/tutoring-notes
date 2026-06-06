/**
 * Short-lived, HMAC-signed handoff token for the verify-email → verify-done exchange.
 *
 * Design (session-wrong-identity-fix-design-2026-06-05.md, Q1-A):
 *   - /verify-email creates a handoff token embedding the raw session token,
 *     then redirects same-site to /auth/verify-done?t=<handoff>
 *   - /auth/verify-done validates the handoff, sets the session cookie on a
 *     clean top-level same-site response (not on a cross-site redirect hop)
 *   - TTL: 90 seconds (plenty for a browser redirect; short enough to be low-risk)
 *   - Format: base64url(JSON payload) + "." + HMAC-SHA256(base64url(JSON payload), secret)
 *   - Single-use enforcement: 90s TTL is the primary guard; replaying within the
 *     window sets the same session cookie again, which is harmless.
 *
 * The raw session token travels in the URL query string of an intra-origin
 * redirect (browser never sends it cross-origin). Referer leakage window
 * is the 90s TTL; risk is equivalent to the existing email verify token already
 * in verify-email URLs.
 *
 * SERVER-ONLY: never import on the client.
 */

import { createHmac } from "node:crypto";

const HANDOFF_TTL_MS = 90_000;

export interface HandoffPayload {
  rawSessionToken: string;
  accountHolderId: string;
  returnTo: string | null;
  expiresAt: number; // ms since epoch
}

function b64url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signPayload(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64, "utf8").digest("hex");
}

/**
 * Mint a handoff token valid for HANDOFF_TTL_MS milliseconds.
 * Returns an opaque string safe to embed in a URL query parameter.
 */
export function createHandoffToken(
  rawSessionToken: string,
  accountHolderId: string,
  returnTo: string | null,
  secret: string
): string {
  const payload: HandoffPayload = {
    rawSessionToken,
    accountHolderId,
    returnTo,
    expiresAt: Date.now() + HANDOFF_TTL_MS,
  };
  const encoded = b64url(JSON.stringify(payload));
  const sig = signPayload(encoded, secret);
  return `${encoded}.${sig}`;
}

/**
 * Validate a handoff token and return its payload.
 * Returns null on any failure (bad signature, expired, malformed).
 * Timing-safe comparison is used for the HMAC check.
 */
export function consumeHandoffToken(
  token: string,
  secret: string
): HandoffPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;

  const payloadB64 = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const expectedSig = signPayload(payloadB64, secret);

  // Constant-time comparison to avoid timing oracle on the HMAC
  if (!timingSafeEqual(providedSig, expectedSig)) return null;

  let payload: HandoffPayload;
  try {
    const decoded = Buffer.from(
      payloadB64.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    payload = JSON.parse(decoded) as HandoffPayload;
  } catch {
    return null;
  }

  if (
    typeof payload.rawSessionToken !== "string" ||
    typeof payload.accountHolderId !== "string" ||
    typeof payload.expiresAt !== "number"
  ) {
    return null;
  }

  if (Date.now() > payload.expiresAt) return null;

  return payload;
}

/** Hex-string constant-time comparison (both must be equal length hex). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
