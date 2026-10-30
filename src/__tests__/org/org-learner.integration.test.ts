/**
 * @jest-environment node
 *
 * Stage 3 learners, claim caps, and consent owner.
 * Oracles are the spec numbers 20 and 30, database constraints, and the
 * absence of a parent-email marker. Requires tutoring_notes_org_test.
 */
jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

const mockGetServerSession = jest.fn();
jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
jest.mock("@/auth-options", () => ({ authOptions: {} }));

jest.mock("@/lib/account-holder-email", () => ({
  sendClaimInviteEmail: jest.fn(async () => ({ sent: true })),
}));

import fs from "node:fs";
import path from "node:path";

import { generateRawToken, hashToken } from "@/lib/crypto/session-tokens";
import { db } from "@/lib/db";
import { createVersionedConsentRecord } from "@/lib/consent-write";
import { resolveEffectiveRecordedConsent } from "@/lib/consent-scope";
import {
  createOrgLearner,
  loadInstructorTaughtSessions,
  loadSchedulerLearner,
  OrgLearnerError,
  reinviteOrgLearner,
  writeOrgLearnerName,
} from "@/lib/org-learner";
import {
  OrgMutationError,
  assertCanAddOrgLearner,
  assertCanSendOrgClaimEmail,
  createOrganization,
  setOrganizationCaps,
  setOrganizationStatus,
} from "@/lib/org-scope";
import { studentsWhereForScope } from "@/lib/student-scope";
import { upsertAdminByEmail } from "../helpers/org-seed";

const OPERATOR_EMAIL = "org-operator@example.com";

function mockSession(email: string, id: string) {
  mockGetServerSession.mockResolvedValue({
    user: { email, id, name: email },
    expires: new Date(Date.now() + 60_000).toISOString(),
  });
}

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

beforeAll(async () => {
  const rows = await db.$queryRaw<Array<{ name: string }>>`
    SELECT current_database() AS name
  `;
  if (rows[0]?.name !== "tutoring_notes_org_test") {
    throw new Error(
      `org tests must run on tutoring_notes_org_test (current_database=${rows[0]?.name ?? "unknown"})`
    );
  }
});

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(() => {
  mockGetServerSession.mockReset();
});

async function seedAdmin(email: string) {
  const row = await upsertAdminByEmail(email);
  return { id: row.id, email: row.email };
}

async function seedOrg(input?: {
  dailyLearnerCap?: number | null;
  dailyClaimEmailCap?: number | null;
  dailyInviteCap?: number | null;
}) {
  const owner = await seedAdmin(`org-owner-${suffix()}@test.local`);
  const admin = await seedAdmin(`org-admin-${suffix()}@test.local`);
  const org = await db.organization.create({
    data: {
      name: `Org ${suffix()}`,
      createdByOperatorId: OPERATOR_EMAIL,
      dailyInviteCap: input?.dailyInviteCap === undefined ? 25 : input.dailyInviteCap,
      dailyLearnerCap: input?.dailyLearnerCap === undefined ? 20 : input.dailyLearnerCap,
      dailyClaimEmailCap:
        input?.dailyClaimEmailCap === undefined ? 30 : input.dailyClaimEmailCap,
      members: {
        create: [
          { adminUserId: owner.id, roles: ["owner"] },
          { adminUserId: admin.id, roles: ["admin"] },
        ],
      },
    },
    select: { id: true, statusChangedAt: true, dailyInviteCap: true },
  });
  return { org, owner, admin };
}

async function seedLearnerProfile(name: string) {
  const holder = await db.accountHolder.create({
    data: { email: `holder-${suffix()}@test.local`, displayName: name },
    select: { id: true },
  });
  return db.learnerProfile.create({
    data: { accountHolderId: holder.id, displayName: name },
    select: { id: true, accountHolderId: true },
  });
}

function migrationSql(): string {
  return fs.readFileSync(
    path.join(process.cwd(), "prisma/migrations/20261011130000_org_learner/migration.sql"),
    "utf8"
  );
}

/** The backfill statement only. A comment elsewhere must not satisfy these asserts. */
function selfLearnerBackfillInsert(sql: string): string {
  const start = sql.indexOf('INSERT INTO "ConsentRecord"');
  const end = sql.indexOf(";", start);
  if (start < 0 || end < 0) {
    throw new Error("migration has no ConsentRecord INSERT");
  }
  return sql.slice(start, end + 1);
}

