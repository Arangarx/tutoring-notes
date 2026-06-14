// @ts-nocheck — Jest 30 mock factory inference produces `never` return types that
// don't type-check with strict TS, but all tests pass at runtime.
/**
 * Trusted-device Route Handler tests — 2FA remember-device (2026-06-14).
 *
 * RH-1  Valid trusted device → redirect to /admin
 * RH-2  Valid trusted device + safe callbackUrl → redirect to callbackUrl
 * RH-3  External/unsafe callbackUrl → redirect to /admin (open-redirect guard)
 * RH-4  No session (not logged in) → redirect to /login
 * RH-5  No session token in cookies → redirect to /verify?td=0 (fail closed)
 * RH-6  decode() returns null → redirect to /verify?td=0 (fail closed)
 * RH-7  tryTrustedDeviceLoginSkip returns false → redirect to /verify?td=0
 * RH-8  Handler body throws unexpectedly → redirect to /verify?td=0 (fail closed, no 500)
 * RH-9  callbackUrl preserved in verify redirect when skip fails
 *
 * REGRESSION NOTE: Prior implementation placed tryTrustedDeviceLoginSkip inside
 * the RSC render of verify/page.tsx and setup/page.tsx. Inside that context,
 * mintTwoFactorVerifiedSession's cookies().set() throws:
 *   "Cookies can only be modified in a Server Action or Route Handler"
 * That throw was silently swallowed by the try-catch → skip always returned false →
 * user always shown TOTP screen despite a valid trusted-device cookie. This handler
 * moves the call into a legal execution context, fixing the bug.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  jest.resetModules();
  process.env.NEXTAUTH_SECRET = "test-nextauth-secret-must-be-at-least-32-chars-long";
  // Keep NODE_ENV as-is (jest sets it to "test") so cookie name stays non-Secure.
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

function makeRequest(query: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/auth/2fa/trusted-device-check");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

// ---------------------------------------------------------------------------
// RH-1: Valid trusted device → redirect to /admin
// ---------------------------------------------------------------------------
describe("RH-1: Valid trusted device → redirect to /admin", () => {
  it("returns 307 redirect to /admin when skip succeeds", async () => {
    jest.mock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({ user: { id: "admin-rh1", email: "a@test.com" } }),
    }));
    jest.mock("@/auth-options", () => ({ authOptions: {} }));
    jest.mock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({
        get: jest.fn().mockReturnValue({ value: "session-token-rh1" }),
      }),
    }));
    jest.mock("next-auth/jwt", () => ({
      decode: jest.fn().mockResolvedValue({ sub: "admin-rh1" }),
    }));
    jest.mock("@/lib/admin-trusted-device", () => ({
      tryTrustedDeviceLoginSkip: jest.fn().mockResolvedValue(true),
      ADMIN_TFA_DEVICE_COOKIE: "mynk_admin_tfa_device",
    }));

    const { GET } = await import("@/app/api/auth/2fa/trusted-device-check/route");
    const res = await GET(makeRequest());

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/admin");
    expect(location).not.toContain("/verify");
    expect(location).not.toContain("/login");
  });
});

// ---------------------------------------------------------------------------
// RH-2: Valid trusted device + safe callbackUrl → redirect to callbackUrl
// ---------------------------------------------------------------------------
describe("RH-2: Valid trusted device + safe callbackUrl → redirect there", () => {
  it("redirects to the provided safe callbackUrl on success", async () => {
    jest.mock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({ user: { id: "admin-rh2", email: "b@test.com" } }),
    }));
    jest.mock("@/auth-options", () => ({ authOptions: {} }));
    jest.mock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({
        get: jest.fn().mockReturnValue({ value: "tok-rh2" }),
      }),
    }));
    jest.mock("next-auth/jwt", () => ({
      decode: jest.fn().mockResolvedValue({ sub: "admin-rh2" }),
    }));
    jest.mock("@/lib/admin-trusted-device", () => ({
      tryTrustedDeviceLoginSkip: jest.fn().mockResolvedValue(true),
      ADMIN_TFA_DEVICE_COOKIE: "mynk_admin_tfa_device",
    }));

    const { GET } = await import("@/app/api/auth/2fa/trusted-device-check/route");
    const res = await GET(makeRequest({ callbackUrl: "/admin/students" }));

    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/admin/students");
  });
});

// ---------------------------------------------------------------------------
// RH-3: External/unsafe callbackUrl → redirect to /admin (open-redirect guard)
// ---------------------------------------------------------------------------
describe("RH-3: External callbackUrl → redirect to /admin (open-redirect guard)", () => {
  it("ignores external callbackUrl and redirects to /admin", async () => {
    jest.mock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({ user: { id: "admin-rh3", email: "c@test.com" } }),
    }));
    jest.mock("@/auth-options", () => ({ authOptions: {} }));
    jest.mock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({
        get: jest.fn().mockReturnValue({ value: "tok-rh3" }),
      }),
    }));
    jest.mock("next-auth/jwt", () => ({
      decode: jest.fn().mockResolvedValue({ sub: "admin-rh3" }),
    }));
    jest.mock("@/lib/admin-trusted-device", () => ({
      tryTrustedDeviceLoginSkip: jest.fn().mockResolvedValue(true),
      ADMIN_TFA_DEVICE_COOKIE: "mynk_admin_tfa_device",
    }));

    const { GET } = await import("@/app/api/auth/2fa/trusted-device-check/route");
    const res = await GET(makeRequest({ callbackUrl: "https://evil.com/steal" }));

    const location = res.headers.get("location") ?? "";
    // Must redirect to /admin, NOT to the external URL.
    expect(location).toContain("/admin");
    expect(location).not.toContain("evil.com");
  });
});

// ---------------------------------------------------------------------------
// RH-4: No session → redirect to /login
// ---------------------------------------------------------------------------
describe("RH-4: No session → redirect to /login", () => {
  it("redirects to /login when getServerSession returns null", async () => {
    jest.mock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue(null),
    }));
    jest.mock("@/auth-options", () => ({ authOptions: {} }));
    jest.mock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({ get: jest.fn().mockReturnValue(null) }),
    }));
    jest.mock("next-auth/jwt", () => ({ decode: jest.fn() }));
    jest.mock("@/lib/admin-trusted-device", () => ({
      tryTrustedDeviceLoginSkip: jest.fn(),
      ADMIN_TFA_DEVICE_COOKIE: "mynk_admin_tfa_device",
    }));

    const { GET } = await import("@/app/api/auth/2fa/trusted-device-check/route");
    const res = await GET(makeRequest());

    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login");
  });
});

// ---------------------------------------------------------------------------
// RH-5: No session token in cookies → redirect to /verify?td=0 (fail closed)
// ---------------------------------------------------------------------------
describe("RH-5: No session token cookie → redirect to /verify?td=0", () => {
  it("redirects to verify with td=0 when session cookie is absent", async () => {
    jest.mock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({ user: { id: "admin-rh5", email: "e@test.com" } }),
    }));
    jest.mock("@/auth-options", () => ({ authOptions: {} }));
    jest.mock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({
        // session cookie absent
        get: jest.fn().mockReturnValue(undefined),
      }),
    }));
    jest.mock("next-auth/jwt", () => ({ decode: jest.fn() }));
    jest.mock("@/lib/admin-trusted-device", () => ({
      tryTrustedDeviceLoginSkip: jest.fn(),
      ADMIN_TFA_DEVICE_COOKIE: "mynk_admin_tfa_device",
    }));

    const { GET } = await import("@/app/api/auth/2fa/trusted-device-check/route");
    const res = await GET(makeRequest());

    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/verify");
    expect(location).toContain("td=0");
  });
});

// ---------------------------------------------------------------------------
// RH-6: decode() returns null → redirect to /verify?td=0 (fail closed)
// ---------------------------------------------------------------------------
describe("RH-6: decode() returns null → redirect to /verify?td=0", () => {
  it("redirects to verify with td=0 when JWT decode fails", async () => {
    jest.mock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({ user: { id: "admin-rh6", email: "f@test.com" } }),
    }));
    jest.mock("@/auth-options", () => ({ authOptions: {} }));
    jest.mock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({
        get: jest.fn().mockReturnValue({ value: "bad-token" }),
      }),
    }));
    jest.mock("next-auth/jwt", () => ({
      decode: jest.fn().mockResolvedValue(null),
    }));
    jest.mock("@/lib/admin-trusted-device", () => ({
      tryTrustedDeviceLoginSkip: jest.fn(),
      ADMIN_TFA_DEVICE_COOKIE: "mynk_admin_tfa_device",
    }));

    const { GET } = await import("@/app/api/auth/2fa/trusted-device-check/route");
    const res = await GET(makeRequest());

    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/verify");
    expect(location).toContain("td=0");
  });
});

// ---------------------------------------------------------------------------
// RH-7: tryTrustedDeviceLoginSkip returns false → redirect to /verify?td=0
// ---------------------------------------------------------------------------
describe("RH-7: skip returns false → redirect to /verify?td=0 (fail closed)", () => {
  it("redirects to verify with td=0 when skip fails (expired/revoked/missing)", async () => {
    jest.mock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({ user: { id: "admin-rh7", email: "g@test.com" } }),
    }));
    jest.mock("@/auth-options", () => ({ authOptions: {} }));
    jest.mock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({
        get: jest.fn().mockReturnValue({ value: "tok-rh7" }),
      }),
    }));
    jest.mock("next-auth/jwt", () => ({
      decode: jest.fn().mockResolvedValue({ sub: "admin-rh7" }),
    }));
    jest.mock("@/lib/admin-trusted-device", () => ({
      tryTrustedDeviceLoginSkip: jest.fn().mockResolvedValue(false),
      ADMIN_TFA_DEVICE_COOKIE: "mynk_admin_tfa_device",
    }));

    const { GET } = await import("@/app/api/auth/2fa/trusted-device-check/route");
    const res = await GET(makeRequest());

    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/verify");
    expect(location).toContain("td=0");
    // Must NOT redirect to admin root (granting access); verify URL contains /admin/settings which is expected.
    expect(location).not.toMatch(/\/admin\/?($|\?)/);
  });
});

// ---------------------------------------------------------------------------
// RH-8: Unexpected throw in handler → redirect to /verify?td=0 (no 500)
// ---------------------------------------------------------------------------
describe("RH-8: Unexpected handler throw → redirect to /verify?td=0 (fail closed)", () => {
  it("returns a redirect (not a 500) when getServerSession throws", async () => {
    jest.mock("next-auth", () => ({
      getServerSession: jest.fn().mockRejectedValue(new Error("DB is down")),
    }));
    jest.mock("@/auth-options", () => ({ authOptions: {} }));
    jest.mock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({ get: jest.fn() }),
    }));
    jest.mock("next-auth/jwt", () => ({ decode: jest.fn() }));
    jest.mock("@/lib/admin-trusted-device", () => ({
      tryTrustedDeviceLoginSkip: jest.fn(),
      ADMIN_TFA_DEVICE_COOKIE: "mynk_admin_tfa_device",
    }));

    const { GET } = await import("@/app/api/auth/2fa/trusted-device-check/route");
    const res = await GET(makeRequest());

    // Must not throw; must be a redirect (3xx).
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/verify");
    expect(location).toContain("td=0");
  });
});

// ---------------------------------------------------------------------------
// RH-9: callbackUrl preserved in verify redirect when skip fails
// ---------------------------------------------------------------------------
describe("RH-9: callbackUrl preserved in verify redirect", () => {
  it("forwards safe callbackUrl to the verify redirect when skip fails", async () => {
    jest.mock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({ user: { id: "admin-rh9", email: "i@test.com" } }),
    }));
    jest.mock("@/auth-options", () => ({ authOptions: {} }));
    jest.mock("next/headers", () => ({
      cookies: jest.fn().mockResolvedValue({
        get: jest.fn().mockReturnValue({ value: "tok-rh9" }),
      }),
    }));
    jest.mock("next-auth/jwt", () => ({
      decode: jest.fn().mockResolvedValue({ sub: "admin-rh9" }),
    }));
    jest.mock("@/lib/admin-trusted-device", () => ({
      tryTrustedDeviceLoginSkip: jest.fn().mockResolvedValue(false),
      ADMIN_TFA_DEVICE_COOKIE: "mynk_admin_tfa_device",
    }));

    const { GET } = await import("@/app/api/auth/2fa/trusted-device-check/route");
    const res = await GET(makeRequest({ callbackUrl: "/admin/sessions" }));

    const location = res.headers.get("location") ?? "";
    expect(location).toContain("td=0");
    expect(location).toContain("callbackUrl=%2Fadmin%2Fsessions");
  });
});
