import { expect, test } from "@playwright/test";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };

test.describe("P1-ID-GOOGLE — tutor login Google sign-in UI", () => {
  test.use({ storageState: EMPTY_STATE });

  test("shows Mortensen notice + Sign in with Google when provider configured", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(/Sign-in is securely handled by Mortensen Apps/i)
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in with Google" })
    ).toBeVisible();
  });

  test("Sign in with Google posts to NextAuth and receives the account chooser URL", async ({
    page,
  }) => {
    await page.route("**/accounts.google.com/**", (route) => route.abort());

    await page.goto("/login?callbackUrl=%2Fadmin%2Fstudents");
    await page.waitForLoadState("networkidle");

    const googleButton = page.getByRole("button", { name: "Sign in with Google" });
    await expect(googleButton).toBeVisible();

    const signInResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/api/auth/signin/google") &&
        res.request().method() === "POST"
    );
    await googleButton.click();
    const response = await signInResponse;
    const body = (await response.json()) as { url?: string };
    expect(body.url).toContain("accounts.google.com");
    expect(body.url).toContain("prompt=select_account");
    expect(decodeURIComponent(response.headers()["set-cookie"] ?? "")).toContain(
      "/admin/students"
    );
  });

  test("existing ?error= banners still render", async ({ page }) => {
    await page.goto("/login?error=not_authorized");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(/doesn't have access to Mynk/i)
    ).toBeVisible();
  });
});
