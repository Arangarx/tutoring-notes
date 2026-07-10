import { test, expect } from "./fixtures";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import {
  seedTestAdmin,
  seedTestStudent,
} from "../visual/helpers";
import {
  seedWbLiveSyncSession,
} from "./whiteboard-live-sync.helpers";

/**
 * Recording resilience integration spec — Phase 1c (Pillar 4 follow-on).
 *
 * Scope: pin the invariants that survive a Sarah-class hostile edge
 * case. Each test exercises a real workspace through the full
 * Pillar 1/2/3 stack — only the failure-mode being asserted is
 * mocked.
 *
 * Blob-gated tests use `blobIntegrationEnabled()` (hermetic harness or
 * real `BLOB_READ_WRITE_TOKEN`) the same way `recording-end-to-end.spec.ts`
 * does.
 *
 * What this file pins:
 *   1. Snapshot PNG generation is best-effort. Blocking the snapshot
 *      upload route does NOT prevent End-session from completing —
 *      events.json is uploaded, segments register, the review page
 *      opens, and the session row's `snapshotBlobUrl` is null.
 *   2. Reopening `/workspace` for an already-ended session stays on the
 *      workspace URL and renders in-shell `SessionReviewMode` (A3) —
 *      not a redirect to the standalone review route and not the stale
 *      `WorkspacePreviousSessionPreview` shell.
 *   3. Persisted `SessionRecording` rows survive a tutor navigate-away
 *      and workspace reopen after End (recording-count HTTP oracle).
 *
 * Future tests to add to this file (NOT in scope for Phase 1c):
 *   - Hard refresh mid-segment then End — outbox crash recovery.
 *   - Network throttle Offline → drainOutboxOrTimeout fires the
 *     error banner.
 *   - Multi-stream segment ordering (Phase 4 enables real fixtures).
 */

const TEST_SECRET =
  process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret";

