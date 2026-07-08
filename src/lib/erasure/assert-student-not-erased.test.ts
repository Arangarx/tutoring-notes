/**
 * @jest-environment node
 *
 * E6 — assert-student-not-erased helper + content-route guard integration.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { uniq } from "../../__tests__/helpers/unique-test-token";
import {
  assertStudentNotErased,
  assertStudentNotErasedApi,
  isStudentErased,
  shouldShortCircuitEndSessionForErasure,
} from "@/lib/erasure/assert-student-not-erased";


async function createTutor() {
  return db.adminUser.create({
    data: { email: `${uniq("tutor")}@example.com`, role: "TUTOR" },
  });
}

async function createAccountHolder() {
  return db.accountHolder.create({
    data: {
      email: `${uniq("ah")}@example.com`,
      emailVerifiedAt: new Date(),
    },
  });
}

async function createLearnerProfile(accountHolderId: string) {
  return db.learnerProfile.create({
    data: {
      accountHolderId,
      displayName: "Test Learner",
    },
  });
}

async function createStudent(adminUserId: string, learnerProfileId: string) {
  return db.student.create({
    data: {
      name: "Alice Student",
      adminUserId,
      learnerProfileId,
    },
  });
}

async function createErasureJob(
  scopeKind: "learner_profile" | "account_holder",
  scopeId: string,
  status: "requested" | "blobs_purging" | "db_scrubbing" = "requested"
) {
  return db.erasureJob.create({
    data: {
      scopeKind,
      scopeId,
      status,
      requestedByPrincipal: `admin:${uniq("principal")}`,
      purgeEligibleAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}

describe("assert-student-not-erased helper", () => {
  it("isStudentErased returns false when erasedAt is null", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    const student = await createStudent(tutor.id, lp.id);

    expect(await isStudentErased(student.id)).toBe(false);
  });

  it("isStudentErased returns true when erasedAt is set (M-4)", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    const student = await createStudent(tutor.id, lp.id);

    await db.student.update({
      where: { id: student.id },
      data: { erasedAt: new Date() },
    });

    expect(await isStudentErased(student.id)).toBe(true);
  });

  it("assertStudentNotErased calls notFound when erased", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    const student = await createStudent(tutor.id, lp.id);

    await db.student.update({
      where: { id: student.id },
      data: { erasedAt: new Date() },
    });

    await expect(assertStudentNotErased(student.id)).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("assertStudentNotErasedApi returns 404 JSON when erased", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    const student = await createStudent(tutor.id, lp.id);

    await db.student.update({
      where: { id: student.id },
      data: { erasedAt: new Date() },
    });

    const res = await assertStudentNotErasedApi(student.id);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
    const body = await res!.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("assertStudentNotErased calls notFound during active ErasureJob grace (ER-3)", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    const student = await createStudent(tutor.id, lp.id);

    await createErasureJob("learner_profile", lp.id, "requested");

    await expect(assertStudentNotErased(student.id)).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("assertStudentNotErasedApi returns 404 during active ErasureJob grace (ER-3)", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    const student = await createStudent(tutor.id, lp.id);

    await createErasureJob("learner_profile", lp.id, "requested");

    const res = await assertStudentNotErasedApi(student.id);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });

  it("assertStudentNotErased allows access after cancel-restore", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    const student = await createStudent(tutor.id, lp.id);

    const job = await createErasureJob("learner_profile", lp.id, "requested");
    await db.erasureJob.update({
      where: { id: job.id },
      data: { status: "canceled", canceledAt: new Date() },
    });

    await assertStudentNotErased(student.id);
  });

  it("shouldShortCircuitEndSessionForErasure is true when erasedAt is set", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    const student = await createStudent(tutor.id, lp.id);

    await db.student.update({
      where: { id: student.id },
      data: { erasedAt: new Date() },
    });

    expect(await shouldShortCircuitEndSessionForErasure(student.id)).toBe(true);
  });

  it("shouldShortCircuitEndSessionForErasure is true for active learner_profile ErasureJob", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    const student = await createStudent(tutor.id, lp.id);

    await createErasureJob("learner_profile", lp.id, "blobs_purging");

    expect(await shouldShortCircuitEndSessionForErasure(student.id)).toBe(true);
  });

  it("shouldShortCircuitEndSessionForErasure is true for active account_holder ErasureJob", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    const student = await createStudent(tutor.id, lp.id);

    await createErasureJob("account_holder", ah.id, "requested");

    expect(await shouldShortCircuitEndSessionForErasure(student.id)).toBe(true);
  });

  it("shouldShortCircuitEndSessionForErasure is false with no erasure state", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    const student = await createStudent(tutor.id, lp.id);

    expect(await shouldShortCircuitEndSessionForErasure(student.id)).toBe(false);
  });
});

describe("replay page guard (assertStudentNotErased contract)", () => {
  it("blocks erased student the same way the review page does", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    const student = await createStudent(tutor.id, lp.id);

    await db.student.update({
      where: { id: student.id },
      data: { erasedAt: new Date() },
    });

    await expect(assertStudentNotErased(student.id)).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });
});
