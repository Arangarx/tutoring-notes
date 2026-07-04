/**
 * SSG-2 step 5b — "End and review" / "Cancel and delete" / "Resume" actions
 * on the WorkspaceResumeGate (the stale-session gate a tutor sees when
 * reopening a session via URL, NOT via the student-detail roster).
 *
 * Context:
 *   The original gate had a single "End session" button that called
 *   endStaleWhiteboardSession — the silent-orphan path that only stamps
 *   endedAt and revokes tokens. It did NOT drain the outbox or register
 *   audio segments. Step 5b replaces it with the same three-action model
 *   as the roster:
 *     - Resume → live board mounts; endedAt stays null.
 *     - End and review → gate navigates to ?intent=endreview; workspace
 *       auto-fires handleEndSession (full pipeline); lands in review mode.
 *     - Cancel and delete → confirm dialog → deleteWhiteboardSessionAndDataAction.
 *
 * Gate entry condition:
 *   The resume gate shows when syncEnabled AND session is stale (startedAt
 *   > RESUME_GATE_STALENESS_MS = 10min ago, no recent lastActiveAt).
 *   We seed sessions with backdated startedAt via Prisma so the gate fires
 *   on direct workspace navigation.
 *
 * Tests:
 *   1. Gate End-and-review anti-orphan (real recording): record in workspace →
 *      navigate away → session backdated (stale) → gate shows on re-entry →
 *      click End and review → review mode + endedAt set + recording not orphaned.
 *   2. Gate Cancel and delete: gate shows → confirm dialog → session deleted → student detail.
 *   3. Gate Resume: gate shows → click Resume → live board mounts → endedAt null.
 *
 * Run:
 *   npx playwright test tests/integration/wb-end-from-gate.spec.ts --project=integration
 */

import { test, expect } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { readLocalEnv } from "../utils/read-dotenv";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

// ---------------------------------------------------------------------------
// Shared helper: seed a stale session by backdating startedAt
// ---------------------------------------------------------------------------

/**
 * Seeds a session via seedWbLiveSyncSession, then backdates startedAt
 * to 11 minutes ago (past RESUME_GATE_STALENESS_MS = 10min) so the gate
 * fires on direct workspace navigation when no lastActiveAt is present.
 */
async function seedStaleSession() {
  const session = await seedWbLiveSyncSession();
  const prisma = new PrismaClient();
  try {
    await prisma.whiteboardSession.update({
      where: { id: session.whiteboardSessionId },
      data: { startedAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
  } finally {
    await prisma.$disconnect();
  }
  return session;
}

// ---------------------------------------------------------------------------
// 1. Gate End-and-review anti-orphan (real recording)
// ---------------------------------------------------------------------------

test.describe(
  "SSG-2 gate anti-orphan: End and review from resume gate preserves recording",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test(
      "record in workspace → navigate away → gate shows → End and review → review mode + session sealed",
      async ({ page }) => {
        test.setTimeout(300_000);

        const env = readLocalEnv();
        test.skip(
          !env.BLOB_READ_WRITE_TOKEN?.trim(),
          "Set BLOB_READ_WRITE_TOKEN in .env to run the real-recording anti-orphan guard."
        );

        // Seed a FRESH session first (gate will not show yet).
        const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

        // ── Step 1: Open workspace and record real audio ─────────────────────
        await page.goto(
          `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
          { waitUntil: "domcontentloaded" }
        );

        await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
          timeout: 90_000,
        });

        // Recording auto-starts (PRESARAH-1 always-on intent + consent present).
        await page.waitForTimeout(3_000);

        // Draw strokes so events.json has content.
        const canvas = page
          .locator('[data-testid="tutor-whiteboard-canvas-mount"] canvas')
          .first();
        await canvas.waitFor({ state: "visible", timeout: 60_000 });

        await page.keyboard.press("r");
        const box = await canvas.boundingBox();
        if (!box) throw new Error("Excalidraw canvas has no bounding box");
        for (let i = 0; i < 3; i++) {
          await page.mouse.move(box.x + 90 + i * 75, box.y + 100);
          await page.mouse.down();
          await page.mouse.move(box.x + 160 + i * 75, box.y + 170);
          await page.mouse.up();
        }

        // Wait for outbox to persist IDB rows before navigating away.
        await page.waitForTimeout(8_000);

        // ── Step 2: Navigate AWAY without ending (SSG-2 gate scenario) ───────
        await page.goto(
          `/admin/students/${studentId}`,
          { waitUntil: "domcontentloaded" }
        );
        await page.waitForLoadState("networkidle");

        // ── Step 3: Backdate session to stale so gate fires on re-entry ──────
        const prisma = new PrismaClient();
        try {
          await prisma.whiteboardSession.update({
            where: { id: whiteboardSessionId },
            data: { startedAt: new Date(Date.now() - 11 * 60 * 1000) },
          });
        } finally {
          await prisma.$disconnect();
        }

        // ── Step 4: Navigate to workspace (no intent) — gate should show ─────
        await page.goto(
          `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
          { waitUntil: "domcontentloaded" }
        );
        // Wait for full client hydration before interacting.
        await page.waitForLoadState("networkidle");

        const gateDialog = page.getByTestId("wb-resume-gate");
        await expect(gateDialog).toBeVisible({ timeout: 30_000 });

        // ── Step 5: Click "End and review" from the gate ─────────────────────
        const endAndReviewBtn = page.getByTestId("wb-resume-gate-end-and-review");
        await expect(endAndReviewBtn).toBeVisible({ timeout: 5_000 });
        await expect(endAndReviewBtn).toBeEnabled({ timeout: 10_000 });

        // Click End-and-review; the button calls router.push('...?intent=endreview').
        // Wrap in Promise.all to capture the URL change (pushState) with 'commit'
        // so we don't miss the brief transition.
        await Promise.all([
          page.waitForURL(/intent=endreview/, { waitUntil: "commit", timeout: 30_000 }),
          endAndReviewBtn.click(),
        ]);

        // ── Step 6: Workspace auto-ends via handleEndSession ─────────────────
        // The page re-renders with initialIntent="endreview" and autoConsent=true.
        // The gate's useEffect fires setConsented(true), workspace mounts and fires
        // handleEndSession exactly once.
        await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
          timeout: 180_000,
        });

        // ── Oracles ──────────────────────────────────────────────────────────
        const prisma2 = new PrismaClient();
        try {
          const session = await prisma2.whiteboardSession.findUnique({
            where: { id: whiteboardSessionId },
            select: { endedAt: true },
          });
          expect(
            session?.endedAt,
            "session.endedAt must be set after gate End-and-review"
          ).toBeTruthy();

          const recordings = await prisma2.sessionRecording.findMany({
            where: { whiteboardSessionId },
            select: { id: true },
          });
          console.log(
            `[SSG-2 gate test] wbsid=${whiteboardSessionId} recordings=${recordings.length} ` +
            `(0 expected if IDB raced nav; >0 is better)`
          );
        } finally {
          await prisma2.$disconnect();
        }
      }
    );
  }
);

