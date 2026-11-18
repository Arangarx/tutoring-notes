/**
 * WB-STUDENT-APPLY-OVERLAP + WB-STUDENT-FLUSH-IMAGE-ASSETURL — follow-ups to
 * WB-STUDENT-APPLY-RACE (`wb-student-apply-race.spec.ts`), same hold seam
 * (`window.__WBX_STUDENT_APPLY_HOLD__`, `src/lib/whiteboard/e2e-student-apply-hold.ts`).
 *
 * OVERLAP: tutor apply #1 ends with a viewport-align window (H2) that outlives
 * its own apply. When tutor apply #2 starts before #1's align finishes, #1's
 * release must not reopen the student's edit path while #2 is still in flight.
 * Spec: an edit the student makes while apply #2 is in flight is held until
 * that apply is over (nothing is broadcast mid-window, so the student never
 * sends a half-applied scene back to the tutor), then it survives and reaches
 * the tutor exactly once.
 *
 * IMAGE-ASSETURL: a native image (Excalidraw's own paste/tool: binary in
 * BinaryFiles, no `customData.assetUrl`) placed by the student, with or without
 * a held apply window, must reach the tutor with an asset URL and a binary, not
 * as an unloadable placeholder. The signed-in `/join/[sessionId]` student has no
 * path join token; the workspace's back-fill used to bail out on that, so no
 * student native image ever got an asset URL (I0 is the no-hold control).
 * The post-apply flush's own missing back-fill call (BACKLOG
 * WB-STUDENT-FLUSH-IMAGE-ASSETURL) is masked by the next canvas change, which
 * lands within a tutor apply or two, so Playwright cannot see it red.
 *
 * Oracles: student broadcast log lines (`[student-broadcast] ... reason=`) for
 * "nothing sent mid-window", and peer scene state through the E2E bridge.
 *
 * Gate: npx playwright test --project=wb-regression tests/integration/wb-student-apply-overlap.spec.ts --workers=1 --reporter=line
 */

import path from "path";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { blobIntegrationEnabled, blobIntegrationSkipMessage } from "../helpers/blob-gate";
import {
  drawTestStrokeOnRole,
  insertNativeImageOnRole,
  openTutorAndStudent,
  readImageElementState,
  readSceneElementIds,
  seedWbLiveSyncSession,
  waitForElementOnPeer,
} from "./whiteboard-live-sync.helpers";
import {
  armAndParkStudentApply,
  arm,
  forceNextStudentApply,
  parkedTotal,
  release,
  studentUndo,
  waitForHoldApi,
} from "./wb-student-apply-hold.helpers";
import { TAG } from "../test-tags";

/** Counts every student broadcast the hook logs, whatever its `reason=`. */
function attachStudentBroadcastCounter(page: Page): { total: () => number } {
  let total = 0;
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[student-broadcast]") && text.includes("action=broadcast-v2")) {
      total += 1;
    }
  });
  return { total: () => total };
}

/** The tutor holds the image with an asset URL and has hydrated its binary. */
async function expectTutorImageLoaded(tutorPage: Page, imageId: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const s = await readImageElementState(tutorPage, "tutor", imageId);
        return { assetUrl: Boolean(s?.assetUrl), hasBinary: s?.hasBinary === true };
      },
      { timeout: 30_000, message: "tutor image has an asset URL and its binary" }
    )
    .toEqual({ assetUrl: true, hasBinary: true });
}

/**
 * Tutor apply #1 parks in its viewport-align window (H2); tutor apply #2 then
 * parks before its hydrate (H1); #1's align finishes while #2 is still in
 * flight. Returns once that state is reached, with H1 still holding apply #2.
 */
async function openOverlappingApplyWindows(
  tutorPage: Page,
  studentPage: Page,
  tag: string
): Promise<void> {
  await armAndParkStudentApply(tutorPage, studentPage, ["H2"], "H2", `ovl-a-${tag}`);

  const h1Before = await parkedTotal(studentPage, "H1");
  await arm(studentPage, "H1");
  await drawTestStrokeOnRole(tutorPage, "tutor", `ovl-b-${tag}`, 420, 120, 500, 160);
  await expect
    .poll(() => parkedTotal(studentPage, "H1"), {
      timeout: 15_000,
      message: "second tutor apply parked at H1 while the first align window is open",
    })
    .toBeGreaterThan(h1Before);

  // The first apply's viewport window ends mid-way through the second apply.
  await release(studentPage, "H2");
  await studentPage.waitForTimeout(300);
}

