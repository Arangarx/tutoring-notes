import { test, expect } from "./fixtures";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import {
  armHold,
  expectReleasedByTest,
  releaseHold,
  waitUntilParked,
} from "../helpers/consent-harness";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

const TEST_SECRET = process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret";

/** WS-K fast-finalize poll budget — independent wall-clock bound (not impl timers). */
const NOTES_DONE_POLL_BUDGET_MS = 3_000;

type NotesPipelineState = {
  tutorNoteStatus: string | null;
  tutorNoteContent: string | null;
  tutorNoteLastReducedChunkCount: number;
  doneChunkCount: number;
  finalizeReduceCostEventCount: number;
  liveReduceCostEventCount: number;
};

async function fetchNotesPipelineState(
  page: import("@playwright/test").Page,
  sessionId: string
): Promise<NotesPipelineState> {
  const res = await page.request.get(
    `/api/test/whiteboard/${sessionId}/transcript-chunks`,
    { headers: { Authorization: `Bearer ${TEST_SECRET}` } }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as NotesPipelineState;
}

async function fetchTutorNoteStatus(
  page: import("@playwright/test").Page,
  sessionId: string
): Promise<string | null> {
  const body = await fetchNotesPipelineState(page, sessionId);
  return body.tutorNoteStatus;
}

async function seedWskWatermarkCurrent(
  page: import("@playwright/test").Page,
  sessionId: string,
  chunkCount = 5,
  opts?: { pruneNonHarnessChunks?: boolean }
) {
  const res = await page.request.post(
    `/api/test/whiteboard/${sessionId}/seed-wsk-watermark`,
    {
      headers: { Authorization: `Bearer ${TEST_SECRET}` },
      data: { chunkCount, pruneNonHarnessChunks: opts?.pruneNonHarnessChunks ?? false },
    }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function sealSessionAndEnqueueNotes(
  page: import("@playwright/test").Page,
  sessionId: string
): Promise<number> {
  const sealStartMs = Date.now();
  const res = await page.request.post(
    `/api/test/whiteboard/${sessionId}/seal-and-enqueue-notes`,
    { headers: { Authorization: `Bearer ${TEST_SECRET}` } }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  return sealStartMs;
}

async function assertWatermarkCurrentPrecondition(
  page: import("@playwright/test").Page,
  sessionId: string,
  minDoneChunks: number
) {
  const s = await fetchNotesPipelineState(page, sessionId);
  expect(s.doneChunkCount).toBeGreaterThanOrEqual(minDoneChunks);
  expect(s.tutorNoteLastReducedChunkCount).toBeGreaterThanOrEqual(s.doneChunkCount);
  expect(s.tutorNoteStatus).toBe("pending");
  expect(s.liveReduceCostEventCount).toBeGreaterThanOrEqual(1);
  return s;
}

type SkeletonMotion = {
  animationName: string;
  opacity: string;
};

function topicsSkeletonBar(page: import("@playwright/test").Page) {
  return page
    .locator("#wb-note-topics")
    .locator("xpath=..")
    .locator("[data-slot='skeleton']")
    .first();
}

async function readSkeletonMotion(
  bar: import("@playwright/test").Locator
): Promise<SkeletonMotion> {
  return bar.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      animationName: style.animationName,
      opacity: style.opacity,
    };
  });
}

async function visibleNoteFieldsAreEmpty(page: import("@playwright/test").Page) {
  const ids = ["#wb-note-topics", "#wb-note-assessment", "#wb-note-nextsteps", "#wb-note-links"];
  for (const id of ids) {
    const value = await page.locator(id).inputValue();
    if (value.trim()) return false;
  }
  return true;
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
}

async function waitForInFlightNotesUi(
  page: import("@playwright/test").Page,
  timeoutMs = 90_000
): Promise<{ phase: "pending" | "generating" }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const generatingWrap = page.getByTestId("tutor-notes-generating");
    if (!(await generatingWrap.isVisible().catch(() => false))) {
      await page.waitForTimeout(100);
      continue;
    }
    const statusFooter = page.getByTestId("tutor-notes-status");
    if (!(await statusFooter.isVisible().catch(() => false))) {
      await page.waitForTimeout(100);
      continue;
    }
    const text = ((await statusFooter.textContent()) ?? "").trim();
    const phase = await generatingWrap.getAttribute("data-note-phase");
    const copyOk =
      phase === "generating"
        ? text === "Writing notes…"
        : phase === "pending" && text === "Preparing your notes...";
    if (!copyOk || (phase !== "pending" && phase !== "generating")) {
      await page.waitForTimeout(100);
      continue;
    }
    return { phase };
  }

  throw new Error(
    "Timed out waiting for in-flight notes UI with status copy"
  );
}

