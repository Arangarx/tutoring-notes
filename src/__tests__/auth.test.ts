/**
 * @jest-environment node
 */

jest.mock("@/lib/auth-db", () => {
  const actual = jest.requireActual<typeof import("@/lib/auth-db")>("@/lib/auth-db");
  return {
    ...actual,
    // Force the legacy env-credentials path — parallel DB tests leave admin rows
    // that would route authorize() through getAdminByEmail instead.
    hasAdminUsers: jest.fn().mockResolvedValue(false),
  };
});

test("credentials authorize accepts only configured admin", async () => {
  process.env.ADMIN_EMAIL = "admin@example.com";
  process.env.ADMIN_PASSWORD = "replace-me";
  process.env.NEXTAUTH_SECRET = "test-secret";

  jest.resetModules();
  const { authOptions } = await import("@/auth-options");

  const provider: any = authOptions.providers?.[0];
  expect(provider).toBeTruthy();
  const authorize = provider.options?.authorize ?? provider.authorize;
  expect(typeof authorize).toBe("function");

  const ok = await authorize({ email: "admin@example.com", password: "replace-me" });
  const bad = await authorize({ email: "admin@example.com", password: "wrong" });

  expect(ok).toBeTruthy();
  expect(bad).toBeNull();
});
