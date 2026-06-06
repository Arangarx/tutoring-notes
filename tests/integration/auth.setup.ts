import fs from "node:fs";
import path from "node:path";
import { test as setup } from "@playwright/test";
import { TEST_ADMIN, seedTestAdmin, seedTestStudent } from "../visual/helpers";

const authFile = path.join(__dirname, ".auth", "tutor.json");

setup("authenticate tutor storageState", async ({ page }) => {
  const adminUserId = await seedTestAdmin();
  await seedTestStudent(adminUserId);

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(TEST_ADMIN.email);
  await page.getByLabel(/password/i).fill(TEST_ADMIN.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith("/admin") &&
      !url.pathname.startsWith("/admin/settings/2fa"),
    { timeout: 15_000 }
  );

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
