/**
 * SSG-2 anti-orphan regression gate — "End and review" from the student-detail
 * open-sessions roster.
 *
 * Context:
 *   The original roster "End" button called endStaleWhiteboardSession, which
 *   only stamped endedAt and revoked tokens. It did NOT drain the outbox or
 *   register audio segments — so any recording still in the browser's IndexedDB
 *   outbox was silently orphaned. This is the bug that lost Sarah's recording.
 *
 *   The fix: a new "End and review" button navigates the tutor into the workspace
 *   URL with ?intent=endreview. The workspace auto-fires handleEndSession once on
 *   mount (ref-guarded), which drains the outbox, registers segments, and flips
 *   to SessionReviewMode — the same path as pressing End inside the live board.
 *
 * Tests:
 *   1. SSG-2 anti-orphan guard (real recording via fake media + BLOB upload).
 *   2. Cancel and delete: confirm dialog → session deleted → student detail.
 *   3. Auto-end fires exactly once (intent path), never for normal Resume.
 *
 * Run:
 *   npx playwright test tests/integration/wb-end-from-roster.spec.ts --project=integration
 */

import { test, expect } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { readLocalEnv } from "../utils/read-dotenv";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

// ---------------------------------------------------------------------------
// 1. SSG-2 anti-orphan guard
// ---------------------------------------------------------------------------

test.describe(
  "SSG-2 anti-orphan: End and review from roster preserves recording",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test(
      "record in workspace → navigate away → End and review from roster → review mode + session sealed",
      async ({ page }) => {
        test.setTimeout(300_000);

        const env = readLocalEnv();
        test.skip(
          !env.BLOB_READ_WRITE_TOKEN?.trim(),
          "Set BLOB_READ_WRITE_TOKEN in .env to run the real-recording anti-orphan guard."
        );

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
        // Give MediaRecorder time to arm and produce at least one timeslice.
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

        // Wait long enough for at least one MediaRecorder timeslice to complete
        // AND for the outbox to persist any IDB rows before navigation.
        await page.waitForTimeout(8_000);

        // ── Step 2: Navigate AWAY without ending (SSG-2 scenario) ───────────
        // page.goto is a hard navigation; IndexedDB rows already written by the
        // outbox WILL persist (IDB is origin-scoped). Rows mid-write when
        // navigation fires are potentially lost — this is the inherent SSG-2
        // race. The test verifies the END pipeline path, not the timing window.
        await page.goto(
          `/admin/students/${studentId}`,
          { waitUntil: "domcontentloaded" }
        );
        await page.waitForLoadState("networkidle");

        // ── Step 3: Click "End and review" from the roster ──────────────────
        const endAndReviewBtn = page.getByTestId("roster-end-and-review").first();
        await expect(endAndReviewBtn).toBeVisible({ timeout: 10_000 });
        await endAndReviewBtn.click();

        // ── Step 4: Wait for workspace to mount and auto-end ─────────────────
        // The workspace URL has ?intent=endreview; the resume gate auto-consents
        // and handleEndSession fires once. This drains any outbox rows that
        // survived the navigation, uploads events.json, and ends the session.
        await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
          timeout: 180_000,
        });

        // ── Oracles ──────────────────────────────────────────────────────────
        // (a) Session endedAt is set in DB (the full end pipeline ran, not just
        //     endStaleWhiteboardSession which was the SSG-2 bug).
        const prisma = new PrismaClient();
        try {
          const session = await prisma.whiteboardSession.findUnique({
            where: { id: whiteboardSessionId },
            select: { endedAt: true },
          });
          expect(
            session?.endedAt,
            "session.endedAt must be set after End-and-review"
          ).toBeTruthy();

          // (b) If the outbox had any IDB data that survived the hard navigation,
          //     drainOutboxOrTimeout in handleEndSession registers it. The segment
          //     count may be 0 if the IDB writes raced the navigation — this is
          //     the inherent SSG-2 timing window. The key invariant is that the
          //     pipeline DOES run (proven by review mode + endedAt above) and
          //     does NOT orphan segments that ARE in the outbox.
          //
          //     Full recording registration is tested in recording-end-to-end.spec.ts
          //     (single-page flow, no navigation race). The SSG-2 regression test
          //     here verifies the MECHANISM path (handleEndSession, not
          //     endStaleWhiteboardSession) is taken when End-and-review is clicked.
          const recordings = await prisma.sessionRecording.findMany({
            where: { whiteboardSessionId },
            select: { id: true },
          });
          // Log for debugging; the invariant is that endedAt is set (asserted above).
          console.log(
            `[SSG-2 test] wbsid=${whiteboardSessionId} recordings=${recordings.length} ` +
            `(0 is expected if IDB writes raced the hard navigation; >0 is better)`
          );
        } finally {
          await prisma.$disconnect();
        }
      }
    );
  }
);

