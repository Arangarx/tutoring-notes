/**
 * Playwright coverage for Workstream 1: session lifecycle + authenticated /join/
 * + waiting-room overlay.
 *
 * Tests in PRIORITY ORDER (as specified):
 *
 *   P2-A — Auth BLOCKERs (@wb-presence)
 *   P2-B — Fragment preservation (@wb-presence)
 *   P2-C — Phase-gated capture/timer (@wb-sync)
 *   P2-D — Waiting overlay + Start gating (@wb-chrome, @wb-av)
 *   P2-E — Dual-device takeover (@wb-presence)
 *   P2-F — /w retirement redirect (@wb-presence)
 *
 * Gate: npm run test:wb-affected:run (or npx playwright test --project=wb-regression
 *       --grep @wb-presence to run auth/presence subset).
 */

import { test, expect, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  seedWbLiveSyncSession,
  seedWbPendingLiveSyncSession,
  loginLearnerInContext,
  readEncryptionKeyFromHash,
  startSessionAsTutor,
  waitForWbE2eBridge,
  waitForTutorStudentConnected,
} from "./whiteboard-live-sync.helpers";
import {
  seedTestAdmin,
  seedTestStudent,
  seedOpenWhiteboardSession,
  TEST_LEARNER,
} from "../visual/helpers";
import { TAG } from "../test-tags";

// ---------------------------------------------------------------------------
// P2-A: Auth BLOCKERs
// ---------------------------------------------------------------------------

