import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  loginLearnerInContext,
  readEncryptionKeyFromHash,
  seedWbLiveSyncSession,
  waitForTutorStudentConnected,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import { STORAGE_LEARNER_MIC_DEVICE_KEY_PREFIX } from "../../src/lib/recording/storage";
import { TAG } from "../test-tags";

/** Stable fake mic ids injected by {@link installDualMicHarness}. */
export const E6_MIC_A = "e6-persist-mic-a";
export const E6_MIC_B = "e6-persist-mic-b";

/**
 * Patch mediaDevices so enumerateDevices exposes two distinct mics and
 * getUserMedia returns a track whose deviceId matches the requested constraint.
 * Required because Chrome's single fake mic cannot prove slot-1 selection.
 */
export function installDualMicHarness(
  context: import("@playwright/test").BrowserContext
): Promise<void> {
  return context.addInitScript(
    ({ micA, micB }) => {
      function makeAudioTrack(deviceId: string) {
        const groupId = deviceId === micB ? "g-b" : "g-a";
        return {
          kind: "audio",
          enabled: true,
          readyState: "live",
          id: `track-${deviceId}`,
          stop() {
            (this as { readyState: string }).readyState = "ended";
          },
          addEventListener() {},
          removeEventListener() {},
          getSettings() {
            return { deviceId, groupId };
          },
        };
      }

      function makeAudioStream(deviceId: string) {
        const track = makeAudioTrack(deviceId);
        return {
          id: `stream-${deviceId}`,
          active: true,
          getTracks: () => [track],
          getAudioTracks: () => [track],
          getVideoTracks: () => [],
          addEventListener() {},
          removeEventListener() {},
        };
      }

      function pickMicId(constraints: MediaStreamConstraints): string {
        const audio = constraints.audio;
        if (typeof audio === "object" && audio !== null) {
          const groupId = readConstraintString(audio.groupId);
          if (groupId === "g-b") return micB;
          if (groupId === "g-a") return micA;

          const deviceId = readConstraintString(audio.deviceId);
          if (deviceId) return deviceId;
        }
        return micA;
      }

      function readConstraintString(
        value: ConstrainDOMString | undefined
      ): string | null {
        if (!value) return null;
        if (typeof value === "string") return value;
        if (typeof value === "object") {
          if ("exact" in value && value.exact) return String(value.exact);
          if ("ideal" in value && value.ideal) return String(value.ideal);
        }
        return null;
      }

      const md = navigator.mediaDevices;
      const origGUM = md.getUserMedia.bind(md);
      const origEnum = md.enumerateDevices.bind(md);

      md.getUserMedia = async (constraints) => {
        const wantsAudio =
          constraints.audio === true ||
          (typeof constraints.audio === "object" && constraints.audio !== null);
        const wantsVideo =
          constraints.video === true ||
          (typeof constraints.video === "object" && constraints.video !== null);

        if (wantsAudio && !wantsVideo) {
          return makeAudioStream(pickMicId(constraints)) as MediaStream;
        }
        return origGUM(constraints);
      };

      md.enumerateDevices = async () => {
        const real = await origEnum();
        const nonAudio = real.filter((d) => d.kind !== "audioinput");
        return [
          ...nonAudio,
          {
            deviceId: micA,
            label: "E6 Mic A",
            kind: "audioinput",
            groupId: "g-a",
            toJSON() {
              return this;
            },
          },
          {
            deviceId: micB,
            label: "E6 Mic B",
            kind: "audioinput",
            groupId: "g-b",
            toJSON() {
              return this;
            },
          },
        ] as MediaDeviceInfo[];
      };
    },
    { micA: E6_MIC_A, micB: E6_MIC_B }
  );
}

async function openStudentMicPicker(studentPage: import("@playwright/test").Page) {
  const micSettings = studentPage.getByTestId("wb-topbar-mic-settings");
  if (await micSettings.isVisible().catch(() => false)) {
    await micSettings.click();
    return studentPage
      .getByTestId("wb-topbar-mic")
      .getByTestId("audio-device-select");
  }
  return studentPage.getByTestId("audio-device-select").first();
}