async function fetchSessionRecordingCount(
  page: import("@playwright/test").Page,
  sessionId: string
) {
  const res = await page.request.get(
    `/api/test/whiteboard/${sessionId}/recording-count`,
    { headers: { Authorization: `Bearer ${TEST_SECRET}` } }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as { count: number; byStream: Record<string, number> };
}
test.describe("recording resilience (Phase 1c)", { tag: [TAG.WB_RECORDING] }, () => {
  test(
    "snapshot upload failure does NOT block end-session (best-effort contract)",
    async ({ page }) => {
      test.setTimeout(180_000);

      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

      // Block ONLY the snapshot upload path. Audio + events still go
      // through to real Vercel Blob.
      await page.route("**/api/upload/blob**", async (route, req) => {
        const url = new URL(req.url());
        const kind = url.searchParams.get("kind") ?? "";
        if (kind === "whiteboard-snapshot") {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "snapshot blob upload disabled" }),
          });
          return;
        }
        await route.continue();
      });

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );

      await expect(
        page.getByTestId("tutor-whiteboard-canvas-mount")
      ).toBeVisible({ timeout: 90_000 });

      // Recording auto-starts when consent snapshot exists (PRESARAH-1).
      await page.waitForTimeout(2_000);

      const canvas = page
        .locator('[data-testid="tutor-whiteboard-canvas-mount"] canvas')
        .first();
      await canvas.waitFor({ state: "visible", timeout: 60_000 });

      // Draw a single stroke so the snapshot pipeline has something
      // to paint (empty scenes intentionally short-circuit and that
      // would not exercise the "upload fails" branch).
      await page.keyboard.press("r");
      const box = await canvas.boundingBox();
      if (!box) throw new Error("Excalidraw canvas has no bounding box");
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y + 180);
      await page.mouse.up();

      await page.waitForTimeout(5_000);

      await page.getByTestId("wb-end-session").click();
      const confirmBtn = page.getByTestId("wb-end-session-confirm-yes");
      if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await confirmBtn.click();
      }

      // End-session flips to in-shell SessionReviewMode (same workspace URL).
      await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
        timeout: 120_000,
      });

      // DB-level invariant: session is ended, snapshotBlobUrl is null
      // (the column the action would have populated had upload
      // succeeded).
      const prisma = new PrismaClient();
      try {
        const row = await prisma.whiteboardSession.findUnique({
          where: { id: whiteboardSessionId },
          select: {
            endedAt: true,
            eventsBlobUrl: true,
            snapshotBlobUrl: true,
          },
        });
        expect(row).not.toBeNull();
        expect(row?.endedAt).not.toBeNull();
        expect(row?.eventsBlobUrl).toMatch(
          /whiteboard-events|api\/test\/blob\/object.*events\.json/i
        );
        expect(row?.snapshotBlobUrl ?? null).toBeNull();
      } finally {
        await prisma.$disconnect();
      }
    }
  );

  test(
    "reopening workspace URL for an already-ended session shows in-shell SessionReviewMode (not a redirect)",
    async ({ page }) => {
      /**
       * Oracle: workspace URL stays on /workspace; SSR sets initialMode=review
       * for endedAt rows (page.tsx) → wb-session-review-mode mounts. DB endedAt
       * is the independent seal contract — not preview testids or resume-gate UI.
       *
       * Stale oracle (pre-A3): wb-preview-before-start + wb-preview-empty +
       * "Start whiteboard session" — WorkspacePreviousSessionPreview is no longer
       * the reopen surface; ended sessions converge on SessionReviewMode.
       *
       * Red-before (2026-07-05): expecting wb-preview-before-start fails on tip.
       */
      test.setTimeout(120_000);

      const adminUserId = await seedTestAdmin();
      const { studentId } = await seedTestStudent(adminUserId);

      const prisma = new PrismaClient();
      const endedSessionId = await (async () => {
        try {
          const created = await prisma.whiteboardSession.create({
            data: {
              adminUserId,
              studentId,
              consentAcknowledged: true,
              eventsBlobUrl: "https://pw.local/preview-fixture-events.json",
              endedAt: new Date(Date.now() - 60_000),
              durationSeconds: 60,
            },
            select: { id: true },
          });
          return created.id;
        } finally {
          await prisma.$disconnect();
        }
      })();

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${endedSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );

      // Must stay on workspace — pre-A3 redirected to the standalone review route.
      await expect(page).toHaveURL(/\/workspace$/);
      await expect(page).not.toHaveURL(
        new RegExp(`/admin/students/${studentId}/whiteboard/${endedSessionId}$`)
      );

      await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
        timeout: 30_000,
      });

      // Stale surfaces must not appear for an ended reopen.
      await expect(page.getByTestId("wb-preview-before-start")).toHaveCount(0);
      await expect(page.getByTestId("wb-resume-gate")).toHaveCount(0);

      const prisma2 = new PrismaClient();
      try {
        const row = await prisma2.whiteboardSession.findUnique({
          where: { id: endedSessionId },
          select: { endedAt: true },
        });
        expect(row?.endedAt).not.toBeNull();
      } finally {
        await prisma2.$disconnect();
      }
    }
  );

  test(
    "ended session — navigate away and reopen workspace preserves SessionRecording rows",
    async ({ page }) => {
      /**
       * Oracle: `/api/test/whiteboard/{id}/recording-count` — persisted rows
       * grouped by streamId (same contract as P1-WB-1 / wb-session-lifecycle).
       * Independent of recorder hooks; survives tutor leaving /workspace and
       * returning after End sealed the session.
       *
       * Red-before (2026-07-05): reversing count >= 1 after reopen fails when
       * finalize did not register segments.
       */
      test.setTimeout(240_000);

      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );

      await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });

      await page.waitForTimeout(4_000);

      await page.getByTestId("wb-end-session").click();
      const confirmBtn = page.getByTestId("wb-end-session-confirm-yes");
      if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await confirmBtn.click();
      }

      await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
        timeout: 120_000,
      });

      await expect
        .poll(
          async () => {
            const replay = await fetchSessionRecordingCount(
              page,
              whiteboardSessionId
            );
            return replay.count;
          },
          { timeout: 180_000, intervals: [1000, 2000, 3000] }
        )
        .toBeGreaterThanOrEqual(1);

      const beforeLeave = await fetchSessionRecordingCount(
        page,
        whiteboardSessionId
      );

      await page.goto(`/admin/students/${studentId}`, {
        waitUntil: "domcontentloaded",
      });

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );

      await expect(page).toHaveURL(/\/workspace$/);
      await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
        timeout: 60_000,
      });

      const afterReopen = await fetchSessionRecordingCount(
        page,
        whiteboardSessionId
      );

      expect(afterReopen.count).toBeGreaterThanOrEqual(beforeLeave.count);
      expect(afterReopen.byStream["tutor:mic"] ?? 0).toBeGreaterThanOrEqual(1);
    }
  );
});
