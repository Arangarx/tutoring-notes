import { expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import {
  seedTestAdmin,
  seedTestStudent,
  seedOpenWhiteboardSession,
} from "../visual/helpers";
import {
  alignStudentScrollToTutorCenter,
  sceneCenterFromScroll,
} from "../../src/lib/whiteboard/viewport-align";

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

export async function waitForElementOnPeer(
  page: Page,
  role: "tutor" | "student",
  elementId: string,
  timeoutMs = 45_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ids = await readSceneElementIds(page, role);
    if (ids.includes(elementId)) return;
    await page.waitForTimeout(250);
  }
  throw new Error(
    `Timed out waiting for element ${elementId} on ${role} canvas (last ids: ${(await readSceneElementIds(page, role)).join(", ")})`
  );
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
  await expect(tutorPage.getByText(/student connected/i)).toBeVisible({
    timeout: timeoutMs,
  });
}

export async function ensureStudentFollowsTutor(page: Page): Promise<void> {
  const checkbox = page.getByRole("checkbox", {
    name: /keep pan.*zoom synced/i,
  });
  if (!(await checkbox.isChecked())) {
    await checkbox.check();
  }
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

/** Distance from element center to viewport center in screen pixels (student). */
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
      const ex = (Number(el.x) || 0) + (Number(el.width) || 0) / 2;
      const ey = (Number(el.y) || 0) + (Number(el.height) || 0) / 2;
      const screenX = (ex - scrollX) * zoom;
      const screenY = (ey - scrollY) * zoom;
      const cx = vw / 2;
      const cy = vh / 2;
      return Math.hypot(screenX - cx, screenY - cy);
    },
    { r: role, id: markerId }
  );
}

export function expectedAlignedStudentScroll(
  tutor: ViewportSnapshot,
  student: Pick<ViewportSnapshot, "width" | "height">
) {
  return alignStudentScrollToTutorCenter(
    {
      panX: tutor.scrollX,
      panY: tutor.scrollY,
      zoom: tutor.zoom,
      viewportWidth: tutor.width,
      viewportHeight: tutor.height,
    },
    student.width,
    student.height
  );
}

export function tutorSceneCenter(tutor: ViewportSnapshot) {
  return sceneCenterFromScroll(
    tutor.scrollX,
    tutor.scrollY,
    tutor.zoom,
    tutor.width,
    tutor.height
  );
}