describe("organization learner constraints", () => {
  test("student CHECK allows both-null and rejects both owners", async () => {
    const { org } = await seedOrg();
    const owner = await seedAdmin(`both-owner-${suffix()}@test.local`);
    const installed = await db.$queryRaw<Array<{ def: string }>>`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conname = 'student_single_owner'
        AND conrelid = '"Student"'::regclass
    `;
    expect(installed).toHaveLength(1);
    expect(installed[0]?.def ?? "").toContain("adminUserId");
    expect(installed[0]?.def ?? "").toContain("organizationId");
    let rejected = false;
    try {
      await db.student.create({
        data: { name: "Both owners", adminUserId: owner.id, organizationId: org.id },
      });
    } catch (err) {
      rejected = true;
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toMatch(/student_single_owner|23514/);
    }
    expect(rejected).toBe(true);
    const envRow = await db.student.create({
      data: { name: "Env admin row", adminUserId: null, organizationId: null },
      select: { id: true },
    });
    expect(envRow.id).toBeTruthy();
  });

  test("consent CHECK rejects both-null and both owners", async () => {
    const { org, owner } = await seedOrg();
    const profile = await seedLearnerProfile("Consent child");
    await expect(
      db.consentRecord.create({
        data: {
          learnerProfileId: profile.id,
          adminUserId: null,
          organizationId: null,
          version: 1,
          allowLiveSession: true,
          allowAudioRecording: true,
          allowWhiteboardRecording: true,
          allowNoteSending: true,
          setByAccountHolderId: profile.accountHolderId,
          captureMethod: "electronic",
        },
      })
    ).rejects.toThrow();
    await expect(
      db.consentRecord.create({
        data: {
          learnerProfileId: profile.id,
          adminUserId: owner.id,
          organizationId: org.id,
          version: 1,
          allowLiveSession: true,
          allowAudioRecording: true,
          allowWhiteboardRecording: true,
          allowNoteSending: true,
          setByAccountHolderId: profile.accountHolderId,
        },
      })
    ).rejects.toThrow();
  });

  test("one org link per learner profile, and null profiles do not collide", async () => {
    const { org, owner } = await seedOrg();
    const profile = await seedLearnerProfile("Linked child");
    const tutor = await seedAdmin(`tutor-unique-${suffix()}@test.local`);
    await db.student.create({
      data: { name: "Tutor row", adminUserId: tutor.id, learnerProfileId: profile.id },
    });
    const first = await db.student.create({
      data: {
        name: "Org row",
        adminUserId: null,
        organizationId: org.id,
        learnerProfileId: profile.id,
        organizationLearner: {
          create: {
            organizationId: org.id,
            givenName: "Ada",
            familyName: "North",
            createdByAdminUserId: owner.id,
          },
        },
      },
      select: { id: true },
    });
    await db.student.create({
      data: { name: "Unclaimed one", adminUserId: null, organizationId: org.id },
    });
    await db.student.create({
      data: { name: "Unclaimed two", adminUserId: null, organizationId: org.id },
    });
    await expect(
      db.student.create({
        data: {
          name: "Second org link",
          adminUserId: null,
          organizationId: org.id,
          learnerProfileId: profile.id,
        },
      })
    ).rejects.toThrow();
    await expect(db.organization.delete({ where: { id: org.id } })).rejects.toThrow();
    expect(first.id).toBeTruthy();
  });

  test("writeOrgLearnerName keeps Student.name equal to given name, a space, and family name", async () => {
    const { org, owner } = await seedOrg();
    const student = await db.student.create({
      data: {
        name: "Old Name",
        adminUserId: null,
        organizationId: org.id,
        parentEmail: `parent-${suffix()}@test.local`,
        organizationLearner: {
          create: {
            organizationId: org.id,
            givenName: "Old",
            familyName: "Name",
            createdByAdminUserId: owner.id,
          },
        },
      },
      select: { id: true },
    });
    await db.$transaction((tx) => writeOrgLearnerName(tx, student.id, "  Bea ", "  West "));
    const row = await db.student.findUnique({
      where: { id: student.id },
      select: { name: true, organizationLearner: { select: { givenName: true, familyName: true } } },
    });
    expect(row?.organizationLearner?.givenName).toBe("Bea");
    expect(row?.organizationLearner?.familyName).toBe("West");
    expect(row?.name).toBe("Bea West");
  });
});

