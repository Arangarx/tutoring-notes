/**
 * Consent wave — § 6l (B1): /api/cron/session-cleanup and the untouched transcription route, over HTTP with the test CRON_SECRET; no relay.
 *
 * C0 SKELETON (docs/handoff/consent-wave-plan.md § 6, § 8 C0): every row below is `test.fixme` and is filled in by the wave that
 * owns its behavior. Titles state the rule; each row's oracle is quoted in the comment above it. A row is un-fixme'd only together
 * with its red-before / green-after evidence (exhaustive-testing-mandate.mdc).
 *
 * Run (after un-fixme): npx playwright test tests/integration/wb-consent-cron.spec.ts --project=wb-regression --workers=1 --retries=0
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TAG } from "../test-tags";
import {
  armFault,
  armHold,
  disarmFault,
  listHarnessBlobs,
  reaperOutcomeFor,
  resetSeams,
  runCron,
  runReaperCron,
  seedHarnessBlobs,
} from "../helpers/consent-harness";
import { seedIdle } from "../helpers/consent-board-fixture";
import { HOUR_MS } from "../helpers/consent-db-oracle";
import { SESSION_REAPER_TIME_BUDGET_MS } from "@/lib/session-cleanup-config";
import { seedStartFixture } from "../helpers/consent-start-fixture";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";

const HARNESS_ORIGIN = "http://localhost:3100";
const prisma = new PrismaClient();
test.afterAll(async () => {
  await prisma.$disconnect();
});
const readEnded = (id: string) =>
  prisma.whiteboardSession.findUniqueOrThrow({ where: { id }, select: { endedAt: true } });

/** A whiteboard-off session that already ended with its purge intent stamped and a board blob waiting: a purge that is due. */
async function seedDuePurgeRow(request: APIRequestContext) {
  const f = await seedStartFixture({ record: { allowWhiteboardRecording: false }, snapshot: true });
  const prefix = `whiteboard-sessions/${f.studentId}/${f.whiteboardSessionId}/`;
  const key = `${prefix}1-events.json`;
  await prisma.whiteboardSession.update({
    where: { id: f.whiteboardSessionId },
    data: { endedAt: new Date(Date.now() - 60_000), boardPurgeRequestedAt: new Date(Date.now() - 60_000) },
  });
  await seedHarnessBlobs(request, [{ key, text: "{}", contentType: "application/json" }]);
  return {
    ...f,
    prefix,
    key,
    row: () =>
      prisma.whiteboardSession.findUniqueOrThrow({
        where: { id: f.whiteboardSessionId },
        select: { boardPurgeFirstPassAt: true },
      }),
  };
}

