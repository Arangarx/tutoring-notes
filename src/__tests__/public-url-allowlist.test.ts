/**
 * Host-allowlist injection-guard tests for getRequestBaseUrlSafe / isHostAllowlisted.
 *
 * Primary acceptance criterion (RC-A fix):
 *   A forged Host: evil.com MUST NOT produce an evil.com verify link — it must
 *   fall back to getPublicBaseUrl(), which is env-derived and injection-safe.
 *
 * Test groups:
 *   1. isHostAllowlisted — allowlisted pass cases (each variant)
 *   2. isHostAllowlisted — rejected hosts (injection vectors + near-misses)
 *   3. getRequestBaseUrlSafe — end-to-end: allowed hosts reflected, forged hosts rejected
 *   4. Signup route integration — forged Host header → verify URL must not contain evil.com
 */

import { isHostAllowlisted, getRequestBaseUrlSafe } from "@/lib/public-url";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helper: build a minimal NextRequest-shaped object for tests
// ---------------------------------------------------------------------------

function makeReq(headers: Record<string, string>): NextRequest {
  return {
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
  } as unknown as NextRequest;
}

// ---------------------------------------------------------------------------
// Group 1 — isHostAllowlisted: allowlisted pass cases
// ---------------------------------------------------------------------------

describe("isHostAllowlisted — allowlisted hosts are accepted", () => {
  it("accepts localhost (no port)", () => {
    expect(isHostAllowlisted("localhost")).toBe(true);
  });

  it("accepts localhost with port", () => {
    expect(isHostAllowlisted("localhost:3000")).toBe(true);
    expect(isHostAllowlisted("localhost:3100")).toBe(true);
    expect(isHostAllowlisted("localhost:8080")).toBe(true);
  });

  it("accepts 127.0.0.1 (no port)", () => {
    expect(isHostAllowlisted("127.0.0.1")).toBe(true);
  });

  it("accepts 127.0.0.1 with port", () => {
    expect(isHostAllowlisted("127.0.0.1:3000")).toBe(true);
  });

  it("accepts tutoring-notes.vercel.app (legacy default domain)", () => {
    expect(isHostAllowlisted("tutoring-notes.vercel.app")).toBe(true);
  });

  it("accepts Vercel per-deployment preview URL (hash-only)", () => {
    // tutoring-notes-<hash>-arangarx-5209s-projects.vercel.app
    expect(
      isHostAllowlisted(
        "tutoring-notes-d9371d-arangarx-5209s-projects.vercel.app"
      )
    ).toBe(true);
  });

  it("accepts Vercel branch-alias preview URL (git-branch-hash format)", () => {
    // from workspace rules: tutoring-notes-git-reliability-s-d9371d-arangarx-5209s-projects.vercel.app
    expect(
      isHostAllowlisted(
        "tutoring-notes-git-reliability-s-d9371d-arangarx-5209s-projects.vercel.app"
      )
    ).toBe(true);
  });

  it("accepts Vercel branch-alias for v1-redesign branch", () => {
    expect(
      isHostAllowlisted(
        "tutoring-notes-git-v1-redesign-abc123-arangarx-5209s-projects.vercel.app"
      )
    ).toBe(true);
  });

  it("accepts usemynk.com (production canonical apex)", () => {
    expect(isHostAllowlisted("usemynk.com")).toBe(true);
  });

  it("accepts www.usemynk.com (production www)", () => {
    expect(isHostAllowlisted("www.usemynk.com")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Group 2 — isHostAllowlisted: rejected hosts (injection vectors + near-misses)
// ---------------------------------------------------------------------------

describe("isHostAllowlisted — forged/unrecognised hosts are rejected", () => {
  it("rejects a plain attacker domain", () => {
    expect(isHostAllowlisted("evil.com")).toBe(false);
  });

  it("rejects an attacker subdomain of vercel.app (not this project)", () => {
    expect(isHostAllowlisted("attacker-project.vercel.app")).toBe(false);
  });

  it("rejects a tutoring-notes-prefixed domain under a different team slug", () => {
    // Could be minted by an attacker on their own Vercel team — must be rejected
    expect(
      isHostAllowlisted(
        "tutoring-notes-abc-differentteam-5678s-projects.vercel.app"
      )
    ).toBe(false);
  });

  it("rejects a domain that ends with an allowlisted host (open-redirect pattern)", () => {
    expect(isHostAllowlisted("evil.com.usemynk.com")).toBe(false);
    expect(isHostAllowlisted("evil.usemynk.com")).toBe(false);
  });

  it("rejects a domain that contains but does not exactly match an allowlisted host", () => {
    expect(isHostAllowlisted("notlocalhost")).toBe(false);
    expect(isHostAllowlisted("localhost.evil.com")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isHostAllowlisted("")).toBe(false);
  });

  it("rejects a host with path component (header injection attempt)", () => {
    expect(isHostAllowlisted("usemynk.com/evil-path")).toBe(false);
  });

  it("rejects tutoring-notes.vercel.app.evil.com (suffix spoofing)", () => {
    expect(isHostAllowlisted("tutoring-notes.vercel.app.evil.com")).toBe(false);
  });

  it("rejects a host matching project prefix but missing team slug", () => {
    // Must include the arangarx-5209s-projects team slug to match the preview pattern
    expect(
      isHostAllowlisted("tutoring-notes-abc123.vercel.app")
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Group 3 — getRequestBaseUrlSafe: end-to-end reflection + fallback
// ---------------------------------------------------------------------------

describe("getRequestBaseUrlSafe — host reflection + injection guard", () => {
  it("reflects an allowlisted host (usemynk.com)", () => {
    const req = makeReq({ host: "usemynk.com", "x-forwarded-proto": "https" });
    expect(getRequestBaseUrlSafe(req)).toBe("https://usemynk.com");
  });

  it("reflects localhost:3000 (local dev)", () => {
    const req = makeReq({ host: "localhost:3000", "x-forwarded-proto": "http" });
    expect(getRequestBaseUrlSafe(req)).toBe("http://localhost:3000");
  });

  it("reflects a Vercel branch-alias preview URL", () => {
    const req = makeReq({
      "x-forwarded-host":
        "tutoring-notes-git-v1-redesign-abc123-arangarx-5209s-projects.vercel.app",
      "x-forwarded-proto": "https",
    });
    expect(getRequestBaseUrlSafe(req)).toBe(
      "https://tutoring-notes-git-v1-redesign-abc123-arangarx-5209s-projects.vercel.app"
    );
  });

  it("prefers x-forwarded-host over host when both are present", () => {
    const req = makeReq({
      "x-forwarded-host":
        "tutoring-notes-git-fix-branch-abc-arangarx-5209s-projects.vercel.app",
      host: "tutoring-notes-abc-arangarx-5209s-projects.vercel.app",
      "x-forwarded-proto": "https",
    });
    expect(getRequestBaseUrlSafe(req)).toBe(
      "https://tutoring-notes-git-fix-branch-abc-arangarx-5209s-projects.vercel.app"
    );
  });

  // --- INJECTION GUARD (primary security acceptance criterion) ---
  // We do NOT assert the exact fallback URL (that depends on env); we assert
  // only that the attacker host is NEVER reflected into the result.

  it("INJECTION GUARD: forged Host: evil.com → result must not contain evil.com", () => {
    const req = makeReq({ host: "evil.com", "x-forwarded-proto": "https" });
    const result = getRequestBaseUrlSafe(req);
    expect(result).not.toContain("evil.com");
  });

  it("INJECTION GUARD: forged x-forwarded-host: evil.com → result must not contain evil.com", () => {
    const req = makeReq({
      "x-forwarded-host": "evil.com",
      "x-forwarded-proto": "https",
    });
    const result = getRequestBaseUrlSafe(req);
    expect(result).not.toContain("evil.com");
  });

  it("INJECTION GUARD: project-prefixed host with wrong team slug → not reflected", () => {
    const req = makeReq({
      host: "tutoring-notes-abc-evilteam.vercel.app",
      "x-forwarded-proto": "https",
    });
    const result = getRequestBaseUrlSafe(req);
    expect(result).not.toContain("evilteam");
  });

  it("returns a non-empty string when no host header is present (fallback to env)", () => {
    const req = makeReq({});
    const result = getRequestBaseUrlSafe(req);
    expect(typeof result).toBe("string");
    expect(result.startsWith("http")).toBe(true);
  });

  it("normalises protocol: only http or https (not javascript:)", () => {
    const req = makeReq({
      host: "usemynk.com",
      "x-forwarded-proto": "javascript",
    });
    // javascript is neither "http" nor "https" → coerced to https
    expect(getRequestBaseUrlSafe(req)).toBe("https://usemynk.com");
  });
});

// ---------------------------------------------------------------------------
// Group 4 — Signup route integration: forged Host → verify URL safe
// ---------------------------------------------------------------------------

jest.mock("@/lib/db", () => ({
  db: {
    accountHolder: { findUnique: jest.fn(), create: jest.fn() },
    learnerProfile: { create: jest.fn() },
    accountHolderEmailToken: { create: jest.fn() },
  },
}));

jest.mock("@/lib/account-holder-email", () => ({
  stubSendAccountHolderEmail: jest.fn(),
}));

jest.mock("@/lib/account-holder-auth", () => ({
  hashAccountHolderPassword: jest.fn().mockResolvedValue("hashed-pw"),
}));

jest.mock("@/lib/crypto/session-tokens", () => ({
  generateRawToken: jest.fn().mockReturnValue("rawtoken123"),
  hashToken: jest.fn().mockReturnValue("hashedtoken123"),
  EMAIL_TOKEN_TTL_MS_24H: 86_400_000,
}));

import { db } from "@/lib/db";
import { stubSendAccountHolderEmail } from "@/lib/account-holder-email";
import { POST as signupPOST } from "@/app/api/auth/account-holder/signup/route";

const mockDb = db as jest.Mocked<typeof db>;
const mockEmail = stubSendAccountHolderEmail as jest.MockedFunction<
  typeof stubSendAccountHolderEmail
>;

function makeSignupRequest(
  body: Record<string, unknown>,
  headersMap: Record<string, string>
): NextRequest {
  return {
    json: async () => body,
    headers: {
      get: (key: string) => headersMap[key.toLowerCase()] ?? null,
    },
  } as unknown as NextRequest;
}

describe("Signup route — injection guard: forged Host does not appear in verify URL", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockDb.accountHolder.findUnique as jest.Mock).mockResolvedValue(null);
    (mockDb.accountHolder.create as jest.Mock).mockResolvedValue({
      id: "ah-new-001",
      email: "parent@example.com",
      isSelfLearner: false,
    });
    (mockDb.accountHolderEmailToken.create as jest.Mock).mockResolvedValue({});
    mockEmail.mockResolvedValue({ sent: true });
  });

  it("INJECTION GUARD: verify link must NOT contain evil.com when Host is forged", async () => {
    const req = makeSignupRequest(
      {
        email: "parent@example.com",
        password: "SecurePass123!",
        displayName: "Parent User",
      },
      {
        host: "evil.com",
        "x-forwarded-proto": "https",
      }
    );

    await signupPOST(req);

    expect(mockEmail).toHaveBeenCalledTimes(1);
    const callArgs = mockEmail.mock.calls[0][0];
    // Primary security criterion: attacker host must never appear in the sent email
    expect(callArgs.actionUrl).not.toContain("evil.com");
    expect(callArgs.text).not.toContain("evil.com");
    // The verify link must still be a valid URL pointing to /verify-email
    expect(callArgs.actionUrl).toContain("/verify-email");
  });

  it("verify link uses request host when host is allowlisted (Vercel branch alias)", async () => {
    const branchAlias =
      "tutoring-notes-git-v1-redesign-abc123-arangarx-5209s-projects.vercel.app";
    const req = makeSignupRequest(
      {
        email: "parent2@example.com",
        password: "SecurePass123!",
        displayName: "Parent User 2",
      },
      {
        "x-forwarded-host": branchAlias,
        "x-forwarded-proto": "https",
      }
    );

    await signupPOST(req);

    expect(mockEmail).toHaveBeenCalledTimes(1);
    const callArgs = mockEmail.mock.calls[0][0];
    expect(callArgs.actionUrl).toContain(branchAlias);
    expect(callArgs.actionUrl).toContain("/verify-email");
  });

  it("verify link uses request host for localhost dev signup", async () => {
    const req = makeSignupRequest(
      {
        email: "parent3@example.com",
        password: "SecurePass123!",
        displayName: "Parent User 3",
      },
      {
        host: "localhost:3000",
        "x-forwarded-proto": "http",
      }
    );

    await signupPOST(req);

    expect(mockEmail).toHaveBeenCalledTimes(1);
    const callArgs = mockEmail.mock.calls[0][0];
    expect(callArgs.actionUrl).toContain("http://localhost:3000");
    expect(callArgs.actionUrl).toContain("/verify-email");
  });
});
