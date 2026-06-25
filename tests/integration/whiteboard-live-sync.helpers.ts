import { expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  seedTestAdmin,
  seedTestStudent,
  seedOpenWhiteboardSession,
} from "../visual/helpers";
import {
  followWireFromTutorAppState,
  studentScrollFromFollowCenter,
  viewportSceneCenterFromScroll,
} from "../../src/lib/whiteboard/viewport-align";

/** Screen-pixel tolerance for viewport center / PDF fit (owner: 16px). */
export const WB_VIEWPORT_CENTER_PASS_TOLERANCE_PX = 16;

/** Scene-unit tolerance for zoom-invariant center (independent oracle). */
export const WB_ZOOM_INVARIANT_CENTER_TOLERANCE_SCENE = 4;

/** Scene-unit tolerance for live MOVE propagation. */
export const WB_MOVE_PROPAGATION_TOLERANCE_SCENE = 2;

export type WbLiveSyncSession = {
  adminUserId: string;
  studentId: string;
  whiteboardSessionId: string;
  joinToken: string;
};

export async function seedWbLiveSyncSession(): Promise<WbLiveSyncSession> {
  const adminUserId = await seedTestAdmin();
  const { studentId } = await seedTestStudent(adminUserId);
  const whiteboardSessionId = await seedOpenWhiteboardSession({
    adminUserId,
    studentId,
  });

  const prisma = new PrismaClient();
  let joinToken: string;
  try {
    const row = await prisma.whiteboardJoinToken.create({
      data: {
        whiteboardSessionId,
        token: `pw-wb-live-${whiteboardSessionId.slice(0, 8)}-${Date.now()}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      select: { token: true },
    });
    joinToken = row.token;
  } finally {
    await prisma.$disconnect();
  }

  return { adminUserId, studentId, whiteboardSessionId, joinToken };
}

export async function waitForWbE2eBridge(
  page: Page,
  role: "tutor" | "student",
  timeoutMs = 90_000
): Promise<void> {
  await page.waitForFunction(
    (r) => {
      const w = window as Window & {
        __TN_WB_E2E__?: Record<string, { getElements?: () => unknown }>;
      };
      return Boolean(w.__TN_WB_E2E__?.[r]?.getElements);
    },
    role,
    { timeout: timeoutMs }
  );
}

export async function readSceneElementIds(page: Page, role: "tutor" | "student") {
  return page.evaluate((r) => {
    const bridge = (
      window as Window & {
        __TN_WB_E2E__?: Record<
          string,
          { getElements: () => Array<{ id: string }> }
        >;
      }
    ).__TN_WB_E2E__?.[r];
    if (!bridge?.getElements) return [] as string[];
    return bridge.getElements().map((e) => e.id);
  }, role);
}

export async function drawTestStrokeOnRole(
  page: Page,
  role: "tutor" | "student",
  strokeId: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): Promise<void> {
  await page.evaluate(
    ({ r, id, a, b, c, d }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            {
              drawTestStroke: (
                id: string,
                x1: number,
                y1: number,
                x2: number,
                y2: number
              ) => void;
            }
          >;
        }
      ).__TN_WB_E2E__?.[r];
      if (!bridge?.drawTestStroke) {
        throw new Error(`E2E bridge missing drawTestStroke for ${r}`);
      }
      bridge.drawTestStroke(id, a, b, c, d);
    },
    { r: role, id: strokeId, a: x1, b: y1, c: x2, d: y2 }
  );
}

export async function growStrokeOnRole(
  page: Page,
  role: "tutor" | "student",
  strokeId: string,
  width: number,
  version: number
): Promise<void> {
  await page.evaluate(
    ({ r, id, w, v }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            { growStroke: (id: string, w: number, v: number) => void }
          >;
        }
      ).__TN_WB_E2E__?.[r];
      if (!bridge?.growStroke) {
        throw new Error(`E2E bridge missing growStroke for ${r}`);
      }
      bridge.growStroke(id, w, v);
    },
    { r: role, id: strokeId, w: width, v: version }
  );
}

export async function readStrokeWidth(
  page: Page,
  role: "tutor" | "student",
  strokeId: string
): Promise<number> {
  return page.evaluate(
    ({ r, id }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<string, { widthOf: (id: string) => number }>;
        }
      ).__TN_WB_E2E__?.[r];
      return bridge?.widthOf ? bridge.widthOf(id) : -1;
    },
    { r: role, id: strokeId }
  );
}

export async function placeMarkerAtViewportCenter(
  page: Page,
  role: "tutor" | "student",
  markerId: string
): Promise<void> {
  await page.evaluate(
    ({ r, id }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            { placeMarkerAtViewportCenter: (id: string) => void }
          >;
        }
      ).__TN_WB_E2E__?.[r];
      if (!bridge?.placeMarkerAtViewportCenter) {
        throw new Error(`E2E bridge missing placeMarkerAtViewportCenter for ${r}`);
      }
      bridge.placeMarkerAtViewportCenter(id);
    },
    { r: role, id: markerId }
  );
}

export async function moveElementOnRole(
  page: Page,
  role: "tutor" | "student",
  elementId: string,
  deltaX: number,
  deltaY: number
): Promise<void> {
  await page.evaluate(
    ({ r, id, dx, dy }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            {
              moveElement: (
                id: string,
                deltaX: number,
                deltaY: number
              ) => void;
            }
          >;
        }
      ).__TN_WB_E2E__?.[r];
      if (!bridge?.moveElement) {
        throw new Error(`E2E bridge missing moveElement for ${r}`);
      }
      bridge.moveElement(id, dx, dy);
    },
    { r: role, id: elementId, dx: deltaX, dy: deltaY }
  );
}

export async function readElementPosition(
  page: Page,
  role: "tutor" | "student",
  elementId: string
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(
    ({ r, id }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            {
              elementPosition: (
                id: string
              ) => { x: number; y: number } | null;
            }
          >;
        }
      ).__TN_WB_E2E__?.[r];
      return bridge?.elementPosition ? bridge.elementPosition(id) : null;
    },
    { r: role, id: elementId }
  );
}

export async function readAppStateCenterXY(
  page: Page,
  role: "tutor" | "student"
): Promise<{ x: number; y: number }> {
  return page.evaluate((r) => {
    const bridge = (
      window as Window & {
        __TN_WB_E2E__?: Record<
          string,
          { appStateCenterXY: () => { x: number; y: number } }
        >;
      }
    ).__TN_WB_E2E__?.[r];
    if (!bridge?.appStateCenterXY) {
      throw new Error(`E2E bridge missing appStateCenterXY for ${r}`);
    }
    return bridge.appStateCenterXY();
  }, role);
}

export async function setViewportOnRole(
  page: Page,
  role: "tutor" | "student",
  scrollX: number,
  scrollY: number,
  zoom?: number
): Promise<void> {
  await page.evaluate(
    ({ r, sx, sy, z }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            {
              setViewport: (
                scrollX: number,
                scrollY: number,
                zoom?: number
              ) => void;
            }
          >;
        }
      ).__TN_WB_E2E__?.[r];
      if (!bridge?.setViewport) {
        throw new Error(`E2E bridge missing setViewport for ${r}`);
      }
      bridge.setViewport(sx, sy, z);
    },
    { r: role, sx: scrollX, sy: scrollY, z: zoom }
  );
}

export async function waitForElementOnPeer(
  page: Page,
  role: "tutor" | "student",
  elementId: string,
  timeoutMs = 45_000
): Promise<void> {
  await page.waitForFunction(
    ({ r, id }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            { getElements: () => Array<{ id: string }> }
          >;
        }
      ).__TN_WB_E2E__?.[r];
      if (!bridge?.getElements) return false;
      return bridge.getElements().some((e) => e.id === id);
    },
    { r: role, id: elementId },
    { timeout: timeoutMs }
  );
}

export async function waitForStrokeWidthAtLeast(
  page: Page,
  role: "tutor" | "student",
  strokeId: string,
  minWidth: number,
  timeoutMs = 12_000
): Promise<void> {
  await page.waitForFunction(
    ({ r, id, minW }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<string, { widthOf: (id: string) => number }>;
        }
      ).__TN_WB_E2E__?.[r];
      if (!bridge?.widthOf) return false;
      return bridge.widthOf(id) >= minW - 1;
    },
    { r: role, id: strokeId, minW: minWidth },
    { timeout: timeoutMs }
  );
}

export async function waitForViewportAligned(
  page: Page,
  role: "tutor" | "student",
  expectedScrollX: number,
  expectedScrollY: number,
  toleranceUnits = 8,
  timeoutMs = 12_000
): Promise<void> {
  await page.waitForFunction(
    ({ r, ex, ey, tol }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<string, { getAppState: () => Record<string, unknown> }>;
        }
      ).__TN_WB_E2E__?.[r];
      if (!bridge?.getAppState) return false;
      const st = bridge.getAppState();
      const scrollX = Number(st.scrollX) || 0;
      const scrollY = Number(st.scrollY) || 0;
      return (
        Math.abs(scrollX - ex) <= tol && Math.abs(scrollY - ey) <= tol
      );
    },
    {
      r: role,
      ex: expectedScrollX,
      ey: expectedScrollY,
      tol: toleranceUnits,
    },
    { timeout: timeoutMs }
  );
}

export async function waitForSceneElementIdsContaining(
  page: Page,
  role: "tutor" | "student",
  elementId: string,
  timeoutMs = 12_000
): Promise<void> {
  await waitForElementOnPeer(page, role, elementId, timeoutMs);
}

export async function readEncryptionKeyFromHash(page: Page): Promise<string> {
  const hash = await page.evaluate(() => window.location.hash);
  const m = hash.match(/[#&]k=([^&]+)/);
  if (!m?.[1] || m[1].length < 16) {
    throw new Error(`Workspace hash missing encryption key: ${hash}`);
  }
  return decodeURIComponent(m[1]);
}

export async function waitForTutorStudentConnected(
  tutorPage: Page,
  timeoutMs = 90_000
): Promise<void> {
  // P2 chrome hides the sync pill visually (sr-only) but keeps the label for
  // harness + screen readers ΓÇö match text, not visibility.
  await expect(tutorPage.getByTestId("wb-sync-pill")).toHaveText(
    /student connected/i,
    { timeout: timeoutMs }
  );
}

async function locateStudentFollowCheckbox(page: Page) {
  const layout = await page
    .locator(".mynk-wb-chrome")
    .getAttribute("data-layout");
  const followInOverflow =
    layout === "narrow" ||
    layout === "tablet-portrait" ||
    layout === "phone-landscape";
  if (followInOverflow) {
    const dropdown = page.getByTestId("wb-topbar-overflow-dropdown");
    if (!(await dropdown.isVisible())) {
      await page.getByTestId("wb-student-topbar-overflow").click();
      await expect(dropdown).toBeVisible({ timeout: 5_000 });
    }
  }
  return page.getByRole("checkbox", {
    name: /(?:keep pan.*zoom synced|follow tutor)/i,
  });
}

async function closeStudentOverflowIfOpen(page: Page): Promise<void> {
  const dropdown = page.getByTestId("wb-topbar-overflow-dropdown");
  if (await dropdown.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(dropdown).not.toBeVisible({ timeout: 3_000 });
  }
}

export async function ensureStudentFollowsTutor(page: Page): Promise<void> {
  const checkbox = await locateStudentFollowCheckbox(page);
  await expect(checkbox).toBeVisible({ timeout: 90_000 });
  if (!(await checkbox.isChecked())) {
    await checkbox.check();
  }
  await closeStudentOverflowIfOpen(page);
}

export async function setStudentFollowTutor(
  page: Page,
  enabled: boolean
): Promise<void> {
  const checkbox = await locateStudentFollowCheckbox(page);
  await expect(checkbox).toBeVisible({ timeout: 90_000 });
  const checked = await checkbox.isChecked();
  if (enabled && !checked) await checkbox.check();
  if (!enabled && checked) await checkbox.uncheck();
  await closeStudentOverflowIfOpen(page);
}

export type ViewportSnapshot = {
  scrollX: number;
  scrollY: number;
  zoom: number;
  width: number;
  height: number;
};

export async function readViewportSnapshot(
  page: Page,
  role: "tutor" | "student"
): Promise<ViewportSnapshot> {
  return page.evaluate((r) => {
    const bridge = (
      window as Window & {
        __TN_WB_E2E__?: Record<string, { getAppState: () => Record<string, unknown> }>;
      }
    ).__TN_WB_E2E__?.[r];
    if (!bridge?.getAppState) throw new Error(`missing getAppState for ${r}`);
    const st = bridge.getAppState();
    const zoomObj = st.zoom as { value?: number } | undefined;
    const zoom =
      zoomObj && typeof zoomObj.value === "number" ? zoomObj.value : 1;
    return {
      scrollX: Number(st.scrollX) || 0,
      scrollY: Number(st.scrollY) || 0,
      zoom,
      width: Number(st.width) || 0,
      height: Number(st.height) || 0,
    };
  }, role);
}

/**
 * Distance from element center to viewport center in screen pixels.
 * Uses Excalidraw's sceneCoordsToViewportCoords (offsetLeft/offsetTop included).
 */
export async function markerCenterOffsetFromViewportCenter(
  page: Page,
  role: "tutor" | "student",
  markerId: string
): Promise<number> {
  return page.evaluate(
    ({ r, id }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            {
              getElements: () => Array<{
                id: string;
                x?: number;
                y?: number;
                width?: number;
                height?: number;
              }>;
              getAppState: () => Record<string, unknown>;
            }
          >;
        }
      ).__TN_WB_E2E__?.[r];
      if (!bridge) throw new Error(`missing bridge for ${r}`);
      const el = bridge.getElements().find((e) => e.id === id);
      if (!el) throw new Error(`marker ${id} not on ${r} canvas`);
      const st = bridge.getAppState();
      const zoomObj = st.zoom as { value?: number } | undefined;
      const zoom =
        zoomObj && typeof zoomObj.value === "number" ? zoomObj.value : 1;
      const vw = Number(st.width) || 1;
      const vh = Number(st.height) || 1;
      const scrollX = Number(st.scrollX) || 0;
      const scrollY = Number(st.scrollY) || 0;
      const offsetLeft = Number(st.offsetLeft) || 0;
      const offsetTop = Number(st.offsetTop) || 0;
      const ex = (Number(el.x) || 0) + (Number(el.width) || 0) / 2;
      const ey = (Number(el.y) || 0) + (Number(el.height) || 0) / 2;
      const screenX = (ex + scrollX) * zoom + offsetLeft;
      const screenY = (ey + scrollY) * zoom + offsetTop;
      const cx = offsetLeft + vw / 2;
      const cy = offsetTop + vh / 2;
      return Math.hypot(screenX - cx, screenY - cy);
    },
    { r: role, id: markerId }
  );
}

export async function clickBoardPageTab(
  page: Page,
  side: "tutor" | "student",
  pageTitle: string
): Promise<void> {
  const strip = page.getByTestId(
    side === "tutor" ? "wb-tutor-page-strip" : "wb-student-page-strip"
  );
  // Use evaluate(el.click()) rather than Playwright's coordinate-based .click()
  // because the Next.js dev-tools "N" button sits at bottom-left in dev mode
  // and physically overlaps the "Board 1" tab. Coordinate-based clicks (even
  // with force:true) hit the overlay; el.click() dispatches directly on the
  // target element, bypassing the overlay. The React onClick handler on the
  // page tab fires correctly and the full page-switch + sync pipeline is exercised.
  const tab = strip.getByRole("tab", { name: pageTitle, exact: true });
  await tab.evaluate((el) => (el as HTMLButtonElement).click());
}

/** Insert PNG via production `insertImageOnCanvas` + Blob upload (E2E bridge). */
export async function insertPngFixtureOnRole(
  page: Page,
  role: "tutor",
  fixturePath: string,
  session: WbLiveSyncSession
): Promise<string> {
  const base64 = fs.readFileSync(fixturePath).toString("base64");
  const filename = path.basename(fixturePath);
  return page.evaluate(
    async ({ r, b64, name, wbsid, stid }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            {
              insertImageFixture: (
                base64: string,
                filename: string,
                whiteboardSessionId: string,
                studentId: string
              ) => Promise<string>;
            }
          >;
        }
      ).__TN_WB_E2E__?.[r];
      if (!bridge?.insertImageFixture) {
        throw new Error(`E2E bridge missing insertImageFixture for ${r}`);
      }
      return bridge.insertImageFixture(b64, name, wbsid, stid);
    },
    {
      r: role,
      b64: base64,
      name: filename,
      wbsid: session.whiteboardSessionId,
      stid: session.studentId,
    }
  );
}

export async function readImageElementState(
  page: Page,
  role: "tutor" | "student",
  elementId: string
): Promise<{
  fileId: string | null;
  isPlaceholder: boolean;
  hasBinary: boolean;
  assetUrl: string | null;
} | null> {
  return page.evaluate(
    ({ r, id }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            {
              imageElementState: (id: string) => {
                fileId: string | null;
                isPlaceholder: boolean;
                hasBinary: boolean;
                assetUrl: string | null;
              } | null;
            }
          >;
        }
      ).__TN_WB_E2E__?.[r];
      return bridge?.imageElementState ? bridge.imageElementState(id) : null;
    },
    { r: role, id: elementId }
  );
}

export async function findFirstImageElementId(
  page: Page,
  role: "tutor" | "student"
): Promise<string | null> {
  return page.evaluate((r) => {
    const bridge = (
      window as Window & {
        __TN_WB_E2E__?: Record<
          string,
          { getElements: () => Array<{ id: string; type?: string }> }
        >;
      }
    ).__TN_WB_E2E__?.[r];
    if (!bridge?.getElements) return null;
    const img = bridge.getElements().find((e) => e.type === "image");
    return img?.id ?? null;
  }, role);
}

/** Insert JSXGraph embeddable via production `insertGraphOnCanvas` (E2E bridge). */
export async function insertGraphOnRole(
  page: Page,
  role: "tutor",
  session: WbLiveSyncSession,
  initialExpressions: string[] = ["x^2"]
): Promise<string> {
  return page.evaluate(
    ({ r, wbsid, stid, exprs }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            {
              insertGraphFixture: (
                whiteboardSessionId: string,
                studentId: string,
                initialExpressions?: string[]
              ) => string;
            }
          >;
        }
      ).__TN_WB_E2E__?.[r];
      if (!bridge?.insertGraphFixture) {
        throw new Error(`E2E bridge missing insertGraphFixture for ${r}`);
      }
      return bridge.insertGraphFixture(wbsid, stid, exprs);
    },
    {
      r: role,
      wbsid: session.whiteboardSessionId,
      stid: session.studentId,
      exprs: initialExpressions,
    }
  );
}

export async function readGraphElementState(
  page: Page,
  role: "tutor" | "student",
  elementId: string
): Promise<{
  graphStateJson: string | null;
  expressions: string[];
  bbox: [number, number, number, number] | null;
  link: string | null;
} | null> {
  return page.evaluate(
    ({ r, id }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            {
              graphElementState: (eid: string) => {
                graphStateJson: string | null;
                expressions: string[];
                bbox: [number, number, number, number] | null;
                link: string | null;
              } | null;
            }
          >;
        }
      ).__TN_WB_E2E__?.[r];
      return bridge?.graphElementState ? bridge.graphElementState(id) : null;
    },
    { r: role, id: elementId }
  );
}

export function expectedAlignedStudentScroll(
  tutor: ViewportSnapshot,
  student: Pick<ViewportSnapshot, "width" | "height">
) {
  const follow = followWireFromTutorAppState({
    scrollX: tutor.scrollX,
    scrollY: tutor.scrollY,
    zoom: { value: tutor.zoom },
    width: tutor.width,
    height: tutor.height,
  });
  if (!follow) {
    return {
      scrollX: tutor.scrollX,
      scrollY: tutor.scrollY,
      zoom: tutor.zoom,
    };
  }
  return studentScrollFromFollowCenter(
    follow,
    student.width,
    student.height
  );
}

export function tutorSceneCenter(tutor: ViewportSnapshot) {
  return viewportSceneCenterFromScroll(
    tutor.scrollX,
    tutor.scrollY,
    tutor.zoom,
    tutor.width,
    tutor.height
  );
}

export function sceneCenterDistance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export type ViewportScrollZoom = Pick<
  ViewportSnapshot,
  "scrollX" | "scrollY" | "zoom"
>;

/** Scene-unit distance between two viewport scroll positions (ignores zoom). */
export function viewportScrollDistance(
  a: ViewportScrollZoom,
  b: ViewportScrollZoom
): number {
  return Math.hypot(a.scrollX - b.scrollX, a.scrollY - b.scrollY);
}

export function tutorSnapshotAtScrollZoom(
  base: ViewportSnapshot,
  scrollZoom: ViewportScrollZoom
): ViewportSnapshot {
  return { ...base, ...scrollZoom };
}

/**
 * Apply a rapid sequence of tutor viewport changes (pan + zoom) with minimal
 * inter-step delay to mimic continuous gesture cadence, not stop-then-wait.
 */
export async function driveTutorViewportStream(
  tutorPage: Page,
  steps: ViewportScrollZoom[],
  interStepMs = 8
): Promise<void> {
  for (const step of steps) {
    await setViewportOnRole(
      tutorPage,
      "tutor",
      step.scrollX,
      step.scrollY,
      step.zoom
    );
    if (interStepMs > 0) {
      await tutorPage.waitForTimeout(interStepMs);
    }
  }
}

/** Pan delta per step in `buildPanZoomViewportSteps` (scene units). */
export const PAN_ZOOM_STEP_DELTA = { x: 38, y: 24 } as const;

/** Scene-unit distance of one pan step — used for one-frame lag tolerances. */
export const ONE_PAN_ZOOM_STEP_SCENE_DISTANCE = Math.hypot(
  PAN_ZOOM_STEP_DELTA.x,
  PAN_ZOOM_STEP_DELTA.y
);

/** Build evenly spaced pan+zoom steps from a tutor baseline (for stream tests). */
export function buildPanZoomViewportSteps(
  base: ViewportSnapshot,
  count: number,
  panDeltaPerStep = PAN_ZOOM_STEP_DELTA,
  zoomFactorPerStep = 0.035
): ViewportScrollZoom[] {
  const steps: ViewportScrollZoom[] = [];
  for (let i = 1; i <= count; i++) {
    steps.push({
      scrollX: base.scrollX + i * panDeltaPerStep.x,
      scrollY: base.scrollY + i * panDeltaPerStep.y,
      zoom: base.zoom * (1 + i * zoomFactorPerStep),
    });
  }
  return steps;
}

export type WbViewportSize = { width: number; height: number };

export type ViewportRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
};

/**
 * Layout viewport rect for a testid control. Stricter than Playwright
 * `toBeVisible()` — off-screen elements with overflow:visible still pass
 * toBeVisible but fail here.
 */
export async function readControlViewportRect(
  page: Page,
  testId: string
): Promise<ViewportRect> {
  const locator = page.getByTestId(testId);
  await expect(locator).toBeVisible();
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
}

/**
 * Control must be fully inside the layout viewport (tappable without scroll).
 * Use for top-bar chrome — catches horizontal clip regressions on phone.
 */
export async function assertControlFullyInViewport(
  page: Page,
  testId: string,
  opts?: { timeoutMs?: number }
): Promise<void> {
  const locator = page.getByTestId(testId);
  await expect(locator).toBeVisible({ timeout: opts?.timeoutMs ?? 30_000 });
  const rect = await readControlViewportRect(page, testId);
  expect(rect.width, `${testId} width`).toBeGreaterThan(0);
  expect(rect.height, `${testId} height`).toBeGreaterThan(0);
  expect(rect.left, `${testId} left edge`).toBeGreaterThanOrEqual(0);
  expect(rect.top, `${testId} top edge`).toBeGreaterThanOrEqual(0);
  expect(rect.right, `${testId} right edge`).toBeLessThanOrEqual(
    rect.viewportWidth
  );
  expect(rect.bottom, `${testId} bottom edge`).toBeLessThanOrEqual(
    rect.viewportHeight
  );
}

/** Student narrow layout: pill + ⋯ + Exit on-screen; inline toolbar toggle hidden. */
export async function assertStudentPortraitTopBarControls(
  page: Page
): Promise<void> {
  await expect(page.locator(".mynk-wb-chrome")).toHaveAttribute(
    "data-layout",
    "narrow",
    { timeout: 10_000 }
  );
  await assertControlFullyInViewport(page, "wb-student-sync-pill");
  await assertControlFullyInViewport(page, "wb-student-topbar-overflow");
  await assertControlFullyInViewport(page, "wb-student-exit");
  await expect(page.getByTestId("wb-student-toolbar-toggle")).not.toBeVisible();
}

/** Open tutor + student relay session (shared harness entry). */
export async function openTutorAndStudent(
  browser: import("@playwright/test").Browser,
  session: WbLiveSyncSession,
  options?: { ensureFollow?: boolean; studentViewport?: WbViewportSize }
) {
  const ensureFollow = options?.ensureFollow !== false;
  const studentViewport = options?.studentViewport ?? {
    width: 1280,
    height: 640,
  };

  const tutorContext = await browser.newContext({
    storageState: "tests/integration/.auth/tutor.json",
    viewport: { width: 1280, height: 1200 },
  });
  const studentContext = await browser.newContext({
    viewport: studentViewport,
  });

  const tutorPage = await tutorContext.newPage();
  await tutorPage.goto(
    `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
    timeout: 90_000,
  });
  await waitForWbE2eBridge(tutorPage, "tutor");

  const encryptionKey = await readEncryptionKeyFromHash(tutorPage);
  const studentPage = await studentContext.newPage();
  await studentPage.goto(`/w/${session.joinToken}#k=${encryptionKey}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
    timeout: 90_000,
  });
  await waitForWbE2eBridge(studentPage, "student");

  if (ensureFollow) {
    await ensureStudentFollowsTutor(studentPage);
  }
  await waitForTutorStudentConnected(tutorPage);

  return {
    tutorContext,
    studentContext,
    tutorPage,
    studentPage,
    async close() {
      await tutorContext.close();
      await studentContext.close();
    },
  };
}

/** Type an expression into the GraphEmbeddable UI (not the E2E fixture shortcut). */
export async function addGraphExpressionViaUI(
  page: Page,
  expression: string
): Promise<void> {
  const host = page.getByTestId("wb-graph-embed-host").first();
  await expect(host).toBeVisible({ timeout: 30_000 });
  await host.scrollIntoViewIfNeeded();
  const panel = page.getByTestId("wb-graph-expr-panel");
  if (!(await panel.isVisible())) {
    await page.getByTestId("wb-graph-expr-toggle").click();
  }
  const input = page.getByTestId("wb-graph-expr-new");
  await input.click();
  await input.fill(expression);
  await input.press("Enter");
  await expect(input).toHaveValue("", { timeout: 5_000 });
}

export async function countGraphCurvePaths(page: Page): Promise<number> {
  return page.locator(".wb-graph-board-host .jxgbox svg path").count();
}

/** Relational layout oracle — child vertically centered in parent (equal top/bottom inset). */
export async function assertEqualVerticalInsetInParent(
  page: Page,
  childTestId: string,
  parentTestId: string,
  tolerancePx = 4
): Promise<void> {
  const child = page.getByTestId(childTestId);
  const parent = page.getByTestId(parentTestId);
  await expect(child).toBeVisible();
  const childBox = await child.boundingBox();
  const parentBox = await parent.boundingBox();
  expect(childBox, `${childTestId} bounding box`).not.toBeNull();
  expect(parentBox, `${parentTestId} bounding box`).not.toBeNull();
  const topInset = childBox!.y - parentBox!.y;
  const bottomInset =
    parentBox!.y + parentBox!.height - (childBox!.y + childBox!.height);
  expect(
    Math.abs(topInset - bottomInset),
    `${childTestId} equal vertical inset in ${parentTestId}`
  ).toBeLessThanOrEqual(tolerancePx);
}

/** Left edges of overflow dropdown menu rows — consistent left alignment oracle. */
export async function readOverflowMenuItemLeftEdges(
  page: Page
): Promise<number[]> {
  const items = page.locator(
    '[data-testid="wb-topbar-overflow-dropdown"] .mynk-wb-menu-item'
  );
  const count = await items.count();
  const edges: number[] = [];
  for (let i = 0; i < count; i++) {
    const box = await items.nth(i).boundingBox();
    if (box) edges.push(box.x);
  }
  return edges;
}

export async function waitForGraphExpressions(
  page: Page,
  role: "tutor" | "student",
  graphId: string,
  expressions: string[],
  timeoutMs = 30_000
): Promise<void> {
  await page.waitForFunction(
    ({ r, id, expected }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            {
              graphElementState: (eid: string) => {
                expressions: string[];
              } | null;
            }
          >;
        }
      ).__TN_WB_E2E__?.[r];
      const st = bridge?.graphElementState?.(id);
      if (!st) return false;
      return expected.every((expr) => st.expressions.includes(expr));
    },
    { r: role, id: graphId, expected: expressions },
    { timeout: timeoutMs }
  );
}
