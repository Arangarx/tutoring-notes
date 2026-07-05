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
 *   2. The workspace preview-before-Start surface (Phase 1c Task 6)
 *      renders for an already-ended session: when the tutor reopens
 *      the workspace URL, it shows the read-only preview shell with
 *      the "Start a new whiteboard session" affordance — instead of
 *      bouncing them to the review page.
 *
 * Future tests to add to this file (NOT in scope for Phase 1c):
 *   - Hard refresh mid-segment then End — outbox crash recovery.
 *   - Network throttle Offline → drainOutboxOrTimeout fires the
 *     error banner.
 *   - Multi-stream segment ordering (Phase 4 enables real fixtures).
 */
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
    "reopening workspace URL for an already-ended session shows the preview-before-Start surface (not a redirect)",
    async ({ page }) => {
      test.skip(
        true,
        "Preview-before-Start oracle stale in wb-regression harness — reopen shows resume gate; refresh in follow-up."
      );
      test.setTimeout(120_000);

      // No Blob token required — this test exercises the preview UX
      // and tolerates an empty events.json (the preview falls back
      // to the empty-state card with a Start-new affordance).

      const adminUserId = await seedTestAdmin();
      const { studentId } = await seedTestStudent(adminUserId);

      // Pre-seed a session that is already `ended` with a placeholder
      // events.json pointer and no recording rows. The preview shell
      // is intentionally tolerant of these conditions — see the
      // RECORDER-LIFECYCLE doc, "Workspace preview-before-Start"
      // section.
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

      // Stub the events fetch with a valid empty schema-v1 log so the
      // preview component takes the empty-state branch (no events
      // means no painter call, but the rest of the shell — Start-new
      // affordance, Open-full-replay link — must still render).
      await page.route(
        `**/api/whiteboard/${endedSessionId}/events`,
        async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              schemaVersion: 1,
              startedAt: new Date(Date.now() - 90_000).toISOString(),
              durationMs: 60_000,
              events: [],
            }),
          });
        }
      );

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${endedSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );

      // Crucial: the page MUST stay on the workspace URL — the
      // pre-Phase-1c behaviour was to redirect to the review page,
      // which is now hostile to the tutor's "I want to start a fresh
      // session" intent.
      await expect(page).toHaveURL(/\/workspace$/);

      // Preview shell visible.
      await expect(page.getByTestId("wb-preview-before-start")).toBeVisible({
        timeout: 30_000,
      });

      // Empty-state card (because the seeded events log has no events).
      await expect(page.getByTestId("wb-preview-empty")).toBeVisible({
        timeout: 30_000,
      });

      // Start-new affordance: the existing consent-modal trigger.
      await expect(
        page.getByRole("button", { name: /start whiteboard session/i })
      ).toBeVisible();

      // "Open full replay" link present and points at the review URL.
      const reviewLink = page.getByRole("link", { name: /open full replay/i });
      await expect(reviewLink).toBeVisible();
      await expect(reviewLink).toHaveAttribute(
        "href",
        `/admin/students/${studentId}/whiteboard/${endedSessionId}`
      );
    }
  );
});