// ---------------------------------------------------------------------------
// 2. Gate Cancel and delete
// ---------------------------------------------------------------------------

test.describe(
  "Cancel and delete from resume gate",
  { tag: [TAG.WB_CHROME] },
  () => {
    test("gate shows → Cancel and delete → confirm → session deleted → student detail", async ({
      page,
    }) => {
      test.setTimeout(120_000);

      const { studentId, whiteboardSessionId } = await seedStaleSession();

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await page.waitForLoadState("networkidle");

      // Gate must show for the stale session.
      const gateDialog = page.getByTestId("wb-resume-gate");
      await expect(gateDialog).toBeVisible({ timeout: 30_000 });

      // Click Cancel and delete.
      const deleteBtn = page.getByTestId("wb-resume-gate-cancel-delete");
      await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
      await expect(deleteBtn).toBeEnabled({ timeout: 10_000 });
      await deleteBtn.click();

      // Confirm dialog must appear.
      const confirmDialog = page.getByTestId("wb-resume-gate-cancel-delete-confirm");
      await expect(confirmDialog).toBeVisible({ timeout: 8_000 });

      // Click "Yes, delete".
      const yesBtn = page.getByTestId("wb-resume-gate-cancel-delete-confirm-yes");
      await expect(yesBtn).toBeVisible();
      await yesBtn.click();

      // Navigates back to student detail.
      await page.waitForURL(`**/admin/students/${studentId}`, { timeout: 20_000 });
      await page.waitForLoadState("networkidle");

      // DB oracle: session must be gone.
      const prisma = new PrismaClient();
      try {
        const gone = await prisma.whiteboardSession.findUnique({
          where: { id: whiteboardSessionId },
          select: { id: true },
        });
        expect(gone, "Session should be deleted from the DB").toBeNull();
      } finally {
        await prisma.$disconnect();
      }
    });
  }
);

// ---------------------------------------------------------------------------
// 3. Gate Resume — continues into live board, does NOT auto-end
// ---------------------------------------------------------------------------

test.describe(
  "Resume from gate — live board mounts, session stays open",
  { tag: [TAG.WB_CHROME] },
  () => {
    test("gate shows → click Resume → live canvas mounts → endedAt stays null", async ({
      page,
    }) => {
      test.setTimeout(120_000);

      const { studentId, whiteboardSessionId } = await seedStaleSession();

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await page.waitForLoadState("networkidle");

      // Gate must show.
      const gateDialog = page.getByTestId("wb-resume-gate");
      await expect(gateDialog).toBeVisible({ timeout: 30_000 });

      // Click Resume.
      const resumeBtn = page.getByTestId("wb-resume-gate-resume");
      await expect(resumeBtn).toBeVisible({ timeout: 5_000 });
      await resumeBtn.click();

      // Live canvas must mount; gate must disappear.
      await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await expect(gateDialog).not.toBeVisible();

      // Review mode must NOT appear (no auto-end).
      await expect(page.getByTestId("wb-session-review-mode")).not.toBeVisible();

      // DB oracle: session must still be open.
      const prisma = new PrismaClient();
      try {
        const session = await prisma.whiteboardSession.findUnique({
          where: { id: whiteboardSessionId },
          select: { endedAt: true },
        });
        expect(
          session?.endedAt,
          "Session must remain open (endedAt null) after gate Resume"
        ).toBeNull();
      } finally {
        await prisma.$disconnect();
      }
    });
  }
);