// ---------------------------------------------------------------------------
// 6l. Cron isolation (B1)
// ---------------------------------------------------------------------------
test.describe("consent 6l: Cron isolation (B1)", {
  tag: [TAG.WB_CONSENT, TAG.WB_RECORDING],
}, () => {
  // Oracle: Wave C4c (BL2). Arm 'faultPoint("cleanup:reaper")'; seed a due purge row and an idle session. Oracle: the purge row's 'boardPurgedAt' is stamped (the purge ran after the reaper threw), the idle session is untouched, the  …
  test(
    "K1: the reaper throws: the purge still runs, and the route returns 500 naming the reaper",
    async ({ request }) => {
      test.setTimeout(120_000);
      const idle = await seedIdle(request, { whiteboard: true });
      const due = await seedDuePurgeRow(request);
      try {
        await armFault(request, { name: "cleanup:reaper" });
        const failed = await runReaperCron(request, "enforce");
        expect(failed.status, failed.text).toBe(500);
        expect(failed.reaperBody.failedJob).toBe("reaper");
        expect(failed.text).toMatch(/reaper/);
        // The purge ran after the reaper threw ...
        expect((await due.row()).boardPurgeFirstPassAt, "the purge half still ran").not.toBeNull();
        expect(await listHarnessBlobs(request, due.prefix)).toEqual([]);
        // ... and the reaper did nothing.
        expect((await readEnded(idle.whiteboardSessionId)).endedAt).toBeNull();
      } finally {
        await resetSeams(request);
        await Promise.all([idle.cleanup(), due.cleanup()]);
      }
    }
  );
  // Oracle: Wave C4c (BL2). Arm 'faultPoint("cleanup:purge")'; 'enforce' mode; an idle session. Oracle: the session is ended (the reaper's work stands), response 500 naming 'purge'
  test(
    "K2: the purge throws: the reaper's work is already committed, and the route returns 500 naming the purge",
    async ({ request }) => {
      test.setTimeout(120_000);
      const idle = await seedIdle(request, { whiteboard: true });
      try {
        await armFault(request, { name: "cleanup:purge" });
        const failed = await runReaperCron(request, "enforce");
        expect(failed.status, failed.text).toBe(500);
        expect(failed.reaperBody.failedJob).toBe("purge");
        expect((await readEnded(idle.whiteboardSessionId)).endedAt, "the reaper's work stands").not.toBeNull();
        expect(reaperOutcomeFor(failed.reaperBody, idle.whiteboardSessionId)?.action).toBe("reaped");
      } finally {
        await resetSeams(request);
        await idle.cleanup();
      }
    }
  );
  // Oracle: SF-G, BL2. (a) is the C4b jest guard (src/__tests__/api/cron-session-cleanup-budget.test.ts). (b) HTTP, below.
  // The reaper's share is spent by real elapsed time: two held candidates each burn their out-of-transaction hold
  // (the seam's own cap), so the reaper's deadline passes with candidates left. No new seam is needed to make it slow.
  test(
    "K3 (b): a slow reaper ends some candidates and not all, and still leaves the purge its own deadline: the purge half runs in the same request",
    async ({ request }) => {
      test.setTimeout(300_000);
      // Oldest first: A and B are the held, slow ones; C and D queue behind them.
      const queue = [
        await seedIdle(request, { whiteboard: true, idleMs: 30 * HOUR_MS }),
        await seedIdle(request, { whiteboard: true, idleMs: 29 * HOUR_MS }),
        await seedIdle(request, { whiteboard: true, idleMs: 28 * HOUR_MS }),
        await seedIdle(request, { whiteboard: true, idleMs: 27 * HOUR_MS }),
      ];
      const due = await seedDuePurgeRow(request);
      try {
        for (const s of queue.slice(0, 2)) {
          await armHold(request, { name: "reaper:between_scan_and_stamp", sessionId: s.whiteboardSessionId });
        }
        const startedAt = Date.now();
        const run = await runReaperCron(request, "enforce", { timeout: 280_000 });
        const elapsedMs = Date.now() - startedAt;

        expect(run.status, run.text).toBe(200);
        expect(elapsedMs, "the slow reaper really did use more than its share").toBeGreaterThan(SESSION_REAPER_TIME_BUDGET_MS);
        // The route returned before its own ceiling (maxDuration 300 s minus the margin).
        expect(elapsedMs).toBeLessThan(240_000);
        expect(run.reaperBody.reaper?.stoppedAtDeadline).toBe(true);
        const endedCount = (
          await Promise.all(queue.map(async (s) => (await readEnded(s.whiteboardSessionId)).endedAt !== null))
        ).filter(Boolean).length;
        expect(endedCount, "some candidates ended").toBeGreaterThan(0);
        expect(endedCount, "not all in this run").toBeLessThan(queue.length);
        // The purge half ran in the SAME request: it was not starved by the slow reaper.
        expect((await due.row()).boardPurgeFirstPassAt, "purge ran in the same request").not.toBeNull();

        // The rest are ended by the next run.
        await resetSeams(request);
        const next = await runReaperCron(request, "enforce");
        expect(next.status, next.text).toBe(200);
        for (const s of queue) expect((await readEnded(s.whiteboardSessionId)).endedAt).not.toBeNull();
      } finally {
        await resetSeams(request);
        await Promise.all([...queue.map((s) => s.cleanup()), due.cleanup()]);
      }
    }
  );
  // Oracle: C4b with the purge fault only; re-run in C4c with both faults (BL2). Arm the available fault(s) so 'session-cleanup' returns 500; call '/api/cron/transcribe-sweep' over HTTP: it returns 200 and processes a seeded eligibl …
  // C4c arm: BOTH faults armed, so every job in session-cleanup throws.
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
        await armFault(request, { name: "cleanup:reaper" });
        await armFault(request, { name: "cleanup:purge" });
        const failing = await runReaperCron(request, "enforce");
        expect(failing.status, failing.text).toBe(500);
        expect((failing.reaperBody.failedJobs ?? []).map((j) => j.job).sort(), "both jobs failed, each isolated").toEqual(["purge", "reaper"]);

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
      const f = await seedDuePurgeRow(request);
      const { prefix, key, row } = f;
      try {
        await armFault(request, { name: "cleanup:purge" });
        const failed = await runCron(request, "/api/cron/session-cleanup");
        expect(failed.status, failed.text).toBe(500);
        expect(failed.text).toMatch(/purge/);
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