test.describe("notes shimmer — real pipeline (SMOKE-NOTES-1)", { tag: [TAG.WB_RECORDING] }, () => {
  test("end session → pending/generating: in-box placeholder when empty, status copy", async ({
    page,
  }) => {
    test.setTimeout(360_000);

    test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
    await armHold(page.request, {
      name: "notes:reduce:before_resolve",
      sessionId: whiteboardSessionId,
    });
    try {
      await recordShortSoloSession(page, studentId, whiteboardSessionId);
      // The worker must be parked here. Without the product holdPoint the note
      // leaves pending/generating before this returns (no OPENAI_API_KEY).
      await waitUntilParked(
        page.request,
        "notes:reduce:before_resolve",
        whiteboardSessionId
      );

      const { phase } = await waitForInFlightNotesUi(page, 90_000);

      const recordings = await fetchRecordingCount(page, whiteboardSessionId);
      expect(recordings.count).toBeGreaterThanOrEqual(1);

      const topicsField = page.locator("#wb-note-topics");
      await expect(topicsField).toBeVisible();
      await expect(topicsField).toBeEditable({ editable: false });
      await expect(page.locator(".tn-notes-generating-wrap")).toHaveCount(0);
      await expect(page.getByTestId("tutor-notes-content")).not.toBeVisible();
      await expect(page.getByTestId("wb-save-note")).not.toBeVisible();

      const empty = await visibleNoteFieldsAreEmpty(page);
      if (phase === "generating" || empty) {
        if (phase === "generating") {
          await expect(topicsField).toHaveValue("");
        }
        await expectInBoxSkeleton(page, "#wb-note-topics");
        const bar = topicsSkeletonBar(page);
        const motion0 = await readSkeletonMotion(bar);
        expect(motion0.animationName, "in-box skeleton is painted").not.toBe("none");
        expect(Number.parseFloat(motion0.opacity)).toBeGreaterThan(0.4);
        await page.waitForTimeout(800);
        const motion1 = await readSkeletonMotion(bar);
        expect(
          motion1.opacity,
          "skeleton opacity moves over ~800ms (real animation, not static paint)"
        ).not.toBe(motion0.opacity);
      } else {
        expect(phase).toBe("pending");
        await expect(page.getByTestId("tn-note-field-skeleton")).toHaveCount(0);
      }

      await releaseHold(page.request, "notes:reduce:before_resolve", whiteboardSessionId);
      await expectReleasedByTest(
        page.request,
        "notes:reduce:before_resolve",
        whiteboardSessionId
      );
    } finally {
      await releaseHold(
        page.request,
        "notes:reduce:before_resolve",
        whiteboardSessionId
      );
    }
  });

  test("prefers-reduced-motion: static in-box skeleton, no animation", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await page.emulateMedia({ reducedMotion: "reduce" });

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
    await seedBlurNote(page, whiteboardSessionId, {
      noteStatus: "pending",
      noteContent: null,
    });
    await sealWithoutEnqueue(page, whiteboardSessionId);
    await openSealedReview(page, studentId, whiteboardSessionId, "pending");

    await expect(page.locator(".tn-notes-generating-wrap")).toHaveCount(0);
    await expectInBoxSkeleton(page, "#wb-note-topics");

    const bar = topicsSkeletonBar(page);
    const motion0 = await readSkeletonMotion(bar);
    expect(motion0.animationName).toBe("none");
    expect(Number.parseFloat(motion0.opacity)).toBeGreaterThan(0.5);

    await page.waitForTimeout(800);

    const motion1 = await readSkeletonMotion(bar);
    expect(
      motion1.opacity,
      "reduced-motion uses a static in-box skeleton"
    ).toBe(motion0.opacity);
    expect(motion1.animationName).toBe("none");

    await expect(page.getByTestId("tutor-notes-status")).toBeVisible();
  });
});