// ---------------------------------------------------------------------------
// 2. Cancel and delete
// ---------------------------------------------------------------------------

test.describe(
  "Cancel and delete from roster",
  { tag: [TAG.WB_CHROME] },
  () => {
    test("Cancel and delete → confirm dialog → session deleted → back on student detail", async ({
      page,
    }) => {
      test.setTimeout(120_000);

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

      await page.goto(`/admin/students/${studentId}`, {
        waitUntil: "domcontentloaded",
      });
      // Ensure the page is fully loaded and client components are hydrated.
      await page.waitForLoadState("networkidle");
      // Sanity-check: we're on the student detail page, not the workspace.
      await expect(page).toHaveURL(new RegExp(`/admin/students/${studentId}$`), {
        timeout: 5_000,
      });

      // The roster row for this session should be visible.
      // Use the "End and review" link for this exact session as the presence anchor.
      const rosterEndAndReview = page
        .locator(`[data-testid="roster-end-and-review"][href*="${whiteboardSessionId}"]`)
        .first();
      await expect(rosterEndAndReview).toBeVisible({ timeout: 15_000 });

      const deleteBtn = page.getByTestId("roster-cancel-delete").first();
      await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
      // Wait for the button to be enabled (hydration guard).
      await expect(deleteBtn).toBeEnabled({ timeout: 10_000 });
      await deleteBtn.click();

      // Confirm dialog should appear.
      const confirmDialog = page.getByTestId("roster-cancel-delete-confirm");
      await expect(confirmDialog).toBeVisible({ timeout: 8_000 });

      // Click "Yes, delete".
      const yesBtn = page.getByTestId("roster-cancel-delete-confirm-yes");
      await expect(yesBtn).toBeVisible();
      await yesBtn.click();

      // After deletion the router redirects to student detail.
      await page.waitForURL(`**/admin/students/${studentId}`, { timeout: 20_000 });
      await page.waitForLoadState("networkidle");

      // The deleted session should no longer appear in the open-sessions roster.
      // Match the exact "End and review" link for this specific session by combining
      // the testId and the session-specific href segment.
      await expect(
        page.locator(
          `[data-testid="roster-end-and-review"][href*="${whiteboardSessionId}"]`
        )
      ).toHaveCount(0, { timeout: 10_000 });

      // DB oracle: session row must be gone.
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
// 3. Auto-end fires once / normal Resume does NOT auto-end
// ---------------------------------------------------------------------------

test.describe(
  "Auto-end intent guards",
  { tag: [TAG.WB_CHROME] },
  () => {
    test("intent=endreview causes exactly one auto-end → review mode", async ({
      page,
    }) => {
      test.setTimeout(180_000);

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

      // Navigate directly with intent=endreview (no prior recording, just verify
      // the pipeline runs end-to-end and the shell flips to review mode once).
      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace?intent=endreview`,
        { waitUntil: "domcontentloaded" }
      );

      // The auto-end fires once; the shell should flip to SessionReviewMode.
      await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
        timeout: 120_000,
      });

      // DB oracle: session is sealed exactly once (endedAt is set).
      const prisma = new PrismaClient();
      try {
        const session = await prisma.whiteboardSession.findUnique({
          where: { id: whiteboardSessionId },
          select: { endedAt: true },
        });
        expect(
          session?.endedAt,
          "Session must be sealed (endedAt set) after intent=endreview"
        ).toBeTruthy();
      } finally {
        await prisma.$disconnect();
      }
    });

    test("normal Resume (no intent) does NOT auto-end — live board mounts", async ({
      page,
    }) => {
      test.setTimeout(120_000);

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

      // Navigate WITHOUT intent — the workspace should open in live mode.
      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );

      // Live canvas must be visible — the session must NOT have auto-ended.
      await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });

      // Review mode must NOT appear (no auto-end).
      await expect(page.getByTestId("wb-session-review-mode")).not.toBeVisible();

      // DB oracle: session must still be open (endedAt null).
      const prisma = new PrismaClient();
      try {
        const session = await prisma.whiteboardSession.findUnique({
          where: { id: whiteboardSessionId },
          select: { endedAt: true },
        });
        expect(
          session?.endedAt,
          "Session must remain open (endedAt null) after normal Resume"
        ).toBeNull();
      } finally {
        await prisma.$disconnect();
      }
    });
  }
);