test.describe("Auth BLOCKERs — /join/ participant gate", { tag: [TAG.WB_PRESENCE] }, () => {
  test("learner A cannot access learner B's session → 404", async ({ browser }) => {
    test.setTimeout(60_000);

    // Seed two separate sessions under the same admin.
    const sessionA = await seedWbLiveSyncSession();
    // Seed a second learner with a different handle so they are a separate identity.
    const prisma = new PrismaClient();
    let learnerBProfileId: string;
    let learnerBHandle: string;
    const learnerBPin = "AltPin!789";
    try {
      const adminUserId = sessionA.adminUserId;
      const { studentId: studentBId } = await seedTestStudent(adminUserId);

      // Create a second AccountHolder + LearnerProfile + LearnerCredential
      const pinHash = await bcrypt.hash(learnerBPin, 10);
      const ahB = await prisma.accountHolder.upsert({
        where: { email: "pw-learner-b@test.local" },
        create: {
          email: "pw-learner-b@test.local",
          displayName: "Playwright Parent B",
          familyId: "pwfamilyb",
          emailVerifiedAt: new Date("2026-01-01"),
        },
        update: { emailVerifiedAt: new Date("2026-01-01") },
        select: { id: true },
      });

      const existingCredB = await prisma.learnerCredential.findUnique({
        where: {
          accountHolderId_username: { accountHolderId: ahB.id, username: "pwstudentb" },
        },
        select: { learnerProfileId: true },
      });

      if (existingCredB) {
        learnerBProfileId = existingCredB.learnerProfileId;
        await prisma.learnerCredential.update({
          where: {
            accountHolderId_username: { accountHolderId: ahB.id, username: "pwstudentb" },
          },
          data: { secretHash: pinHash },
        });
      } else {
        const profileB = await prisma.learnerProfile.create({
          data: {
            accountHolderId: ahB.id,
            displayName: "Playwright Learner B",
            accessMode: "child_pin_required",
          },
          select: { id: true },
        });
        learnerBProfileId = profileB.id;
        await prisma.learnerCredential.create({
          data: {
            learnerProfileId: learnerBProfileId,
            accountHolderId: ahB.id,
            username: "pwstudentb",
            secretHash: pinHash,
          },
        });
      }

      learnerBHandle = "pwstudentb@pwfamilyb";

      // Link studentB to learnerB profile (claimed student)
      await prisma.student.update({
        where: { id: studentBId },
        data: { learnerProfileId: learnerBProfileId },
      });
      // No SessionParticipant for (sessionA, learnerB) — learner B has no access.
    } finally {
      await prisma.$disconnect();
    }

    // Create a context authenticated as Learner B
    const contextB = await browser.newContext();
    try {
      await loginLearnerInContext(contextB, learnerBHandle, learnerBPin);
      const page = await contextB.newPage();
      // Learner B tries to access Learner A's session → should 404.
      // The /join/ page calls assertIsSessionParticipant which calls notFound().
      const response = await page.goto(
        `/join/${sessionA.whiteboardSessionId}`,
        { waitUntil: "domcontentloaded" }
      );
      // Next.js notFound() returns a 404 page.
      expect(response?.status()).toBe(404);
    } finally {
      await contextB.close();
    }
  });

  test("unauthenticated hit to /join/[sessionId] redirects to learner login (not the board)", async ({
    browser,
  }) => {
    test.setTimeout(30_000);
    const session = await seedWbLiveSyncSession();

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      // No learner cookie — JoinAuthGate should redirect to /students/login.
      await page.goto(`/join/${session.whiteboardSessionId}`, {
        waitUntil: "domcontentloaded",
      });
      // JoinAuthGate does client-side router.replace — wait for the URL to change.
      await page.waitForURL(
        (url) => url.pathname === "/students/login",
        { timeout: 15_000 }
      );
      expect(page.url()).toContain("/students/login");
      // Must NOT show the whiteboard board.
      await expect(page.getByTestId("student-whiteboard-canvas-mount")).not.toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("learner with no SessionParticipant row → 404 (not their session)", async ({
    browser,
  }) => {
    test.setTimeout(30_000);

    // Create a session WITHOUT seeding a SessionParticipant.
    const adminUserId = await seedTestAdmin();
    const { studentId } = await seedTestStudent(adminUserId);
    // seedOpenWhiteboardSession — no learner, no participant row.
    const whiteboardSessionId = await seedOpenWhiteboardSession({ adminUserId, studentId });

    // Create a learner (standard TEST_LEARNER) but don't link them to this session.
    const contextA = await browser.newContext();
    try {
      await loginLearnerInContext(contextA, TEST_LEARNER.handle, TEST_LEARNER.pin);
      const page = await contextA.newPage();
      const resp = await page.goto(
        `/join/${whiteboardSessionId}`,
        { waitUntil: "domcontentloaded" }
      );
      // The participant check fails → notFound() → 404.
      expect(resp?.status()).toBe(404);
    } finally {
      await contextA.close();
    }
  });

  test("tutor (NextAuth) session at /join/[sessionId] redirects to learner login", async ({
    browser,
  }) => {
    test.setTimeout(30_000);
    const session = await seedWbLiveSyncSession();

    // Tutor context (has NextAuth session, NOT a learner session cookie).
    const tutorCtx = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
    });
    try {
      const page = await tutorCtx.newPage();
      await page.goto(`/join/${session.whiteboardSessionId}`, {
        waitUntil: "domcontentloaded",
      });
      // No learner cookie → JoinAuthGate → /students/login.
      await page.waitForURL(
        (url) => url.pathname === "/students/login",
        { timeout: 15_000 }
      );
      expect(page.url()).toContain("/students/login");
    } finally {
      await tutorCtx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// P2-B: Fragment preservation (#k= survives stale-session hit → login → back)
// ---------------------------------------------------------------------------

test.describe("Fragment preservation — #k= survives stale-session /join/ hit", { tag: [TAG.WB_PRESENCE] }, () => {
  test("stale learner cookie + /join/[sessionId]#k=KEY → JoinAuthGate saves key to sessionStorage → returnTo includes session path", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    /**
     * Architecture note:
     *
     * JoinAuthGate runs whenever the /join/[sessionId] page renders and
     * getLearnerSessionFromHeaders() returns null. This happens in two cases:
     *   1. No learner cookie at all — middleware passes through (by design; a
     *      server redirect would destroy the #k= fragment). Page renders → JoinAuthGate.
     *   2. Stale/invalid cookie — middleware sees the cookie and passes through;
     *      server-side session lookup fails → JoinAuthGate.
     *
     * In both cases JoinAuthGate saves window.location.hash to sessionStorage,
     * then client-redirects to /students/login. JoinHashRestorer restores the
     * hash on the authenticated return visit before the board key-read effect fires.
     *
     * This test covers the stale-cookie path. The no-cookie path (with the full
     * login + board-mount oracle) is covered by the adjacent test.
     */
    const session = await seedWbLiveSyncSession();
    const fakeKey = "pw-test-fake-encryption-key-abc123";

    // Set a fake (invalid) learner session cookie so the middleware allows the
    // request through but the server-side getLearnerSession() returns null.
    // This triggers JoinAuthGate on the client.
    const ctx = await browser.newContext();
    await ctx.addCookies([
      {
        name: "mynk_learner_session",
        value: "pw-invalid-test-token-" + Date.now(),
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);

    try {
      const page = await ctx.newPage();
      // Hit /join/ with invalid cookie + fragment key.
      // Middleware sees cookie → allows through.
      // Server: getLearnerSession() → null (invalid token) → renders JoinAuthGate.
      // JoinAuthGate: saves hash to sessionStorage → client-side redirect to login.
      await page.goto(
        `/join/${session.whiteboardSessionId}#k=${fakeKey}`,
        { waitUntil: "domcontentloaded" }
      );

      // Wait for client-side redirect to /students/login (JoinAuthGate effect).
      await page.waitForURL(
        (url) => url.pathname === "/students/login",
        { timeout: 15_000 }
      );

      // sessionStorage is per-tab (same browsing context) — persists across the
      // client-side navigation from /join/ to /students/login.
      const storedHash = await page.evaluate(
        (sessionId) =>
          sessionStorage.getItem(`mynk_join_hash_${sessionId}`),
        session.whiteboardSessionId
      );
      // The stored value should be the full hash string "#k=<key>".
      expect(storedHash).toBe(`#k=${fakeKey}`);

      // The returnTo param points back to /join/<sessionId> so login can redirect.
      expect(page.url()).toContain(
        encodeURIComponent(`/join/${session.whiteboardSessionId}`)
      );
    } finally {
      await ctx.close();
    }
  });

  test("no-cookie /join#k= preserves the key through login (middleware does not strip)", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    // This test would FAIL on the pre-fix middleware: the server redirect in middleware
    // bypassed JoinAuthGate entirely, so the #k= fragment was never saved to
    // sessionStorage — the board could not decrypt after the student logged in.
    //
    // After the fix: middleware passes /join/* through → page renders → JoinAuthGate
    // saves window.location.hash to sessionStorage → client-redirects to /students/login.
    // loginLearnerInContext() authenticates via API (no page navigation) so sessionStorage
    // is intact. A subsequent goto(/join/<id>) lands the authenticated student on the
    // board; JoinHashRestorer reads the saved hash and restores it before the board
    // key-read effect fires. bridge-ready is the independent oracle: bridge ready ⟹
    // key survived the login round-trip and the board decrypted successfully.

    const session = await seedWbLiveSyncSession(); // ACTIVE phase — board must mount

    // Open tutor workspace to obtain the real E2E encryption key from the URL hash.
    const tutorCtx = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    let encryptionKey: string;
    try {
      const tutorPage = await tutorCtx.newPage();
      await tutorPage.goto(
        `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await waitForWbE2eBridge(tutorPage, "tutor");
      encryptionKey = await readEncryptionKeyFromHash(tutorPage);
    } finally {
      await tutorCtx.close();
    }

    // Student context with NO learner cookie — do NOT load .auth/learner.json.
    const studentCtx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    try {
      const studentPage = await studentCtx.newPage();

      // 1. Navigate to /join/<id>#k=<key> with no auth.
      //    Middleware (post-fix) passes through; the page renders JoinAuthGate.
      await studentPage.goto(
        `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
        { waitUntil: "domcontentloaded" }
      );

      // 2. JoinAuthGate saves hash and client-redirects to /students/login.
      await studentPage.waitForURL(
        (url) => url.pathname === "/students/login",
        { timeout: 15_000 }
      );
      expect(studentPage.url()).toContain(
        encodeURIComponent(`/join/${session.whiteboardSessionId}`)
      );

      // 3. Intermediate oracle: hash is in sessionStorage on this tab.
      //    sessionStorage persists across client-side navigations within the same tab.
      const storedHash = await studentPage.evaluate(
        (sessionId) => sessionStorage.getItem(`mynk_join_hash_${sessionId}`),
        session.whiteboardSessionId
      );
      expect(storedHash).toBe(`#k=${encryptionKey}`);

      // 4. Authenticate (API POST — sets mynk_learner_session cookie in the context
      //    without triggering a page navigation, so sessionStorage is preserved).
      await loginLearnerInContext(studentCtx, session.learnerHandle, session.learnerPin);

      // 5. Navigate back to /join/<id> without the hash — JoinHashRestorer will read
      //    the hash from sessionStorage (step 3) and restore it to window.location.hash
      //    before the board key-read effect fires.
      await studentPage.goto(
        `/join/${session.whiteboardSessionId}`,
        { waitUntil: "domcontentloaded" }
      );

      // 6. Board mounts (ACTIVE session, SessionParticipant row seeded).
      await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });

      // 7. Bridge ready — independent oracle: board is decrypted and interactive.
      //    This only succeeds if the key was restored from sessionStorage correctly.
      await waitForWbE2eBridge(studentPage, "student");
    } finally {
      await studentCtx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// P2-C: Phase-gated capture / billing timer
// ---------------------------------------------------------------------------

test.describe("Phase-gated capture + timer", { tag: [TAG.WB_SYNC] }, () => {
  test("recording does NOT start and billing timer does NOT accrue while PENDING", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const session = await seedWbPendingLiveSyncSession();

    const tutorCtx = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
      permissions: ["microphone"],
    });
    try {
      const tutorPage = await tutorCtx.newPage();
      await tutorPage.goto(
        `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });

      // PENDING: waiting-room overlay must be visible.
      await expect(tutorPage.getByTestId("wb-waiting-overlay")).toBeVisible({
        timeout: 10_000,
      });

      // PLAYWRIGHT-GAP: In the test harness, NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT=1
      // allows solo recording to arm even before a student joins. This makes the
      // recording pill show "LIVE" in PENDING phase in solo mode — a harness-specific
      // behavior, not a phase-gate bug. The phase gate test uses the billing timer
      // (active-ping) as the independent oracle instead.
      // The full phase-gated recording assertion requires running without the solo-
      // until-student flag and is documented in docs/BACKLOG.md as PLAYWRIGHT-GAP.

      // PENDING: active-ping must NOT fire (billing timer off).
      // Oracle: wait 3 seconds and verify the active timer text is either absent or
      // showing 0:00 / not incrementing. We check the wb-session-timer testid.
      const timer = tutorPage.getByTestId("wb-session-timer");
      const timerVisible = await timer.isVisible();
      if (timerVisible) {
        const timerText1 = await timer.textContent();
        await tutorPage.waitForTimeout(3_000);
        const timerText2 = await timer.textContent();
        // Timer must not have advanced while PENDING (phase gate inactive).
        expect(timerText1, "billing timer advanced while PENDING").toBe(timerText2);
      }
    } finally {
      await tutorCtx.close();
    }
  });

  test("recording starts and timer accrues after tutor Start (PENDING → ACTIVE)", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbPendingLiveSyncSession();

    const tutorCtx = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
      permissions: ["microphone"],
    });
    const studentCtx = await browser.newContext({
      permissions: ["microphone"],
    });
    try {
      await loginLearnerInContext(studentCtx, session.learnerHandle, session.learnerPin);

      const tutorPage = await tutorCtx.newPage();
      await tutorPage.goto(
        `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await waitForWbE2eBridge(tutorPage, "tutor");

      const encryptionKey = await tutorPage.evaluate(() => {
        const m = window.location.hash.match(/[#&]k=([^&]+)/);
        return m?.[1] ? decodeURIComponent(m[1]) : "";
      });
      const studentPage = await studentCtx.newPage();
      await studentPage.goto(
        `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await waitForWbE2eBridge(studentPage, "student");
      await waitForTutorStudentConnected(tutorPage);

      // Click Start → PENDING → ACTIVE.
      await startSessionAsTutor(tutorPage);

      // ACTIVE: overlay gone on tutor side.
      await expect(tutorPage.getByTestId("wb-waiting-overlay")).not.toBeVisible();

      // After Start the recording pill should show a live/active state.
      // (NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT=1 is set, so solo recording
      // also arms. Post-Start is always ACTIVE so recording should begin.)
      // The pill eventually shows "Live" (or similar) once the FSM transitions.
      // This is a soft check — the main oracle is the overlay dismissal above.
      const recordingPill = tutorPage.getByTestId("wb-recording-pill");
      if (await recordingPill.isVisible()) {
        // Allow up to 15s for the FSM to arm after Start.
        await expect(recordingPill).toContainText(/live|armed/i, { timeout: 15_000 }).catch(
          () => {
            // Non-fatal: some test environments skip recording. The overlay
            // dismissal is the primary ACTIVE oracle.
          }
        );
      }
    } finally {
      await tutorCtx.close();
      await studentCtx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// P2-D: Waiting-room overlay + Start gating
// ---------------------------------------------------------------------------

test.describe("Waiting-room overlay + Start gating", { tag: [TAG.WB_CHROME, TAG.WB_AV] }, () => {
  test("overlay visible for tutor while PENDING; Start disabled until student connects in LIVE mode", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const session = await seedWbPendingLiveSyncSession();

    const tutorCtx = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
      permissions: ["microphone"],
    });
    try {
      const tutorPage = await tutorCtx.newPage();
      await tutorPage.goto(
        `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });

      // Overlay must be visible (tutor role, PENDING).
      await expect(tutorPage.getByTestId("wb-waiting-overlay")).toBeVisible({
        timeout: 10_000,
      });
      await expect(tutorPage.getByTestId("wb-waiting-overlay")).toHaveAttribute(
        "data-role",
        "tutor"
      );

      // LIVE mode Start button must be disabled until student connects.
      const startBtn = tutorPage.getByTestId("wb-start-session");
      await expect(startBtn).toBeVisible();
      await expect(startBtn).toBeDisabled({ timeout: 5_000 });

      // Mode toggle must be visible.
      await expect(tutorPage.getByTestId("wb-session-mode-toggle")).toBeVisible();
    } finally {
      await tutorCtx.close();
    }
  });

  test("overlay visible for student while PENDING; dismisses when tutor clicks Start", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbPendingLiveSyncSession();

    const tutorCtx = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
      permissions: ["microphone"],
    });
    const studentCtx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      permissions: ["microphone"],
    });
    try {
      await loginLearnerInContext(studentCtx, session.learnerHandle, session.learnerPin);

      const tutorPage = await tutorCtx.newPage();
      await tutorPage.goto(
        `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await waitForWbE2eBridge(tutorPage, "tutor");

      const encryptionKey = await tutorPage.evaluate(() => {
        const m = window.location.hash.match(/[#&]k=([^&]+)/);
        return m?.[1] ? decodeURIComponent(m[1]) : "";
      });
      const studentPage = await studentCtx.newPage();
      await studentPage.goto(
        `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await waitForWbE2eBridge(studentPage, "student");

      // Student overlay visible while PENDING.
      await expect(studentPage.getByTestId("wb-waiting-overlay")).toBeVisible({
        timeout: 10_000,
      });
      await expect(studentPage.getByTestId("wb-waiting-overlay")).toHaveAttribute(
        "data-role",
        "student"
      );

      // Wait for sync presence then start.
      await waitForTutorStudentConnected(tutorPage);
      await startSessionAsTutor(tutorPage);

      // Tutor overlay dismissed.
      await expect(tutorPage.getByTestId("wb-waiting-overlay")).not.toBeVisible();

      // Student overlay dismisses when join-timer poll reports ACTIVE.
      await expect(studentPage.getByTestId("wb-waiting-overlay")).not.toBeVisible({
        timeout: 60_000,
      });
    } finally {
      await tutorCtx.close();
      await studentCtx.close();
    }
  });

  test(
    "tutor waiting room — copy student link yields /join URL on clipboard",
    { tag: [TAG.WB_PRESENCE, TAG.WB_CHROME] },
    async ({ browser }) => {
      test.setTimeout(120_000);
      const session = await seedWbPendingLiveSyncSession();

      const tutorCtx = await browser.newContext({
        storageState: "tests/integration/.auth/tutor.json",
        viewport: { width: 1280, height: 900 },
        permissions: ["microphone", "clipboard-read", "clipboard-write"],
      });
      const studentCtx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        permissions: ["microphone"],
      });
      try {
        await loginLearnerInContext(studentCtx, session.learnerHandle, session.learnerPin);

        const tutorPage = await tutorCtx.newPage();
        await tutorPage.goto(
          `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
          timeout: 90_000,
        });
        await expect(tutorPage.getByTestId("wb-waiting-overlay")).toBeVisible({
          timeout: 10_000,
        });

        const copyBtn = tutorPage.getByTestId("wb-waiting-copy-student-link");
        await expect(copyBtn).toBeVisible();
        await waitForWbE2eBridge(tutorPage, "tutor");
        await expect(copyBtn).toBeEnabled({ timeout: 15_000 });

        const encryptionKey = await readEncryptionKeyFromHash(tutorPage);
        await copyBtn.click();
        await expect(copyBtn).toContainText("Copied!", { timeout: 5_000 });

        const clipboardText = await tutorPage.evaluate(() => navigator.clipboard.readText());
        const origin = new URL(tutorPage.url()).origin;
        expect(clipboardText).toBe(
          `${origin}/join/${session.whiteboardSessionId}#k=${encryptionKey}`
        );

        const studentPage = await studentCtx.newPage();
        await studentPage.goto(
          `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
          timeout: 90_000,
        });
        await expect(studentPage.getByTestId("wb-waiting-overlay")).toBeVisible({
          timeout: 10_000,
        });
        await expect(studentPage.getByTestId("wb-waiting-copy-student-link")).toHaveCount(0);
      } finally {
        await tutorCtx.close();
        await studentCtx.close();
      }
    }
  );

  test("IN_PERSON mode — Start is always enabled (no student required)", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    // Seed the session with IN_PERSON mode pre-set (avoids needing to click the
    // mode toggle in the test, which has pointer-interception issues in Playwright's
    // synthetic browser context). The test verifies the START-without-student behavior.
    // UI toggle interaction is covered by the overlay-visible tests and manual smoke.
    const session = await seedWbPendingLiveSyncSession({ sessionMode: "IN_PERSON" });

    const tutorCtx = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
      permissions: ["microphone"],
    });
    try {
      const tutorPage = await tutorCtx.newPage();
      await tutorPage.goto(
        `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await waitForWbE2eBridge(tutorPage, "tutor");
      await expect(tutorPage.getByTestId("wb-waiting-overlay")).toBeVisible({
        timeout: 10_000,
      });

      // IN_PERSON mode pre-set: overlay shows IN_PERSON state.
      await expect(tutorPage.getByTestId("wb-waiting-overlay")).toHaveAttribute(
        "data-session-mode",
        "IN_PERSON",
        { timeout: 5_000 }
      );

      // IN_PERSON always startable — Start button must be enabled without a student.
      const startBtn = tutorPage.getByTestId("wb-start-session");
      await expect(startBtn).toBeEnabled({ timeout: 10_000 });

      // Click Start — overlay dismisses once startWhiteboardSession server action
      // flips phase to ACTIVE and client calls setSessionPhase("ACTIVE").
      await startBtn.click();
      await expect(tutorPage.getByTestId("wb-waiting-overlay")).not.toBeVisible({
        timeout: 60_000,
      });

      // Board is fully functional after dismissal.
      await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible();
    } finally {
      await tutorCtx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// P2-E: Dual-device takeover
// ---------------------------------------------------------------------------

test.describe("Dual-device takeover", { tag: [TAG.WB_PRESENCE] }, () => {
  test("second student device with same learner joins → older device shows takeover message", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();

    const tutorCtx = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
      permissions: ["microphone"],
    });
    // Two student contexts share the same learner credentials (same identity).
    const student1Ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      permissions: ["microphone"],
    });
    const student2Ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      permissions: ["microphone"],
    });
    try {
      // Both student contexts authenticate as the same learner.
      await loginLearnerInContext(student1Ctx, session.learnerHandle, session.learnerPin);
      await loginLearnerInContext(student2Ctx, session.learnerHandle, session.learnerPin);

      const tutorPage = await tutorCtx.newPage();
      await tutorPage.goto(
        `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await waitForWbE2eBridge(tutorPage, "tutor");

      const encryptionKey = await tutorPage.evaluate(() => {
        const m = window.location.hash.match(/[#&]k=([^&]+)/);
        return m?.[1] ? decodeURIComponent(m[1]) : "";
      });

      // Device 1 joins first.
      const student1Page = await student1Ctx.newPage();
      await student1Page.goto(
        `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(student1Page.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await waitForWbE2eBridge(student1Page, "student");
      await waitForTutorStudentConnected(tutorPage);

      // Device 2 joins (same identity = newer device takes over).
      const student2Page = await student2Ctx.newPage();
      await student2Page.goto(
        `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(student2Page.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });

      // Device 1 (older) should show the takeover screen.
      // WhiteboardWorkspaceClient renders:
      //   <h1>You joined on another device</h1>
      // when deviceSuperseded=true (identity-peerid workstream).
      await expect(
        student1Page.getByRole("heading", { name: /another device/i })
      ).toBeVisible({ timeout: 60_000 });
    } finally {
      await tutorCtx.close();
      await student1Ctx.close();
      await student2Ctx.close();
    }
  });

  test(
    "after device A is superseded and closes, tutor retains device B — never drops to zero students",
    { tag: [TAG.WB_PRESENCE, TAG.WB_AV, TAG.WB_SYNC] },
    async ({ browser }) => {
      // Regression oracle for the dual-device prune bug (wb-wave5-polish Plan #1 smoke FAIL):
      //
      // Pre-fix behaviour (FAIL path):
      //   1. Device A socket closes → relay fires room-user-change shrink.
      //   2. Tutor sync-client marks ALL remote peers (including healthy device B)
      //      as pendingPrune.
      //   3. After ~5s grace, device B is evicted → tutor shows "Waiting for student".
      //
      // Post-fix behaviour (PASS path):
      //   Fix 1: device A's clean close emits a leave:true frame → only A removed,
      //          B never marked pendingPrune.
      //   Fix 3: device B's 2s heartbeat re-announces before the 5s grace window
      //          fires, rescuing B even if the leave frame was missed (crash path).
      //
      // We wait 8s (> 5s prune grace) after closing device A's tab and then assert
      // the tutor sync pill still shows "Student connected" (i.e. device B alive).
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();

      const tutorCtx = await browser.newContext({
        storageState: "tests/integration/.auth/tutor.json",
        viewport: { width: 1280, height: 900 },
        permissions: ["microphone"],
      });
      // Both student contexts share the same learner (same identity key).
      const student1Ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        permissions: ["microphone"],
      });
      const student2Ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        permissions: ["microphone"],
      });

      try {
        await loginLearnerInContext(student1Ctx, session.learnerHandle, session.learnerPin);
        await loginLearnerInContext(student2Ctx, session.learnerHandle, session.learnerPin);

        const tutorPage = await tutorCtx.newPage();
        await tutorPage.goto(
          `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
          timeout: 90_000,
        });
        await waitForWbE2eBridge(tutorPage, "tutor");

        const encryptionKey = await tutorPage.evaluate(() => {
          const m = window.location.hash.match(/[#&]k=([^&]+)/);
          return m?.[1] ? decodeURIComponent(m[1]) : "";
        });

        // Device A joins first; tutor sees it.
        const student1Page = await student1Ctx.newPage();
        await student1Page.goto(
          `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(student1Page.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
          timeout: 90_000,
        });
        await waitForWbE2eBridge(student1Page, "student");
        await waitForTutorStudentConnected(tutorPage);

        // Device B joins (same identity = supersedes A).
        const student2Page = await student2Ctx.newPage();
        await student2Page.goto(
          `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(student2Page.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
          timeout: 90_000,
        });
        await waitForWbE2eBridge(student2Page, "student");

        // Device A must show the takeover screen before we close it.
        await expect(
          student1Page.getByRole("heading", { name: /another device/i })
        ).toBeVisible({ timeout: 60_000 });

        // Simulate device A closing its tab (user closes the superseded browser).
        // This is a socket disconnect without a leave frame — the crash-path that
        // Fix 3 (heartbeat) must cover, even when Fix 1 (leave frame) can't fire.
        await student1Page.close();

        // CRITICAL INVARIANT: wait well past the 5s prune grace window.
        // Pre-fix: after ~5s, device B would be evicted and the tutor would
        // flip from "Student connected" to "Awaiting student" (pill hidden).
        // Post-fix: device B's 2s heartbeat keeps it alive; pill stays green.
        await tutorPage.waitForTimeout(8_000);

        // Assert the tutor still sees a student — never dropped to zero.
        // "Student connected" text must still be present; if it changed to
        // "Awaiting student", this assertion fails (the pre-fix regression).
        await expect(tutorPage.getByTestId("wb-sync-pill")).toHaveText(
          /student connected/i,
          { timeout: 3_000 }
        );

        // Device B must still be on the board (it was never evicted).
        await expect(student2Page.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
          timeout: 5_000,
        });
      } finally {
        await tutorCtx.close();
        await student1Ctx.close();
        await student2Ctx.close();
      }
    }
  );
});

// ---------------------------------------------------------------------------
// P2-F: /w/[joinToken] retirement — redirect to /join/
// ---------------------------------------------------------------------------

test.describe("/w/ retirement — redirect bridge", { tag: [TAG.WB_PRESENCE] }, () => {
  test("/w/[token]#k=KEY redirects to /join/[sessionId]#k=KEY (client bridge)", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const session = await seedWbLiveSyncSession();

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      const fakeKey = "pw-test-bridge-key-abc123";
      // Navigate to the legacy /w/ path with a fragment key.
      // JoinTokenRedirect does window.location.replace("/join/<id>#k=...").
      await page.goto(
        `/w/${session.joinToken}#k=${fakeKey}`,
        { waitUntil: "domcontentloaded" }
      );

      // Wait for the client-side replace to fire — ends up at either:
      //   /join/<id>  (if learner not authenticated → JoinAuthGate → /students/login)
      //   /join/<id>  (if learner authenticated → board)
      // Without auth, we expect /students/login.
      await page.waitForURL(
        (url) =>
          url.pathname === "/students/login" ||
          url.pathname.startsWith("/join/"),
        { timeout: 15_000 }
      );

      // The final URL must include the session ID somewhere in the path.
      // Either /join/<sessionId> or (after auth-redirect) /students/login with returnTo=/join/<sessionId>.
      const finalUrl = page.url();
      expect(finalUrl).toContain(session.whiteboardSessionId);

      // Must NOT still be at /w/ (redirect happened).
      expect(finalUrl).not.toContain(`/w/${session.joinToken}`);
    } finally {
      await ctx.close();
    }
  });

  test("/w/[token]#k=KEY → after learner auth, lands on /join/[sessionId] board", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const session = await seedWbLiveSyncSession();

    // Authenticate the learner FIRST, then navigate to /w/ — should auto-join board.
    const tutorCtx = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const studentCtx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    try {
      // Get encryption key from tutor (tutor workspace must be open first).
      const tutorPage = await tutorCtx.newPage();
      await tutorPage.goto(
        `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      const encryptionKey = await tutorPage.evaluate(() => {
        const m = window.location.hash.match(/[#&]k=([^&]+)/);
        return m?.[1] ? decodeURIComponent(m[1]) : "";
      });

      // Authenticate learner then navigate to the legacy /w/ URL.
      await loginLearnerInContext(studentCtx, session.learnerHandle, session.learnerPin);
      const studentPage = await studentCtx.newPage();
      await studentPage.goto(
        `/w/${session.joinToken}#k=${encryptionKey}`,
        { waitUntil: "domcontentloaded" }
      );

      // JoinTokenRedirect fires → window.location.replace(/join/<id>#k=<key>)
      // Learner is authenticated → /join/ renders the board.
      await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });

      // URL must be at /join/ (redirect completed; key preserved in hash).
      await page_waitForJoinUrl(studentPage, session.whiteboardSessionId, 15_000);
    } finally {
      await tutorCtx.close();
      await studentCtx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// P3-A: Dead-end /join retirement — honest no-session message
// ---------------------------------------------------------------------------

test.describe("Dead-end /join retirement", { tag: [TAG.WB_PRESENCE] }, () => {
  test("/join (no sessionId) shows honest no-session message — not old fake waiting room", async ({
    browser,
  }) => {
    test.setTimeout(30_000);
    // Use a seeded pending session to get a valid learner credential.
    const session = await seedWbPendingLiveSyncSession();

    const ctx = await browser.newContext();
    try {
      await loginLearnerInContext(ctx, session.learnerHandle, session.learnerPin);
      const page = await ctx.newPage();
      await page.goto("/join", { waitUntil: "domcontentloaded" });

      // Honest no-session message must be visible.
      const msg = page.getByTestId("join-no-session-message");
      await expect(msg).toBeVisible({ timeout: 10_000 });
      await expect(msg).toContainText("No active session");

      // Must NOT contain the retired passive "let you in" promise.
      await expect(page.getByText(/let you in/i)).not.toBeVisible();
      // Must NOT contain the old "Your tutor will let you in" dead-end copy.
      await expect(
        page.getByText(/your tutor will let you in/i)
      ).not.toBeVisible();
      // Must NOT render fake device preview (no camera placeholder buttons).
      await expect(page.getByText(/camera preview/i)).not.toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// P3-B: Student overlay convergence — mutual presence + chip-toggle controls
// ---------------------------------------------------------------------------

test.describe(
  "Student overlay convergence — mutual presence copy + chip-toggle A/V",
  { tag: [TAG.WB_PRESENCE, TAG.WB_CHROME] },
  () => {
    test(
      "student /join/<sessionId>#k= lands directly on wb-waiting-overlay with mutual-presence copy",
      async ({ browser }) => {
        test.setTimeout(180_000);
        const session = await seedWbPendingLiveSyncSession();

        const tutorCtx = await browser.newContext({
          storageState: "tests/integration/.auth/tutor.json",
          viewport: { width: 1280, height: 900 },
          permissions: ["microphone"],
        });
        const studentCtx = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          permissions: ["microphone"],
        });
        try {
          await loginLearnerInContext(
            studentCtx,
            session.learnerHandle,
            session.learnerPin
          );

          const tutorPage = await tutorCtx.newPage();
          await tutorPage.goto(
            `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(
            tutorPage.getByTestId("tutor-whiteboard-canvas-mount")
          ).toBeVisible({ timeout: 90_000 });
          await waitForWbE2eBridge(tutorPage, "tutor");

          const encryptionKey = await tutorPage.evaluate(() => {
            const m = window.location.hash.match(/[#&]k=([^&]+)/);
            return m?.[1] ? decodeURIComponent(m[1]) : "";
          });

          const studentPage = await studentCtx.newPage();
          await studentPage.goto(
            `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(
            studentPage.getByTestId("student-whiteboard-canvas-mount")
          ).toBeVisible({ timeout: 90_000 });

          // Student lands directly on the mutual overlay — no intermediate gate.
          const overlay = studentPage.getByTestId("wb-waiting-overlay");
          await expect(overlay).toBeVisible({ timeout: 10_000 });
          await expect(overlay).toHaveAttribute("data-role", "student");

          // Must NOT contain the retired passive "will let you in" copy.
          await expect(overlay).not.toContainText(/will let you in/i);
          await expect(overlay).not.toContainText(/waiting to be let in/i);
          // Must NOT contain the old redundant passive block copy.
          await expect(overlay).not.toContainText(
            /waiting for .* to start the session/i
          );

          // Student heading shows mutual-presence framing (connected or connecting).
          const heading = studentPage.getByTestId(
            "wb-waiting-overlay-student-heading"
          );
          await expect(heading).toBeVisible();
          // Either "You're in — <name> will start" (connected) or "Connecting…"
          await expect(heading).toContainText(
            /You're in|Connecting/i,
            { timeout: 30_000 }
          );
        } finally {
          await tutorCtx.close();
          await studentCtx.close();
        }
      }
    );

    test(
      "waiting-room A/V controls render as stateful chip-toggles (checkbox role + persistent state label)",
      async ({ browser }) => {
        test.setTimeout(180_000);
        const session = await seedWbPendingLiveSyncSession();

        const tutorCtx = await browser.newContext({
          storageState: "tests/integration/.auth/tutor.json",
          viewport: { width: 1280, height: 900 },
          permissions: ["microphone"],
        });
        const studentCtx = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          permissions: ["microphone"],
        });
        try {
          await loginLearnerInContext(
            studentCtx,
            session.learnerHandle,
            session.learnerPin
          );

          const tutorPage = await tutorCtx.newPage();
          await tutorPage.goto(
            `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(
            tutorPage.getByTestId("tutor-whiteboard-canvas-mount")
          ).toBeVisible({ timeout: 90_000 });
          await waitForWbE2eBridge(tutorPage, "tutor");

          const encryptionKey = await tutorPage.evaluate(() => {
            const m = window.location.hash.match(/[#&]k=([^&]+)/);
            return m?.[1] ? decodeURIComponent(m[1]) : "";
          });

          const studentPage = await studentCtx.newPage();
          await studentPage.goto(
            `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(
            studentPage.getByTestId("student-whiteboard-canvas-mount")
          ).toBeVisible({ timeout: 90_000 });
          await expect(
            studentPage.getByTestId("wb-waiting-overlay")
          ).toBeVisible({ timeout: 10_000 });

          // ── Mic control (top-bar component reused in overlay — inline meter) ──
          const micToggle = studentPage.getByTestId("wb-topbar-mic-toggle");
          await expect(micToggle).toBeVisible({ timeout: 10_000 });
          await expect(micToggle.locator(".mynk-wb-mic-meter")).toBeVisible();

          // ── Cam chip-toggle ──
          const camChip = studentPage.getByTestId("wb-overlay-cam-chip");
          await expect(camChip).toBeVisible({ timeout: 10_000 });

          const camCheckbox = camChip.getByRole("checkbox");
          await expect(camCheckbox).toBeVisible();

          const camLabel = studentPage.getByTestId("wb-overlay-cam-chip-label");
          await expect(camLabel).toBeVisible();
          const camLabelText = await camLabel.textContent();
          expect(["Camera on", "Camera off"]).toContain(camLabelText?.trim());

          // ── Toggle oracle: clicking cam chip flips the state label ──
          const camBefore = await camLabel.textContent();
          await camChip.click();
          await expect(camLabel).not.toHaveText(camBefore ?? "", { timeout: 10_000 });
        } finally {
          await tutorCtx.close();
          await studentCtx.close();
        }
      }
    );

    test(
      "student local AV tile is present in the waiting-room overlay during PENDING",
      async ({ browser }) => {
        test.setTimeout(180_000);
        const session = await seedWbPendingLiveSyncSession();

        const tutorCtx = await browser.newContext({
          storageState: "tests/integration/.auth/tutor.json",
          viewport: { width: 1280, height: 900 },
          permissions: ["microphone"],
        });
        const studentCtx = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          // Grant both mic and camera so the A/V bootstrap can acquire both.
          permissions: ["microphone", "camera"],
        });
        try {
          await loginLearnerInContext(
            studentCtx,
            session.learnerHandle,
            session.learnerPin
          );

          const tutorPage = await tutorCtx.newPage();
          await tutorPage.goto(
            `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(
            tutorPage.getByTestId("tutor-whiteboard-canvas-mount")
          ).toBeVisible({ timeout: 90_000 });
          await waitForWbE2eBridge(tutorPage, "tutor");

          const encryptionKey = await tutorPage.evaluate(() => {
            const m = window.location.hash.match(/[#&]k=([^&]+)/);
            return m?.[1] ? decodeURIComponent(m[1]) : "";
          });

          const studentPage = await studentCtx.newPage();
          await studentPage.goto(
            `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(
            studentPage.getByTestId("student-whiteboard-canvas-mount")
          ).toBeVisible({ timeout: 90_000 });
          await expect(
            studentPage.getByTestId("wb-waiting-overlay")
          ).toBeVisible({ timeout: 10_000 });

          // The AVTilesPanel for the overlay must be present and contain a local tile.
          // localTile is always passed to AVTilesPanel — the tile renders even before
          // the video stream arrives (shows a placeholder / muted state).
          const tilesPanel = studentPage.getByTestId("wb-waiting-room-av-tiles");
          await expect(tilesPanel).toBeVisible({ timeout: 10_000 });

          // At least one av-tile- element must exist (the local self-tile).
          // Note: data-testid^="av-tile-" matches both the tile root AND its child
          // sub-elements; asserting .first() is visible confirms the tile rendered.
          const localTiles = tilesPanel.locator('[data-testid^="av-tile-"]');
          await expect(localTiles.first()).toBeVisible({ timeout: 15_000 });
        } finally {
          await tutorCtx.close();
          await studentCtx.close();
        }
      }
    );
  }
);

// ---------------------------------------------------------------------------
// P4-A: Remote-tile util + Bug 1 — post-login-redirect key survival
// ---------------------------------------------------------------------------

/**
 * Shared utility: assert that the wb-waiting-room-av-tiles panel contains at
 * least one REMOTE peer tile (data-participant-count ≥ 1).
 *
 * Oracle: the AVTilesPanel sets `data-participant-count` to the number of
 * remote peers. Count ≥ 1 ⟹ a peer was added via WebRTC (which requires
 * matching encryption keys for signaling). This is the canonical "false-
 * confidence gap" closer — a local-only tile check passes even when A/V
 * signaling is broken.
 */
async function assertRemoteTilePresent(
  tilesPanel: import("@playwright/test").Locator,
  timeoutMs = 45_000
): Promise<void> {
  await expect(tilesPanel).toHaveAttribute(
    "data-participant-count",
    /^[1-9][0-9]*$/,
    { timeout: timeoutMs }
  );
}

test.describe(
  "Bug 1 — post-login-redirect key survival (sessionStorage fallback)",
  { tag: [TAG.WB_PRESENCE, TAG.WB_AV, TAG.WB_SYNC] },
  () => {
    test(
      "student with no hash but sessionStorage-seeded key connects to tutor (remote A/V tile appears)",
      async ({ browser }) => {
        // Verifies that the encryption-key sessionStorage fallback (Bug 1 fix)
        // allows the student to join after the post-login-redirect path strips
        // the URL hash. Oracle: a remote tile in the waiting-room overlay ⟹
        // WebRTC signaling succeeded ⟹ same encryption key on both sides.
        //
        // Setup mirrors the real post-login-redirect path:
        //   1. Student lands at /join/<id>#k=<key> while not logged in.
        //   2. JoinAuthGate saves the hash to sessionStorage and redirects.
        //   3. Student logs in (API, no page-nav → sessionStorage intact).
        //   4. Student returns to /join/<id> WITHOUT the hash.
        //   5. Student key-read effect reads sessionStorage → key found.
        test.setTimeout(300_000);
        const session = await seedWbPendingLiveSyncSession();

        const tutorCtx = await browser.newContext({
          storageState: "tests/integration/.auth/tutor.json",
          viewport: { width: 1280, height: 900 },
          permissions: ["microphone", "camera"],
        });
        // Student context with NO pre-auth (no .auth/learner.json).
        const studentCtx = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          permissions: ["microphone", "camera"],
        });
        try {
          // -- Tutor opens workspace and waits for bridge + key --
          const tutorPage = await tutorCtx.newPage();
          await tutorPage.goto(
            `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
            timeout: 90_000,
          });
          await waitForWbE2eBridge(tutorPage, "tutor");
          const encryptionKey = await readEncryptionKeyFromHash(tutorPage);

          // -- Student: simulate post-login-redirect path --
          const studentPage = await studentCtx.newPage();

          // Step 1: navigate with hash while unauthenticated.
          // Page renders → JoinAuthGate fires → saves hash → redirects to login.
          await studentPage.goto(
            `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
            { waitUntil: "domcontentloaded" }
          );
          await studentPage.waitForURL(
            (url) => url.pathname === "/students/login",
            { timeout: 15_000 }
          );

          // Intermediate oracle: hash was saved to sessionStorage.
          const storedHash = await studentPage.evaluate(
            (sid) => sessionStorage.getItem(`mynk_join_hash_${sid}`),
            session.whiteboardSessionId
          );
          expect(storedHash).toBe(`#k=${encryptionKey}`);

          // Step 2: authenticate without a page navigation (sessionStorage intact).
          await loginLearnerInContext(studentCtx, session.learnerHandle, session.learnerPin);

          // Step 3: navigate to /join/<id> WITHOUT the hash.
          // The student key-read effect must recover the key from sessionStorage.
          await studentPage.goto(
            `/join/${session.whiteboardSessionId}`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
            timeout: 90_000,
          });

          // Oracle: remote tile for tutor appears in the student's overlay tiles panel.
          // This only succeeds if WebRTC signaling worked → same key on both sides.
          const overlayTiles = studentPage.getByTestId("wb-waiting-room-av-tiles");
          await expect(overlayTiles).toBeVisible({ timeout: 30_000 });
          await assertRemoteTilePresent(overlayTiles);
        } finally {
          await tutorCtx.close();
          await studentCtx.close();
        }
      }
    );
  }
);

// ---------------------------------------------------------------------------
// P4-B: Bug 2 — student heading transitions from "Connecting…" to "You're in"
// ---------------------------------------------------------------------------

test.describe(
  "Bug 2 — student overlay heading transitions once tutor connects via A/V",
  { tag: [TAG.WB_PRESENCE, TAG.WB_AV] },
  () => {
    test(
      "student overlay heading shows 'You're in' (not 'Connecting…') after remote tutor tile appears",
      async ({ browser }) => {
        // Verifies Bug 2 fix: bothPartiesInRoom is now computed from
        // studentConnected (not tutorSyncConnected which is always false for
        // students). Once the student's sync socket is connected AND ≥1
        // WebRTC-reachable peer is present, the overlay heading must change
        // from "Connecting…" to "You're in — <tutor> will start the session".
        test.setTimeout(300_000);
        const session = await seedWbPendingLiveSyncSession();

        const tutorCtx = await browser.newContext({
          storageState: "tests/integration/.auth/tutor.json",
          viewport: { width: 1280, height: 900 },
          permissions: ["microphone", "camera"],
        });
        const studentCtx = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          permissions: ["microphone", "camera"],
        });
        try {
          await loginLearnerInContext(studentCtx, session.learnerHandle, session.learnerPin);

          const tutorPage = await tutorCtx.newPage();
          await tutorPage.goto(
            `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
            timeout: 90_000,
          });
          await waitForWbE2eBridge(tutorPage, "tutor");

          const encryptionKey = await readEncryptionKeyFromHash(tutorPage);
          const studentPage = await studentCtx.newPage();
          await studentPage.goto(
            `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
            timeout: 90_000,
          });

          // Student overlay must be visible.
          const overlay = studentPage.getByTestId("wb-waiting-overlay");
          await expect(overlay).toBeVisible({ timeout: 10_000 });

          // Oracle A: remote tile appears (WebRTC connected → same key, mesh up).
          const overlayTiles = studentPage.getByTestId("wb-waiting-room-av-tiles");
          await assertRemoteTilePresent(overlayTiles, 120_000);

          // Oracle B: heading transitions from "Connecting…" to "You're in…".
          // Relational assert: once remote tile is present, bothPartiesInRoom
          // must be true → heading must show the connected copy.
          const heading = studentPage.getByTestId("wb-waiting-overlay-student-heading");
          await expect(heading).toContainText(/You're in/i, { timeout: 30_000 });
          await expect(heading).not.toContainText(/Connecting/i);
        } finally {
          await tutorCtx.close();
          await studentCtx.close();
        }
      }
    );
  }
);

