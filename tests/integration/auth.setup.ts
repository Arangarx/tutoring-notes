import fs from "node:fs";
import path from "node:path";
import { test as setup, request } from "@playwright/test";
import { TEST_ADMIN, TEST_LEARNER, seedTestAdmin, seedTestStudent, seedTestLearner } from "../visual/helpers";
import {
  TEST_PARENT,
  TEST_ERASURE_ADMIN,
  seedParentAccountHolder,
  seedTestAdminWithRole,
} from "./identity/identity.helpers";

const authFile = path.join(__dirname, ".auth", "tutor.json");
const learnerAuthFile = path.join(__dirname, ".auth", "learner.json");
const parentAuthFile = path.join(__dirname, ".auth", "parent.json");
const erasureAdminAuthFile = path.join(__dirname, ".auth", "erasure-admin.json");

setup("authenticate tutor storageState + seed learner credentials", async ({
  page,
}) => {
  setup.setTimeout(120_000);
  const adminUserId = await seedTestAdmin();
  const { studentId } = await seedTestStudent(adminUserId);

  // Seed the test learner (AccountHolder + LearnerProfile + LearnerCredential)
  // so that /api/auth/learner/login works for wb-regression tests.
  await seedTestLearner(adminUserId, studentId);

  // Identity e2e: parent password login + ADMIN-role admin for erasure follow-on.
  await seedParentAccountHolder();
  await seedTestAdminWithRole("ADMIN");

  // --- Tutor: full NextAuth login → tutor.json storage state ---
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(TEST_ADMIN.email);
  await page.getByLabel(/password/i).fill(TEST_ADMIN.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith("/admin") &&
      !url.pathname.startsWith("/admin/settings/2fa") &&
      url.pathname !== "/admin/pending-approval",
    { timeout: 15_000 }
  );

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });

  // --- Learner: one-shot PIN login → learner.json storage state ---
  //
  // Pre-create the learner session cookie so openTutorAndStudent() can load it
  // via storageState rather than calling POST /api/auth/learner/login per-test.
  // This avoids exhausting the 30-req/min API rate limit when many tests run
  // sequentially (the middleware's API_DEFAULT bucket is shared for 127.0.0.1).
  //
  // The stored cookie is valid for 90 days (LearnerDeviceSession.expiresAt);
  // it is refreshed on every integration-setup run so it never expires during
  // a test run.
  const apiCtx = await request.newContext({ baseURL: "http://localhost:3100" });
  try {
    const resp = await apiCtx.post("/api/auth/learner/login", {
      data: { username: TEST_LEARNER.handle, pin: TEST_LEARNER.pin },
      headers: { "Content-Type": "application/json" },
    });
    if (!resp.ok()) {
      const body = await resp.text().catch(() => "<no body>");
      throw new Error(`Learner setup login failed (${resp.status()}): ${body}`);
    }
    // Extract the Set-Cookie header and persist it as a Playwright storage state.
    const cookies = await apiCtx.storageState();
    fs.writeFileSync(learnerAuthFile, JSON.stringify(cookies, null, 2), "utf-8");
  } finally {
    await apiCtx.dispose();
  }

  // --- Parent: account-holder login → parent.json storage state ---
  const parentCtx = await request.newContext({ baseURL: "http://localhost:3100" });
  try {
    const resp = await parentCtx.post("/api/auth/account-holder/login", {
      data: { email: TEST_PARENT.email, password: TEST_PARENT.password },
      headers: { "Content-Type": "application/json" },
    });
    if (!resp.ok()) {
      const body = await resp.text().catch(() => "<no body>");
      throw new Error(`Parent setup login failed (${resp.status()}): ${body}`);
    }
    const cookies = await parentCtx.storageState();
    fs.mkdirSync(path.dirname(parentAuthFile), { recursive: true });
    fs.writeFileSync(parentAuthFile, JSON.stringify(cookies, null, 2), "utf-8");
  } finally {
    await parentCtx.dispose();
  }

  // --- Erasure ADMIN: sign out tutor, NextAuth login → erasure-admin.json ---
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL((url) => url.pathname === "/login" || url.pathname === "/", {
    timeout: 15_000,
  });
  if (!page.url().includes("/login")) {
    await page.goto("/login");
  }
  await page.locator("#email").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#email").fill(TEST_ERASURE_ADMIN.email);
  await page.locator("#password").fill(TEST_ERASURE_ADMIN.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith("/admin") &&
      !url.pathname.startsWith("/admin/settings/2fa") &&
      url.pathname !== "/admin/pending-approval",
    { timeout: 30_000 }
  );
  fs.mkdirSync(path.dirname(erasureAdminAuthFile), { recursive: true });
  await page.context().storageState({ path: erasureAdminAuthFile });
});
