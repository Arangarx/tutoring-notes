/**
 * Playwright spec — End-session wind-down (smoke-end-winddown).
 *
 * Spec under test:
 *   1. Board-ending overlay — visible on tutor immediately when End is confirmed
 *      (before finalization completes); blocks interaction (data-testid target).
 *   2. Immediate student wind-down via relay signal — student sees "Session has
 *      ended" overlay WITHOUT waiting solely for the join-timer poll (~3.5 s).
 *      Oracle: overlay appears within 2 s of tutor confirm, independent of poll.
 *   3. Board not drawable during Finalizing — tutor overlay is present while
 *      endingState !== "idle".
 *
 * Independent oracle: the overlay's DOM presence is the spec requirement; we do
 * NOT derive timing constants from the implementation (poll interval). The 2 s
 * budget is shorter than the 3.5 s poll interval, so any test that passes only
 * because the poll fired would fail this assertion.
 *
 * Project:  wb-regression (two-browser relay harness)
 * Tags:     @wb-presence, @wb-recording
 * Run:      npx playwright test tests/integration/wb-end-winddown.spec.ts --project=wb-regression
 */

import { test, expect } from "@playwright/test";
import {
  openTutorAndStudent,
  seedWbLiveSyncSession,
  waitForTutorStudentConnected,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

test.describe(
  "End-session wind-down — board disarm + immediate student overlay",
  { tag: [TAG.WB_PRESENCE, TAG.WB_RECORDING] },
  () => {
    test(
      "tutor board gets ending overlay immediately on End confirm (before finalize)",
      { tag: [TAG.WB_CHROME] },
      async ({ browser }) => {
        test.setTimeout(180_000);

        const session = await seedWbLiveSyncSession();
        const peers = await openTutorAndStudent(browser, session);
        try {
          await waitForTutorStudentConnected(peers.tutorPage);

          // Confirm End on the tutor side.
          const endCta = peers.tutorPage.getByTestId("wb-end-session");
          await expect(endCta).toBeVisible({ timeout: 15_000 });
          await endCta.click();

          const confirmYes = peers.tutorPage.getByTestId("wb-end-session-confirm-yes");
          await expect(confirmYes).toBeVisible({ timeout: 5_000 });
          await confirmYes.click();

          // Board-ending overlay must appear immediately (within 2 s, well before
          // the 3.5 s poll and the full finalization pipeline).
          await expect(
            peers.tutorPage.getByTestId("wb-board-ending-overlay")
          ).toBeVisible({ timeout: 2_000 });
        } finally {
          await peers.close();
        }
      }
    );

    test(
      "student sees 'Session has ended' via relay signal without waiting for join-timer poll",
      async ({ browser }) => {
        test.setTimeout(180_000);

        const session = await seedWbLiveSyncSession();
        const peers = await openTutorAndStudent(browser, session);
        try {
          await waitForTutorStudentConnected(peers.tutorPage);

          // Confirm End on the tutor side.
          const endCta = peers.tutorPage.getByTestId("wb-end-session");
          await expect(endCta).toBeVisible({ timeout: 15_000 });
          await endCta.click();

          const confirmYes = peers.tutorPage.getByTestId("wb-end-session-confirm-yes");
          await expect(confirmYes).toBeVisible({ timeout: 5_000 });
          await confirmYes.click();

          // Student must see the "Session has ended" overlay within 2 s of the
          // tutor clicking confirm. The join-timer poll fires at ~3.5 s; if the
          // test passes only via the poll, it would take > 3.5 s and fail here.
          //
          // Oracle: wb-student-join-unavailable-close button is rendered by the
          // joinUnavailableReason === "session_ended" branch (not the poll path).
          await expect(
            peers.studentPage.getByTestId("wb-student-join-unavailable-close")
          ).toBeVisible({ timeout: 2_000 });
        } finally {
          await peers.close();
        }
      }
    );

    test(
      "student A/V stops promptly — tutor's A/V disconnects when student overlay appears",
      async ({ browser }) => {
        test.setTimeout(180_000);

        const session = await seedWbLiveSyncSession();
        const peers = await openTutorAndStudent(browser, session);
        try {
          await waitForTutorStudentConnected(peers.tutorPage);

          // Confirm End — the sync relay should drive both wind-downs.
          const endCta = peers.tutorPage.getByTestId("wb-end-session");
          await expect(endCta).toBeVisible({ timeout: 15_000 });
          await endCta.click();
          await peers.tutorPage.getByTestId("wb-end-session-confirm-yes").click();

          // Student canvas mount disappears once joinUnavailableReason is set
          // (the full-screen "Session has ended" overlay replaces it).
          await expect(
            peers.studentPage.getByTestId("student-whiteboard-canvas-mount")
          ).not.toBeVisible({ timeout: 5_000 });

          // The tutor's sync pill for the student disappears promptly too,
          // because the student's sync client disconnects on overlay.
          await expect(
            peers.tutorPage.getByTestId("wb-sync-pill")
          ).not.toBeVisible({ timeout: 10_000 });
        } finally {
          await peers.close();
        }
      }
    );
  }
);
