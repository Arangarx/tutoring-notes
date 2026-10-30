/**
 * Shared fixtures + assertions for "a refused waiting-room Start names the learner's
 * situation". Used by the dev-server wb-regression spec (`wb-org-qol-bridge.spec.ts`) and the
 * production-build spec (`tests/prod-shape/refused-start.prod.spec.ts`) so the two cannot drift.
 *
 * Expected strings are the W4 copy spec's, written by hand — never imported from the code
 * under test.
 */

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { seedOpenWhiteboardSession, seedTestAdmin } from "../visual/helpers";

export type RefusedStartSituation = "self-learner" | "parent-held" | "unclaimed";

export interface RefusedStartCase {
  situation: RefusedStartSituation;
  line: (name: string) => string;
  /** Parent-held and unclaimed learners get the "Parent account" hint; a self-learner does not. */
  parentHint: boolean;
}

export const REFUSED_START_CASES: RefusedStartCase[] = [
  {
    situation: "self-learner",
    line: (name) => `${name} hasn't finished privacy preferences yet.`,
    parentHint: false,
  },
  {
    situation: "parent-held",
    line: () => "The parent hasn't finished privacy preferences yet.",
    parentHint: true,
  },
  {
    situation: "unclaimed",
    line: (name) => `${name} hasn't connected their Mynk account yet.`,
    parentHint: true,
  },
];

export interface SeededPendingSession {
  studentId: string;
  whiteboardSessionId: string;
  learnerName: string;
}

/**
 * A learner with NO consent record in the given situation, plus an in-person session seeded
 * PENDING straight into the database (the create path would refuse first).
 */
export async function seedPendingWithoutConsent(
  situation: RefusedStartSituation,
  /** The owning tutor. Defaults to the shared wb-regression harness tutor. */
  ownerAdminUserId?: string
): Promise<SeededPendingSession> {
  const adminUserId = ownerAdminUserId ?? (await seedTestAdmin());
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const learnerName = `Refused ${situation.replace("-", " ")} ${suffix}`;
  const prisma = new PrismaClient();
  try {
    let learnerProfileId: string | null = null;
    if (situation !== "unclaimed") {
      const holder = await prisma.accountHolder.create({
        data: {
          email: `pw-refused-${suffix}@test.local`,
          emailVerifiedAt: new Date("2026-01-01"),
          isSelfLearner: situation === "self-learner",
        },
        select: { id: true },
      });
      const profile = await prisma.learnerProfile.create({
        data: {
          accountHolderId: holder.id,
          displayName: learnerName,
          isSelfLearner: situation === "self-learner",
        },
        select: { id: true },
      });
      learnerProfileId = profile.id;
    }
    const student = await prisma.student.create({
      data: { name: learnerName, adminUserId, learnerProfileId, parentEmail: "parent@test.local" },
      select: { id: true },
    });
    const whiteboardSessionId = await seedOpenWhiteboardSession({
      adminUserId,
      studentId: student.id,
      sessionPhase: "PENDING",
      sessionMode: "IN_PERSON",
    });
    return { studentId: student.id, whiteboardSessionId, learnerName };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * After the tutor pressed the waiting-room Start: the refusal line for this learner's
 * situation is shown, the generic failure copy is not, and enforcement is unchanged (still in
 * the waiting room, the session still PENDING in the database).
 */
export async function expectRefusedStartShown(
  page: Page,
  testCase: RefusedStartCase,
  seeded: SeededPendingSession
): Promise<void> {
  const error = page.getByTestId("wb-waiting-start-error");
  await expect(error).toBeVisible({ timeout: 30_000 });
  await expect(error).toContainText(testCase.line(seeded.learnerName));
  if (testCase.parentHint) {
    await expect(error).toContainText("Parent account section");
  } else {
    await expect(error).not.toContainText("Parent account");
    await expect(error).not.toContainText("The parent hasn't");
    await expect(error).not.toContainText("hasn't connected their Mynk account");
  }
  await expect(error).not.toContainText("Error ID");
  await expect(error).not.toContainText("Couldn't start the session");
  await expect(page.getByTestId("wb-waiting-overlay")).toBeVisible();
  const prisma = new PrismaClient();
  try {
    const row = await prisma.whiteboardSession.findUniqueOrThrow({
      where: { id: seeded.whiteboardSessionId },
      select: { sessionPhase: true },
    });
    expect(row.sessionPhase).toBe("PENDING");
  } finally {
    await prisma.$disconnect();
  }
}
