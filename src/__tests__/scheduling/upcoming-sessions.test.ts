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

    await db.scheduledSession.deleteMany({ where: { studentId: student.id } });
    await db.student.delete({ where: { id: student.id } });
    await db.learnerProfile.delete({ where: { id: profile.id } });
    await db.accountHolder.delete({ where: { id: ah.id } });
    await db.adminUser.delete({ where: { id: tutor.id } });
  });
});
