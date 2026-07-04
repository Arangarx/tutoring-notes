import { test, expect } from "./fixtures";
import { readLocalEnv } from "../utils/read-dotenv";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";

const TEST_SECRET = process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret";

async function fetchTutorNoteStatus(
  page: import("@playwright/test").Page,
  sessionId: string
): Promise<string | null> {
  const res = await page.request.get(
    `/api/test/whiteboard/${sessionId}/transcript-chunks`,
    { headers: { Authorization: `Bearer ${TEST_SECRET}` } }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as { tutorNoteStatus: string | null };
  return body.tutorNoteStatus;
}

type ShimmerOverlayState = {
  content: string;
  backgroundPosition: string;
  animationName: string;
  opacity: string;
  zIndex: string;
};

async function readShimmerOverlayState(
  page: import("@playwright/test").Page,
  generatingWrap: import("@playwright/test").Locator
): Promise<ShimmerOverlayState> {
  return generatingWrap.evaluate((el) => {
    const after = getComputedStyle(el, "::after");
    return {
      content: after.content,
      backgroundPosition: after.backgroundPosition,
      animationName: after.animationName,
      opacity: after.opacity,
      zIndex: after.zIndex,
    };
  });
}

async function waitForNotesPipelineActiveState(
  page: import("@playwright/test").Page,
  sessionId: string,
  timeoutMs = 120_000
): Promise<{ noteStatus: string | null; generatingVisible: boolean }> {
  const deadline = Date.now() + timeoutMs;
  const seenStatuses = new Set<string>();

  while (Date.now() < deadline) {
    const noteStatus = await fetchTutorNoteStatus(page, sessionId);
    if (noteStatus) {
      seenStatuses.add(noteStatus);
    }
    const generatingVisible = await page
      .getByTestId("tutor-notes-generating")
      .isVisible()
      .catch(() => false);

    if (generatingVisible) {
      return { noteStatus, generatingVisible: true };
    }
    if (noteStatus === "pending" || noteStatus === "generating") {
      return { noteStatus, generatingVisible: false };
    }

    await page.waitForTimeout(100);
  }

  throw new Error(
    `Timed out waiting for tutor-notes-generating UI (statuses seen: ${[...seenStatuses].join(", ") || "none"}) for session ${sessionId}`
  );
}

async function fetchRecordingCount(
  page: import("@playwright/test").Page,
  sessionId: string
) {
  const res = await page.request.get(
    `/api/test/whiteboard/${sessionId}/recording-count`,
    { headers: { Authorization: `Bearer ${TEST_SECRET}` } }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as { count: number };
}

async function recordShortSoloSession(
  page: import("@playwright/test").Page,
  studentId: string,
  whiteboardSessionId: string
) {
  await page.goto(
    `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );

  await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
    timeout: 90_000,
  });

  // Recording auto-starts when consent is present (PRESARAH-1).
  await page.waitForTimeout(2_000);

  const canvas = page
    .locator('[data-testid="tutor-whiteboard-canvas-mount"] canvas')
    .first();
  await canvas.waitFor({ state: "visible", timeout: 60_000 });

  await page.keyboard.press("r");
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Excalidraw canvas has no bounding box");
  }
  for (let i = 0; i < 3; i++) {
    const x0 = box.x + 90 + i * 75;
    const y0 = box.y + 100;
    const x1 = box.x + 160 + i * 75;
    const y1 = box.y + 170;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x1, y1);
    await page.mouse.up();
  }

  // Allow at least one real audio segment to upload before End.
  await page.waitForTimeout(8_000);

  await page.getByTestId("wb-end-session").click();
  const confirmBtn = page.getByTestId("wb-end-session-confirm-yes");
  if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await confirmBtn.click();
  }

  await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
    timeout: 180_000,
  });

  // Tight poll begins immediately — notes can finish before slower UI assertions run.
  await waitForNotesPipelineActiveState(page, whiteboardSessionId, 90_000);
}

test.describe("notes shimmer — real pipeline (SMOKE-NOTES-1)", () => {
  test("end session → pending/generating: overlay visible, animating, status copy", async ({
    page,
  }) => {
    test.setTimeout(360_000);

    const env = readLocalEnv();
    test.skip(
      !env.BLOB_READ_WRITE_TOKEN?.trim(),
      "Set BLOB_READ_WRITE_TOKEN in .env for real recording + notes pipeline."
    );

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
    await recordShortSoloSession(page, studentId, whiteboardSessionId);

    const generatingWrap = page.getByTestId("tutor-notes-generating");
    await expect(generatingWrap).toBeVisible();

    const statusFooter = page.getByTestId("tutor-notes-status");
    await expect(statusFooter).toBeVisible();

    const phase = await generatingWrap.getAttribute("data-note-phase");
    if (phase === "generating") {
      await expect(statusFooter).toHaveText("Writing notes…");
    } else {
      await expect(statusFooter).toHaveText("Waiting for transcript…");
    }

    const recordings = await fetchRecordingCount(page, whiteboardSessionId);
    expect(recordings.count).toBeGreaterThanOrEqual(1);

    // Form fields stay visible underneath the overlay affordance.
    const topicsField = page.locator("#wb-note-topics");
    await expect(topicsField).toBeVisible();
    await expect(topicsField).toBeEditable({ editable: false });

    // Shimmer is a wrapper ::after ON TOP of fields — not an invisible div behind textareas.
    const overlay0 = await readShimmerOverlayState(page, generatingWrap);
    expect(overlay0.content, "wrapper ::after shimmer overlay is present").not.toBe("none");
    expect(Number.parseInt(overlay0.zIndex, 10)).toBeGreaterThanOrEqual(2);
    expect(Number.parseFloat(overlay0.opacity)).toBeGreaterThan(0.4);

    await page.waitForTimeout(800);

    const overlay1 = await readShimmerOverlayState(page, generatingWrap);
    expect(
      overlay1.backgroundPosition,
      "shimmer background-position moves over ~800ms (real animation, not static paint)"
    ).not.toBe(overlay0.backgroundPosition);

    await expect(page.getByTestId("tutor-notes-content")).not.toBeVisible();
    await expect(page.getByTestId("wb-save-note")).not.toBeVisible();
  });

  test("prefers-reduced-motion: static loading overlay, no animation", async ({
    page,
  }) => {
    test.setTimeout(360_000);

    const env = readLocalEnv();
    test.skip(
      !env.BLOB_READ_WRITE_TOKEN?.trim(),
      "Set BLOB_READ_WRITE_TOKEN in .env for real recording + notes pipeline."
    );

    await page.emulateMedia({ reducedMotion: "reduce" });

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
    await recordShortSoloSession(page, studentId, whiteboardSessionId);

    const generatingWrap = page.getByTestId("tutor-notes-generating");
    await expect(generatingWrap).toBeVisible();

    const overlay0 = await readShimmerOverlayState(page, generatingWrap);
    expect(overlay0.content).not.toBe("none");
    expect(overlay0.animationName).toBe("none");
    expect(Number.parseFloat(overlay0.opacity)).toBeGreaterThan(0.5);

    await page.waitForTimeout(800);

    const overlay1 = await readShimmerOverlayState(page, generatingWrap);
    expect(
      overlay1.backgroundPosition,
      "reduced-motion uses a static high-contrast loading state"
    ).toBe(overlay0.backgroundPosition);

    await expect(page.getByTestId("tutor-notes-status")).toBeVisible();
  });
});
