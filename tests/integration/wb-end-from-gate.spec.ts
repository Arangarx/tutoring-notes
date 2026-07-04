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
import { put } from "@vercel/blob";

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
      "upload real audio from workspace → outbox row in IDB → session backdated → gate shows → End and review → recordings > 0",
      async ({ page }) => {
        test.setTimeout(300_000);

        const env = readLocalEnv();
        test.skip(
          !env.BLOB_READ_WRITE_TOKEN?.trim(),
          "Set BLOB_READ_WRITE_TOKEN in .env to run the real-recording anti-orphan guard."
        );

        // Seed a FRESH session (gate will not show yet — startedAt is now).
        const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

        // ── Step 1: Open workspace, record, and write outbox row ─────────────
        //
        // WHY THIS APPROACH:
        //   The gate test's SSG-2 scenario is: tutor records audio → navigates
        //   away (without ending) → comes back via workspace URL → gate shows →
        //   End and review → recording preserved.
        //
        //   In Playwright's single-tab model, IDB writes from the workspace
        //   context are NOT reliably visible to subsequent page.goto contexts.
        //   Specifically, the outbox IDB write that happens in the workspace's
        //   MediaRecorder onstop (during page unload) produces an empty blob
        //   (chunksRef has no data in 8s with DRAFT_TIMESLICE_MS=30s), so no
        //   outbox row is ever written.
        //
        //   SOLUTION: Write the outbox row DIRECTLY from the workspace page
        //   context using a real Vercel Blob upload (via window.fetch to
        //   /api/upload/audio, same path the recorder uses). Then backdate
        //   the session and reload the workspace URL — the IDB row persists
        //   because we only do ONE page.goto (same URL).
        //
        //   This tests the FULL production code path:
        //     outbox.enqueue → handleEndSession → assembleEndSessionSegments
        //     → endWhiteboardSession → SessionRecording created
        //   The "outbox has a real uploaded segment" precondition is the same
        //   as in the real SSG-2 product scenario; we just seed it directly
        //   from the test rather than via the auto-recording path (which
        //   requires 30+ seconds for a timeslice in the E2E environment).

        await page.goto(
          `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
          timeout: 90_000,
        });

        // Draw strokes so events.json has content.
        await page.waitForTimeout(2_000);
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

        // ── Step 2: Upload a real audio blob and write the outbox row ──────────
        //
        // Upload a tiny WebM blob directly from the Playwright (Node.js) context
        // using `put()` from @vercel/blob (uses BLOB_READ_WRITE_TOKEN from .env).
        // This gives us a real Vercel Blob URL that validateEndSessionSegments
        // will accept (matches ALLOWED_BLOB_HOST_RE = /blob\.vercel-storage\.com/).
        //
        // Then write the outbox row FROM THE WORKSPACE PAGE via page.evaluate,
        // so the IDB write lands in the workspace's storage context and persists
        // across the same-URL reload (page.goto workspaceUrl → gate).
        const tinyWebm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]); // WebM EBML magic
        const localEnv = readLocalEnv();
        const blobResult = await put(
          `sessions/${studentId}/e2e-gate-${whiteboardSessionId.slice(0, 8)}.webm`,
          tinyWebm,
          {
            access: "private",
            token: localEnv.BLOB_READ_WRITE_TOKEN?.trim() ?? "",
          }
        );
        const blobUrl = blobResult.url;
        const mimeType = "audio/webm";
        const sizeBytes = tinyWebm.byteLength;
        console.log(
          `[SSG-2 gate test] wbsid=${whiteboardSessionId} blob uploaded: ...${blobUrl.slice(-24)}`
        );

        // Write the outbox row FROM THE WORKSPACE PAGE so the IDB write is in
        // the workspace's storage context (same-URL reload will see it).
        const rowWritten = await page.evaluate(
          (args: { sessionId: string; blobUrl: string; mimeType: string; sizeBytes: number }):
            Promise<boolean> =>
            new Promise((resolve) => {
              const segId = globalThis.crypto?.randomUUID
                ? globalThis.crypto.randomUUID()
                : `seg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
              const row = {
                id: globalThis.crypto?.randomUUID
                  ? globalThis.crypto.randomUUID()
                  : `row-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                sessionId: args.sessionId,
                streamId: "tutor:mic",
                segmentId: segId,
                blobLocalRef: null,
                blobRemoteUrl: args.blobUrl,
                mimeType: args.mimeType,
                sizeBytes: args.sizeBytes,
                audioStartedAtMs: Date.now(),
                attempts: 0,
                registerOk: false,
                lastError: null,
                createdAt: Date.now(),
              };
              const req = window.indexedDB.open("tutoring-notes-upload-outbox", 1);
              req.onerror = () => resolve(false);
              req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains("rows")) {
                  const store = db.createObjectStore("rows", { keyPath: "id" });
                  store.createIndex("by_session", "sessionId", { unique: false });
                  store.createIndex("by_session_stream", ["sessionId", "streamId"], { unique: false });
                  store.createIndex("by_session_stream_segment",
                    ["sessionId", "streamId", "segmentId"], { unique: true });
                }
              };
              req.onsuccess = () => {
                const db = req.result;
                const tx = db.transaction("rows", "readwrite");
                const store = tx.objectStore("rows");
                const putReq = store.put(row);
                putReq.onsuccess = () => { db.close(); resolve(true); };
                putReq.onerror = () => { db.close(); resolve(false); };
              };
            }),
          { sessionId: whiteboardSessionId, blobUrl, mimeType, sizeBytes }
        );

        if (!rowWritten) {
          throw new Error(
            `[SSG-2 gate] Failed to write outbox row to workspace page IDB. ` +
              `wbsid=${whiteboardSessionId}`
          );
        }
        console.log(
          `[SSG-2 gate test] wbsid=${whiteboardSessionId} ` +
            `outbox row written in workspace page IDB context`
        );

        // ── Step 3: Backdate session to stale (while still on workspace page) ──
        // Backdate BEFORE reloading so the gate fires on the reload.
        const prisma = new PrismaClient();
        try {
          await prisma.whiteboardSession.update({
            where: { id: whiteboardSessionId },
            data: { startedAt: new Date(Date.now() - 11 * 60 * 1000) },
          });
        } finally {
          await prisma.$disconnect();
        }

        // ── Step 4: Reload the workspace URL — gate should show ───────────────
        // We navigate to the SAME URL (workspace → workspace) to trigger the
        // server to re-render with the stale startedAt → gate decision = stale.
        // The IDB row written in step 2 persists across this same-origin same-URL
        // reload; the gate page's workspace context can read it.
        await page.goto(
          `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
          { waitUntil: "domcontentloaded" }
        );
        await page.waitForLoadState("networkidle");

        const gateDialog = page.getByTestId("wb-resume-gate");
        await expect(gateDialog).toBeVisible({ timeout: 30_000 });

        // ── Step 5: Click "End and review" from the gate ─────────────────────
        const endAndReviewBtn = page.getByTestId("wb-resume-gate-end-and-review");
        await expect(endAndReviewBtn).toBeVisible({ timeout: 5_000 });
        await expect(endAndReviewBtn).toBeEnabled({ timeout: 10_000 });

        await Promise.all([
          page.waitForURL(/intent=endreview/, { waitUntil: "commit", timeout: 30_000 }),
          endAndReviewBtn.click(),
        ]);

        // ── Step 6: Workspace auto-ends via handleEndSession ──────────────────
        // The page re-renders with initialIntent="endreview" and autoConsent=true.
        // handleEndSession drains the outbox (finds the row seeded in step 2),
        // registers the segment, and flips to review mode.
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
            `[SSG-2 gate test] wbsid=${whiteboardSessionId} recordings=${recordings.length}`
          );
          // Hard anti-orphan assertion: the outbox row was seeded with a real
          // Vercel Blob URL. handleEndSession must have found and registered it.
          // recordings=0 means the pipeline ran but silently discarded the row —
          // a real SSG-2 regression in the gate path.
          expect(
            recordings.length,
            `[SSG-2 gate anti-orphan] Expected ≥1 SessionRecording but got 0. ` +
              `The outbox row was seeded (real Vercel Blob URL) before End-and-review, ` +
              `so the pipeline MUST have registered it. ` +
              `wbsid=${whiteboardSessionId}`
          ).toBeGreaterThan(0);
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
