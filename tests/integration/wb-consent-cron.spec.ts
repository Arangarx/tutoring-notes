/**
 * Consent wave — § 6l (B1): /api/cron/session-cleanup and the untouched transcription route, over HTTP with the test CRON_SECRET; no relay.
 *
 * C0 SKELETON (docs/handoff/consent-wave-plan.md § 6, § 8 C0): every row below is `test.fixme` and is filled in by the wave that
 * owns its behavior. Titles state the rule; each row's oracle is quoted in the comment above it. A row is un-fixme'd only together
 * with its red-before / green-after evidence (exhaustive-testing-mandate.mdc).
 *
 * Run (after un-fixme): npx playwright test tests/integration/wb-consent-cron.spec.ts --project=wb-regression --workers=1 --retries=0
 */

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TAG } from "../test-tags";
import {
  armFault,
  disarmFault,
  listHarnessBlobs,
  resetSeams,
  runCron,
  seedHarnessBlobs,
} from "../helpers/consent-harness";
import { seedStartFixture } from "../helpers/consent-start-fixture";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";

const HARNESS_ORIGIN = "http://localhost:3100";
const prisma = new PrismaClient();
test.afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// 6l. Cron isolation (B1)
// ---------------------------------------------------------------------------
test.describe("consent 6l: Cron isolation (B1)", {
  tag: [TAG.WB_CONSENT, TAG.WB_RECORDING],
}, () => {
  // Oracle: Wave C4c (BL2). Arm 'faultPoint("cleanup:reaper")'; seed a due purge row and an idle session. Oracle: the purge row's 'boardPurgedAt' is stamped (the purge ran after the reaper threw), the idle session is untouched, the  …
  test.fixme(
    "K1: the reaper throws: the purge still runs, and the route returns 500 naming the reaper",
    async () => {
      // pending: wave that owns K1
    }
  );
  // Oracle: Wave C4c (BL2). Arm 'faultPoint("cleanup:purge")'; 'enforce' mode; an idle session. Oracle: the session is ended (the reaper's work stands), response 500 naming 'purge'
  test.fixme(
    "K2: the purge throws: the reaper's work is already committed, and the route returns 500 naming the purge",
    async () => {
      // pending: wave that owns K2
    }
  );
  // Oracle: SF-G, BL2. (a) C4b, jest guard: 'SESSION_REAPER_TIME_BUDGET_MS + BOARD_PURGE_SWEEP_MIN_WINDOW_MS + SESSION_CLEANUP_MARGIN_MS <= maxDuration * 1000', importing 'maxDuration' from the route module (red when someone raises  …
  test.fixme(
    "K3: budgets: the deadlines derive from the route's start, reaper + purge window + margin fit under maxDuration, and a slow reaper cannot push the purge past the route deadline",
    async () => {
      // pending: wave that owns K3
    }
  );
  // Oracle: C4b with the purge fault only; re-run in C4c with both faults (BL2). Arm the available fault(s) so 'session-cleanup' returns 500; call '/api/cron/transcribe-sweep' over HTTP: it returns 200 and processes a seeded eligibl …
  // C4b arm: the purge fault only (the reaper fault joins in C4c).
  test(
    "K4: transcribe-sweep is untouched: it still processes work while session-cleanup is failing, and its schedule is unchanged",
    async ({ request }) => {
      // Schedules, read from vercel.json as data: the existing sweep is unchanged and the new job has its own entry.
      const crons = (JSON.parse(readFileSync(path.join(__dirname, "..", "..", "vercel.json"), "utf8")) as {
        crons?: { path: string; schedule: string }[];
      }).crons ?? [];
      expect(crons).toContainEqual({ path: "/api/cron/transcribe-sweep", schedule: "*/15 * * * *" });
      expect(crons).toContainEqual({ path: "/api/cron/session-cleanup", schedule: "7,22,37,52 * * * *" });

      const s = await seedWbLiveSyncSession();
      const chunk = await prisma.transcriptChunk.create({
        data: {
          sessionId: s.whiteboardSessionId,
          chunkBlobUrl: `${HARNESS_ORIGIN}/api/test/blob/object/consent-k4/${s.studentId}/${Date.now()}.webm`,
          recordingTimeOffsetMs: 0,
          status: "pending",
          streamId: "tutor:mic",
          speakerId: null,
          updatedAt: new Date(Date.UTC(2002, 0, 1)),
        },
        select: { id: true },
      });
      try {
        await armFault(request, { name: "cleanup:purge" });
        const failing = await runCron(request, "/api/cron/session-cleanup");
        expect(failing.status, failing.text).toBe(500);

        const swept = await runCron(request, "/api/cron/transcribe-sweep");
        expect(swept.status, swept.text).toBe(200);
        await expect
          .poll(
            async () =>
              (await prisma.transcriptChunk.findUniqueOrThrow({ where: { id: chunk.id }, select: { status: true } }))
                .status,
            { timeout: 60_000 }
          )
          .not.toBe("pending");
      } finally {
        await resetSeams(request);
        await prisma.transcriptChunk.deleteMany({ where: { id: chunk.id } });
      }
    }
  );
  // Oracle: Wave C4b (BL2, ADDED, veto-able): the arm of K1/K2 that does not need the reaper. Route has one job at this point. Seed a due purge row; arm 'faultPoint("cleanup:purge")'; call the route. Oracle: HTTP 500 with a body nam …
  test(
    "K5: purge-only isolation: a throwing purge is caught, logged and returned as a 500 naming purge, and the next clean call purges the row",
    async ({ request }) => {
      const f = await seedStartFixture({ record: { allowWhiteboardRecording: false }, snapshot: true });
      const prefix = `whiteboard-sessions/${f.studentId}/${f.whiteboardSessionId}/`;
      const key = `${prefix}1-events.json`;
      try {
        await prisma.whiteboardSession.update({
          where: { id: f.whiteboardSessionId },
          data: { endedAt: new Date(Date.now() - 60_000), boardPurgeRequestedAt: new Date(Date.now() - 60_000) },
        });
        await seedHarnessBlobs(request, [{ key, text: "{}", contentType: "application/json" }]);

        await armFault(request, { name: "cleanup:purge" });
        const failed = await runCron(request, "/api/cron/session-cleanup");
        expect(failed.status, failed.text).toBe(500);
        expect(failed.text).toMatch(/purge/);
        const row = () =>
          prisma.whiteboardSession.findUniqueOrThrow({
            where: { id: f.whiteboardSessionId },
            select: { boardPurgeFirstPassAt: true },
          });
        expect((await row()).boardPurgeFirstPassAt).toBeNull();
        expect((await listHarnessBlobs(request, prefix)).map((o) => o.key)).toEqual([key]);

        await disarmFault(request, "cleanup:purge");
        const ok = await runCron(request, "/api/cron/session-cleanup");
        expect(ok.status, ok.text).toBe(200);
        expect((await row()).boardPurgeFirstPassAt).not.toBeNull();
        expect(await listHarnessBlobs(request, prefix)).toEqual([]);
      } finally {
        await resetSeams(request);
        await f.cleanup();
      }
    }
  );
});