test.describe(
  "notes pipeline WS-K — fast finalize (P1-WB-5)",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test("live watermark current at End → done within 3s, zero finalize-reduce LLM calls", async ({
      page,
    }) => {
      test.setTimeout(360_000);

      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

      // Seed watermark BEFORE opening workspace — avoids fake-mic transcript rows.
      await seedWskWatermarkCurrent(page, whiteboardSessionId, 5);
      const preEnd = await assertWatermarkCurrentPrecondition(
        page,
        whiteboardSessionId,
        5
      );
      const finalizeReduceBeforeEnd = preEnd.finalizeReduceCostEventCount;

      const sealStartMs = await sealSessionAndEnqueueNotes(page, whiteboardSessionId);

      const reviewNav = page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );

      await expect
        .poll(
          async () => (await fetchTutorNoteStatus(page, whiteboardSessionId)) === "done",
          { timeout: NOTES_DONE_POLL_BUDGET_MS, intervals: [50, 100, 200] }
        )
        .toBe(true);

      const elapsedMs = Date.now() - sealStartMs;
      expect(
        elapsedMs,
        `tutor note must reach done within ${NOTES_DONE_POLL_BUDGET_MS}ms wall-clock budget`
      ).toBeLessThanOrEqual(NOTES_DONE_POLL_BUDGET_MS);

      await reviewNav;
      await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
        timeout: 90_000,
      });

      await expect(page.getByTestId("tutor-notes-content")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId("tutor-notes-generating")).not.toBeVisible();

      const postEnd = await fetchNotesPipelineState(page, whiteboardSessionId);
      expect(postEnd.tutorNoteStatus).toBe("done");
      expect(postEnd.finalizeReduceCostEventCount).toBe(finalizeReduceBeforeEnd);
    });
  }
);

const DRAFT_TOPICS = "Algebra factoring";

/**
 * First-paint bound. Playwright treats `timeout: FIRST_PAINT_MS` as no timeout, so a
 * failing count would wait until the test dies. 500ms is shorter than the
 * 3s notes poll, so a visible form-wide wrap fails instead of disappearing.
 */
const FIRST_PAINT_MS = 500;

