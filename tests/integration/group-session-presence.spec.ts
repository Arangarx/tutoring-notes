import { test, expect, type BrowserContext } from "@playwright/test";
import { test as authedTest } from "./fixtures";
import { readLocalEnv } from "../utils/read-dotenv";
import { PrismaClient } from "@prisma/client";
import {
  seedTestAdmin,
  seedTestStudent,
  seedOpenWhiteboardSession,
} from "../visual/helpers";

/**
 * Group-session presence canary — Phase 1c (Pillar 4 follow-on).
 *
 * Pillar 1's lifecycle FSM and the workspace's presence-pill wiring
 * are designed to support N participants from day one (see
 * docs/RECORDER-LIFECYCLE.md, "Multi-stream + multi-participant"
 * rules). Today the workspace runs 1:1 sessions, but this file is the
 * integration-level canary that the wiring won't silently break when
 * Phase 4 wires in real WebRTC group sessions (siblings, study
 * groups).
 *
 * Two tests, two strictness levels:
 *
 *   1. **Always-on smoke** — opens the tutor workspace, asserts the
 *      recording pill renders and the workspace doesn't crash when
 *      sync is enabled but no students are present (the "armed
 *      (waiting for first participant)" code path). This proves the
 *      multi-participant FSM wiring is reachable end-to-end.
 *
 *   2. **Gated multi-context** — gated on a real
 *      `WHITEBOARD_SYNC_URL`, opens the tutor + 2 student browser
 *      contexts simultaneously joining via separate join tokens
 *      minted directly in Prisma. Asserts the tutor's sync pill
 *      flips to "Student connected" once both peers are present.
 *      Without `WHITEBOARD_SYNC_URL` we cannot meaningfully test
 *      this without standing up a real sync server, so it self-
 *      skips with a helpful message.
 *
 * Future work (NOT in scope for Phase 1c):
 *   - Recording pill copy with N=2 vs N=1 vs N=0 once per-participant
 *     copy lands in the workspace UI (Phase 4).
 *   - Per-stream audio routing assertions when student audio streams
 *     are enqueued into the outbox (Phase 4 outbox `student:peer-X:mic`).
 */

test.describe("group-session presence (Phase 1c)", () => {
  authedTest(
    "tutor workspace renders without crash when sync is enabled and 0 students are present (armed-waiting smoke)",
    async ({ page }) => {
      test.setTimeout(120_000);

      const adminUserId = await seedTestAdmin();
      const { studentId } = await seedTestStudent(adminUserId);
      const whiteboardSessionId = await seedOpenWhiteboardSession({
        adminUserId,
        studentId,
      });

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );

      await expect(
        page.getByTestId("tutor-whiteboard-canvas-mount")
      ).toBeVisible({ timeout: 90_000 });

      // The recording-pill is FSM-driven. With no participants and
      // sync enabled, it must still render (state: armed or off
      // depending on `NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT`),
      // never crash.
      await expect(page.getByTestId("wb-recording-pill")).toBeVisible({
        timeout: 30_000,
      });

      const env = readLocalEnv();
      const syncEnabled = Boolean(env.WHITEBOARD_SYNC_URL?.trim());
      if (syncEnabled) {
        // Sync pill renders only when a sync URL is configured. With
        // no peer present yet, copy should be "Connecting…" or
        // "Awaiting student" — both are valid transient states; the
        // canary is just that the pill is wired.
        await expect(page.getByTestId("wb-sync-pill")).toBeVisible({
          timeout: 30_000,
        });
      }

      // Page should never have crashed to an error boundary.
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.waitForTimeout(2_000);
      expect(errors).toEqual([]);
    }
  );

  test(
    "tutor + 2 mocked students canary — sync pill flips to 'Student connected' when both peers are present",
    async ({ browser }) => {
      test.setTimeout(180_000);

      const env = readLocalEnv();
      test.skip(
        !env.WHITEBOARD_SYNC_URL?.trim(),
        "Set WHITEBOARD_SYNC_URL in .env to exercise multi-participant presence."
      );

      // Tutor seed — same admin used by the integration storageState.
      const adminUserId = await seedTestAdmin();
      const { studentId } = await seedTestStudent(adminUserId);
      const whiteboardSessionId = await seedOpenWhiteboardSession({
        adminUserId,
        studentId,
      });

      // Mint 2 join tokens directly in Prisma so we don't have to
      // drive the "Copy student link" UI twice. The tokens expire 1
      // hour out, plenty for the test budget.
      const prisma = new PrismaClient();
      const tokens: string[] = [];
      try {
        for (let i = 0; i < 2; i++) {
          const created = await prisma.whiteboardJoinToken.create({
            data: {
              whiteboardSessionId,
              token: `pw-group-${whiteboardSessionId.slice(0, 8)}-${i}-${Date.now()}`,
              expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            },
            select: { token: true },
          });
          tokens.push(created.token);
        }
      } finally {
        await prisma.$disconnect();
      }

      // Tutor context — uses the storageState from auth.setup.ts.
      const tutorContext = await browser.newContext({
        storageState: "tests/integration/.auth/tutor.json",
      });
      // Two anonymous student contexts — distinct browser contexts so
      // the sync server treats them as separate peers.
      const studentContexts: BrowserContext[] = [
        await browser.newContext(),
        await browser.newContext(),
      ];

      try {
        const tutorPage = await tutorContext.newPage();
        await tutorPage.goto(
          `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(
          tutorPage.getByTestId("tutor-whiteboard-canvas-mount")
        ).toBeVisible({ timeout: 90_000 });

        // Open both student contexts at their respective join URLs.
        // The student page generates its own e2e key in window.hash,
        // so we don't need to share a key here — the canary is
        // presence (peer-count), not e2e crypto.
        for (let i = 0; i < tokens.length; i++) {
          const studentPage = await studentContexts[i]!.newPage();
          await studentPage.goto(`/w/${tokens[i]}`, {
            waitUntil: "domcontentloaded",
          });
        }

        // Tutor's sync pill should flip to "Student connected" once
        // any peer is present (today's UI uses a binary flag; Phase
        // 4 will replace this with N-aware copy). The canary is that
        // the multi-participant code path doesn't dead-lock on N=2.
        await expect(tutorPage.getByTestId("wb-sync-pill")).toContainText(
          /student connected/i,
          { timeout: 60_000 }
        );

        // No tutor-page errors.
        const errors: string[] = [];
        tutorPage.on("pageerror", (e) => errors.push(String(e)));
        await tutorPage.waitForTimeout(2_000);
        expect(errors).toEqual([]);
      } finally {
        await tutorContext.close();
        for (const ctx of studentContexts) {
          await ctx.close();
        }
      }
    }
  );
});
