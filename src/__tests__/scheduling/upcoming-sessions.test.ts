/**
 * @jest-environment node
 */
import { db } from "@/lib/db";
import {
  listUpcomingForLearnerProfiles,
  listUpcomingForStudent,
} from "@/lib/scheduling/upcoming-sessions";
import { JOIN_WINDOW_OPENS_BEFORE_MS } from "@/lib/scheduling/join-window";
import { uniq } from "../helpers/unique-test-token";

describe("listUpcomingForStudent / listUpcomingForLearnerProfiles", () => {
  it("returns future sessions ordered by startAt and computes join window", async () => {
    const tutor = await db.adminUser.create({
      data: {
        email: `${uniq("upcoming")}@example.com`,
        role: "TUTOR",
        approvalStatus: "APPROVED",
      },
    });
    const student = await db.student.create({
      data: { name: "Upcoming Kid", adminUserId: tutor.id },
    });
    const now = Date.now();
    const startAt = new Date(now + 10 * 60_000);
    const endAt = new Date(now + 70 * 60_000);
    const sched = await db.scheduledSession.create({
      data: {
        adminUserId: tutor.id,
        studentId: student.id,
        date: new Date(Date.UTC(2026, 9, 6)),
        startTime: "10:00",
        endTime: "11:00",
        startAt,
        endAt,
        plannedDurationMinutes: 60,
        subject: "Algebra",
      },
    });

    const rows = await listUpcomingForStudent(tutor.id, student.id, new Date(now));
    expect(rows.map((r) => r.id)).toEqual([sched.id]);
    expect(rows[0]!.joinWindowOpen).toBe(
      now >= startAt.getTime() - JOIN_WINDOW_OPENS_BEFORE_MS
    );
    // No LearnerProfile yet (unclaimed): neither mode can be entered, and it says why.
    expect(rows[0]!.entry).toEqual({
      online: { allowed: false, reason: "unclaimed" },
      inPerson: { allowed: false, reason: "unclaimed" },
    });

    await db.scheduledSession.delete({ where: { id: sched.id } });
    await db.student.delete({ where: { id: student.id } });
    await db.adminUser.delete({ where: { id: tutor.id } });
  });

  it("listUpcomingForLearnerProfiles scopes by learner profile", async () => {
    const tutor = await db.adminUser.create({
      data: {
        email: `${uniq("fam-up")}@example.com`,
        role: "TUTOR",
        approvalStatus: "APPROVED",
      },
    });
    const ah = await db.accountHolder.create({
      data: { email: `${uniq("ah-up")}@example.com`, emailVerifiedAt: new Date() },
    });
    const profile = await db.learnerProfile.create({
      data: { accountHolderId: ah.id, displayName: "Kid", isSelfLearner: false },
    });
    const student = await db.student.create({
      data: { name: "Kid", adminUserId: tutor.id, learnerProfileId: profile.id },
    });
    const startAt = new Date(Date.now() + 2 * 60 * 60_000);
    const endAt = new Date(startAt.getTime() + 60 * 60_000);
    await db.scheduledSession.create({
      data: {
        adminUserId: tutor.id,
        studentId: student.id,
        date: new Date(Date.UTC(2026, 9, 6)),
        startTime: "12:00",
        endTime: "13:00",
        startAt,
        endAt,
        plannedDurationMinutes: 60,
        subject: "Reading",
      },
    });

    const rows = await listUpcomingForLearnerProfiles([profile.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.joinWindowOpen).toBe(false);
    // Claimed by a parent, but no ConsentRecord: blocked in both modes, parent wording.
    expect(rows[0]!.entry).toEqual({
      online: { allowed: false, reason: "consent_missing_parent" },
      inPerson: { allowed: false, reason: "consent_missing_parent" },
    });

    await db.scheduledSession.deleteMany({ where: { studentId: student.id } });
    await db.student.delete({ where: { id: student.id } });
    await db.learnerProfile.delete({ where: { id: profile.id } });
    await db.accountHolder.delete({ where: { id: ah.id } });
    await db.adminUser.delete({ where: { id: tutor.id } });
  });

  it("reports entry per mode from the latest consent (online off blocks online only)", async () => {
    const tutor = await db.adminUser.create({
      data: {
        email: `${uniq("live-up")}@example.com`,
        role: "TUTOR",
        approvalStatus: "APPROVED",
      },
    });
    const ah = await db.accountHolder.create({
      data: { email: `${uniq("live-ah")}@example.com`, emailVerifiedAt: new Date() },
    });
    const allowed = await db.learnerProfile.create({
      data: { accountHolderId: ah.id, displayName: "Allowed", isSelfLearner: false },
    });
    const blocked = await db.learnerProfile.create({
      data: { accountHolderId: ah.id, displayName: "Blocked", isSelfLearner: false },
    });
    const allowedStudent = await db.student.create({
      data: { name: "Allowed", adminUserId: tutor.id, learnerProfileId: allowed.id },
    });
    const blockedStudent = await db.student.create({
      data: { name: "Blocked", adminUserId: tutor.id, learnerProfileId: blocked.id },
    });
    await db.consentRecord.create({
      data: {
        learnerProfileId: allowed.id,
        adminUserId: tutor.id,
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: false,
        allowWhiteboardRecording: false,
        allowNoteSending: true,
        setByAccountHolderId: ah.id,
      },
    });
    await db.consentRecord.create({
      data: {
        learnerProfileId: blocked.id,
        adminUserId: tutor.id,
        version: 1,
        allowLiveSession: false,
        allowAudioRecording: false,
        allowWhiteboardRecording: false,
        allowNoteSending: true,
        setByAccountHolderId: ah.id,
      },
    });
    const startAt = new Date(Date.now() + 5 * 60_000);
    const endAt = new Date(startAt.getTime() + 60 * 60_000);
    for (const studentId of [allowedStudent.id, blockedStudent.id]) {
      await db.scheduledSession.create({
        data: {
          adminUserId: tutor.id,
          studentId,
          date: new Date(Date.UTC(2026, 9, 6)),
          startTime: "10:00",
          endTime: "11:00",
          startAt,
          endAt,
          plannedDurationMinutes: 60,
          subject: "Live gate",
        },
      });
    }

    const allowedRows = await listUpcomingForStudent(tutor.id, allowedStudent.id);
    const blockedRows = await listUpcomingForLearnerProfiles([blocked.id]);
    expect(allowedRows[0]!.entry).toEqual({
      online: { allowed: true },
      inPerson: { allowed: true },
    });
    // Online sessions off blocks ONLINE only; in person stays reachable (Decision 5).
    expect(blockedRows[0]!.entry).toEqual({
      online: { allowed: false, reason: "live_off" },
      inPerson: { allowed: true },
    });
  });
  // A family must never receive org-internal state (org suspended, instructor removed)
  // in the rows that become component props. The tutor side keeps the real reason.
  it.each([
    { name: "org suspended", status: "suspended" as const, removed: false, tutorReason: "org_inactive" },
    { name: "instructor removed", status: "active" as const, removed: true, tutorReason: "instructor_not_admitted" },
  ])("family rows collapse org-internal reasons ($name); org-side keeps the reason", async (c) => {
    const instructor = await db.adminUser.create({
      data: {
        email: `${uniq("fam-org-instr")}@example.com`,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        emailVerifiedAt: new Date("2026-01-01"),
        isTestAccount: false,
      },
    });
    const org = await db.organization.create({
      data: {
        name: `Org ${uniq("fam-org")}`,
        status: c.status,
        timezone: "America/Denver",
        createdByOperatorId: "org-operator@example.com",
        members: {
          create: [
            { adminUserId: instructor.id, roles: ["instructor"], removedAt: c.removed ? new Date() : null },
          ],
        },
      },
    });
    const ah = await db.accountHolder.create({
      data: { email: `${uniq("fam-org-ah")}@example.com`, emailVerifiedAt: new Date() },
    });
    const profile = await db.learnerProfile.create({
      data: { accountHolderId: ah.id, displayName: "Org Kid", isSelfLearner: false },
    });
    const student = await db.student.create({
      data: { name: "Org Kid", adminUserId: null, organizationId: org.id, learnerProfileId: profile.id },
    });
    await db.consentRecord.create({
      data: {
        learnerProfileId: profile.id,
        adminUserId: null,
        organizationId: org.id,
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: ah.id,
      },
    });
    const startAt = new Date(Date.now() + 5 * 60_000);
    await db.scheduledSession.create({
      data: {
        adminUserId: instructor.id,
        studentId: student.id,
        date: new Date(Date.UTC(2026, 9, 6)),
        startTime: "10:00",
        endTime: "11:00",
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60_000),
        plannedDurationMinutes: 60,
        subject: "Org family",
      },
    });

    const familyRows = await listUpcomingForLearnerProfiles([profile.id]);
    expect(familyRows).toHaveLength(1);
    // Spec: the generic family reason only, in both modes.
    expect(familyRows[0]!.entry).toEqual({
      online: { allowed: false, reason: "unknown" },
      inPerson: { allowed: false, reason: "unknown" },
    });
    // The serialized rows (what ships as props) carry no org-internal code.
    expect(JSON.stringify(familyRows)).not.toMatch(/org_inactive|instructor_not_admitted/);

    const orgSide = await listUpcomingForStudent(instructor.id, student.id);
    expect(orgSide[0]!.entry.online).toEqual({ allowed: false, reason: c.tutorReason });
  });
});