async function seedBlurNote(
  page: import("@playwright/test").Page,
  sessionId: string,
  note: { noteStatus: "pending" | "generating"; noteContent: string | null }
) {
  const res = await page.request.post(
    `/api/test/whiteboard/${sessionId}/seed-wsk-watermark`,
    {
      headers: { Authorization: `Bearer ${TEST_SECRET}` },
      data: { chunkCount: 5, ...note },
    }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function sealWithoutEnqueue(
  page: import("@playwright/test").Page,
  sessionId: string
) {
  const res = await page.request.post(
    `/api/test/whiteboard/${sessionId}/seal-and-enqueue-notes`,
    {
      headers: { Authorization: `Bearer ${TEST_SECRET}` },
      data: { enqueue: false },
    }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as { enqueued?: boolean };
  expect(body.enqueued).toBe(false);
}

async function openSealedReview(
  page: import("@playwright/test").Page,
  studentId: string,
  whiteboardSessionId: string,
  phase: "pending" | "generating"
) {
  await page.goto(
    `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
    timeout: 90_000,
  });
  const topics = page.locator("#wb-note-topics");
  await expect(topics).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("tutor-notes-generating")).toHaveAttribute(
    "data-note-phase",
    phase
  );
  return topics;
}

function formWideWrap(page: import("@playwright/test").Page) {
  return page.locator(".tn-notes-generating-wrap");
}

test.describe(
  "notes blur — in-box placeholder (Andrew 2026-10-12)",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test("pending note with topics text: first paint shows the draft, no form-wide blur, no in-box skeleton", async ({
      page,
    }) => {
      test.setTimeout(180_000);

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      await seedBlurNote(page, whiteboardSessionId, {
        noteStatus: "pending",
        noteContent: JSON.stringify({
          topics: DRAFT_TOPICS,
          assessment: "Solid grasp of basics",
          nextSteps: "Practice mixed problems",
          links: "",
        }),
      });
      await sealWithoutEnqueue(page, whiteboardSessionId);

      const topics = await openSealedReview(
        page,
        studentId,
        whiteboardSessionId,
        "pending"
      );

      // First paint. Do not wait for a wrapper to disappear.
      await expect(topics).toHaveValue(DRAFT_TOPICS, { timeout: FIRST_PAINT_MS });
      await expect(formWideWrap(page)).toHaveCount(0, { timeout: FIRST_PAINT_MS });
      await expect(page.getByTestId("tn-note-field-skeleton")).toHaveCount(0, {
        timeout: FIRST_PAINT_MS,
      });
      await expect(topics).toBeEditable({ editable: false, timeout: FIRST_PAINT_MS });
      await expect(page.getByTestId("wb-save-note")).toHaveCount(0, { timeout: FIRST_PAINT_MS });
      await expect(page.getByTestId("tutor-notes-status")).toHaveText(
        "Preparing your notes...",
        { timeout: FIRST_PAINT_MS }
      );
    });

    test("generating note keeps stored topics in the database and clears the box", async ({
      page,
    }) => {
      test.setTimeout(180_000);

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      const stored = JSON.stringify({
        topics: DRAFT_TOPICS,
        assessment: "Solid grasp of basics",
        nextSteps: "Practice mixed problems",
        links: "",
      });
      await seedBlurNote(page, whiteboardSessionId, {
        noteStatus: "generating",
        noteContent: stored,
      });
      await sealWithoutEnqueue(page, whiteboardSessionId);

      const topics = await openSealedReview(
        page,
        studentId,
        whiteboardSessionId,
        "generating"
      );

      const storedRow = await fetchNotesPipelineState(page, whiteboardSessionId);
      expect(storedRow.tutorNoteStatus).toBe("generating");
      expect(storedRow.tutorNoteContent).toContain(DRAFT_TOPICS);

      // Immediate: today's code still shows the previous topics under the form-wide wrap.
      await expect(topics).toHaveValue("", { timeout: FIRST_PAINT_MS });
      await expect(formWideWrap(page)).toHaveCount(0, { timeout: FIRST_PAINT_MS });
      await expectInBoxSkeleton(page, "#wb-note-topics");
      await expect(topics).toBeEditable({ editable: false, timeout: FIRST_PAINT_MS });
      await expect(page.getByTestId("wb-save-note")).toHaveCount(0, { timeout: FIRST_PAINT_MS });
      await expect(page.getByTestId("tutor-notes-status")).toHaveText("Writing notes…", {
        timeout: FIRST_PAINT_MS,
      });
    });

    test("pending and generating with empty content show the in-box skeleton only", async ({
      page,
    }) => {
      test.setTimeout(180_000);

      for (const noteStatus of ["pending", "generating"] as const) {
        const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
        await seedBlurNote(page, whiteboardSessionId, {
          noteStatus,
          noteContent: null,
        });
        await sealWithoutEnqueue(page, whiteboardSessionId);

        const topics = await openSealedReview(
          page,
          studentId,
          whiteboardSessionId,
          noteStatus
        );
        await expect(topics).toHaveValue("", { timeout: FIRST_PAINT_MS });
        await expect(page.getByTestId("tn-note-field-skeleton").first()).toBeVisible({
          timeout: FIRST_PAINT_MS,
        });
        await expect(formWideWrap(page)).toHaveCount(0, { timeout: FIRST_PAINT_MS });
        await expectInBoxSkeleton(page, "#wb-note-topics");
        await expect(topics).toBeEditable({ editable: false, timeout: FIRST_PAINT_MS });
        await expect(page.getByTestId("wb-save-note")).toHaveCount(0, { timeout: FIRST_PAINT_MS });
      }
    });
  }
);

/** Skeleton bars sit inside the entry box, not over the rest of the form. */
async function expectInBoxSkeleton(
  page: import("@playwright/test").Page,
  fieldSelector: string
) {
  const field = page.locator(fieldSelector);
  const skeleton = field.locator("xpath=..").getByTestId("tn-note-field-skeleton");
  await expect(skeleton).toBeVisible({ timeout: FIRST_PAINT_MS });
  const fieldBox = await field.boundingBox();
  const skeletonBox = await skeleton.boundingBox();
  expect(fieldBox, `${fieldSelector} has a box`).not.toBeNull();
  expect(skeletonBox, `${fieldSelector} skeleton has a box`).not.toBeNull();
  expect(skeletonBox!.x).toBeGreaterThanOrEqual(fieldBox!.x - 2);
  expect(skeletonBox!.y).toBeGreaterThanOrEqual(fieldBox!.y - 2);
  expect(skeletonBox!.x + skeletonBox!.width).toBeLessThanOrEqual(
    fieldBox!.x + fieldBox!.width + 2
  );
  expect(skeletonBox!.y + skeletonBox!.height).toBeLessThanOrEqual(
    fieldBox!.y + fieldBox!.height + 2
  );
}
