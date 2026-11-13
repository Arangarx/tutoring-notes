/**
 * Consent wave — no relay: entry, Start/refreeze, replay visibility, share link.
 *
 * C0 SKELETON (docs/handoff/consent-wave-plan.md § 6, § 8 C0): every row below is `test.fixme` and is filled in by the wave that
 * owns its behavior. Titles state the rule; each row's oracle is quoted in the comment above it. A row is un-fixme'd only together
 * with its red-before / green-after evidence (exhaustive-testing-mandate.mdc).
 *
 * Run (after un-fixme): npx playwright test tests/integration/consent-entry.spec.ts --project=wb-regression --workers=1 --retries=0
 */

import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import { TEST_ADMIN } from "../visual/helpers";
import {
  TEST_2FA_TUTOR,
  generateTotpCode,
  loginTutorWithPassword,
  seedEnrolled2faTutor,
  submitTotpOnVerifyPage,
  waitFor2faVerifyChallenge,
} from "./identity/tutor-2fa-login.helpers";
import {
  armFault,
  armHold,
  expectReleasedByTest,
  invokeConsentAction,
  listHarnessBlobs,
  releaseHold,
  resetSeams,
  runCron,
  seedHarnessBlobs,
  waitUntilParked,
} from "../helpers/consent-harness";
import { seedStartFixture, type StartFixture } from "../helpers/consent-start-fixture";
import {
  expectReads,
  openFamilyContext,
  readReplay,
  replayPagePath,
  seedReplay,
  SHAPE_ACCESS,
  type Principal,
  type ReplayFixture,
} from "../helpers/consent-replay-fixture";
import type { SessionCapabilities } from "../../src/lib/recording/session-capabilities";
import {
  countBackendsWaitingOnLock,
  dropFamilyConsentVersionsAbove,
  readConsentSnapshots,
  saveFamilyConsentVersion,
} from "../helpers/consent-db-oracle";
import {
  loginAccountHolderInContext,
  loginLearnerInContext,
  openTutorAndStudent,
  seedParentJoinPendingSession,
  seedSelfLearnerWbSession,
  seedWbPendingLiveSyncSession,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import { TEST_PARENT } from "./identity/identity.helpers";
import { seedBridgeScheduledSession, seedOnlineOffAppointment } from "./wb-org-qol-bridge.helpers";
import { blobIntegrationEnabled } from "../helpers/blob-gate";
import { driveVadSilenceCut, injectVadOverrides } from "../helpers/vad-test-meter";
import {
  audioRequests,
  chooseMode,
  endFromWorkspace,
  laneCreateLines,
  openTutorRoom,
  seedConsentSession,
  setFamilySwitches,
  startFromWaitingRoom,
} from "../helpers/consent-tutor-room";

const { assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

async function withPrisma<T>(run: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}


const START_HOLD = "start:tx:between_consent_read_and_update" as const;
const END_HOLD = "end:tx:before_update" as const;

/** Spec-typed literal (org UX W4 copy spec): the tutor line for a parent-held learner with no record. */
const NO_RECORD_PARENT_LINE = "The parent hasn't finished privacy preferences yet.";

type StartResult =
  | {
      ok: true;
      phase: "active";
      sessionMode: "LIVE" | "IN_PERSON";
      capabilities: SessionCapabilities;
    }
  | { ok: false; reason: string };

/** Runs the real `startWhiteboardSession` action as the signed-in tutor (the response is the action's own return value). */
async function startVia(
  request: APIRequestContext,
  sessionId: string,
  sessionMode?: "LIVE" | "IN_PERSON"
): Promise<StartResult> {
  const res = await invokeConsentAction(request, "startSession", sessionId, sessionMode ? { sessionMode } : {});
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { result: StartResult }).result;
}

/** The session row's phase fields, read straight from Postgres. */
function sessionRow(id: string) {
  return withPrisma((p) =>
    p.whiteboardSession.findUniqueOrThrow({
      where: { id },
      select: { sessionPhase: true, activatedAt: true, endedAt: true },
    })
  );
}

/** Opens the tutor workspace for a PENDING session and waits until the waiting room is hydrated. */
async function openWorkspaceWaitingRoom(page: Page, f: StartFixture): Promise<void> {
  await page.goto(`/admin/students/${f.studentId}/whiteboard/${f.whiteboardSessionId}/workspace`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("wb-waiting-overlay")).toBeVisible({ timeout: 90_000 });
  await waitForWbE2eBridge(page, "tutor");
}
// ---------------------------------------------------------------------------
// Entry helpers (consent wave C5): the learner and parent sides of `/join`, and the shared copy literals.
// ---------------------------------------------------------------------------

/** Spec-typed copy (the plan's § 7b table, written by hand here, never read from the code under test). */
const FAMILY_LIVE_OFF = "Live sessions are off in privacy settings.";
const tutorLiveOff = (learnerName: string) => `Live sessions are off in ${learnerName}'s privacy settings.`;
const IN_PERSON_STILL_OPEN = "You can still open the room in person.";
const familyMissingParent = (learnerName: string) => `Finish privacy preferences for ${learnerName} to join.`;

const TUTOR_STATE = "tests/integration/.auth/tutor.json";
/** A well-formed 128-bit key: `/join` needs `#k=` to mount the board, and no tutor is in the room to supply one. */
const JOIN_KEY_FRAGMENT = "#k=AAAAAAAAAAAAAAAAAAAAAA";
const joinPath = (sessionId: string) => `/join/${sessionId}${JOIN_KEY_FRAGMENT}`;

async function studentNameOf(studentId: string): Promise<string> {
  return withPrisma(
    async (p) => (await p.student.findUniqueOrThrow({ where: { id: studentId }, select: { name: true } })).name
  );
}

type LearnerLogin = { handle: string; pin: string };

const shortStamp = () => `${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Gives an isolated fixture's learner a PIN login and makes it a participant of `sessionIds` (rows written straight to
 * Postgres, never through the code under test). Deleting the profile removes the credential with it.
 */
async function giveLearnerLogin(learnerProfileId: string, sessionIds: string[]): Promise<LearnerLogin> {
  const pin = "482916";
  const stamp = shortStamp();
  return withPrisma(async (p) => {
    const profile = await p.learnerProfile.findUniqueOrThrow({
      where: { id: learnerProfileId },
      select: { accountHolderId: true, accountHolder: { select: { familyId: true } } },
    });
    const familyId = profile.accountHolder.familyId ?? `entfam${stamp}`;
    if (!profile.accountHolder.familyId) {
      await p.accountHolder.update({ where: { id: profile.accountHolderId }, data: { familyId } });
    }
    await p.learnerProfile.update({ where: { id: learnerProfileId }, data: { accessMode: "child_pin_required" } });
    const username = `e${stamp}`;
    await p.learnerCredential.create({
      data: {
        learnerProfileId,
        accountHolderId: profile.accountHolderId,
        username,
        secretHash: await bcrypt.hash(pin, 10),
      },
    });
    for (const whiteboardSessionId of sessionIds) {
      await p.sessionParticipant.create({ data: { whiteboardSessionId, learnerProfileId } });
    }
    return { handle: `${username}@${familyId}`, pin };
  });
}

type JoinVisit = { context: BrowserContext; page: Page };

/** A fresh signed-in context (nothing shared with the tutor) that navigates straight to `path`. */
async function visitAs(
  browser: Browser,
  signIn: (context: BrowserContext) => Promise<void>,
  path: string
): Promise<JoinVisit> {
  const context = await browser.newContext();
  await signIn(context);
  const page = await context.newPage();
  await page.goto(path, { waitUntil: "domcontentloaded" });
  return { context, page };
}

const asLearner = (login: LearnerLogin) => (context: BrowserContext) =>
  loginLearnerInContext(context, login.handle, login.pin);
const asAccountHolder = (email: string, password: string) => (context: BrowserContext) =>
  loginAccountHolderInContext(context, email, password);

/** `/join` refused: the one-line reason (copy and code), still on the join URL, and the board never mounts. */
async function expectJoinRefused(page: Page, sessionId: string, reason: string, text: string): Promise<void> {
  const line = page.getByTestId("join-entry-blocked");
  await expect(line).toBeVisible({ timeout: 60_000 });
  await expect(line).toHaveText(text);
  await expect(line).toHaveAttribute("data-entry-reason", reason);
  await expect(page).toHaveURL(new RegExp(`/join/${sessionId}`));
  await expect(page.getByTestId("student-whiteboard-canvas-mount")).toHaveCount(0);
}

/** `/join` admitted: the learner's board mounts and no refusal line is on the page. */
async function expectJoinAdmitted(page: Page): Promise<void> {
  await expect(page.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("join-entry-blocked")).toHaveCount(0);
}

/** The real `issueJoinToken` action as the signed-in tutor: `{ ok: true }` or `{ ok: false, reason }`. */
async function issueTokenVia(
  request: APIRequestContext,
  sessionId: string
): Promise<{ ok: boolean; reason?: string }> {
  const res = await invokeConsentAction(request, "issueJoinToken", sessionId);
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { result: { ok: boolean; reason?: string } }).result;
}

/**
 * One learner who studies with a private tutor AND in an organization, with a separate privacy record per owner and one
 * PENDING session each (E10, E11). Everything is written straight to Postgres.
 */
async function seedTwoOwnerLearner(opts: { orgAllowsLive: boolean; privateAllowsLive: boolean }) {
  const stamp = shortStamp();
  const placeholder = "https://pw.local/placeholder-whiteboard-events.json";
  const ids = await withPrisma(async (p) => {
    const holder = await p.accountHolder.create({
      data: { email: `pw-two-owner-${stamp}@test.local`, emailVerifiedAt: new Date("2026-01-01") },
      select: { id: true },
    });
    const profile = await p.learnerProfile.create({
      data: { accountHolderId: holder.id, displayName: `Two Owners ${stamp}` },
      select: { id: true },
    });
    const tutor = await p.adminUser.create({
      data: {
        email: `pw-two-owner-tutor-${stamp}@test.local`,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        emailVerifiedAt: new Date("2026-01-01"),
      },
      select: { id: true },
    });
    const instructor = await p.adminUser.create({
      data: {
        email: `pw-two-owner-instructor-${stamp}@test.local`,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        emailVerifiedAt: new Date("2026-01-01"),
      },
      select: { id: true },
    });
    const org = await p.organization.create({
      data: {
        name: `PW Two Owner ${stamp}`,
        status: "active",
        timezone: "America/Denver",
        createdByOperatorId: "org-operator@example.com",
        members: { create: [{ adminUserId: instructor.id, roles: ["instructor"] }] },
      },
      select: { id: true },
    });
    const privateStudent = await p.student.create({
      data: { name: `Private ${stamp}`, adminUserId: tutor.id, learnerProfileId: profile.id },
      select: { id: true },
    });
    const orgStudent = await p.student.create({
      data: { name: `OrgLearner ${stamp}`, adminUserId: null, organizationId: org.id, learnerProfileId: profile.id },
      select: { id: true },
    });
    const allOn = { allowAudioRecording: true, allowWhiteboardRecording: true, allowNoteSending: true };
    await p.consentRecord.create({
      data: {
        learnerProfileId: profile.id,
        adminUserId: tutor.id,
        version: 1,
        allowLiveSession: opts.privateAllowsLive,
        ...allOn,
        setByAccountHolderId: holder.id,
        captureMethod: "electronic",
      },
    });
    await p.consentRecord.create({
      data: {
        learnerProfileId: profile.id,
        adminUserId: null,
        organizationId: org.id,
        version: 1,
        allowLiveSession: opts.orgAllowsLive,
        ...allOn,
        setByAccountHolderId: holder.id,
        captureMethod: "electronic",
      },
    });
    const sessionFor = (adminUserId: string, studentId: string) =>
      p.whiteboardSession.create({
        data: {
          adminUserId,
          studentId,
          consentAcknowledged: true,
          eventsBlobUrl: placeholder,
          sessionPhase: "PENDING",
          sessionMode: "LIVE",
        },
        select: { id: true },
      });
    const privateSession = await sessionFor(tutor.id, privateStudent.id);
    const orgSession = await sessionFor(instructor.id, orgStudent.id);
    return {
      holderId: holder.id,
      profileId: profile.id,
      adminIds: [tutor.id, instructor.id],
      organizationId: org.id,
      studentIds: [privateStudent.id, orgStudent.id],
      privateSessionId: privateSession.id,
      orgSessionId: orgSession.id,
    };
  });
  const login = await giveLearnerLogin(ids.profileId, [ids.privateSessionId, ids.orgSessionId]);
  return {
    ...ids,
    login,
    cleanup: () =>
      withPrisma(async (p) => {
        const sessionIds = [ids.privateSessionId, ids.orgSessionId];
        await p.productEvent.deleteMany({ where: { whiteboardSessionId: { in: sessionIds } } });
        await p.sessionParticipant.deleteMany({ where: { whiteboardSessionId: { in: sessionIds } } });
        await p.whiteboardSession.deleteMany({ where: { id: { in: sessionIds } } });
        await p.consentRecord.deleteMany({ where: { learnerProfileId: ids.profileId } });
        await p.student.deleteMany({ where: { id: { in: ids.studentIds } } });
        await p.learnerProfile.deleteMany({ where: { id: ids.profileId } });
        await p.accountHolder.deleteMany({ where: { id: ids.holderId } });
        await p.organization.deleteMany({ where: { id: ids.organizationId } });
        await p.adminUser.deleteMany({ where: { id: { in: ids.adminIds } } });
      }),
  };
}

// ---------------------------------------------------------------------------
// 6a. Entry (online switch)
// ---------------------------------------------------------------------------
test.describe("consent 6a: Entry (online switch)", {
  tag: [TAG.WB_CONSENT, TAG.WB_PRESENCE],
}, () => {
  // Oracle: Server response; session 'sessionMode' row
  test(
    "E1: online off: tutor Start Online is refused and Start in person works",
    async ({ request }) => {
      test.setTimeout(150_000);
      // Both session shapes the product has: one created with a snapshot, and a legacy one with none.
      for (const snapshot of [false, true]) {
        const f = await seedStartFixture({ record: { allowLiveSession: false }, snapshot });
        const id = f.whiteboardSessionId;
        try {
          expect(await startVia(request, id, "LIVE"), "explicit Online").toEqual({ ok: false, reason: "live_off" });
          // The stored mode is Online, so Start with no mode argument is also an Online Start.
          expect(await startVia(request, id), "the session's own Online mode").toEqual({ ok: false, reason: "live_off" });
          const refused = await sessionRow(id);
          expect(refused.sessionPhase).toBe("PENDING");
          expect(refused.activatedAt).toBeNull();

          const started = await startVia(request, id, "IN_PERSON");
          expect(started.ok).toBe(true);
          if (started.ok) expect(started.sessionMode).toBe("IN_PERSON");
          const after = await withPrisma((p) =>
            p.whiteboardSession.findUniqueOrThrow({ where: { id }, select: { sessionPhase: true, sessionMode: true } })
          );
          expect(after).toEqual({ sessionPhase: "ACTIVE", sessionMode: "IN_PERSON" });
        } finally {
          await f.cleanup();
        }
      }
    }
  );
  // Oracle: DOM: in-person button visible, online absent; no mode auto-flip event
  // Real-browser oracle for "nothing chooses the mode for the tutor": while the room is only open, the session mode the
  // chrome acts on stays UNKNOWN (it is set only by a choice), and pressing Start is what commits "in person". The old
  // overlay effect committed the mode on mount, before any press.
  test(
    "E2: online off: Open room works and offers only in person",
    async ({ browser }) => {
      test.setTimeout(240_000);
      const s = await seedConsentSession({ switches: { allowLiveSession: false }, phase: "PENDING" });
      const name = await studentNameOf(s.studentId);
      const room = await openTutorRoom(browser, s, { spy: "passthrough" });
      try {
        const page = room.page;
        const overlay = page.getByTestId("wb-waiting-overlay");
        await expect(overlay).toBeVisible();
        // Only in person is offered, and it is the pressed mode.
        await expect(page.getByTestId("wb-session-mode-live")).toHaveCount(0);
        await expect(page.getByTestId("wb-session-mode-in-person")).toHaveAttribute("aria-pressed", "true");
        await expect(overlay).toHaveAttribute("data-session-mode", "IN_PERSON");
        await expect(page.getByTestId("wb-waiting-online-blocked")).toHaveText(
          `${tutorLiveOff(name)} ${IN_PERSON_STILL_OPEN}`
        );
        await expect(page.getByTestId("wb-start-session")).toHaveText("Start in person");

        // Nobody has chosen anything yet: the session mode the chrome acts on is still unset (UNKNOWN), not committed.
        await page.waitForTimeout(4_000);
        const chrome = page.getByTestId("mynk-wb-chrome");
        await expect(chrome).toHaveAttribute("data-session-mode", "UNKNOWN");
        // Pressing Start is the choice: the session starts in person.
        await startFromWaitingRoom(page);
        await expect(chrome).toHaveAttribute("data-session-mode", "IN_PERSON");
        const row = await withPrisma((p) =>
          p.whiteboardSession.findUniqueOrThrow({
            where: { id: s.whiteboardSessionId },
            select: { sessionPhase: true, sessionMode: true },
          })
        );
        expect(row).toEqual({ sessionPhase: "ACTIVE", sessionMode: "IN_PERSON" });
        // Control: the spy works, and audio (on) is requested once the mode is chosen.
        await expect.poll(() => audioRequests(page), { timeout: 20_000 }).toBeGreaterThan(0);
      } finally {
        await room.close();
        await s.cleanup();
      }
    }
  );
  // Oracle: Same reason line text
  test(
    "E3: online off: resume of an open session gives the same answer as Start",
    async ({ browser }) => {
      test.setTimeout(240_000);
      const off = await seedStartFixture({ record: { allowLiveSession: false }, snapshot: true });
      const on = await seedStartFixture({ record: {}, snapshot: true });
      const context = await browser.newContext({ storageState: TUTOR_STATE });
      try {
        const page = await context.newPage();
        const name = await studentNameOf(off.studentId);

        // The student page's Resume link carries the same sentence the waiting room shows beside Start.
        await page.goto(`/admin/students/${off.studentId}`, { waitUntil: "domcontentloaded" });
        const resumeLine = page.getByTestId("resume-whiteboard-session-reason").first();
        await expect(resumeLine).toBeVisible({ timeout: 30_000 });
        const resumeText = (await resumeLine.innerText()).trim();
        expect(resumeText).toBe(`${tutorLiveOff(name)} ${IN_PERSON_STILL_OPEN}`);

        // Resume is not blocked (in person is open): it opens the room.
        const resume = page.getByTestId("roster-resume-session").first();
        await expect(resume).toBeVisible();
        await resume.click();
        await page.waitForURL(new RegExp(`/whiteboard/${off.whiteboardSessionId}/workspace`), { timeout: 60_000 });
        await expect(page.getByTestId("wb-waiting-overlay")).toBeVisible({ timeout: 90_000 });
        await expect(page.getByTestId("wb-waiting-online-blocked")).toHaveText(resumeText);

        // Control: online allowed shows no line under Resume.
        await page.goto(`/admin/students/${on.studentId}`, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("roster-resume-session").first()).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("resume-whiteboard-session-reason")).toHaveCount(0);
      } finally {
        await context.close();
        await off.cleanup();
        await on.cleanup();
      }
    }
  );
  // Oracle: Redirect + 'ENTRY_BLOCK_COPY' text
  test(
    "E4: online off: child cannot join, sees a one-line reason",
    async ({ browser }) => {
      test.setTimeout(150_000);
      const s = await seedConsentSession({ switches: { allowLiveSession: false }, phase: "PENDING" });
      const visit = await visitAs(
        browser,
        asLearner({ handle: s.learnerHandle, pin: s.learnerPin }),
        joinPath(s.whiteboardSessionId)
      );
      try {
        await expectJoinRefused(visit.page, s.whiteboardSessionId, "live_off", FAMILY_LIVE_OFF);
      } finally {
        await visit.context.close();
        await s.cleanup();
      }
    }
  );
  // Oracle: Same
  test(
    "E5: online off: parent joining as child cannot join",
    async ({ browser }) => {
      test.setTimeout(150_000);
      const s = await seedParentJoinPendingSession();
      // The family turns online off after the room exists: a new live record version.
      await saveFamilyConsentVersion(s.learnerProfileId, s.adminUserId, { allowLiveSession: false });
      const visit = await visitAs(browser, asAccountHolder(s.ahEmail, s.ahPassword), joinPath(s.whiteboardSessionId));
      try {
        await expectJoinRefused(visit.page, s.whiteboardSessionId, "live_off", FAMILY_LIVE_OFF);
      } finally {
        await visit.context.close();
        await dropFamilyConsentVersionsAbove(s.learnerProfileId, s.adminUserId, 1);
      }
    }
  );
  // Oracle: Same; red today
  test(
    "E6: online off: self-learner cannot join (the /join gap)",
    async ({ browser }) => {
      test.setTimeout(150_000);
      const s = await seedSelfLearnerWbSession({ sessionPhase: "PENDING" });
      await saveFamilyConsentVersion(s.learnerProfileId, s.adminUserId, { allowLiveSession: false });
      const visit = await visitAs(browser, asAccountHolder(s.ahEmail, s.ahPassword), joinPath(s.whiteboardSessionId));
      try {
        await expectJoinRefused(visit.page, s.whiteboardSessionId, "live_off", FAMILY_LIVE_OFF);
      } finally {
        await visit.context.close();
        await dropFamilyConsentVersionsAbove(s.learnerProfileId, s.adminUserId, 1);
      }
    }
  );
  // Oracle: Lands on the blocked page, not a room
  test(
    "E7: online off: old /w/<joinToken> link cannot join",
    async ({ browser }) => {
      test.setTimeout(150_000);
      const s = await seedConsentSession({ switches: { allowLiveSession: false }, phase: "PENDING" });
      const visit = await visitAs(
        browser,
        asLearner({ handle: s.learnerHandle, pin: s.learnerPin }),
        `/w/${s.joinToken}${JOIN_KEY_FRAGMENT}`
      );
      try {
        // The legacy link hands over to /join, which is where the one rule runs.
        await visit.page.waitForURL(new RegExp(`/join/${s.whiteboardSessionId}`), { timeout: 60_000 });
        await expectJoinRefused(visit.page, s.whiteboardSessionId, "live_off", FAMILY_LIVE_OFF);
      } finally {
        await visit.context.close();
        await s.cleanup();
      }
    }
  );
  // Oracle: DOM
  test(
    "E8: online off: schedule Join button is disabled with a reason for every principal",
    async ({ browser }) => {
      test.setTimeout(300_000);
      // Parent and tutor: the shared online-off appointment (the child's record has live off, in person still allowed).
      const { fx, sched } = await seedOnlineOffAppointment();
      const parent = await visitAs(browser, asAccountHolder(TEST_PARENT.email, TEST_PARENT.password), "/account/dashboard");
      const tutorContext = await browser.newContext({ storageState: TUTOR_STATE });
      // Child: the shared harness learner with its own appointment.
      const child = await seedConsentSession({ switches: { allowLiveSession: false }, phase: "PENDING" });
      const childAppointment = await seedBridgeScheduledSession({
        adminUserId: child.adminUserId,
        studentId: child.studentId,
        learnerProfileId: child.learnerProfileId,
        accountHolderId: (
          await withPrisma((p) =>
            p.learnerProfile.findUniqueOrThrow({
              where: { id: child.learnerProfileId },
              select: { accountHolderId: true },
            })
          )
        ).accountHolderId,
        startsInMs: 5 * 60_000,
      });
      const childVisit = await visitAs(browser, asLearner({ handle: child.learnerHandle, pin: child.learnerPin }), "/join");
      try {
        const parentJoin = parent.page.getByTestId(`join-scheduled-session-${sched.scheduledSessionId}`);
        await expect(parentJoin).toBeVisible({ timeout: 30_000 });
        await expect(parentJoin).toBeDisabled();
        await expect(parent.page.getByTestId(`join-scheduled-reason-${sched.scheduledSessionId}`)).toHaveText(FAMILY_LIVE_OFF);

        const childJoin = childVisit.page.getByTestId(`join-scheduled-session-${childAppointment.scheduledSessionId}`);
        await expect(childJoin).toBeVisible({ timeout: 30_000 });
        await expect(childJoin).toBeDisabled();
        await expect(
          childVisit.page.getByTestId(`join-scheduled-reason-${childAppointment.scheduledSessionId}`)
        ).toHaveText(FAMILY_LIVE_OFF);

        // The tutor's control is Open room: online-off does not close it (in person), and the reason sits under it.
        const tutorPage = await tutorContext.newPage();
        await tutorPage.goto(`/admin/students/${fx.studentId}`, { waitUntil: "domcontentloaded" });
        const open = tutorPage.getByTestId(`open-scheduled-room-${sched.scheduledSessionId}`).first();
        await expect(open).toBeVisible({ timeout: 30_000 });
        await expect(open).toBeEnabled();
        await expect(tutorPage.getByTestId(`open-scheduled-room-reason-${sched.scheduledSessionId}`)).toContainText(
          IN_PERSON_STILL_OPEN
        );
      } finally {
        await parent.context.close();
        await tutorContext.close();
        await childVisit.context.close();
        await withPrisma((p) =>
          p.scheduledSession.deleteMany({
            where: { id: { in: [sched.scheduledSessionId, childAppointment.scheduledSessionId] } },
          })
        );
        await child.cleanup();
      }
    }
  );
  // Oracle: Positive control
  test(
    "E9: online on: all of the above succeed",
    async ({ browser, request }) => {
      test.setTimeout(300_000);
      const f = await seedStartFixture({ record: {}, snapshot: true });
      const id = f.whiteboardSessionId;
      const login = await giveLearnerLogin(f.learnerProfileId, [id]);
      const tutorContext = await browser.newContext({ storageState: TUTOR_STATE });
      let visit: JoinVisit | null = null;
      try {
        // The tutor's waiting room offers both modes, with the ordinary Start label and no reason line.
        const tutorPage = await tutorContext.newPage();
        await openWorkspaceWaitingRoom(tutorPage, f);
        await expect(tutorPage.getByTestId("wb-session-mode-live")).toBeVisible();
        await expect(tutorPage.getByTestId("wb-session-mode-in-person")).toBeVisible();
        await expect(tutorPage.getByTestId("wb-waiting-online-blocked")).toHaveCount(0);
        await expect(tutorPage.getByTestId("wb-start-session")).toHaveText("Start session");

        // The child joins; the tutor mints a join token; the tutor starts Online.
        visit = await visitAs(browser, asLearner(login), joinPath(id));
        await expectJoinAdmitted(visit.page);
        expect((await issueTokenVia(request, id)).ok).toBe(true);
        const started = await startVia(request, id, "LIVE");
        expect(started.ok).toBe(true);
        if (started.ok) expect(started.sessionMode).toBe("LIVE");
      } finally {
        await visit?.context.close();
        await tutorContext.close();
        await f.cleanup();
      }
    }
  );
  // Oracle: Two sessions, one learner profile
  test(
    "E10: org consent off, private consent on: org session blocked, private session allowed, same learner",
    { tag: [TAG.ORG] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      const x = await seedTwoOwnerLearner({ orgAllowsLive: false, privateAllowsLive: true });
      const context = await browser.newContext();
      try {
        await asLearner(x.login)(context);
        const orgPage = await context.newPage();
        await orgPage.goto(joinPath(x.orgSessionId), { waitUntil: "domcontentloaded" });
        await expectJoinRefused(orgPage, x.orgSessionId, "live_off", FAMILY_LIVE_OFF);
        const privatePage = await context.newPage();
        await privatePage.goto(joinPath(x.privateSessionId), { waitUntil: "domcontentloaded" });
        await expectJoinAdmitted(privatePage);
      } finally {
        await context.close();
        await x.cleanup();
      }
    }
  );
  // Oracle: Same
  test(
    "E11: org consent on, private consent off: private session blocked, org session allowed",
    { tag: [TAG.ORG] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      const x = await seedTwoOwnerLearner({ orgAllowsLive: true, privateAllowsLive: false });
      const context = await browser.newContext();
      try {
        await asLearner(x.login)(context);
        const privatePage = await context.newPage();
        await privatePage.goto(joinPath(x.privateSessionId), { waitUntil: "domcontentloaded" });
        await expectJoinRefused(privatePage, x.privateSessionId, "live_off", FAMILY_LIVE_OFF);
        const orgPage = await context.newPage();
        await orgPage.goto(joinPath(x.orgSessionId), { waitUntil: "domcontentloaded" });
        await expectJoinAdmitted(orgPage);
      } finally {
        await context.close();
        await x.cleanup();
      }
    }
  );
  // Oracle: Live read while PENDING; '[cns]' log
  test(
    "E12: parent turns online on after the room was opened: child can join without a new session",
    async ({ browser, request }) => {
      test.setTimeout(240_000);
      const f = await seedStartFixture({ record: { allowLiveSession: false }, snapshot: true });
      const id = f.whiteboardSessionId;
      const login = await giveLearnerLogin(f.learnerProfileId, [id]);
      const visit = await visitAs(browser, asLearner(login), joinPath(id));
      try {
        await expectJoinRefused(visit.page, id, "live_off", FAMILY_LIVE_OFF);

        // The parent turns online on: a new live record version. The room (and its create-time snapshot) is untouched.
        await saveFamilyConsentVersion(f.learnerProfileId, f.adminUserId, { allowLiveSession: true });
        // A reload (a goto to the same URL and hash would be a same-document navigation and never ask the server).
        await visit.page.reload({ waitUntil: "domcontentloaded" });
        await expectJoinAdmitted(visit.page);

        // Same room: one session row for the student, still PENDING, and the tutor can now Start Online.
        const sessions = await withPrisma((p) => p.whiteboardSession.count({ where: { studentId: f.studentId } }));
        expect(sessions).toBe(1);
        expect((await sessionRow(id)).sessionPhase).toBe("PENDING");
        const started = await startVia(request, id, "LIVE");
        expect(started.ok).toBe(true);
      } finally {
        await visit.context.close();
        await f.cleanup();
      }
    }
  );
  // Oracle: Same
  test(
    "E13: child turns online off after the room was opened: child is refused",
    async ({ browser }) => {
      test.setTimeout(240_000);
      const f = await seedStartFixture({ record: {}, snapshot: true });
      const id = f.whiteboardSessionId;
      const login = await giveLearnerLogin(f.learnerProfileId, [id]);
      const visit = await visitAs(browser, asLearner(login), joinPath(id));
      try {
        await expectJoinAdmitted(visit.page);

        // The child tightens their own privacy: a restriction row forbids live sessions. No new session, no Start.
        await withPrisma((p) =>
          p.consentRestriction.create({
            data: { learnerProfileId: f.learnerProfileId, restrictLiveSession: true, childSetLiveSession: true },
          })
        );
        await visit.page.reload({ waitUntil: "domcontentloaded" });
        await expectJoinRefused(visit.page, id, "live_off", FAMILY_LIVE_OFF);
        expect((await sessionRow(id)).sessionPhase).toBe("PENDING");
      } finally {
        await visit.context.close();
        await f.cleanup();
      }
    }
  );
  // Oracle: Accept/refuse of each site vs the brief's table typed into the spec
  // The brief's table, typed here (never read from the rule): what every caller must answer for each privacy fixture.
  //   no record    : Online refused (no record), in person refused (no record)
  //   live off     : Online refused (live off),  in person accepted
  //   live on      : Online accepted,            in person accepted
  // `/join` and `issueJoinToken` are always online entries (the session's mode does not change their answer); the schedule
  // bridge is the tutor's Open room control, which opens the room for in person (its answer is the in-person column).
  test(
    "E16: one rule, every caller: Start, bridge, /join and issueJoinToken give the same answer for every (toggle, mode) fixture",
    async ({ browser, request }) => {
      test.setTimeout(900_000);
      const accept = { ok: true } as const;
      const refuse = (reason: string) => ({ ok: false, reason }) as const;
      const fixtures = [
        { name: "no record", record: null, snapshot: false, online: refuse("consent_missing_parent"), inPerson: refuse("consent_missing_parent") },
        { name: "live off", record: { allowLiveSession: false }, snapshot: true, online: refuse("live_off"), inPerson: accept },
        { name: "live on", record: {}, snapshot: true, online: accept, inPerson: accept },
      ] as const;

      for (const fixture of fixtures) {
        // Start, once per mode, on a fresh session each (an accepted Start changes the session).
        for (const mode of ["LIVE", "IN_PERSON"] as const) {
          const f = await seedStartFixture({ record: fixture.record, snapshot: fixture.snapshot });
          try {
            const expected = mode === "LIVE" ? fixture.online : fixture.inPerson;
            const result = await startVia(request, f.whiteboardSessionId, mode);
            const label = `Start (${fixture.name}, ${mode})`;
            if (expected.ok) expect(result.ok, label).toBe(true);
            else expect(result, label).toEqual({ ok: false, reason: expected.reason });
          } finally {
            await f.cleanup();
          }
        }

        // issueJoinToken, /join and the bridge on one PENDING session.
        const f = await seedStartFixture({ record: fixture.record, snapshot: fixture.snapshot });
        const id = f.whiteboardSessionId;
        const login = await giveLearnerLogin(f.learnerProfileId, [id]);
        const studentName = await studentNameOf(f.studentId);
        const visit = await visitAs(browser, asLearner(login), joinPath(id));
        try {
          const token = await issueTokenVia(request, id);
          const tokenLabel = `issueJoinToken (${fixture.name})`;
          if (fixture.online.ok) expect(token.ok, tokenLabel).toBe(true);
          else expect(token, tokenLabel).toEqual({ ok: false, reason: fixture.online.reason });

          if (fixture.online.ok) {
            await expectJoinAdmitted(visit.page);
          } else {
            const familyReason = fixture.online.reason;
            const familyText = familyReason === "live_off" ? FAMILY_LIVE_OFF : familyMissingParent(studentName);
            await expectJoinRefused(visit.page, id, familyReason, familyText);
          }
        } finally {
          await visit.context.close();
          await f.cleanup();
        }

        // The bridge: an appointment the tutor opens from the student page.
        const b = await seedStartFixture({ record: fixture.record, snapshot: fixture.snapshot });
        const appointment = await seedBridgeScheduledSession({
          adminUserId: b.adminUserId,
          studentId: b.studentId,
          learnerProfileId: b.learnerProfileId,
          accountHolderId: "unused",
          startsInMs: 5 * 60_000,
        });
        // The appointment, not a pre-made room, is what the control opens.
        await withPrisma(async (p) => {
          await p.sessionConsentSnapshot.deleteMany({ where: { whiteboardSessionId: b.whiteboardSessionId } });
          await p.whiteboardSession.deleteMany({ where: { id: b.whiteboardSessionId } });
        });
        const tutorContext = await browser.newContext({ storageState: TUTOR_STATE });
        try {
          const page = await tutorContext.newPage();
          await page.goto(`/admin/students/${b.studentId}`, { waitUntil: "domcontentloaded" });
          const open = page.getByTestId(`open-scheduled-room-${appointment.scheduledSessionId}`);
          if (fixture.inPerson.ok) {
            await expect(open.first(), `bridge control (${fixture.name})`).toBeVisible({ timeout: 30_000 });
            await expect(open.first()).toBeEnabled();
            await open.first().click();
            await page.waitForURL(/\/whiteboard\/[^/]+\/workspace/, { timeout: 60_000 });
          } else {
            // Neither mode can be entered: the page shows the "Open room unavailable" callout in place of the control.
            await expect(page.getByText("Open room unavailable"), `bridge callout (${fixture.name})`).toBeVisible({
              timeout: 30_000,
            });
            await expect(page.getByText("privacy preferences are not complete").first()).toBeVisible();
            await expect(open).toHaveCount(0);
            const rooms = await withPrisma((p) => p.whiteboardSession.count({ where: { studentId: b.studentId } }));
            expect(rooms, `no room is created for a refused bridge (${fixture.name})`).toBe(0);
          }
        } finally {
          await tutorContext.close();
          await withPrisma(async (p) => {
            await p.scheduledSession.deleteMany({ where: { id: appointment.scheduledSessionId } });
            const rooms = await p.whiteboardSession.findMany({ where: { studentId: b.studentId }, select: { id: true } });
            const roomIds = rooms.map((r) => r.id);
            await p.sessionConsentSnapshot.deleteMany({ where: { whiteboardSessionId: { in: roomIds } } });
            await p.productEvent.deleteMany({ where: { whiteboardSessionId: { in: roomIds } } });
            await p.whiteboardSession.deleteMany({ where: { id: { in: roomIds } } });
          });
          await b.cleanup();
        }
      }
    }
  );
  // Oracle: DOM on the scheduler card; the 'org-learner.ts' child-floor bug; red today, fixed in C1.
  // Independent oracle (no copy literal, no value read from the implementation): the restricted learner's
  // card must show EXACTLY the line the card already shows for the plain "org record forbids live" case
  // (the behavior that was right before this wave), and a learner whose restriction row does not touch live
  // shows no blocked line at all (positive control: the card is not simply always blocked).
  test(
    "E17: child restriction forbids live: the org scheduler card shows live sessions off even when the org record allows it",
    { tag: [TAG.ORG] },
    async ({ page }) => {
      test.setTimeout(180_000);
      const seeded = await seedEnrolled2faTutor();
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const familyName = `E17${stamp.slice(-4)}`;
      const created: { organizationId: string; profileIds: string[]; holderIds: string[] } = {
        organizationId: "",
        profileIds: [],
        holderIds: [],
      };

      async function seedCard(
        prisma: PrismaClient,
        organizationId: string,
        givenName: string,
        organizationRecordAllowsLive: boolean,
        restriction: { restrictLiveSession: boolean } | null
      ): Promise<string> {
        const holder = await prisma.accountHolder.create({
          data: { email: `pw-e17-${givenName.toLowerCase()}-${stamp}@test.local`, emailVerifiedAt: new Date() },
          select: { id: true },
        });
        created.holderIds.push(holder.id);
        const profile = await prisma.learnerProfile.create({
          data: { accountHolderId: holder.id, displayName: `${givenName} ${familyName}` },
          select: { id: true },
        });
        created.profileIds.push(profile.id);
        const student = await prisma.student.create({
          data: {
            name: `${givenName} ${familyName}`,
            adminUserId: null,
            organizationId,
            learnerProfileId: profile.id,
            organizationLearner: {
              create: { organizationId, givenName, familyName, createdByAdminUserId: seeded.adminUserId },
            },
          },
          select: { id: true },
        });
        await prisma.consentRecord.create({
          data: {
            learnerProfileId: profile.id,
            adminUserId: null,
            organizationId,
            version: 1,
            allowLiveSession: organizationRecordAllowsLive,
            allowAudioRecording: true,
            allowWhiteboardRecording: true,
            allowNoteSending: true,
            setByAccountHolderId: holder.id,
            captureMethod: "electronic",
          },
        });
        if (restriction) {
          await prisma.consentRestriction.create({
            data: { learnerProfileId: profile.id, ...restriction },
          });
        }
        return student.id;
      }

      try {
        const ids = await withPrisma(async (prisma) => {
          const operator = await prisma.adminUser.findUnique({
            where: { email: TEST_ADMIN.email },
            select: { id: true },
          });
          if (!operator) throw new Error("Playwright operator is missing from the local database.");
          await prisma.organizationMember.deleteMany({ where: { adminUserId: seeded.adminUserId } });
          const org = await prisma.organization.create({
            data: {
              name: `PW E17 ${stamp}`,
              timezone: "America/Denver",
              status: "active",
              createdByOperatorId: operator.id,
              members: {
                create: [
                  { adminUserId: operator.id, roles: ["owner"] },
                  { adminUserId: seeded.adminUserId, roles: ["scheduler"] },
                ],
              },
            },
            select: { id: true },
          });
          created.organizationId = org.id;
          return {
            restricted: await seedCard(prisma, org.id, "Rae", true, { restrictLiveSession: true }),
            orgOff: await seedCard(prisma, org.id, "Tia", false, null),
            unrestricted: await seedCard(prisma, org.id, "Sam", true, { restrictLiveSession: false }),
          };
        });

        await page.context().clearCookies();
        // Retries the form fill once: the first fill can land before the login form hydrates.
        await loginTutorWithPassword(page, TEST_2FA_TUTOR);
        await waitFor2faVerifyChallenge(page);
        await submitTotpOnVerifyPage(page, generateTotpCode(TEST_2FA_TUTOR.totpSecret));
        await page.waitForURL((url) => !url.pathname.includes("/2fa"), { timeout: 30_000 });
        await page.goto(`/admin/organization/${created.organizationId}`);

        const cards = page.getByTestId("org-scheduler-cards");
        await expect(cards.getByText(`Rae ${familyName}`)).toBeVisible({ timeout: 30_000 });

        const orgOffLine = page.getByTestId(`org-learner-blocked-${ids.orgOff}`);
        await expect(orgOffLine).toBeVisible();
        const expectedLine = (await orgOffLine.innerText()).trim();
        expect(expectedLine.length).toBeGreaterThan(0);

        // The bug: org record allows live, child restricted live. Must show the same line as the org-off case.
        await expect(page.getByTestId(`org-learner-blocked-${ids.restricted}`)).toHaveText(expectedLine);
        // Positive control: restriction row exists but does not touch live. No blocked line.
        await expect(page.getByTestId(`org-learner-blocked-${ids.unrestricted}`)).toHaveCount(0);
      } finally {
        await withPrisma(async (prisma) => {
          // Records reference the organization, so they go first.
          await prisma.consentRecord.deleteMany({ where: { learnerProfileId: { in: created.profileIds } } });
          await prisma.consentRestriction.deleteMany({ where: { learnerProfileId: { in: created.profileIds } } });
          if (created.organizationId) {
            await prisma.student.deleteMany({ where: { organizationId: created.organizationId } });
            await prisma.organization.deleteMany({ where: { id: created.organizationId } });
          }
          await prisma.learnerProfile.deleteMany({ where: { id: { in: created.profileIds } } });
          await prisma.accountHolder.deleteMany({ where: { id: { in: created.holderIds } } });
        });
      }
    }
  );
  // Oracle: Q9 (PENDING ANDREW, default applied). Online off; create an in-person-intended session; the learner opens '/join' and is refused with the one-line reason ('ENTRY_BLOCK_COPY.live_off'), no room, no A/V. Control: online on …
  test(
    "E18: online off: a learner device cannot join any session, including one the tutor runs in person",
    async ({ browser }) => {
      test.setTimeout(400_000);
      // Each shape on its own (the harness learner is shared, so one live record at a time).
      for (const shape of [
        { name: "in-person session, still PENDING", phase: "PENDING", mode: "IN_PERSON" },
        { name: "in-person session the tutor already Started (ACTIVE)", phase: "ACTIVE", mode: "IN_PERSON" },
      ] as const) {
        const s = await seedConsentSession({ switches: { allowLiveSession: false }, phase: shape.phase, mode: shape.mode });
        const visit = await visitAs(
          browser,
          asLearner({ handle: s.learnerHandle, pin: s.learnerPin }),
          joinPath(s.whiteboardSessionId)
        );
        try {
          await expectJoinRefused(visit.page, s.whiteboardSessionId, "live_off", FAMILY_LIVE_OFF);
        } finally {
          await visit.context.close();
          await s.cleanup();
        }
      }

      // Control: online on, the same learner joins the same shape.
      const control = await seedConsentSession({ switches: {}, phase: "ACTIVE", mode: "IN_PERSON" });
      const visit = await visitAs(
        browser,
        asLearner({ handle: control.learnerHandle, pin: control.learnerPin }),
        joinPath(control.whiteboardSessionId)
      );
      try {
        await expectJoinAdmitted(visit.page);
      } finally {
        await visit.context.close();
        await control.cleanup();
      }
    }
  );
  // Oracle: C7. Spec-typed literals: the § 7a consent-editor descriptions (parent, child, self) and the § 7b 'ENTRY_BLOCK_COPY.live_off' lines (tutor and family) plus the waiting-room reason. The in-session recording notice is V1 an …
  test.fixme(
    "E-copy: approved § 7a editor strings and the § 7b live_off reword render",
    async () => {
      // pending: wave that owns E-copy
    }
  );
});

// ---------------------------------------------------------------------------
// 6b. Start and refreeze (B5)
// ---------------------------------------------------------------------------
test.describe("consent 6b: Start and refreeze (B5)", {
  tag: [TAG.WB_CONSENT, TAG.WB_PRESENCE, TAG.WB_SYNC],
}, () => {
  // Oracle: Arm → park → release (B3). Arm 'start:tx:between_consent_read_and_update' with 'parkFirstN: 1'; fire Start A (it parks inside its transaction, before its update); wait until parked; flip a consent toggle through the real …
  test(
    "S1: double Start (two tabs): the second Start does not refreeze an ACTIVE session",
    async ({ request }) => {
      test.setTimeout(90_000);
      // Plain-owned tutor (SF-B): a parked Start must not hold an org lock.
      const f = await seedStartFixture({ record: {}, snapshot: false });
      const id = f.whiteboardSessionId;
      try {
        await armHold(request, { name: START_HOLD, sessionId: id, parkFirstN: 1 });
        const startA = startVia(request, id);
        void startA.catch(() => undefined);
        await waitUntilParked(request, START_HOLD, id);

        // The family flips audio off while A is parked after its read. B passes the seam, wins, goes ACTIVE.
        await saveFamilyConsentVersion(f.learnerProfileId, f.adminUserId, { allowAudioRecording: false });
        const b = await startVia(request, id);
        expect(b.ok).toBe(true);
        const afterB = await readConsentSnapshots(id);
        expect(afterB).toHaveLength(1);
        expect(afterB[0]).toMatchObject({
          allowLiveSession: true,
          allowAudioRecording: false,
          allowWhiteboardRecording: true,
          allowNoteSending: true,
          consentRecordVersion: 2,
        });
        expect((await sessionRow(id)).sessionPhase).toBe("ACTIVE");

        await releaseHold(request, START_HOLD, id);
        const a = await startA;

        // A's conditional update matched zero rows, so A must not have re-frozen: the row is exactly B's
        // (frozenAt included), and A answers with B's frozen capabilities, not its own stale read.
        expect(a.ok).toBe(true);
        expect(await readConsentSnapshots(id)).toEqual(afterB);
        if (a.ok && b.ok) {
          expect(a.capabilities).toEqual(b.capabilities);
          // Independent oracle: audio off, online (LIVE) means the learner's voice is left out.
          expect(b.capabilities.audio.mode).toBe("tutor_only");
          expect(b.capabilities.transcript.learnerVoice).toBe(false);
        }
        await expectReleasedByTest(request, START_HOLD, id);
      } finally {
        await resetSeams(request);
        await f.cleanup();
      }
    }
  );
  // Oracle: C3a Start half, behavior only. Capabilities unchanged; lanes unchanged. The "next session" sentence is S2b (C7), not this row
  test(
    "S2: ACTIVE session: a consent flip changes nothing mid-session",
    async ({ request }) => {
      test.setTimeout(90_000);
      const f = await seedStartFixture({ record: {}, snapshot: true });
      const id = f.whiteboardSessionId;
      try {
        const first = await startVia(request, id, "LIVE");
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        // Everything is on, so every capability and both transcript lanes are on.
        expect(first.capabilities).toMatchObject({
          audio: { mode: "full" },
          whiteboard: { persist: true },
          notes: { draft: true },
          transcript: { tutorVoice: true, learnerVoice: true },
          replay: { audio: true, board: true },
        });
        const rowBefore = await readConsentSnapshots(id);

        // The family turns every switch off mid-session.
        await saveFamilyConsentVersion(f.learnerProfileId, f.adminUserId, {
          allowLiveSession: false,
          allowAudioRecording: false,
          allowWhiteboardRecording: false,
          allowNoteSending: false,
        });
        const second = await startVia(request, id, "LIVE");
        expect(second.ok).toBe(true);
        if (!second.ok) return;
        // Capabilities and lanes are what was frozen at Start, not the new record.
        expect(second.capabilities).toEqual(first.capabilities);
        expect(await readConsentSnapshots(id)).toEqual(rowBefore);
        expect((await sessionRow(id)).sessionPhase).toBe("ACTIVE");
      } finally {
        await f.cleanup();
      }
    }
  );
  // Oracle: C7. DOM text typed in the spec, the § 7a line "Changes apply to the next session, not one already started", on the in-session notice and the consent editors. Not folded into V1/V2: those assert which recordings are off,  …
  test.fixme(
    "S2b: ACTIVE session: the notice says a consent change applies to the next session",
    async () => {
      // pending: wave that owns S2b
    }
  );
  // Oracle: Blob store listing has no learner-lane object; no 'speaker:*' row in 'SessionRecording' or 'TranscriptChunk'; client adopted the response
  // The page loads with audio on (a learner lane would be armed from page-load capabilities); the family turns audio off
  // before Start. Start refreezes audio off, and the tutor client must act on THAT answer: no learner lane recorder, no
  // learner-lane row, no blob outside the tutor lane; the tutor banner names the adopted mode.
  test(
    "S3: consent flipped between page load and Start: Start returns the refrozen capabilities and no learner lane or blob is created",
    { tag: [TAG.WB_AV, TAG.WB_RECORDING] },
    async ({ browser, request }) => {
      test.setTimeout(300_000);
      const s = await seedConsentSession({ switches: { allowAudioRecording: true } });
      const tutorLines: string[] = [];
      let contexts = 0;
      const pair = await openTutorAndStudent(browser, s, {
        ensureFollow: false,
        // Tutor context is prepared first; only the tutor runs lane recorders.
        prepareContext: async (ctx: BrowserContext) => {
          if (contexts++ === 0) {
            ctx.on("console", (m) => tutorLines.push(m.text()));
            await injectVadOverrides(ctx);
          }
        },
      });
      try {
        const id = s.whiteboardSessionId;
        await chooseMode(pair.tutorPage, "LIVE");
        await setFamilySwitches(s, { allowAudioRecording: false }, { snapshot: false });
        const blobsBefore = blobIntegrationEnabled() ? new Set((await listHarnessBlobs(request)).map((o) => o.key)) : null;

        await startFromWaitingRoom(pair.tutorPage);
        await expect(pair.tutorPage.getByTestId("wb-audio-consent-banner")).toContainText("Student audio not recorded");
        await pair.tutorPage.waitForTimeout(2_000);
        await driveVadSilenceCut(pair.tutorPage);
        await pair.tutorPage.waitForTimeout(6_000);
        await endFromWorkspace(pair.tutorPage);

        expect(laneCreateLines(tutorLines)).toEqual([]);
        const rows = await withPrisma((p) =>
          p.sessionRecording.findMany({ where: { whiteboardSessionId: id }, select: { streamId: true, blobUrl: true } })
        );
        const chunks = await withPrisma((p) =>
          p.transcriptChunk.findMany({ where: { sessionId: id }, select: { streamId: true, chunkBlobUrl: true } })
        );
        for (const r of rows) expect(r.streamId).toBe("tutor:mic");
        for (const c of chunks) expect(c.streamId ?? "tutor:mic").toBe("tutor:mic");
        if (blobsBefore) {
          // The session's concat audio is assembled from the recordings above (all tutor:mic), so it is tutor audio.
          const { concatBlobUrl } = await withPrisma((p) =>
            p.whiteboardSession.findUniqueOrThrow({ where: { id }, select: { concatBlobUrl: true } })
          );
          const tutorUrls = [...rows.map((r) => r.blobUrl), ...chunks.map((c) => c.chunkBlobUrl), concatBlobUrl].map(
            (u) => decodeURIComponent(u ?? "")
          );
          const stray = (await listHarnessBlobs(request))
            .map((o) => o.key)
            .filter((k) => !blobsBefore.has(k))
            .filter((k) => !/-events\.json|-snapshot\.png/.test(k) && !k.includes("/assets/"))
            .filter((k) => !tutorUrls.some((u) => u.includes(k)));
          expect(stray).toEqual([]);
        }
      } finally {
        await pair.close();
        await s.cleanup();
      }
    }
  );
  // Oracle: Response vs DB row
  test(
    "S4: Start returns capabilities equal to the snapshot row it just wrote",
    async ({ request }) => {
      test.setTimeout(90_000);
      // Created with everything on (snapshot v1); the family then turns audio and the board off BEFORE Start.
      const f = await seedStartFixture({ record: {}, snapshot: true });
      const id = f.whiteboardSessionId;
      try {
        const saved = await saveFamilyConsentVersion(f.learnerProfileId, f.adminUserId, {
          allowAudioRecording: false,
          allowWhiteboardRecording: false,
        });
        const started = await startVia(request, id, "LIVE");
        expect(started.ok).toBe(true);
        if (!started.ok) return;

        const rows = await readConsentSnapshots(id);
        expect(rows).toHaveLength(1);
        // The row Start wrote is the live record at Start...
        expect(rows[0]).toMatchObject({
          consentRecordId: saved.id,
          consentRecordVersion: saved.version,
          allowAudioRecording: false,
          allowWhiteboardRecording: false,
          allowNoteSending: true,
          allowLiveSession: true,
        });
        // ...and the response is that row, read through the spec's own switch-to-capability table.
        expect(started.capabilities.audio.mode).toBe(rows[0].allowAudioRecording ? "full" : "tutor_only");
        expect(started.capabilities.transcript.learnerVoice).toBe(rows[0].allowAudioRecording);
        expect(started.capabilities.whiteboard.persist).toBe(rows[0].allowWhiteboardRecording);
        expect(started.capabilities.replay.board).toBe(rows[0].allowWhiteboardRecording);
        expect(started.capabilities.notes.draft).toBe(rows[0].allowNoteSending);
        expect(started.sessionMode).toBe("LIVE");
      } finally {
        await f.cleanup();
      }
    }
  );
  // Oracle: Arm → park → release (B3), plain-owned tutor (SF-B), red recorded on the seam-only commit (SF-A). Online Start with live on; arm 'start:tx:between_consent_read_and_update'; fire Start (parks after its first 'sessionEntry …
  for (const preSnapshot of [false, true]) {
    test(
      `S5: Start refuses online when live is off even if the refusal read and the update interleave (${preSnapshot ? "session with a create-time snapshot" : "legacy session, no snapshot"})`,
      async ({ request }) => {
        test.setTimeout(90_000);
        const f = await seedStartFixture({ record: {}, snapshot: preSnapshot });
        const id = f.whiteboardSessionId;
        try {
          const snapshotBefore = await readConsentSnapshots(id);
          await armHold(request, { name: START_HOLD, sessionId: id, parkFirstN: 1 });
          const start = startVia(request, id, "LIVE");
          void start.catch(() => undefined);
          await waitUntilParked(request, START_HOLD, id);

          // Live was on at Start's read. The family turns it off while Start is parked.
          await saveFamilyConsentVersion(f.learnerProfileId, f.adminUserId, { allowLiveSession: false });
          await releaseHold(request, START_HOLD, id);
          const result = await start;

          // The refusal is returned data naming the reason, and the whole transaction rolled back.
          expect(result).toEqual({ ok: false, reason: "live_off" });
          const row = await sessionRow(id);
          expect(row.sessionPhase).toBe("PENDING");
          expect(row.activatedAt).toBeNull();
          expect(await readConsentSnapshots(id)).toEqual(snapshotBefore);
          const blobs = await listHarnessBlobs(request, "");
          expect(blobs.filter((b) => b.key.includes(id))).toHaveLength(0);
          await expectReleasedByTest(request, START_HOLD, id);
        } finally {
          await resetSeams(request);
          await f.cleanup();
        }
      }
    );
  }
  // Oracle: Re-premised by re-review 2 (R1). New code cannot create an unclaimed-learner session (the entry rule refuses it), so the test seeds a legacy PENDING row directly through the DB oracle helper (a 'WhiteboardSe …
  // The claimed learner and its whiteboard-off record are seeded directly with the legacy row (a pre-gate session the family
  // claimed later). The `[cns] refrozen_at_start created=true` line is not read here; the new snapshot row is the oracle.
  test(
    "S6: legacy PENDING session with no snapshot: family claims and turns whiteboard off, tutor Starts, session ends: the board is purged",
    async ({ request }) => {
      test.setTimeout(120_000);
      const f = await seedStartFixture({ record: { allowWhiteboardRecording: false }, snapshot: false });
      const id = f.whiteboardSessionId;
      const prefix = `whiteboard-sessions/${f.studentId}/${id}/`;
      try {
        expect(await readConsentSnapshots(id), "precondition: legacy row, no snapshot").toEqual([]);
        const started = await startVia(request, id, "LIVE");
        expect(started.ok).toBe(true);
        const snaps = await readConsentSnapshots(id);
        expect(snaps).toHaveLength(1);
        expect(snaps[0]).toMatchObject({ allowWhiteboardRecording: false });

        // Board data present before End (positive control).
        await withPrisma((p) =>
          p.whiteboardEventBatch.create({
            data: {
              whiteboardSessionId: id,
              batchSeq: 1,
              fromEventIndex: 0,
              toEventIndex: 1,
              eventsJson: [{ t: 0, type: "add", id: "pw-s6" }],
              boardDocumentJson: { pages: [] },
              schemaVersion: 1,
            },
          })
        );
        await seedHarnessBlobs(request, [
          { key: `${prefix}1-events.json`, text: "{}", contentType: "application/json" },
          { key: `${prefix}assets/1-image.png`, text: "pw-s6-image", contentType: "image/png" },
        ]);
        expect((await listHarnessBlobs(request, prefix)).length).toBe(2);

        // Started, so End needs a URL: the one the row already names.
        const { eventsBlobUrl } = await withPrisma((p) =>
          p.whiteboardSession.findUniqueOrThrow({ where: { id }, select: { eventsBlobUrl: true } })
        );
        const end = await invokeConsentAction(request, "endWhiteboardSession", id, { finalEventsBlobUrl: eventsBlobUrl });
        expect(end.status(), await end.text()).toBe(200);
        await expect
          .poll(
            () =>
              withPrisma(async (p) =>
                (await p.whiteboardSession.findUniqueOrThrow({ where: { id }, select: { boardPurgeFirstPassAt: true } }))
                  .boardPurgeFirstPassAt !== null
              ),
            { timeout: 20_000 }
          )
          .toBe(true);
        await withPrisma((p) =>
          p.whiteboardSession.update({
            where: { id },
            data: { boardPurgeFirstPassAt: new Date(Date.now() - 2 * 60 * 60_000) },
          })
        );
        const sweep = await runCron(request, "/api/cron/session-cleanup");
        expect(sweep.status, sweep.text).toBe(200);
        expect(await withPrisma((p) => p.whiteboardEventBatch.count({ where: { whiteboardSessionId: id } }))).toBe(0);
        expect(await listHarnessBlobs(request, prefix)).toEqual([]);
      } finally {
        await f.cleanup();
      }
    }
  );
  // Oracle: C3a End half. Parametrized over tutor End ('endWhiteboardSession') and the shared stale stamp ('endStaleWhiteboardSession'; the reaper's snapshot arm is G2). Family sets whiteboard off after create; End. Oracle: the winn …
  // The snapshot seeded at create says everything is on. After the family's save, only the End path can make the row
  // point at the new record version, so the oracle is the stored row (record id, switches, frozenAt) and endedAt.
  for (const endPath of ["endWhiteboardSession", "endStaleWhiteboardSession"] as const) {
    for (const whiteboardOn of [false, true]) {
      test(
        `S7: PENDING session ended without Start: the live record at End decides, and the End path writes the snapshot (${endPath}, whiteboard ${whiteboardOn ? "on (control)" : "off"})`,
        async ({ request }) => {
          const s = await seedWbPendingLiveSyncSession();
          const id = s.whiteboardSessionId;
          await dropFamilyConsentVersionsAbove(s.learnerProfileId, s.adminUserId, 1);
          const endArgs = endPath === "endWhiteboardSession" ? { finalEventsBlobUrl: "" } : undefined;
          try {
            const saved = await saveFamilyConsentVersion(s.learnerProfileId, s.adminUserId, {
              allowWhiteboardRecording: whiteboardOn,
            });
            const endStartMs = Date.now();
            const first = await invokeConsentAction(request, endPath, id, endArgs);
            expect(first.status(), await first.text()).toBe(200);

            const ended = await withPrisma((p) =>
              p.whiteboardSession.findUniqueOrThrow({ where: { id }, select: { endedAt: true } })
            );
            expect(ended.endedAt).not.toBeNull();
            const rows = await readConsentSnapshots(id);
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({
              consentRecordId: saved.id,
              consentRecordVersion: saved.version,
              allowWhiteboardRecording: whiteboardOn,
              allowLiveSession: true,
              allowAudioRecording: true,
              allowNoteSending: true,
            });
            expect(rows[0].frozenAt.getTime()).toBeGreaterThanOrEqual(endStartMs);

            // A second End after another family change writes no second snapshot and does not move endedAt.
            await saveFamilyConsentVersion(s.learnerProfileId, s.adminUserId, {
              allowWhiteboardRecording: !whiteboardOn,
              allowAudioRecording: false,
            });
            const second = await invokeConsentAction(request, endPath, id, endArgs);
            expect(second.ok()).toBe(false);
            expect(await readConsentSnapshots(id)).toEqual(rows);
            const after = await withPrisma((p) =>
              p.whiteboardSession.findUniqueOrThrow({ where: { id }, select: { endedAt: true } })
            );
            expect(after.endedAt).toEqual(ended.endedAt);
          } finally {
            await dropFamilyConsentVersionsAbove(s.learnerProfileId, s.adminUserId, 1);
          }
        }
      );
    }
  }
  // Oracle: C4b (migration + 'stampBoardPurgeIntent'). Same two callers as S7. After End with whiteboard off: 'boardPurgeRequestedAt' is set, and the sweep predicate selects that same snapshot row. Control: whiteboard on, no intent. …
  for (const endPath of ["endWhiteboardSession", "endStaleWhiteboardSession"] as const) {
    for (const whiteboardOn of [false, true]) {
      test(
        `S7b: PENDING session ended without Start: the purge intent is written from that snapshot, and the sweep selects it (${endPath}, whiteboard ${whiteboardOn ? "on (control)" : "off"})`,
        async ({ request }) => {
          const s = await seedWbPendingLiveSyncSession();
          const id = s.whiteboardSessionId;
          await dropFamilyConsentVersionsAbove(s.learnerProfileId, s.adminUserId, 1);
          const endArgs = endPath === "endWhiteboardSession" ? { finalEventsBlobUrl: "" } : undefined;
          const purgeRow = () =>
            withPrisma((p) =>
              p.whiteboardSession.findUniqueOrThrow({
                where: { id },
                select: { boardPurgeRequestedAt: true, boardPurgeFirstPassAt: true },
              })
            );
          try {
            await saveFamilyConsentVersion(s.learnerProfileId, s.adminUserId, { allowWhiteboardRecording: whiteboardOn });
            // Keep the End-time purge from running, so only the sweep can select the row.
            await armFault(request, { name: "end:after_purge", sessionId: id });
            const end = await invokeConsentAction(request, endPath, id, endArgs);
            expect(end.status(), await end.text()).toBe(200);
            const [snap] = await readConsentSnapshots(id);
            expect(snap).toMatchObject({ allowWhiteboardRecording: whiteboardOn });

            const intent = await purgeRow();
            if (whiteboardOn) {
              expect(intent.boardPurgeRequestedAt).toBeNull();
              return;
            }
            expect(intent.boardPurgeRequestedAt).not.toBeNull();
            expect(intent.boardPurgeFirstPassAt).toBeNull();
            const sweep = await runCron(request, "/api/cron/session-cleanup");
            expect(sweep.status, sweep.text).toBe(200);
            expect((await purgeRow()).boardPurgeFirstPassAt, "the sweep selected this row from its snapshot").not.toBeNull();
          } finally {
            await resetSeams(request);
            await dropFamilyConsentVersionsAbove(s.learnerProfileId, s.adminUserId, 1);
          }
        }
      );
    }
  }
  // Oracle: Arm → park → release (B3), deterministic, no "repeated N times". Two scripted orderings, on a plain-owned tutor. (a) Start parked, End runs: arm 'start:tx:between_consent_read_and_update'; fire Start (parks); wait until  …
  test(
    "S8: Start racing End on a PENDING session: exactly one wins, and the snapshot equals the live record at the moment the winning transaction committed",
    async ({ request }) => {
      test.setTimeout(120_000);
      const endArgs = { finalEventsBlobUrl: "" };

      // (a) Start parked, End runs to completion, then Start is released: Start must not activate an ended session,
      // and the snapshot is the End-time read of the live record (Start did not touch it).
      const a = await seedStartFixture({ record: {}, snapshot: false });
      try {
        await armHold(request, { name: START_HOLD, sessionId: a.whiteboardSessionId, parkFirstN: 1 });
        const start = startVia(request, a.whiteboardSessionId, "LIVE");
        void start.catch(() => undefined);
        await waitUntilParked(request, START_HOLD, a.whiteboardSessionId);

        const end = await invokeConsentAction(request, "endWhiteboardSession", a.whiteboardSessionId, endArgs);
        expect(end.status(), await end.text()).toBe(200);
        // The family flips a switch AFTER End committed: neither Start nor the snapshot may see it.
        await saveFamilyConsentVersion(a.learnerProfileId, a.adminUserId, { allowWhiteboardRecording: false });
        await releaseHold(request, START_HOLD, a.whiteboardSessionId);
        await start;

        const row = await sessionRow(a.whiteboardSessionId);
        expect(row.endedAt).not.toBeNull();
        expect(row.sessionPhase).not.toBe("ACTIVE");
        expect(row.activatedAt).toBeNull();
        const rows = await readConsentSnapshots(a.whiteboardSessionId);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          consentRecordVersion: 1,
          allowWhiteboardRecording: true,
          allowAudioRecording: true,
          allowLiveSession: true,
          allowNoteSending: true,
        });
        await expectReleasedByTest(request, START_HOLD, a.whiteboardSessionId);
      } finally {
        await resetSeams(request);
        await a.cleanup();
      }

      // (b) End parked (holding the row lock), Start fired, End released. One coherent outcome. This arm does
      // NOT prove lock order (S14 does): both orderings end in a state the oracle accepts.
      const b = await seedStartFixture({ record: {}, snapshot: false });
      try {
        await armHold(request, { name: END_HOLD, sessionId: b.whiteboardSessionId, parkFirstN: 1 });
        const end = invokeConsentAction(request, "endWhiteboardSession", b.whiteboardSessionId, endArgs);
        void end.catch(() => undefined);
        await waitUntilParked(request, END_HOLD, b.whiteboardSessionId);
        const start = startVia(request, b.whiteboardSessionId, "LIVE");
        void start.catch(() => undefined);
        // Give Start the chance to reach the row lock End holds (Postgres's own view; bounded, never a sleep).
        await expect
          .poll(() => countBackendsWaitingOnLock(), { timeout: 2_500 })
          .toBeGreaterThanOrEqual(1)
          .catch(() => undefined);
        await releaseHold(request, END_HOLD, b.whiteboardSessionId);
        const [endRes] = await Promise.all([end, start]);
        expect(endRes.status()).toBe(200);

        const row = await sessionRow(b.whiteboardSessionId);
        const rows = await readConsentSnapshots(b.whiteboardSessionId);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          consentRecordVersion: 1,
          allowLiveSession: true,
          allowAudioRecording: true,
          allowWhiteboardRecording: true,
          allowNoteSending: true,
        });
        const endedNotActive =
          row.endedAt !== null && row.sessionPhase !== "ACTIVE" && row.activatedAt === null;
        const activeNotEnded = row.endedAt === null && row.sessionPhase === "ACTIVE";
        expect(endedNotActive || activeNotEnded, JSON.stringify(row)).toBe(true);
        await expectReleasedByTest(request, END_HOLD, b.whiteboardSessionId);
      } finally {
        await resetSeams(request);
        await b.cleanup();
      }
    }
  );
  // Oracle: CHARACTERIZATION (relabeled by re-review 3), green today by design on its Start-after-End arm; ADDED by B3, veto-able. Sequential, no seam: End a PENDING session, then Start it → not activated, no 'startAt', snapshot unt …
  test.fixme(
    "S12: Start does not activate a session the End already stamped, and End after Start still ends cleanly",
    async () => {
      // pending: wave that owns S12
    }
  );
  // Oracle: SF1, RED today, arm → park → release, plain-owned tutor (SF-B). Seed a PENDING session with an effective record; arm 'start:tx:between_consent_read_and_update'; fire Start (it passes step 2's read and parks); wait until  …
  for (const preSnapshot of [false, true]) {
    test(
      `S13: Start rolls back when the freeze finds no record: the session stays PENDING, no snapshot row, no startAt (${preSnapshot ? "session with a create-time snapshot" : "legacy session, no snapshot"})`,
      async ({ request }) => {
        test.setTimeout(90_000);
        const f = await seedStartFixture({ record: {}, snapshot: preSnapshot });
        const id = f.whiteboardSessionId;
        try {
          const snapshotBefore = await readConsentSnapshots(id);
          await armHold(request, { name: START_HOLD, sessionId: id, parkFirstN: 1 });
          const start = startVia(request, id, "LIVE");
          void start.catch(() => undefined);
          await waitUntilParked(request, START_HOLD, id);

          // The effective record disappears (a direct row write, not an implementation call).
          await withPrisma((p) => p.consentRecord.deleteMany({ where: { learnerProfileId: f.learnerProfileId } }));
          await releaseHold(request, START_HOLD, id);
          const result = await start;

          expect(result).toEqual({ ok: false, reason: "consent_missing_parent" });
          const row = await sessionRow(id);
          expect(row.sessionPhase).toBe("PENDING");
          expect(row.activatedAt).toBeNull();
          expect(await readConsentSnapshots(id)).toEqual(snapshotBefore);
          const blobs = await listHarnessBlobs(request, "");
          expect(blobs.filter((b) => b.key.includes(id))).toHaveLength(0);
          await expectReleasedByTest(request, START_HOLD, id);
        } finally {
          await resetSeams(request);
          await f.cleanup();
        }
      }
    );
  }

  test(
    "S13 control: the same parked Start with the record left in place activates and writes the snapshot",
    async ({ request }) => {
      test.setTimeout(90_000);
      const f = await seedStartFixture({ record: {}, snapshot: false });
      const id = f.whiteboardSessionId;
      try {
        await armHold(request, { name: START_HOLD, sessionId: id, parkFirstN: 1 });
        const start = startVia(request, id, "LIVE");
        void start.catch(() => undefined);
        await waitUntilParked(request, START_HOLD, id);
        await releaseHold(request, START_HOLD, id);
        const result = await start;

        expect(result.ok).toBe(true);
        const row = await sessionRow(id);
        expect(row.sessionPhase).toBe("ACTIVE");
        expect(row.activatedAt).not.toBeNull();
        const rows = await readConsentSnapshots(id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ consentRecordVersion: 1, allowLiveSession: true });
      } finally {
        await resetSeams(request);
        await f.cleanup();
      }
    }
  );
  // Oracle: GREEN today by design (SF6 split). Seed a legacy PENDING session with no 'ConsentRecord' (the create-time gate prevents it for new sessions, so the DB oracle helper seeds it). Online Start: the server refuses ('CONSENT_R …
  test.fixme(
    "S9a: no consent record, online Start: characterization — today's server refuses and the session stays PENDING",
    async () => {
      // pending: wave that owns S9a
    }
  );
  // Oracle: RED today (SF6 split). Same seed. The Start control is disabled and shows the reason text (decision 6) in the DOM beside it; asserted by 'toHaveText' on the reason element. Red because the control today either stays sile …
  test(
    "S9b: no consent record, online Start: the reason is visible on the Start control",
    async ({ page }) => {
      test.setTimeout(150_000);
      const f = await seedStartFixture({ record: null });
      try {
        await openWorkspaceWaitingRoom(page, f);
        // Online (the default mode). The control is disabled AND the reason is in the DOM beside it.
        await expect(page.getByTestId("wb-waiting-overlay")).toHaveAttribute("data-session-mode", "LIVE");
        await expect(page.getByTestId("wb-start-session")).toBeDisabled();
        await expect(page.getByTestId("wb-waiting-start-blocked")).toContainText(NO_RECORD_PARENT_LINE);
      } finally {
        await f.cleanup();
      }
    }
  );
  // Oracle: GREEN today by design. Same as S9a, mode in person
  test.fixme(
    "S10a: no consent record, in-person Start: characterization — today's server refuses",
    async () => {
      // pending: wave that owns S10a
    }
  );
  // Oracle: RED today. Same as S9b, mode in person
  test(
    "S10b: no consent record, in-person Start: the reason is visible on the Start control",
    async ({ page }) => {
      test.setTimeout(150_000);
      const f = await seedStartFixture({ record: null });
      const control = await seedStartFixture({ record: {}, snapshot: true });
      try {
        await openWorkspaceWaitingRoom(page, f);
        await page.getByTestId("wb-session-mode-in-person").click();
        await expect(page.getByTestId("wb-waiting-overlay")).toHaveAttribute("data-session-mode", "IN_PERSON");
        // In person needs no student connection, so the only thing that can disable Start is the missing record.
        await expect(page.getByTestId("wb-start-session")).toBeDisabled();
        await expect(page.getByTestId("wb-waiting-start-blocked")).toContainText(NO_RECORD_PARENT_LINE);

        // Control: the same click path with a record in place leaves Start enabled and shows no blocked line.
        await openWorkspaceWaitingRoom(page, control);
        await page.getByTestId("wb-session-mode-in-person").click();
        await expect(page.getByTestId("wb-start-session")).toBeEnabled();
        await expect(page.getByTestId("wb-waiting-start-blocked")).toHaveCount(0);
      } finally {
        await f.cleanup();
        await control.cleanup();
      }
    }
  );
});

// ---------------------------------------------------------------------------
// 6g. Replay per principal (B7, D4)
// ---------------------------------------------------------------------------
test.describe("consent 6g: Replay per principal (B7, D4)", {
  tag: [TAG.WB_CONSENT, TAG.WB_ASSETS, TAG.WB_PRESENCE],
}, () => {
  /** The "View whiteboard" chips on a note card (`ParentShareNoteCard`). */
  const REPLAY_LINK = "[data-testid='share-wb-replay-links'] a";
  /** The inline audio players on a note card. */
  const CARD_AUDIO = "[data-testid='share-page-audio'] audio";
  const SHAPES = ["full", "audio_only", "board_only", "none"] as const;
  const PRINCIPALS = ["share", "learner"] as const;
  const PRINCIPAL_LABEL = { share: "share link", learner: "learner" } as const;
  const NOT_SAVED_LINE = "The board was not saved because whiteboard recording was off.";

  /** Every list that renders note cards, with the principal that reads it (parent notes and share are one family). */
  function listSurfaces(f: ReplayFixture): Array<{ name: string; principal: Principal; path: string }> {
    return [
      { name: "parent notes", principal: "share", path: `/account/children/${f.learnerProfileId}/notes` },
      { name: "share page", principal: "share", path: `/s/${f.shareToken}` },
      { name: "share all", principal: "share", path: `/s/${f.shareToken}/all` },
      { name: "learner home", principal: "learner", path: "/join" },
    ];
  }

  /** What a list shows for the fixture's note: replay chips and inline audio players. Waits for the card. */
  async function readCard(context: BrowserContext, path: string, noteId: string) {
    const page = await context.newPage();
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator(`article[data-note-id='${noteId}']`)).toBeVisible({ timeout: 45_000 });
      const card = page.locator(`article[data-note-id='${noteId}']`);
      return {
        links: await card.locator(REPLAY_LINK).count(),
        audio: await card.locator(CARD_AUDIO).count(),
        notesHeading: await card.getByText("Topics covered").count(),
      };
    } finally {
      await page.close();
    }
  }

  /** The replay page as the family sees it: player mounted, "not saved" line iff no board, audio scrubber iff audio. */
  async function expectReplayPageShape(
    context: BrowserContext,
    f: ReplayFixture,
    principal: Principal,
    access: { board: boolean; audio: boolean }
  ) {
    const page = await context.newPage();
    try {
      await page.goto(replayPagePath(f, principal), { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("wb-replay-in-frame")).toBeVisible({ timeout: 90_000 });
      await expect(page.getByTestId("wb-board-not-saved")).toHaveCount(access.board ? 0 : 1);
      if (!access.board) await expect(page.getByTestId("wb-board-not-saved")).toHaveText(NOT_SAVED_LINE);
      await expect(page.getByTestId("wb-replay-audio")).toHaveCount(access.audio ? 1 : 0);
    } finally {
      await page.close();
    }
  }

  /** Opens both family contexts, runs `check` for each principal, closes them. */
  async function forEachPrincipal(
    browser: Browser,
    f: ReplayFixture,
    check: (context: BrowserContext, principal: Principal) => Promise<void>
  ) {
    for (const principal of PRINCIPALS) {
      const context = await openFamilyContext(browser, f, principal);
      try {
        await check(context, principal);
      } finally {
        await context.close();
      }
    }
  }

  // Oracle: HTTP status of each replay URL plus DOM of the replay card ("audio scrubber only" for audio-only, board+audio for full, none link for none).
  // One test per shape, each covering both principals; the table SHAPE_ACCESS is hand-written from the plan, not read from the code.
  for (const shape of SHAPES) {
    test(
      `RP1: replay: ${shape} is available to ${PRINCIPALS.map((p) => PRINCIPAL_LABEL[p]).join(" and ")}`,
      async ({ browser }) => {
        test.setTimeout(240_000);
        const f = await seedReplay(browser, { shape });
        try {
          await forEachPrincipal(browser, f, async (context, principal) => {
            const access = SHAPE_ACCESS[shape];
            expectReads(await readReplay(context, f, principal), access, `${shape} / ${principal}`);
            if (access.board || access.audio) await expectReplayPageShape(context, f, principal, access);
          });
        } finally {
          await f.cleanup();
        }
      }
    );
  }

  // Oracle: compare the set of asset URLs reachable by token vs. by family.
  test(
    "RP2: replay: share link shows exactly what the family sees, nothing more",
    async ({ browser }) => {
      test.setTimeout(240_000);
      for (const shape of SHAPES) {
        const f = await seedReplay(browser, { shape });
        try {
          const reads = {} as Record<Principal, Awaited<ReturnType<typeof readReplay>>>;
          await forEachPrincipal(browser, f, async (context, principal) => {
            reads[principal] = await readReplay(context, f, principal);
          });
          // Same reachable set, and that set is the shape's: the token reaches nothing the learner cannot.
          expect(reads.share, `${shape}: share link vs learner`).toEqual(reads.learner);
          expectReads(reads.share, SHAPE_ACCESS[shape], `${shape}: share link`);
        } finally {
          await f.cleanup();
        }
      }
    }
  );

  // Oracle: record with whiteboard on, End, then flip the live record off; replay still 200 (the frozen snapshot decides). Red today.
  test(
    "RP3: replay after consent revoked post-End: a recorded board is still replayable",
    async ({ browser }) => {
      test.setTimeout(240_000);
      // The board was recorded (snapshot whiteboard on). The family later turned the board off and restricted it.
      const f = await seedReplay(browser, { shape: "full", liveRecord: { whiteboard: false }, restrictWhiteboard: true });
      try {
        await forEachPrincipal(browser, f, async (context, principal) => {
          expectReads(await readReplay(context, f, principal), SHAPE_ACCESS.full, `revoked / ${principal}`);
          await expectReplayPageShape(context, f, principal, SHAPE_ACCESS.full);
        });
        for (const surface of listSurfaces(f)) {
          const context = await openFamilyContext(browser, f, surface.principal);
          try {
            const card = await readCard(context, surface.path, f.noteId!);
            expect(card.links, `${surface.name}: View whiteboard chip`).toBe(1);
            expect(card.audio, `${surface.name}: inline audio`).toBe(1);
          } finally {
            await context.close();
          }
        }
      } finally {
        await f.cleanup();
      }
    }
  );

  // Oracle: the converse.
  test(
    "RP4: replay after consent granted post-End: an unrecorded board stays unavailable",
    async ({ browser }) => {
      test.setTimeout(240_000);
      // The board was NOT recorded (snapshot whiteboard off). The family later turned the board on.
      const f = await seedReplay(browser, { shape: "audio_only", liveRecord: { whiteboard: true } });
      try {
        await forEachPrincipal(browser, f, async (context, principal) => {
          expectReads(await readReplay(context, f, principal), SHAPE_ACCESS.audio_only, `granted / ${principal}`);
          await expectReplayPageShape(context, f, principal, SHAPE_ACCESS.audio_only);
        });
      } finally {
        await f.cleanup();
      }
    }
  );

  // Oracle: table-driven across the loaders, learner/share/parent pages, the audio proxy, and the share proxy (HTTP/DOM per site; oracle is the brief's table, not 'replay-access.ts').
  test(
    "RP5: all seven replay sites give the same answer for the same session",
    async ({ browser }) => {
      test.setTimeout(420_000);
      for (const shape of SHAPES) {
        const access = SHAPE_ACCESS[shape];
        const f = await seedReplay(browser, { shape });
        try {
          // Sites 1-4: the four lists (parent notes, share page, share all, learner home) show a chip and the inline
          // audio exactly when the table says so.
          for (const surface of listSurfaces(f)) {
            const context = await openFamilyContext(browser, f, surface.principal);
            try {
              const card = await readCard(context, surface.path, f.noteId!);
              expect(card.links, `${shape} / ${surface.name}: chip`).toBe(access.board || access.audio ? 1 : 0);
              expect(card.audio, `${shape} / ${surface.name}: inline audio`).toBe(access.audio ? 1 : 0);
            } finally {
              await context.close();
            }
          }
          // Sites 5-7: the replay pages, the board/audio routes and the audio proxy, for both principals.
          await forEachPrincipal(browser, f, async (context, principal) => {
            expectReads(await readReplay(context, f, principal), access, `${shape} / ${principal}`);
          });
        } finally {
          await f.cleanup();
        }
      }
    }
  );

  // Characterization (green before and after): a session with no snapshot keeps today's replay, open when the
  // learner's live record allows the board or when there is no record at all. The email-only arm is covered by
  // parent-child-notes-whiteboard-replay.spec.ts.
  test(
    "RP6: legacy session without a snapshot keeps today's replay behavior",
    async ({ browser }) => {
      test.setTimeout(240_000);
      for (const liveRecord of [{ whiteboard: true }, null]) {
        const f = await seedReplay(browser, { snapshot: false, liveRecord });
        try {
          await forEachPrincipal(browser, f, async (context, principal) => {
            expectReads(
              await readReplay(context, f, principal),
              SHAPE_ACCESS.full,
              `legacy, record ${liveRecord ? "allows board" : "absent"} / ${principal}`
            );
          });
          for (const surface of listSurfaces(f)) {
            const context = await openFamilyContext(browser, f, surface.principal);
            try {
              const card = await readCard(context, surface.path, f.noteId!);
              expect(card.links, `legacy ${surface.name}: chip`).toBe(1);
            } finally {
              await context.close();
            }
          }
        } finally {
          await f.cleanup();
        }
      }
    }
  );

  // Oracle: the legacy board still follows the live record (C6 lock): board denied, audio still open (legacy audio is open).
  test(
    "RP6b: legacy session whose live record has whiteboard off: board hidden, audio still replayable",
    async ({ browser }) => {
      test.setTimeout(240_000);
      const f = await seedReplay(browser, { snapshot: false, liveRecord: { whiteboard: false } });
      try {
        await forEachPrincipal(browser, f, async (context, principal) => {
          expectReads(await readReplay(context, f, principal), SHAPE_ACCESS.audio_only, `legacy, board off / ${principal}`);
        });
      } finally {
        await f.cleanup();
      }
    }
  );

  /** Opens the tutor review screen and taps "Share session" (notes off). Returns once the save is confirmed. */
  async function tutorSharesSession(page: Page, f: ReplayFixture) {
    await page.goto(`/admin/students/${f.studentId}/whiteboard/${f.sessionId}/workspace`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({ timeout: 60_000 });
    const share = page.getByTestId("wb-share-session");
    await expect(share).toBeVisible({ timeout: 30_000 });
    await expect(share).toHaveText("Share session");
    await share.click();
    await expect(page.getByTestId("wb-save-note-confirmation")).toBeVisible({ timeout: 30_000 });
  }

  const readSavedNote = (sessionId: string) =>
    withPrisma(async (p) => {
      const session = await p.whiteboardSession.findUniqueOrThrow({ where: { id: sessionId }, select: { noteId: true } });
      if (!session.noteId) return null;
      return p.sessionNote.findUniqueOrThrow({
        where: { id: session.noteId },
        select: { id: true, status: true, aiGenerated: true, aiPromptVersion: true },
      });
    });

  test(
    "RP7: notes off: the review screen's \"Share session\" save releases the replay to the family",
    async ({ page, browser }) => {
      test.setTimeout(300_000);
      const f = await seedReplay(browser, { shape: "full", notesOff: true, noNote: true });
      try {
        await tutorSharesSession(page, f);
        const saved = await readSavedNote(f.sessionId);
        expect(saved?.status).toBe("READY");

        await forEachPrincipal(browser, f, async (context, principal) => {
          expectReads(await readReplay(context, f, principal), SHAPE_ACCESS.full, `after Share session / ${principal}`);
        });
        const parent = await openFamilyContext(browser, f, "share");
        try {
          const card = await readCard(parent, `/account/children/${f.learnerProfileId}/notes`, saved!.id);
          expect(card.links, "parent notes: View whiteboard chip").toBe(1);
        } finally {
          await parent.close();
        }
      } finally {
        await f.cleanup();
      }
    }
  );

  test(
    "RP8: notes off: before \"Share session\" the family sees no replay",
    async ({ browser }) => {
      test.setTimeout(240_000);
      const f = await seedReplay(browser, { shape: "full", notesOff: true, noNote: true });
      try {
        await forEachPrincipal(browser, f, async (context, principal) => {
          expectReads(await readReplay(context, f, principal), SHAPE_ACCESS.none, `before Share session / ${principal}`);
        });
        const parent = await openFamilyContext(browser, f, "share");
        try {
          const page = await parent.newPage();
          await page.goto(`/account/children/${f.learnerProfileId}/notes`, { waitUntil: "domcontentloaded" });
          await expect(page.locator(REPLAY_LINK)).toHaveCount(0);
          await expect(page.locator(`a[href*='${f.sessionId}']`)).toHaveCount(0);
        } finally {
          await parent.close();
        }
      } finally {
        await f.cleanup();
      }
    }
  );

  // Oracle: DB oracle: 'aiGenerated = false' and 'aiPromptVersion = null' after a share-only save (today 'notes-actions.ts' 331–332 and 355–356 write 'true' and 'REDUCE_PROMPT_VERSION' unconditionally); control arm: a save from a generated draft keeps true plus the version.
  test(
    "RP9: notes off: a \"Share session\" save does not claim an AI wrote it",
    async ({ page, browser, request }) => {
      test.setTimeout(300_000);
      const shareOnly = await seedReplay(browser, { shape: "full", notesOff: true, noNote: true });
      const generated = await seedReplay(browser, { shape: "full", noteStatus: "DRAFT", generatedTutorNote: true });
      try {
        await tutorSharesSession(page, shareOnly);
        expect(await readSavedNote(shareOnly.sessionId)).toMatchObject({
          status: "READY",
          aiGenerated: false,
          aiPromptVersion: null,
        });

        // Control arm: a save that carries a generated draft still records the provenance (so the DB oracle can go red).
        const res = await invokeConsentAction(request, "saveSessionNotes", generated.sessionId, {
          topics: "edited",
          assessment: "",
          nextSteps: "",
          links: "",
        });
        expect(res.status(), await res.text()).toBe(200);
        const saved = await readSavedNote(generated.sessionId);
        expect(saved).toMatchObject({ status: "READY", aiGenerated: true });
        expect(saved?.aiPromptVersion, "the prompt version of the generated draft").toBeTruthy();
      } finally {
        await shareOnly.cleanup();
        await generated.cleanup();
      }
    }
  );

  // Oracle: family DOM on the parent and share surfaces: replay card present, no empty notes block. How the family surface renders an all-blank READY note today is **UNVERIFIED**; this test settles it and the fix follows what it finds.
  test(
    "RP10: notes off: a shared session with blank notes shows the replay and no empty notes block",
    async ({ browser }) => {
      test.setTimeout(240_000);
      const blank = await seedReplay(browser, {
        shape: "full",
        notesOff: true,
        note: { topics: "", homework: "", assessment: "", nextSteps: "" },
      });
      const written = await seedReplay(browser, { shape: "full" });
      try {
        const parent = await openFamilyContext(browser, blank, "share");
        try {
          for (const path of [`/account/children/${blank.learnerProfileId}/notes`, `/s/${blank.shareToken}`]) {
            const card = await readCard(parent, path, blank.noteId!);
            expect(card.links, `${path}: replay chip`).toBe(1);
            expect(card.notesHeading, `${path}: empty "Topics covered" block`).toBe(0);
          }
        } finally {
          await parent.close();
        }
        // Control: a note with text keeps its notes block on the same surface.
        const control = await openFamilyContext(browser, written, "share");
        try {
          const card = await readCard(control, `/s/${written.shareToken}`, written.noteId!);
          expect(card.notesHeading, "a written note shows its notes block").toBeGreaterThan(0);
        } finally {
          await control.close();
        }
      } finally {
        await blank.cleanup();
        await written.cleanup();
      }
    }
  );
});

// ---------------------------------------------------------------------------
// 6h. Visibility (both sides see what is off)
// ---------------------------------------------------------------------------
test.describe("consent 6h: Visibility (both sides see what is off)", {
  tag: [TAG.WB_CONSENT, TAG.WB_CHROME],
}, () => {
  // Oracle: DOM text from literals in the spec (not the copy module)
  test.fixme(
    "V1: tutor sees which recordings are off before Start and during the session",
    async () => {
      // pending: wave that owns V1
    }
  );
  // Oracle: Same
  test.fixme(
    "V2: learner sees which recordings are off in the waiting room and in the session",
    async () => {
      // pending: wave that owns V2
    }
  );
  // Oracle: Grep over every consent surface DOM for the self-learner principal
  test.fixme(
    "V3: self-learner copy never says \"your child\"",
    async () => {
      // pending: wave that owns V3
    }
  );
  // Oracle: DOM
  test.fixme(
    "V4: child consent screen shows each tutor/org separately",
    async () => {
      // pending: wave that owns V4
    }
  );
});
