/**
 * WS-N5 — strokes drawn right after the tutor reopens a started session are recorded.
 *
 * Spec (user-observable): the tutor reopens a session that was already started (ACTIVE) and draws
 * immediately, before any student has reconnected. Those strokes must land in the whiteboard
 * recording, so the replay shows them.
 *
 * Production default: `NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT` is UNSET. The primary harness server
 * sets it to 1 (which masks the bug by recording solo), so this spec runs against the alternate
 * server (`PW_ALT_PORT`), which carries the production default — same trick as
 * `wb-in-person-audio-start.spec.ts` / project `wb-in-person-unmasked`.
 *
 * Oracle (independent of app internals): the replay event log the server returns after End
 * (`GET /api/whiteboard/:id/events`, assembled from the server-persisted batches). The stroke is
 * identified by an element id the test itself chose.
 *
 * Red-before: the recorder is gated off while the lifecycle is `armed`, which is where a reopened
 * session sits until a student reconnects, so the stroke is on the canvas but never in the log.
 *
 * Run:
 *   npx playwright test tests/integration/wb-reopen-stroke-capture.spec.ts --project=wb-regression --workers=1
 */

import { test, expect } from "./fixtures";
import {
  drawTestStrokeOnRole,
  readSceneElementIds,
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

const { resolvePwStack } = require("../../scripts/pw-stack.cjs");

// Production-default server (solo-until-student OFF), see header.
test.use({ baseURL: resolvePwStack().altOrigin });

test.describe(
  "WS-N5 strokes drawn right after reopening a started session are recorded",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test("reopen an ACTIVE session with no student present, draw at once, End: the stroke is in the replay event log", async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await waitForWbE2eBridge(page, "tutor");

      // Draw immediately after reopen.
      const strokeId = `n5-reopen-${Date.now()}`;
      await drawTestStrokeOnRole(page, "tutor", strokeId, 60, 60, 180, 160);
      await expect
        .poll(async () => (await readSceneElementIds(page, "tutor")).includes(strokeId), {
          timeout: 10_000,
        })
        .toBe(true);
      // Leave time for the ~1s server persist sidecar to flush the batch carrying the stroke.
      await page.waitForTimeout(3_000);

      await page.getByTestId("wb-end-session").click();
      const confirmBtn = page.getByTestId("wb-end-session-confirm-yes");
      if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({ timeout: 120_000 });

      const eventsRes = await page.request.get(`/api/whiteboard/${whiteboardSessionId}/events`);
      // Nothing recorded -> the endpoint may answer non-2xx rather than an empty log; either way the
      // stroke is absent, so fold that into the one assertion below with a clear message.
      const eventsBody = eventsRes.ok()
        ? ((await eventsRes.json()) as { events?: unknown[] })
        : { events: [] as unknown[] };
      expect(
        JSON.stringify(eventsBody.events ?? []),
        `stroke ${strokeId} drawn right after reopen is missing from the replay event log (HTTP ${eventsRes.status()}, ${eventsBody.events?.length ?? 0} events)`
      ).toContain(strokeId);
    });
  }
);
