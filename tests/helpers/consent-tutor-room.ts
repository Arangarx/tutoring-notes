/**
 * Consent wave C3b — the tutor's side of a real session for the mic, adoption and device-data rows
 * (A2b, A3, A4, A7, M1–M9, M16, S3, W2, W15, W16). docs/handoff/consent-wave-plan.md § 4.1, § 3.7, § 6.
 *
 * Sessions use the shared harness learner (`seedWbLiveSyncSession`). The family's switches are set the way the
 * product sets them: a NEW ConsentRecord version (the live record that decides while PENDING and that Start
 * refreezes), with the create-time snapshot row matching it. `cleanup()` drops the extra versions so the shared
 * learner ends on its seeded all-on version 1.
 */

import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import {
  dropFamilyConsentVersionsAbove,
  saveFamilyConsentVersion,
  type ConsentSwitches,
} from "./consent-db-oracle";
import { installGetUserMediaSpy, readGetUserMediaSpy, type GetUserMediaMode } from "./get-user-media-spy";
import {
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
  type WbLiveSyncSession,
} from "../integration/whiteboard-live-sync.helpers";

const { assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

export type ConsentRoomSession = WbLiveSyncSession & { cleanup: () => Promise<void> };

/** Seed a session whose family switches are `switches` (unlisted switches on) in both the live record and the snapshot. */
export async function seedConsentSession(opts: {
  switches: Partial<ConsentSwitches>;
  phase?: "PENDING" | "ACTIVE";
  mode?: "LIVE" | "IN_PERSON";
}): Promise<ConsentRoomSession> {
  assertLocalDatabaseUrlForHarness();
  const s = await seedWbLiveSyncSession({ sessionPhase: opts.phase ?? "PENDING", sessionMode: opts.mode ?? "LIVE" });
  await dropFamilyConsentVersionsAbove(s.learnerProfileId, s.adminUserId, 1);
  await setFamilySwitches(s, opts.switches);
  return {
    ...s,
    cleanup: () => dropFamilyConsentVersionsAbove(s.learnerProfileId, s.adminUserId, 1),
  };
}

/** The family saves new switches: a new live record version, and the session snapshot follows it. */
export async function setFamilySwitches(
  s: WbLiveSyncSession,
  switches: Partial<ConsentSwitches>,
  opts?: { snapshot?: boolean }
): Promise<void> {
  const record = await saveFamilyConsentVersion(s.learnerProfileId, s.adminUserId, switches);
  if (opts?.snapshot === false) return;
  const prisma = new PrismaClient();
  try {
    await prisma.sessionConsentSnapshot.update({
      where: { whiteboardSessionId: s.whiteboardSessionId },
      data: {
        allowLiveSession: switches.allowLiveSession ?? true,
        allowAudioRecording: switches.allowAudioRecording ?? true,
        allowWhiteboardRecording: switches.allowWhiteboardRecording ?? true,
        allowNoteSending: switches.allowNoteSending ?? true,
        consentRecordId: record.id,
        consentRecordVersion: record.version,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export type TutorRoom = {
  context: BrowserContext;
  page: Page;
  /** Every console line the tutor page printed, in order. */
  consoleLines: string[];
  close: () => Promise<void>;
};

export function workspaceUrl(s: Pick<WbLiveSyncSession, "studentId" | "whiteboardSessionId">): string {
  return `/admin/students/${s.studentId}/whiteboard/${s.whiteboardSessionId}/workspace`;
}

/** Open the tutor workspace with the `getUserMedia` spy installed before any page script runs. */
export async function openTutorRoom(
  browser: Browser,
  s: Pick<WbLiveSyncSession, "studentId" | "whiteboardSessionId">,
  opts?: { spy?: GetUserMediaMode; permissions?: string[]; prepare?: (ctx: BrowserContext, page: Page) => Promise<void> }
): Promise<TutorRoom> {
  const context = await browser.newContext({
    storageState: "tests/integration/.auth/tutor.json",
    viewport: { width: 1280, height: 1000 },
    permissions: opts?.permissions ?? ["microphone", "camera"],
  });
  await installGetUserMediaSpy(context, opts?.spy ?? "passthrough");
  const page = await context.newPage();
  const consoleLines: string[] = [];
  page.on("console", (m) => consoleLines.push(m.text()));
  if (opts?.prepare) await opts.prepare(context, page);
  await page.goto(workspaceUrl(s), { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({ timeout: 90_000 });
  await waitForWbE2eBridge(page, "tutor");
  return { context, page, consoleLines, close: () => context.close() };
}

/** Pick online / in person in the waiting room (the tutor's explicit choice). */
export async function chooseMode(page: Page, mode: "LIVE" | "IN_PERSON"): Promise<void> {
  await page.getByTestId(mode === "LIVE" ? "wb-session-mode-live" : "wb-session-mode-in-person").click();
  await expect(page.getByTestId("wb-waiting-overlay")).toHaveAttribute("data-session-mode", mode);
}

export async function startFromWaitingRoom(page: Page): Promise<void> {
  const start = page.getByTestId("wb-start-session");
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await expect(page.getByTestId("wb-waiting-overlay")).not.toBeVisible({ timeout: 60_000 });
}

export async function endFromWorkspace(page: Page): Promise<void> {
  await page.getByTestId("wb-end-session").click();
  const confirm = page.getByTestId("wb-end-session-confirm-yes");
  if (await confirm.isVisible({ timeout: 5_000 }).catch(() => false)) await confirm.click();
  await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({ timeout: 120_000 });
}

/** Number of `getUserMedia` calls that asked for audio (the browser's own API, counted by the spy). */
export async function audioRequests(page: Page): Promise<number> {
  return (await readGetUserMediaSpy(page)).audioCalls;
}

/** `[avx] action=mic_request_blocked reason=<r>` lines the page printed. */
export function micBlockedLines(lines: readonly string[], reason?: "defer" | "no"): string[] {
  return lines.filter(
    (l) => l.includes("[avx]") && l.includes("action=mic_request_blocked") && (!reason || l.includes(`reason=${reason}`))
  );
}

/**
 * The on-device whiteboard checkpoint store, read and written through the browser's own IndexedDB API (independent of
 * the app's checkpoint module). Schema literals are the stored format: DB `tutoring-notes-checkpoints` v1, store
 * `checkpoints`, key `whiteboard:wb:<adminUserId>:<studentId>:<sessionId>`.
 */
export type DeviceCheckpoint = { adminUserId: string; studentId: string; sessionId: string };

export const checkpointKey = (c: DeviceCheckpoint) => `whiteboard:wb:${c.adminUserId}:${c.studentId}:${c.sessionId}`;

export async function readCheckpointKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open("tutoring-notes-checkpoints");
        // Never create the database from the test: an empty v1 would stop the app from creating its store.
        let created = false;
        open.onupgradeneeded = () => {
          created = true;
          open.transaction?.abort();
        };
        open.onerror = () => (created ? resolve([]) : reject(open.error));
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("checkpoints")) {
            db.close();
            return resolve([]);
          }
          const req = db.transaction("checkpoints", "readonly").objectStore("checkpoints").getAllKeys();
          req.onsuccess = () => {
            db.close();
            resolve((req.result as IDBValidKey[]).map(String));
          };
          req.onerror = () => reject(req.error);
        };
      })
  );
}

/** Write a leftover checkpoint row the way the recorder stores one (the store exists once the workspace mounted). */
export async function seedCheckpointRow(page: Page, c: DeviceCheckpoint): Promise<void> {
  await page.evaluate(
    ({ c, key }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("tutoring-notes-checkpoints");
        open.onerror = () => reject(open.error);
        open.onupgradeneeded = () => open.transaction?.abort();
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("checkpoints")) {
            db.close();
            return reject(new Error("checkpoint store not created yet (workspace has not opened it)"));
          }
          const tx = db.transaction("checkpoints", "readwrite");
          const now = new Date().toISOString();
          tx.objectStore("checkpoints").put({
            key,
            kind: "whiteboard",
            sessionId: c.sessionId,
            adminUserId: c.adminUserId,
            studentId: c.studentId,
            startedAt: now,
            updatedAt: now,
            schemaVersion: 1,
            payload: { events: [] },
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { c, key: checkpointKey(c) }
  );
}

/** The per-tab scene draft keys (`sessionStorage`) the workspace writes for a session. */
export const sceneDraftKeys = (sessionId: string) => [
  `wn_wb_session_elements_v1:${sessionId}`,
  `wn_wb_session_board_v1:${sessionId}`,
];

export async function readSceneDraftKeys(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Object.keys(sessionStorage).filter((k) => k.startsWith("wn_wb_session_elements_v1:") || k.startsWith("wn_wb_session_board_v1:"))
  );
}

/** Learner-lane recorder creations on the tutor (`[psc] … action=create`). */
export function laneCreateLines(lines: readonly string[]): string[] {
  return lines.filter((l) => l.startsWith("[psc]") && l.includes("action=create "));
}
