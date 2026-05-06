import { test, expect } from "../visual/fixtures";
import {
  seedTestAdmin,
  seedTestStudent,
  loginAsTestAdmin,
  seedOpenWhiteboardSession,
} from "../visual/helpers";
import { readLocalEnv } from "../utils/read-dotenv";

/**
 * Whiteboard Playwright smoke (WHITEBOARD-STATUS §1.12).
 *
 * 1) **Workspace mount** — DB-seeded open session → tutor workspace loads Excalidraw.
 *    No Vercel Blob required (matches CI / fresh sqlite).
 *
 * 2) **Consent → workspace** — full `createWhiteboardSession` path including Blob put.
 *    Skips when `BLOB_READ_WRITE_TOKEN` is absent from `.env` (local dev only).
 */

let adminUserId: string;
let studentId: string;
let seededWorkspaceSessionId: string;

test.beforeAll(async () => {
  adminUserId = await seedTestAdmin();
  const seed = await seedTestStudent(adminUserId);
  studentId = seed.studentId;
  seededWorkspaceSessionId = await seedOpenWhiteboardSession({
    adminUserId,
    studentId,
  });
});

test("whiteboard workspace — Excalidraw mount (seeded open session)", async ({
  guardedPage,
}) => {
  test.setTimeout(120_000);

  await loginAsTestAdmin(guardedPage);
  await guardedPage.goto(
    `/admin/students/${studentId}/whiteboard/${seededWorkspaceSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );

  await expect(guardedPage).toHaveURL(
    /\/admin\/students\/.+\/whiteboard\/.+\/workspace$/,
    { timeout: 30_000 }
  );

  await expect(
    guardedPage.getByTestId("tutor-whiteboard-canvas-mount")
  ).toBeVisible({ timeout: 90_000 });

  await expect(guardedPage.getByTestId("wb-tutor-page-strip")).toBeVisible();
});

test("whiteboard — consent modal starts session (needs BLOB)", async ({
  guardedPage,
}) => {
  test.setTimeout(120_000);

  const env = readLocalEnv();
  test.skip(
    !env.BLOB_READ_WRITE_TOKEN?.trim(),
    "Set BLOB_READ_WRITE_TOKEN in .env to exercise createWhiteboardSession Blob upload."
  );

  await loginAsTestAdmin(guardedPage);
  await guardedPage.goto(`/admin/students/${studentId}`, {
    waitUntil: "domcontentloaded",
  });

  await guardedPage.getByTestId("start-whiteboard-session-btn").click();
  await expect(
    guardedPage.getByRole("heading", { name: "Start a whiteboard session" })
  ).toBeVisible({ timeout: 10_000 });

  await guardedPage.locator("#wb-consent-checkbox").check();
  await guardedPage.getByRole("button", { name: "Start session" }).click();

  await expect(guardedPage).toHaveURL(/\/workspace$/, { timeout: 45_000 });

  await expect(
    guardedPage.getByTestId("tutor-whiteboard-canvas-mount")
  ).toBeVisible({ timeout: 90_000 });
});