describe("organization caps", () => {
  test("the 21st learner is refused, and both staff count together", async () => {
    const { org, owner, admin } = await seedOrg({ dailyLearnerCap: 20, dailyClaimEmailCap: null });
    for (let i = 0; i < 10; i++) {
      await db.student.create({
        data: {
          name: `Owner learner ${i}`,
          adminUserId: null,
          organizationId: org.id,
          organizationLearner: {
            create: {
              organizationId: org.id,
              givenName: "Owner",
              familyName: String(i),
              createdByAdminUserId: owner.id,
            },
          },
        },
      });
    }
    for (let i = 0; i < 10; i++) {
      await db.student.create({
        data: {
          name: `Admin learner ${i}`,
          adminUserId: null,
          organizationId: org.id,
          organizationLearner: {
            create: {
              organizationId: org.id,
              givenName: "Admin",
              familyName: String(i),
              createdByAdminUserId: admin.id,
            },
          },
        },
      });
    }
    await expect(
      db.$transaction((tx) => assertCanAddOrgLearner(tx, org.id))
    ).rejects.toMatchObject({ code: "learner_cap" });
  });

  test("the 31st claim email is refused, and both staff count together", async () => {
    const { org, owner, admin } = await seedOrg({ dailyLearnerCap: null, dailyClaimEmailCap: 30 });
    const students = [];
    for (let i = 0; i < 30; i++) {
      students.push(
        await db.student.create({
          data: {
            name: `Claim learner ${i}`,
            adminUserId: null,
            organizationId: org.id,
            parentEmail: `claim-${i}-${suffix()}@test.local`,
          },
          select: { id: true },
        })
      );
    }
    for (let i = 0; i < 30; i++) {
      const raw = await generateRawToken();
      await db.studentClaimInvite.create({
        data: {
          studentId: students[i]!.id,
          adminUserId: i < 15 ? owner.id : admin.id,
          tokenHash: hashToken(raw),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    }
    await expect(
      db.$transaction((tx) => assertCanSendOrgClaimEmail(tx, org.id))
    ).rejects.toBeInstanceOf(OrgMutationError);
    await expect(
      db.$transaction((tx) => assertCanSendOrgClaimEmail(tx, org.id))
    ).rejects.toMatchObject({ code: "claim_email_cap" });
  });

  test("omitted create stores 20 and 30, explicit null is unlimited, and invite null stays null", async () => {
    const operator = await seedAdmin(OPERATOR_EMAIL);
    mockSession(operator.email, operator.id);
    const owner = await seedAdmin(`cap-owner-${suffix()}@test.local`);
    const omitted = await createOrganization({
      name: `Omitted caps ${suffix()}`,
      ownerAdminUserId: owner.id,
    });
    const omittedRow = await db.organization.findUnique({
      where: { id: omitted.organizationId },
      select: {
        dailyLearnerCap: true,
        dailyClaimEmailCap: true,
        dailyInviteCap: true,
        statusChangedAt: true,
      },
    });
    expect(omittedRow?.dailyLearnerCap).toBe(20);
    expect(omittedRow?.dailyClaimEmailCap).toBe(30);
    expect(omittedRow?.dailyInviteCap).toBe(25);
    const createdAt = omittedRow?.statusChangedAt?.getTime() ?? 0;
    expect(createdAt).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await setOrganizationStatus(omitted.organizationId, "active");
    const afterStatus = await db.organization.findUnique({
      where: { id: omitted.organizationId },
      select: { statusChangedAt: true, status: true },
    });
    expect(afterStatus?.status).toBe("active");
    expect(afterStatus!.statusChangedAt.getTime()).toBeGreaterThan(createdAt);

    await setOrganizationCaps(omitted.organizationId, {
      maxMembers: null,
      dailyInviteCap: 25,
    });
    const afterCaps = await db.organization.findUnique({
      where: { id: omitted.organizationId },
      select: { statusChangedAt: true, dailyLearnerCap: true },
    });
    expect(afterCaps?.statusChangedAt.getTime()).toBe(afterStatus!.statusChangedAt.getTime());
    expect(afterCaps?.dailyLearnerCap).toBe(20);

    const unlimited = await createOrganization({
      name: `Unlimited caps ${suffix()}`,
      ownerAdminUserId: owner.id,
      dailyLearnerCap: null,
      dailyClaimEmailCap: null,
      dailyInviteCap: null,
    });
    const unlimitedRow = await db.organization.findUnique({
      where: { id: unlimited.organizationId },
      select: { dailyLearnerCap: true, dailyClaimEmailCap: true, dailyInviteCap: true },
    });
    expect(unlimitedRow).toEqual({
      dailyLearnerCap: null,
      dailyClaimEmailCap: null,
      dailyInviteCap: null,
    });

    expect(migrationSql()).not.toMatch(/UPDATE\s+"Organization"\s+SET\s+"dailyInviteCap"/i);
  });
});

describe("self-learner consent backfill", () => {
  test("the INSERT statement itself names presumed, the account holder, and the skips", () => {
    const insert = selfLearnerBackfillInsert(migrationSql());
    expect(insert.startsWith('INSERT INTO "ConsentRecord"')).toBe(true);
    expect(insert).toContain("'presumed'");
    expect(insert).toContain('lp."accountHolderId"');
    expect(insert).toContain('lp."isSelfLearner" = TRUE');
    expect(insert).toContain('lp."tombstonedAt" IS NULL');
    expect(insert).toContain('s."adminUserId" IS NOT NULL');
    expect(insert).toContain("NOT EXISTS");
    expect(insert).toMatch(/TRUE,\s*TRUE,\s*TRUE,\s*TRUE/);
  });

  test("running the INSERT backfills a live self-learner once and skips tombstoned and org rows", async () => {
    const tutor = await seedAdmin(`backfill-tutor-${suffix()}@test.local`);
    const holder = await db.accountHolder.create({
      data: { email: `backfill-holder-${suffix()}@test.local`, displayName: "Holder" },
      select: { id: true },
    });
    const live = await db.learnerProfile.create({
      data: {
        accountHolderId: holder.id,
        displayName: "Live self",
        isSelfLearner: true,
      },
      select: { id: true },
    });
    await db.student.create({
      data: { name: "Live self", adminUserId: tutor.id, learnerProfileId: live.id },
    });
    const tombstoned = await db.learnerProfile.create({
      data: {
        accountHolderId: holder.id,
        displayName: "Gone self",
        isSelfLearner: true,
        tombstonedAt: new Date("2026-01-02"),
      },
      select: { id: true },
    });
    await db.student.create({
      data: { name: "Gone self", adminUserId: tutor.id, learnerProfileId: tombstoned.id },
    });
    const { org, owner } = await seedOrg();
    const orgProfile = await db.learnerProfile.create({
      data: {
        accountHolderId: holder.id,
        displayName: "Org self",
        isSelfLearner: true,
      },
      select: { id: true },
    });
    await db.student.create({
      data: {
        name: "Org self",
        adminUserId: null,
        organizationId: org.id,
        learnerProfileId: orgProfile.id,
        organizationLearner: {
          create: {
            organizationId: org.id,
            givenName: "Org",
            familyName: "Self",
            createdByAdminUserId: owner.id,
          },
        },
      },
    });

    const insert = selfLearnerBackfillInsert(migrationSql());
    await db.$executeRawUnsafe(insert);
    await db.$executeRawUnsafe(insert);

    const liveRows = await db.consentRecord.findMany({
      where: { learnerProfileId: live.id },
    });
    expect(liveRows).toHaveLength(1);
    expect(liveRows[0]).toMatchObject({
      adminUserId: tutor.id,
      organizationId: null,
      version: 1,
      allowLiveSession: true,
      allowAudioRecording: true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
      captureMethod: "presumed",
      setByAccountHolderId: holder.id,
    });
    expect(
      await db.consentRecord.count({ where: { learnerProfileId: tombstoned.id } })
    ).toBe(0);
    expect(
      await db.consentRecord.count({ where: { learnerProfileId: orgProfile.id } })
    ).toBe(0);
  });
});

describe("createOrgLearner and reinvite", () => {
  function learnerInput(organizationId: string, inviteFor: "student" | "parent" = "parent") {
    return {
      organizationId,
      givenName: "Ada",
      familyName: "North",
      brief: "Reads aloud",
      email: `learner-${suffix()}@test.local`,
      inviteFor,
    };
  }

  test("owner create writes the org student, the side record, and one invite", async () => {
    const { org, owner } = await seedOrg();
    mockSession(owner.email, owner.id);
    const input = learnerInput(org.id, "student");
    const created = await createOrgLearner(input);
    const student = await db.student.findUnique({
      where: { id: created.studentId },
      include: {
        organizationLearner: true,
        claimInvites: { select: { id: true, inviteTargetKind: true } },
      },
    });
    expect(student?.adminUserId).toBeNull();
    expect(student?.organizationId).toBe(org.id);
    expect(student?.name).toBe("Ada North");
    expect(student?.parentEmail).toBe(input.email);
    expect(student?.organizationLearner).toMatchObject({
      givenName: "Ada",
      familyName: "North",
      brief: "Reads aloud",
    });
    expect(student?.claimInvites).toHaveLength(1);
    expect(student?.claimInvites[0]?.inviteTargetKind).toBe("self_learner");
    expect(created.inviteId).toBe(student?.claimInvites[0]?.id);
  });

  test("scheduler and instructor cannot create a learner", async () => {
    const { org } = await seedOrg();
    for (const role of ["scheduler", "instructor"] as const) {
      const member = await seedAdmin(`${role}-${suffix()}@test.local`);
      await db.organizationMember.create({
        data: { organizationId: org.id, adminUserId: member.id, roles: [role] },
      });
      mockSession(member.email, member.id);
      await expect(createOrgLearner(learnerInput(org.id))).rejects.toThrow("NEXT_NOT_FOUND");
    }
  });

  test("the 2nd learner through createOrgLearner is refused when the cap is 1", async () => {
    const { org, owner } = await seedOrg({ dailyLearnerCap: 1, dailyClaimEmailCap: null });
    mockSession(owner.email, owner.id);
    await createOrgLearner(learnerInput(org.id));
    await expect(createOrgLearner(learnerInput(org.id))).rejects.toMatchObject({
      code: "learner_cap",
    });
  });

  test("reinvite sends another claim email until the cap, and refuses a connected learner", async () => {
    const { org, owner } = await seedOrg({ dailyLearnerCap: null, dailyClaimEmailCap: 2 });
    mockSession(owner.email, owner.id);
    const created = await createOrgLearner(learnerInput(org.id));
    const again = await reinviteOrgLearner(org.id, created.studentId);
    expect(again.inviteId).not.toBe(created.inviteId);
    const invites = await db.studentClaimInvite.count({
      where: { studentId: created.studentId, revokedAt: null },
    });
    expect(invites).toBe(2);

    const profile = await seedLearnerProfile("Connected");
    await db.student.update({
      where: { id: created.studentId },
      data: { learnerProfileId: profile.id },
    });
    await expect(reinviteOrgLearner(org.id, created.studentId)).rejects.toMatchObject({
      code: "already_connected",
    });

    const capped = await seedOrg({ dailyLearnerCap: null, dailyClaimEmailCap: 1 });
    mockSession(capped.owner.email, capped.owner.id);
    const first = await createOrgLearner(learnerInput(capped.org.id));
    await expect(reinviteOrgLearner(capped.org.id, first.studentId)).rejects.toMatchObject({
      code: "claim_email_cap",
    });
  });
});

describe("scheduler and instructor loaders", () => {
  test("scheduler card has name, brief, and a blocked reason, and not the parent email", async () => {
    const { org, owner } = await seedOrg();
    const marker = `scheduler-secret-${suffix()}@test.local`;
    const student = await db.student.create({
      data: {
        name: "Should not be the card name",
        adminUserId: null,
        organizationId: org.id,
        parentEmail: marker,
        organizationLearner: {
          create: {
            organizationId: org.id,
            givenName: "Cara",
            familyName: "Lane",
            brief: "Reads aloud",
            createdByAdminUserId: owner.id,
          },
        },
      },
      select: { id: true },
    });
    mockSession(owner.email, owner.id);
    const card = await loadSchedulerLearner(org.id, student.id);
    expect(card.fullName).toBe("Cara Lane");
    expect(card.brief).toBe("Reads aloud");
    expect(card.blockedReason).toBe("Waiting on the family");
    expect(JSON.stringify(card)).not.toContain(marker);
    expect(JSON.stringify(card)).not.toContain("parentEmail");
  });

  test("a claimed learner is blocked only when the latest organization consent turns live sessions off", async () => {
    const { org, owner } = await seedOrg();
    mockSession(owner.email, owner.id);

    async function seedClaimed(givenName: string, familyName: string) {
      const profile = await seedLearnerProfile(`${givenName} ${familyName}`);
      const student = await db.student.create({
        data: {
          name: "Not the card name",
          adminUserId: null,
          organizationId: org.id,
          learnerProfileId: profile.id,
          parentEmail: `secret-${suffix()}@test.local`,
          organizationLearner: {
            create: {
              organizationId: org.id,
              givenName,
              familyName,
              brief: "Keeps the card loadable",
              createdByAdminUserId: owner.id,
            },
          },
        },
        select: { id: true },
      });
      return { studentId: student.id, profile };
    }

    async function writeConsent(
      profile: { id: string; accountHolderId: string },
      version: number,
      allowLiveSession: boolean
    ) {
      await db.consentRecord.create({
        data: {
          learnerProfileId: profile.id,
          adminUserId: null,
          organizationId: org.id,
          version,
          allowLiveSession,
          allowAudioRecording: true,
          allowWhiteboardRecording: true,
          allowNoteSending: true,
          setByAccountHolderId: profile.accountHolderId,
          captureMethod: "electronic",
        },
      });
    }

    const liveOff = await seedClaimed("Nora", "Keene");
    await writeConsent(liveOff.profile, 1, true);
    await writeConsent(liveOff.profile, 2, false);
    const offCard = await loadSchedulerLearner(org.id, liveOff.studentId);
    expect(offCard.blockedReason).toBe("Live sessions are off");

    const liveOn = await seedClaimed("Owen", "Park");
    await writeConsent(liveOn.profile, 1, false);
    await writeConsent(liveOn.profile, 2, true);
    const onCard = await loadSchedulerLearner(org.id, liveOn.studentId);
    expect(onCard.blockedReason).toBeNull();
  });

  // Consent wave C1 (E17, D5). Oracle: the brief's rule "effective = ceiling AND NOT child restriction", typed
  // here as literals, not read from consent-scope.ts. The card used to read the raw org record and ignore the child floor.
  test("E17: a child restriction that forbids live blocks the card even when the organization record allows it", async () => {
    const { org, owner } = await seedOrg();
    mockSession(owner.email, owner.id);

    async function seedCard(
      givenName: string,
      organizationRecord: { allowLiveSession: boolean } | null,
      restriction: { restrictLiveSession: boolean } | null
    ) {
      const profile = await seedLearnerProfile(`${givenName} Floor`);
      const student = await db.student.create({
        data: {
          name: "Not the card name",
          adminUserId: null,
          organizationId: org.id,
          learnerProfileId: profile.id,
          organizationLearner: {
            create: {
              organizationId: org.id,
              givenName,
              familyName: "Floor",
              brief: "E17",
              createdByAdminUserId: owner.id,
            },
          },
        },
        select: { id: true },
      });
      if (organizationRecord) {
        await db.consentRecord.create({
          data: {
            learnerProfileId: profile.id,
            adminUserId: null,
            organizationId: org.id,
            version: 1,
            allowLiveSession: organizationRecord.allowLiveSession,
            allowAudioRecording: true,
            allowWhiteboardRecording: true,
            allowNoteSending: true,
            setByAccountHolderId: profile.accountHolderId,
            captureMethod: "electronic",
          },
        });
      }
      if (restriction) {
        await db.consentRestriction.create({
          data: { learnerProfileId: profile.id, ...restriction },
        });
      }
      return loadSchedulerLearner(org.id, student.id);
    }

    // The bug: org record allows live, the child restricted live. Must read "Live sessions are off".
    const restricted = await seedCard("Rae", { allowLiveSession: true }, { restrictLiveSession: true });
    expect(restricted.blockedReason).toBe("Live sessions are off");

    // Positive control: same record, restriction row present but not restricting live. Not blocked.
    const unrestricted = await seedCard("Sam", { allowLiveSession: true }, { restrictLiveSession: false });
    expect(unrestricted.blockedReason).toBeNull();

    // Unchanged: org record already off is blocked with no restriction at all.
    const orgOff = await seedCard("Tia", { allowLiveSession: false }, null);
    expect(orgOff.blockedReason).toBe("Live sessions are off");

    // Unchanged: a claimed learner with no record is not blocked on this card (the record-missing reason is entry state's, org W4/C5).
    const noRecord = await seedCard("Uma", null, null);
    expect(noRecord.blockedReason).toBeNull();
  });

  test("instructor result has no parent email", async () => {
    const { org, admin } = await seedOrg();
    await db.organizationMember.update({
      where: { organizationId_adminUserId: { organizationId: org.id, adminUserId: admin.id } },
      data: { roles: ["instructor"] },
    });
    const marker = `instructor-secret-${suffix()}@test.local`;
    const student = await db.student.create({
      data: {
        name: "Drew Cole",
        adminUserId: null,
        organizationId: org.id,
        parentEmail: marker,
        organizationLearner: {
          create: {
            organizationId: org.id,
            givenName: "Drew",
            familyName: "Cole",
            createdByAdminUserId: admin.id,
          },
        },
      },
      select: { id: true },
    });
    mockSession(admin.email, admin.id);
    const result = await loadInstructorTaughtSessions(org.id, student.id);
    expect(result).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(marker);
    expect(JSON.stringify(result)).not.toContain("Drew Cole");
  });
});

describe("org consent write", () => {
  test("createVersionedConsentRecord writes the organization and not the minter", async () => {
    const { org, owner } = await seedOrg();
    const profile = await seedLearnerProfile("Org consent");
    await db.student.create({
      data: {
        name: "Org consent",
        adminUserId: null,
        organizationId: org.id,
        learnerProfileId: profile.id,
      },
    });
    mockSession(owner.email, owner.id);
    await createVersionedConsentRecord(db, {
      learnerProfileId: profile.id,
      organizationId: org.id,
      setByAccountHolderId: profile.accountHolderId,
      flags: {
        allowLiveSession: true,
        allowAudioRecording: false,
        allowWhiteboardRecording: true,
        allowNoteSending: false,
      },
    });
    const row = await db.consentRecord.findFirst({
      where: { learnerProfileId: profile.id },
      select: { adminUserId: true, organizationId: true, version: true },
    });
    expect(row).toEqual({ adminUserId: null, organizationId: org.id, version: 1 });
    const resolved = await resolveEffectiveRecordedConsent({
      learnerProfileId: profile.id,
      organizationId: org.id,
    });
    expect(resolved?.allowAudioRecording).toBe(false);
    expect(resolved?.allowLiveSession).toBe(true);
    await expect(
      resolveEffectiveRecordedConsent({ learnerProfileId: profile.id })
    ).rejects.toThrow("consent_owner_required");
  });

  test("a learner email is required", async () => {
    const { org, owner } = await seedOrg();
    mockSession(owner.email, owner.id);
    await expect(
      createOrgLearner({
        organizationId: org.id,
        givenName: "Eve",
        familyName: "Ng",
        brief: "",
        email: "",
        inviteFor: "parent",
      })
    ).rejects.toBeInstanceOf(OrgLearnerError);
  });
});

describe("env-admin where does not list organization learners", () => {
  test("both-null is listed and an organization learner is not", async () => {
    const { org } = await seedOrg();
    const marker = `env-scope-${suffix()}`;
    await db.student.create({
      data: { name: `${marker} env`, adminUserId: null, organizationId: null },
    });
    await db.student.create({
      data: { name: `${marker} org`, adminUserId: null, organizationId: org.id },
    });
    const rows = await db.student.findMany({
      where: {
        ...studentsWhereForScope({ kind: "env", email: "env@test.local" }),
        name: { startsWith: marker },
      },
      select: { name: true, organizationId: true },
    });
    expect(rows.map((row) => row.name)).toEqual([`${marker} env`]);
  });
});
