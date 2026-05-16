import { test as authedTest } from "./fixtures";
import { expect } from "@playwright/test";
import {
  seedTestAdmin,
  seedTestStudent,
  seedOpenWhiteboardSession,
} from "../visual/helpers";

/**
 * Live-A/V Phase 4d regression canaries — Playwright integration.
 *
 * Goal of this file: lock in three observable behaviours that pilot
 * smoke caught and 4d fixed, in a way that's deterministic enough to
 * run in CI WITHOUT depending on a real WebRTC sync server (the
 * existing group-session-presence.spec.ts already covers the
 * sync-gated 2-peer happy path). Scenarios chosen to maximise
 * regression coverage / minimise rabbit-hole risk.
 *
 * Scenarios:
 *
 *   1. **Stable localPeerId across reload** (4d Commit 4). Workspace
 *      mounts → reads `sessionStorage[wb-peerid:<sessionId>]` →
 *      reload → assert the SAME id persists. Prevents the
 *      duplicate-tile-on-reload regression by construction (the
 *      peerId is the cause; with a stable id, the presence layer
 *      sees the reload as the same human, not a new peer).
 *
 *   2. **Permissions-Policy site-wide is permissive** (4c hotfix #2,
 *      4d non-regression contract). Workspace HTTP response header
 *      MUST allow camera + microphone — otherwise Next.js server-
 *      action redirects from the dashboard would inherit the
 *      source page's tight policy and the browser would block
 *      `getUserMedia({video: true})` with "camera is not allowed in
 *      this document". This is the symptom that drove Sarah's
 *      "I have to hard refresh EVERY page" complaint pre-4c.
 *
 *   3. **Audio-flow gate UI is observable** (4d Commit 6). Workspace
 *      mounts alone (no student) → if soloEnabled is OFF (sync
 *      mode), the recording pill shows the "Waiting for student"
 *      copy from `awaiting_first_participant`. We assert the pill
 *      renders SOMEthing in the FSM-driven copy space rather than
 *      crashing or hanging — the actual audio-flow gate copy
 *      requires a real WebRTC student to fire, which the existing
 *      sync-gated 2-peer test covers.
 *
 * Why not test the full audio-flow gate with a real student here?
 * That would require:
 *   - A live `WHITEBOARD_SYNC_URL` (already an env-gated dependency).
 *   - A controllable way to delay the student's audio track from
 *     flowing (Chrome's `--use-fake-device-for-media-stream` flag
 *     produces audio immediately, so the gate never fires).
 *   - Coordination across two browser contexts — already exercised
 *     by `group-session-presence.spec.ts`.
 *
 * The Jest tests for `useAudioFlowConfirmation` and the FSM cover
 * the gate's logic deterministically; the real-browser confirmation
 * is the cross-browser smoke checklist in PHASE-4D-STATUS.md.
 */

authedTest.describe("Live-A/V Phase 4d regression canaries", () => {
  authedTest(
    "4d Commit 4 regression: localPeerId persists across reload (no duplicate tile)",
    async ({ page }) => {
      authedTest.setTimeout(120_000);

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

      // The workspace's localPeerId effect runs on mount and writes
      // to sessionStorage. Wait briefly for that to land.
      const sessionKey = `wb-peerid:${whiteboardSessionId}`;
      await page.waitForFunction(
        (key) => sessionStorage.getItem(key) !== null,
        sessionKey,
        { timeout: 10_000 }
      );

      const peerIdBefore = await page.evaluate(
        (key) => sessionStorage.getItem(key),
        sessionKey
      );
      expect(peerIdBefore).toBeTruthy();
      expect(peerIdBefore).toMatch(/^tutor-/);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(
        page.getByTestId("tutor-whiteboard-canvas-mount")
      ).toBeVisible({ timeout: 90_000 });

      await page.waitForFunction(
        (key) => sessionStorage.getItem(key) !== null,
        sessionKey,
        { timeout: 10_000 }
      );
      const peerIdAfter = await page.evaluate(
        (key) => sessionStorage.getItem(key),
        sessionKey
      );
      expect(peerIdAfter).toBe(peerIdBefore);
    }
  );

  authedTest(
    "4c hotfix #2 non-regression: workspace response permits camera+microphone site-wide",
    async ({ page }) => {
      authedTest.setTimeout(60_000);

      const adminUserId = await seedTestAdmin();
      const { studentId } = await seedTestStudent(adminUserId);
      const whiteboardSessionId = await seedOpenWhiteboardSession({
        adminUserId,
        studentId,
      });

      const response = await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      expect(response, "workspace navigation returned no response").not.toBeNull();
      const headers = response!.headers();

      // The header name is case-insensitive; Playwright lowercases.
      const policy = headers["permissions-policy"];
      expect(
        policy,
        "Permissions-Policy header must be present on every document — 4c hotfix #2"
      ).toBeTruthy();

      // The policy MUST allow camera + microphone (either as `*` or
      // `self`). It MUST NOT be the empty-list form `camera=()` /
      // `microphone=()` — that's what blocked getUserMedia after the
      // server-action redirect.
      expect(
        policy,
        `Permissions-Policy must allow camera; got ${policy}`
      ).not.toMatch(/camera=\(\)/);
      expect(
        policy,
        `Permissions-Policy must allow microphone; got ${policy}`
      ).not.toMatch(/microphone=\(\)/);
    }
  );

  authedTest(
    "4d FSM smoke: workspace renders without crash and recording pill is FSM-driven",
    async ({ page }) => {
      authedTest.setTimeout(120_000);

      const adminUserId = await seedTestAdmin();
      const { studentId } = await seedTestStudent(adminUserId);
      const whiteboardSessionId = await seedOpenWhiteboardSession({
        adminUserId,
        studentId,
      });

      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(
        page.getByTestId("tutor-whiteboard-canvas-mount")
      ).toBeVisible({ timeout: 90_000 });

      // FSM pill is always present (state copy varies by mode).
      await expect(page.getByTestId("wb-recording-pill")).toBeVisible({
        timeout: 30_000,
      });

      // Audio-flow gate copy is reachable from the FSM but only
      // fires when there's a participant whose audio hasn't started.
      // No participant here → assert the pill does NOT erroneously
      // show "Waiting for audio…" (that copy is specifically for
      // the audio-flow-gate case, which requires a present peer).
      const pillText = await page
        .getByTestId("wb-recording-pill")
        .innerText();
      expect(pillText, "no participant → no audio-flow-gate copy").not.toMatch(
        /Waiting for audio/i
      );

      // Page should never have crashed to an error boundary.
      await page.waitForTimeout(2_000);
      expect(errors).toEqual([]);
    }
  );
});
