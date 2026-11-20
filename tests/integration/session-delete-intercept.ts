/**
 * One interceptor for the session-delete server action.
 *
 * The delete body is exactly `["<whiteboardSessionId>"]`. The notes status
 * poll (`getTutorNoteStatusAction`) sends that same body, so pinning the
 * first match from page load can hold or abort the poll. Capture opens only
 * when the test calls `armDeleteCapture()`, which the confirm helpers do
 * immediately before the confirm click. Review tests also pass
 * `requireTutorNoteDone` so a seed that is not `done` fails before any pin.
 */

import { expect, type Page, type Request, type Route } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const { assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

export type SessionDeleteInterceptOptions = {
  studentId?: string;
  /**
   * Read the seeded TutorNote and fail unless its status is `done`.
   * Callers that load the review page must set this. A pending or
   * generating note polls with the same body as delete.
   */
  requireTutorNoteDone?: boolean;
};

/**
 * Delete server action. The review URL contains the session id, and the notes
 * poll and save bodies contain it too, so a substring match aborts the wrong
 * action. The delete body is exactly the one-argument server-action payload.
 * `pinnedActionId` is the `next-action` id from the first match after capture
 * is armed — never from a poll that ran before the confirm click.
 */
function isSessionDeletePost(
  request: Request,
  whiteboardSessionId: string,
  pinnedActionId: string | null,
): boolean {
  if (request.method() !== "POST") return false;
  const actionId = request.headers()["next-action"];
  if (!actionId) return false;
  if (pinnedActionId && actionId !== pinnedActionId) return false;
  return request.postData()?.trim() === JSON.stringify([whiteboardSessionId]);
}

/** RSC refresh/navigation of the student detail page. Prefetches are not a navigation. */
function isStudentDetailFlight(request: Request, studentId: string): boolean {
  if (request.headers()["next-action"]) return false;
  if (request.headers()["next-router-prefetch"]) return false;
  if (request.headers()["next-router-segment-prefetch"]) return false;
  let pathname = "";
  let search = "";
  try {
    const url = new URL(request.url());
    pathname = url.pathname;
    search = url.search;
  } catch {
    return false;
  }
  const detail =
    pathname === `/admin/students/${studentId}` || pathname === `/admin/students/${studentId}/`;
  if (!detail) return false;
  return request.headers()["rsc"] === "1" || search.includes("_rsc=");
}

function describeActionPost(request: Request): string {
  let pathname = request.url();
  try {
    pathname = new URL(request.url()).pathname;
  } catch {
    // keep the raw url
  }
  const action = request.headers()["next-action"] ? "yes" : "no";
  const body = (request.postData() ?? "").slice(0, 160);
  return `next-action=${action} ${pathname} body=${body}`;
}

/** The review seed must be a finished note. Anything else polls with the delete body. */
export async function assertSeededTutorNoteDone(whiteboardSessionId: string): Promise<void> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const note = await prisma.tutorNote.findUnique({
      where: { sessionId: whiteboardSessionId },
      select: { status: true },
    });
    expect(
      note,
      "seeded TutorNote row is missing. The review page would poll getTutorNoteStatusAction with the same body as delete, and the interceptor would pin that poll.",
    ).not.toBeNull();
    expect(
      note?.status,
      "seeded TutorNote must be done before the delete interceptor arms. A pending or generating note polls getTutorNoteStatusAction with the same one-id body as delete.",
    ).toBe("done");
  } finally {
    await prisma.$disconnect();
  }
}

export type HeldSessionDelete = {
  actionPosts: string[];
  flights: string[];
  sawDeletePost: () => boolean;
  deletePostCount: () => number;
  deletePostPath: () => string;
  /** Start recording student-page flights. Call after the page has settled. */
  arm: () => void;
  /**
   * Open the delete-capture window. Call immediately before the confirm click.
   * Matching posts before this cannot pin the action id.
   */
  armDeleteCapture: () => Promise<void>;
  /**
   * Hold later student-detail RSC flights so the row stays on screen after
   * refresh() returns. That is the window where "Yes, delete" used to re-enable.
   */
  stallStudentDetail: () => void;
  releaseFlights: () => void;
  release: () => void;
  unroute: () => Promise<void>;
};

/**
 * Hold or abort the session-delete server action. The review page and the
 * student list share this route: the broken handler navigates first, so the
 * POST may land on a page that does not own the control, and a refresh can
 * leave while the POST is still held.
 *
 * The route is installed immediately so the confirm click cannot race the
 * install, but the action id is pinned only after `armDeleteCapture()`.
 */
export async function interceptSessionDeletePost(
  page: Page,
  whiteboardSessionId: string,
  mode: "hold" | "abort",
  opts?: SessionDeleteInterceptOptions,
): Promise<HeldSessionDelete> {
  const actionPosts: string[] = [];
  const flights: string[] = [];
  let sawDeletePost = false;
  let deletePostCount = 0;
  let deletePostPath = "";
  let pinnedActionId: string | null = null;
  let armed = false;
  let captureArmed = false;
  let released = false;
  let aborted = false;
  let stallStudentDetail = false;
  let releaseDelete = () => {};
  let releaseFlights = () => {};
  const deleteHeld = new Promise<void>((resolve) => {
    releaseDelete = () => {
      released = true;
      resolve();
    };
  });
  const flightsStalled = new Promise<void>((resolve) => {
    releaseFlights = () => {
      stallStudentDetail = false;
      resolve();
    };
  });

  const onRoute = async (route: Route) => {
    const request = route.request();
    if (request.method() === "POST") {
      actionPosts.push(describeActionPost(request));
    }
    if (!captureArmed || !isSessionDeletePost(request, whiteboardSessionId, pinnedActionId)) {
      const studentFlight =
        Boolean(opts?.studentId) && isStudentDetailFlight(request, opts?.studentId ?? "");
      if (armed && !released && studentFlight) {
        flights.push(describeActionPost(request));
      }
      if (stallStudentDetail && studentFlight) {
        await flightsStalled;
        try {
          await route.continue();
        } catch {
          // The test unroutes on the way out. The request was already settled.
        }
        return;
      }
      await route.continue();
      return;
    }
    try {
      deletePostPath = new URL(request.url()).pathname;
    } catch {
      deletePostPath = request.url();
    }
    sawDeletePost = true;
    deletePostCount += 1;
    if (!pinnedActionId) {
      pinnedActionId = request.headers()["next-action"] ?? null;
    }
    if (mode === "abort") {
      if (aborted) {
        await route.continue();
        return;
      }
      aborted = true;
      await route.abort("failed");
      return;
    }
    await deleteHeld;
    try {
      await route.continue();
    } catch {
      // The test unroutes on the way out. The request was already settled.
    }
  };
  await page.route("**/*", onRoute);

  return {
    actionPosts,
    flights,
    sawDeletePost: () => sawDeletePost,
    deletePostCount: () => deletePostCount,
    deletePostPath: () => deletePostPath,
    arm: () => {
      armed = true;
    },
    armDeleteCapture: async () => {
      if (opts?.requireTutorNoteDone) {
        await assertSeededTutorNoteDone(whiteboardSessionId);
      }
      captureArmed = true;
    },
    stallStudentDetail: () => {
      stallStudentDetail = true;
    },
    releaseFlights: () => releaseFlights(),
    release: () => releaseDelete(),
    unroute: async () => {
      releaseDelete();
      releaseFlights();
      await page.unroute("**/*", onRoute).catch(() => {});
    },
  };
}