test.describe("WB-STUDENT-APPLY-OVERLAP — student edits during overlapping tutor applies", () => {
  test.setTimeout(240_000);

  test(
    "O1 — stroke drawn while a second tutor apply is in flight (first apply's align just ended) is held, not broadcast mid-apply, and reaches the tutor",
    { tag: [TAG.WB_STROKES, TAG.WB_SYNC] },
    async ({ browser }) => {
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      const student = peers.studentPage;
      try {
        await waitForHoldApi(student);
        const broadcasts = attachStudentBroadcastCounter(student);
        const tag = `o1-${Date.now()}`;
        await openOverlappingApplyWindows(peers.tutorPage, student, tag);

        const sentBefore = broadcasts.total();
        const strokeId = `student-${tag}`;
        await drawTestStrokeOnRole(student, "student", strokeId, 60, 60, 160, 120);
        await student.waitForTimeout(500);
        expect(await readSceneElementIds(student, "student")).toContain(strokeId);
        expect(
          broadcasts.total() - sentBefore,
          "student broadcasts nothing while the second tutor apply is still in flight"
        ).toBe(0);

        await release(student, "H1", "H2");
        await forceNextStudentApply(peers.tutorPage, student, `ovl-c-${tag}`);

        const studentIds = await readSceneElementIds(student, "student");
        expect(studentIds, "student stroke survives the overlapping applies").toContain(
          strokeId
        );
        for (const id of [`ovl-a-${tag}`, `ovl-b-${tag}`, `ovl-c-${tag}`]) {
          expect(studentIds, `tutor stroke ${id} applied on the student`).toContain(id);
        }
        await waitForElementOnPeer(peers.tutorPage, "tutor", strokeId, 15_000);
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "O2 — student undo while a second tutor apply is in flight (first apply's align just ended) is held, not broadcast mid-apply, and is not resurrected",
    { tag: [TAG.WB_STROKES, TAG.WB_SYNC] },
    async ({ browser }) => {
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      const student = peers.studentPage;
      try {
        await waitForHoldApi(student);
        const broadcasts = attachStudentBroadcastCounter(student);
        const tag = `o2-${Date.now()}`;
        const strokeId = `student-${tag}`;
        await drawTestStrokeOnRole(student, "student", strokeId, 60, 60, 160, 120);
        await waitForElementOnPeer(peers.tutorPage, "tutor", strokeId, 15_000);

        await openOverlappingApplyWindows(peers.tutorPage, student, tag);
        const sentBefore = broadcasts.total();
        await studentUndo(student);
        await student.waitForTimeout(500);
        expect(await readSceneElementIds(student, "student")).not.toContain(strokeId);
        expect(
          broadcasts.total() - sentBefore,
          "student broadcasts nothing while the second tutor apply is still in flight"
        ).toBe(0);

        await release(student, "H1", "H2");
        await forceNextStudentApply(peers.tutorPage, student, `ovl-c-${tag}`);

        expect(
          await readSceneElementIds(student, "student"),
          "undone stroke stays gone on the student"
        ).not.toContain(strokeId);
        await expect
          .poll(() => readSceneElementIds(peers.tutorPage, "tutor"), {
            timeout: 15_000,
            message: "undone stroke removed on the tutor",
          })
          .not.toContain(strokeId);
      } finally {
        await peers.close();
      }
    }
  );
});

test.describe("WB-STUDENT-FLUSH-IMAGE-ASSETURL — native image committed by the post-apply flush", () => {
  test.setTimeout(240_000);

  test(
    "I0 (control, no hold) — native image placed by the student outside any apply window reaches the tutor with an asset URL and a binary",
    { tag: [TAG.WB_ASSETS, TAG.WB_SYNC] },
    async ({ browser }) => {
      // Positive control for I1: proves the harness upload + back-fill + hydrate
      // chain works, so an I1 failure is the held-apply path, not the harness.
      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const pngPath = path.join(__dirname, "../fixtures/tiny-red-square.png");
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        const imageId = await insertNativeImageOnRole(peers.studentPage, "student", pngPath);
        await waitForElementOnPeer(peers.tutorPage, "tutor", imageId, 15_000);
        await expectTutorImageLoaded(peers.tutorPage, imageId);
      } finally {
        await peers.close();
      }
    }
  );

  for (const hold of ["H1", "H2"] as const) {
    test(
      `I1 (${hold}) — native image placed by the student inside a held tutor apply reaches the tutor with an asset URL and a binary`,
      { tag: [TAG.WB_ASSETS, TAG.WB_SYNC] },
      async ({ browser }) => {
        test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

        const pngPath = path.join(__dirname, "../fixtures/tiny-red-square.png");
        const session = await seedWbLiveSyncSession();
        const peers = await openTutorAndStudent(browser, session);
        const student = peers.studentPage;
        try {
          await waitForHoldApi(student);
          const tag = `i1-${hold.toLowerCase()}-${Date.now()}`;
          await armAndParkStudentApply(
            peers.tutorPage,
            student,
            hold === "H1" ? ["H1", "H2"] : ["H2"],
            hold,
            `race-a-${tag}`
          );

          const imageId = await insertNativeImageOnRole(student, "student", pngPath);
          expect(await readSceneElementIds(student, "student")).toContain(imageId);

          await release(student, "H1", "H2");
          await forceNextStudentApply(peers.tutorPage, student, `race-b-${tag}`);

          await waitForElementOnPeer(peers.tutorPage, "tutor", imageId, 15_000);
          await expectTutorImageLoaded(peers.tutorPage, imageId);
        } finally {
          await peers.close();
        }
      }
    );
  }
});