/**
 * WS-E E6 / BUG-7 — learner mic choice survives student exit → rejoin.
 *
 * Run: npm run test:wb-playwright -- tests/integration/wb-student-mic-persistence.spec.ts --workers=1
 */
test.describe("student mic persistence (BUG-7)", { tag: [TAG.WB_AV] }, () => {
  test("exit then rejoin — persisted mic device is pre-selected", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();

    const tutorContext = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
      permissions: ["microphone", "camera"],
    });

    const learnerAuthFile = path.join(
      process.cwd(),
      "tests",
      "integration",
      ".auth",
      "learner.json"
    );
    const learnerStorageState = fs.existsSync(learnerAuthFile)
      ? learnerAuthFile
      : undefined;

    const studentContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      permissions: ["microphone", "camera"],
      ...(learnerStorageState ? { storageState: learnerStorageState } : {}),
    });
    await installDualMicHarness(studentContext);
    if (!learnerStorageState) {
      await loginLearnerInContext(
        studentContext,
        session.learnerHandle,
        session.learnerPin
      );
    }

    const tutorPage = await tutorContext.newPage();
    const studentPage = await studentContext.newPage();
    try {
      await tutorPage.goto(
        `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(
        tutorPage.getByTestId("tutor-whiteboard-canvas-mount")
      ).toBeVisible({ timeout: 90_000 });
      await waitForWbE2eBridge(tutorPage, "tutor");

      const encryptionKey = await readEncryptionKeyFromHash(tutorPage);

      await studentPage.goto(
        `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(
        studentPage.getByTestId("student-whiteboard-canvas-mount")
      ).toBeVisible({ timeout: 90_000 });
      await waitForWbE2eBridge(studentPage, "student");

      await waitForTutorStudentConnected(tutorPage);

      const micSelect = await openStudentMicPicker(studentPage);
      await expect(micSelect).toBeVisible({ timeout: 30_000 });
      await expect(micSelect.locator("option")).toHaveCount(2, { timeout: 30_000 });

      // Harness limitation: patched getUserMedia tracks are plain objects — they
      // cannot be re-wrapped in `new MediaStream([track])` inside setMicDeviceBySlot.
      // Selection→persist is covered by Jest; this spec proves rejoin pre-select by
      // seeding the learner-scoped key (as after a real pick) then navigating away/back.
      await studentPage.evaluate(
        ({ prefix, learnerId, micB, grp }) => {
          localStorage.setItem(`${prefix}${learnerId}`, micB);
          localStorage.setItem(`tn-mic-group-id:${learnerId}`, grp);
        },
        {
          prefix: STORAGE_LEARNER_MIC_DEVICE_KEY_PREFIX,
          learnerId: session.learnerProfileId,
          micB: E6_MIC_B,
          grp: "g-b",
        }
      );

      await studentPage.getByTestId("wb-student-exit").click();
      await expect(studentPage.getByRole("status")).toHaveText(
        /you left the session/i,
        { timeout: 15_000 }
      );

      await studentPage.getByTestId("wb-student-rejoin").click();
      await expect(
        studentPage.getByTestId("student-whiteboard-canvas-mount")
      ).toBeVisible({ timeout: 90_000 });
      await waitForWbE2eBridge(studentPage, "student");
      await waitForTutorStudentConnected(tutorPage);

      const micSelectAfterRejoin = await openStudentMicPicker(studentPage);
      await expect(micSelectAfterRejoin).toBeVisible({ timeout: 30_000 });
      await expect(micSelectAfterRejoin).toHaveValue("1", { timeout: 30_000 });

      await expect
        .poll(
          async () =>
            studentPage.evaluate(
              ({ prefix, learnerId }) =>
                localStorage.getItem(`${prefix}${learnerId}`),
              {
                prefix: STORAGE_LEARNER_MIC_DEVICE_KEY_PREFIX,
                learnerId: session.learnerProfileId,
              }
            ),
          { timeout: 10_000 }
        )
        .toBe(E6_MIC_B);
    } finally {
      await tutorContext.close();
      await studentContext.close();
    }
  });
});