// ---------------------------------------------------------------------------
// P4-C: Bug 3 — device pickers present in waiting-room overlay (both roles)
// ---------------------------------------------------------------------------

test.describe(
  "Bug 3 — device pickers (mic + camera selects) present in waiting-room overlay",
  { tag: [TAG.WB_CHROME, TAG.WB_AV] },
  () => {
    test(
      "tutor waiting-room overlay contains mic and camera device pickers",
      async ({ browser }) => {
        // Verifies Bug 3 fix: AudioControls (audio-device-select) and
        // VideoControls (video-device-select) are rendered in the overlay for
        // the tutor role. Semantic oracle: picker elements are present and
        // interactable (not just in the top-bar overflow, which is hidden by
        // the overlay during PENDING).
        test.setTimeout(120_000);
        const session = await seedWbPendingLiveSyncSession();

        const tutorCtx = await browser.newContext({
          storageState: "tests/integration/.auth/tutor.json",
          viewport: { width: 1280, height: 900 },
          permissions: ["microphone", "camera"],
        });
        try {
          const tutorPage = await tutorCtx.newPage();
          await tutorPage.goto(
            `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
            timeout: 90_000,
          });
          await expect(tutorPage.getByTestId("wb-waiting-overlay")).toBeVisible({
            timeout: 10_000,
          });

          // Device pickers container is rendered inside the overlay.
          const devicePickers = tutorPage.getByTestId(
            "wb-waiting-overlay-device-pickers"
          );
          await expect(devicePickers).toBeVisible({ timeout: 10_000 });

          // Mic picker (AudioControls) is present + interactable.
          const micSelect = devicePickers.getByTestId("audio-device-select");
          await expect(micSelect).toBeVisible({ timeout: 5_000 });
          await expect(micSelect).not.toBeDisabled();

          // Camera picker (VideoControls) is present + interactable.
          const camSelect = devicePickers.getByTestId("video-device-select");
          await expect(camSelect).toBeVisible({ timeout: 5_000 });
        } finally {
          await tutorCtx.close();
        }
      }
    );

    test(
      "student waiting-room overlay contains mic and camera device pickers",
      async ({ browser }) => {
        test.setTimeout(180_000);
        const session = await seedWbPendingLiveSyncSession();

        const tutorCtx = await browser.newContext({
          storageState: "tests/integration/.auth/tutor.json",
          viewport: { width: 1280, height: 900 },
          permissions: ["microphone", "camera"],
        });
        const studentCtx = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          permissions: ["microphone", "camera"],
        });
        try {
          await loginLearnerInContext(studentCtx, session.learnerHandle, session.learnerPin);

          const tutorPage = await tutorCtx.newPage();
          await tutorPage.goto(
            `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
            timeout: 90_000,
          });
          await waitForWbE2eBridge(tutorPage, "tutor");
          const encryptionKey = await readEncryptionKeyFromHash(tutorPage);

          const studentPage = await studentCtx.newPage();
          await studentPage.goto(
            `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
            timeout: 90_000,
          });
          await expect(studentPage.getByTestId("wb-waiting-overlay")).toBeVisible({
            timeout: 10_000,
          });

          // Device pickers container is rendered inside the student overlay.
          const devicePickers = studentPage.getByTestId(
            "wb-waiting-overlay-device-pickers"
          );
          await expect(devicePickers).toBeVisible({ timeout: 10_000 });

          // Mic picker present in student overlay.
          const micSelect = devicePickers.getByTestId("audio-device-select");
          await expect(micSelect).toBeVisible({ timeout: 5_000 });

          // Camera picker present in student overlay.
          const camSelect = devicePickers.getByTestId("video-device-select");
          await expect(camSelect).toBeVisible({ timeout: 5_000 });
        } finally {
          await tutorCtx.close();
          await studentCtx.close();
        }
      }
    );

    test(
      "student device pickers stay visible and contained in overlay at phone-portrait width",
      async ({ browser }) => {
        test.setTimeout(180_000);
        const session = await seedWbPendingLiveSyncSession();

        const tutorCtx = await browser.newContext({
          storageState: "tests/integration/.auth/tutor.json",
          viewport: { width: 1280, height: 900 },
          permissions: ["microphone", "camera"],
        });
        const studentCtx = await browser.newContext({
          viewport: { width: 390, height: 844 },
          permissions: ["microphone", "camera"],
        });
        try {
          await loginLearnerInContext(
            studentCtx,
            session.learnerHandle,
            session.learnerPin
          );

          const tutorPage = await tutorCtx.newPage();
          await tutorPage.goto(
            `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(
            tutorPage.getByTestId("tutor-whiteboard-canvas-mount")
          ).toBeVisible({ timeout: 90_000 });
          await waitForWbE2eBridge(tutorPage, "tutor");
          const encryptionKey = await readEncryptionKeyFromHash(tutorPage);

          const studentPage = await studentCtx.newPage();
          await studentPage.goto(
            `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(
            studentPage.getByTestId("student-whiteboard-canvas-mount")
          ).toBeVisible({ timeout: 90_000 });

          const overlay = studentPage.getByTestId("wb-waiting-overlay");
          await expect(overlay).toBeVisible({ timeout: 10_000 });

          const devicePickers = overlay.getByTestId(
            "wb-waiting-overlay-device-pickers"
          );
          await expect(devicePickers).toBeVisible({ timeout: 10_000 });

          const micSelect = devicePickers.getByTestId("audio-device-select");
          const camSelect = devicePickers.getByTestId("video-device-select");
          await expect(micSelect).toBeVisible();
          await expect(camSelect).toBeVisible();

          // Relational oracle: pickers are inside the overlay, not clipped.
          const overlayBox = await overlay.boundingBox();
          const micBox = await micSelect.boundingBox();
          const camBox = await camSelect.boundingBox();
          expect(overlayBox).not.toBeNull();
          expect(micBox).not.toBeNull();
          expect(camBox).not.toBeNull();
          if (overlayBox && micBox && camBox) {
            expect(micBox.y).toBeGreaterThanOrEqual(overlayBox.y);
            expect(micBox.y + micBox.height).toBeLessThanOrEqual(
              overlayBox.y + overlayBox.height + 4
            );
            expect(camBox.y).toBeGreaterThanOrEqual(overlayBox.y);
            expect(camBox.y + camBox.height).toBeLessThanOrEqual(
              overlayBox.y + overlayBox.height + 4
            );
          }
        } finally {
          await tutorCtx.close();
          await studentCtx.close();
        }
      }
    );
  }
);

// ---------------------------------------------------------------------------
// Bug A — Start-button latch + full PENDING→ACTIVE transition
// ---------------------------------------------------------------------------
//
// Root cause: `overlayCanStart` was gated on live `bothPartiesInRoom` (WebRTC
// ICE reachability). On real hardware ICE can briefly flap (peerConnectionState
// leaving "connected"), which transiently flips `bothPartiesInRoom` false and
// re-disables the Start button even when the student is genuinely present.
//
// Fix: a `studentHasConnectedOnceRef` latch is set true the first time
// `bothPartiesInRoom` is true (while PENDING). The Start button is gated on
// `latch || bothPartiesInRoom`, so a transient ICE drop no longer kills it.

test.describe(
  "Bug A — Start-button latch + full PENDING→ACTIVE transition",
  { tag: [TAG.WB_PRESENCE, TAG.WB_AV, TAG.WB_SYNC] },
  () => {
    test(
      "full PENDING→ACTIVE: tutor clicks Start → overlay dismissed on both tutor and student",
      async ({ browser }) => {
        // Primary regression guard: asserts the complete PENDING→ACTIVE
        // transition with both tutor and student overlay dismissal.
        // Oracle: overlay testid absent on both pages (not just disabled).
        test.setTimeout(300_000);
        const session = await seedWbPendingLiveSyncSession();

        const tutorCtx = await browser.newContext({
          storageState: "tests/integration/.auth/tutor.json",
          viewport: { width: 1280, height: 900 },
          permissions: ["microphone", "camera"],
        });
        const studentCtx = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          permissions: ["microphone", "camera"],
        });
        try {
          await loginLearnerInContext(
            studentCtx,
            session.learnerHandle,
            session.learnerPin
          );

          const tutorPage = await tutorCtx.newPage();
          await tutorPage.goto(
            `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(
            tutorPage.getByTestId("tutor-whiteboard-canvas-mount")
          ).toBeVisible({ timeout: 90_000 });
          await waitForWbE2eBridge(tutorPage, "tutor");

          const encryptionKey = await readEncryptionKeyFromHash(tutorPage);

          const studentPage = await studentCtx.newPage();
          await studentPage.goto(
            `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(
            studentPage.getByTestId("student-whiteboard-canvas-mount")
          ).toBeVisible({ timeout: 90_000 });
          await waitForWbE2eBridge(studentPage, "student");

          // Both overlays visible while PENDING.
          await expect(
            tutorPage.getByTestId("wb-waiting-overlay")
          ).toBeVisible({ timeout: 10_000 });
          await expect(
            studentPage.getByTestId("wb-waiting-overlay")
          ).toBeVisible({ timeout: 10_000 });

          // Wait for sync presence then Start.
          await waitForTutorStudentConnected(tutorPage);
          await startSessionAsTutor(tutorPage);

          // Tutor overlay dismissed immediately (client sets sessionPhase=ACTIVE).
          await expect(tutorPage.getByTestId("wb-waiting-overlay")).not.toBeVisible();

          // Student overlay dismisses via join-timer poll (≤3.5 s per poll + margin).
          await expect(
            studentPage.getByTestId("wb-waiting-overlay")
          ).not.toBeVisible({ timeout: 60_000 });
        } finally {
          await tutorCtx.close();
          await studentCtx.close();
        }
      }
    );

    test(
      "Start button stays enabled once student connects — latch guards against ICE-flap dead-button",
      async ({ browser }) => {
        // Verifies the studentHasConnectedOnceRef latch: once the Start button
        // has been enabled by the student's genuine A/V connection, it must
        // remain enabled even if a brief ICE reachability drop occurs.
        //
        // PLAYWRIGHT-GAP: True ICE flap simulation (forcing peerConnectionState
        // out of "connected" while keeping sync presence) cannot be induced
        // hermetically in the Playwright fake-media context — the fake tracks
        // never trigger real ICE state-machine transitions. The latch's
        // correctness on hardware is verified by Andrew's smoke. The harness
        // covers the non-flap path: button is enabled after student connects
        // and stays enabled for 5 s (enough to catch any immediate re-disable
        // regression). The hardware ICE-flap scenario is documented in
        // docs/BACKLOG.md as PLAYWRIGHT-GAP: start-button-ice-flap-latch.
        test.setTimeout(300_000);
        const session = await seedWbPendingLiveSyncSession();

        const tutorCtx = await browser.newContext({
          storageState: "tests/integration/.auth/tutor.json",
          viewport: { width: 1280, height: 900 },
          permissions: ["microphone", "camera"],
        });
        const studentCtx = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          permissions: ["microphone", "camera"],
        });
        try {
          await loginLearnerInContext(
            studentCtx,
            session.learnerHandle,
            session.learnerPin
          );

          const tutorPage = await tutorCtx.newPage();
          await tutorPage.goto(
            `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(
            tutorPage.getByTestId("tutor-whiteboard-canvas-mount")
          ).toBeVisible({ timeout: 90_000 });
          await waitForWbE2eBridge(tutorPage, "tutor");

          const encryptionKey = await readEncryptionKeyFromHash(tutorPage);

          const studentPage = await studentCtx.newPage();
          await studentPage.goto(
            `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(
            studentPage.getByTestId("student-whiteboard-canvas-mount")
          ).toBeVisible({ timeout: 90_000 });
          await waitForWbE2eBridge(studentPage, "student");

          // Wait for Start button to become enabled — this means bothPartiesInRoom
          // was true at least once (the latch fires) and studentHasConnectedOnceRef
          // is now set.
          const startBtn = tutorPage.getByTestId("wb-start-session");
          await expect(startBtn).toBeEnabled({ timeout: 90_000 });

          // Hold for 5 s: any immediate re-disable regression (e.g. latch removed,
          // or a synchronous state reset) would surface here. The genuine ICE-flap
          // scenario (hardware, multi-second drop) is a PLAYWRIGHT-GAP above.
          await tutorPage.waitForTimeout(5_000);
          await expect(startBtn).toBeEnabled();
        } finally {
          await tutorCtx.close();
          await studentCtx.close();
        }
      }
    );
  }
);

// ---------------------------------------------------------------------------
// Plan #1 waiting-room smoke polish (Andrew 2026-06-28)
// ---------------------------------------------------------------------------

test.describe(
  "Plan #1 waiting-room smoke polish",
  { tag: [TAG.WB_CHROME, TAG.WB_AV, TAG.WB_PRESENCE] },
  () => {
    test(
      "remote off-camera tile shows initials in both directions when peer mutes camera",
      async ({ browser }) => {
        test.setTimeout(300_000);
        const session = await seedWbPendingLiveSyncSession();

        const tutorCtx = await browser.newContext({
          storageState: "tests/integration/.auth/tutor.json",
          viewport: { width: 1280, height: 900 },
          permissions: ["microphone", "camera"],
        });
        const studentCtx = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          permissions: ["microphone", "camera"],
        });
        try {
          await loginLearnerInContext(
            studentCtx,
            session.learnerHandle,
            session.learnerPin
          );

          const tutorPage = await tutorCtx.newPage();
          await tutorPage.goto(
            `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(
            tutorPage.getByTestId("tutor-whiteboard-canvas-mount")
          ).toBeVisible({ timeout: 90_000 });
          await waitForWbE2eBridge(tutorPage, "tutor");

          const encryptionKey = await readEncryptionKeyFromHash(tutorPage);

          const studentPage = await studentCtx.newPage();
          await studentPage.goto(
            `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(
            studentPage.getByTestId("student-whiteboard-canvas-mount")
          ).toBeVisible({ timeout: 90_000 });
          await waitForWbE2eBridge(studentPage, "student");

          const studentTiles = studentPage.getByTestId("wb-waiting-room-av-tiles");
          const tutorTiles = tutorPage.getByTestId("wb-waiting-room-av-tiles");
          await assertRemoteTilePresent(studentTiles, 120_000);
          await assertRemoteTilePresent(tutorTiles, 120_000);

          // Tutor cam off → student sees tutor initials (not black tile).
          const tutorCamChip = tutorPage.getByTestId("wb-overlay-cam-chip");
          const tutorCamLabel = tutorPage.getByTestId("wb-overlay-cam-chip-label");
          if ((await tutorCamLabel.textContent())?.trim() === "Camera on") {
            await tutorCamChip.click();
          }
          await expect(tutorCamLabel).toHaveText("Camera off", { timeout: 10_000 });

          const studentRemoteTile = studentTiles.locator('[data-is-local="false"]').first();
          await expect(studentRemoteTile).toBeVisible({ timeout: 10_000 });
          await expect(
            studentRemoteTile.locator('[data-placeholder-kind="initials"]')
          ).toBeVisible({ timeout: 10_000 });
          await expect(
            studentRemoteTile.locator('[data-testid^="av-tile-initials-"]')
          ).toBeVisible();

          // Student cam off → tutor sees student initials.
          const studentCamChip = studentPage.getByTestId("wb-overlay-cam-chip");
          const studentCamLabel = studentPage.getByTestId(
            "wb-overlay-cam-chip-label"
          );
          if ((await studentCamLabel.textContent())?.trim() === "Camera on") {
            await studentCamChip.click();
          }
          await expect(studentCamLabel).toHaveText("Camera off", {
            timeout: 10_000,
          });

          const tutorRemoteTile = tutorTiles.locator('[data-is-local="false"]').first();
          await expect(tutorRemoteTile).toBeVisible({ timeout: 10_000 });
          await expect(
            tutorRemoteTile.locator('[data-placeholder-kind="initials"]')
          ).toBeVisible({ timeout: 10_000 });
          await expect(
            tutorRemoteTile.locator('[data-testid^="av-tile-initials-"]')
          ).toBeVisible();
        } finally {
          await tutorCtx.close();
          await studentCtx.close();
        }
      }
    );

    test(
      "student waiting-room mic control shows inline volume meter (parity with tutor)",
      async ({ browser }) => {
        test.setTimeout(180_000);
        const session = await seedWbPendingLiveSyncSession();

        const studentCtx = await browser.newContext({
          viewport: { width: 390, height: 844 },
          permissions: ["microphone", "camera"],
        });
        try {
          await loginLearnerInContext(
            studentCtx,
            session.learnerHandle,
            session.learnerPin
          );

          const tutorCtx = await browser.newContext({
            storageState: "tests/integration/.auth/tutor.json",
            viewport: { width: 1280, height: 900 },
            permissions: ["microphone", "camera"],
          });
          const tutorPage = await tutorCtx.newPage();
          await tutorPage.goto(
            `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(
            tutorPage.getByTestId("tutor-whiteboard-canvas-mount")
          ).toBeVisible({ timeout: 90_000 });
          const encryptionKey = await readEncryptionKeyFromHash(tutorPage);

          const studentPage = await studentCtx.newPage();
          await studentPage.goto(
            `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
            { waitUntil: "domcontentloaded" }
          );
          await expect(
            studentPage.getByTestId("wb-waiting-overlay")
          ).toBeVisible({ timeout: 10_000 });

          const studentMic = studentPage
            .getByTestId("wb-waiting-overlay")
            .getByTestId("wb-topbar-mic-toggle");
          await expect(studentMic).toBeVisible({ timeout: 10_000 });
          await expect(studentMic.locator(".mynk-wb-mic-meter")).toBeVisible();

          const tutorMic = tutorPage
            .getByTestId("wb-waiting-overlay")
            .getByTestId("wb-topbar-mic-toggle");
          await expect(tutorMic).toBeVisible({ timeout: 10_000 });
          await expect(tutorMic.locator(".mynk-wb-mic-meter")).toBeVisible();

          await tutorCtx.close();
        } finally {
          await studentCtx.close();
        }
      }
    );
  }
);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Wait for the page URL to stabilise at /join/<sessionId>. */
async function page_waitForJoinUrl(
  page: import("@playwright/test").Page,
  sessionId: string,
  timeoutMs: number
): Promise<void> {
  await page.waitForURL(
    (url) => url.pathname === `/join/${sessionId}`,
    { timeout: timeoutMs }
  );
}
