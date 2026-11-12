/**
 * Consent wave C3a (Start half) — an ISOLATED PENDING-session fixture for the Start tests.
 *
 * The shared harness learner (`seedWbPendingLiveSyncSession`) is one learner reused by every spec, so a test that
 * flips or deletes its consent record would leak into the next one. This seeds a fresh tutor-owned student, parent
 * account, learner and PENDING session per test (rows written straight to Postgres, never through the code under
 * test), and `cleanup()` removes everything it made.
 *
 * `record: null` = a legacy session whose learner has NO ConsentRecord (S9/S10/S13 oracle).
 * `snapshot: true` = also write a SessionConsentSnapshot that matches the record (a session created through the product).
 */

import { PrismaClient } from "@prisma/client";
import { seedTestAdmin } from "../visual/helpers";
import type { ConsentSwitches } from "./consent-db-oracle";

const { assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

export type StartFixture = {
  adminUserId: string;
  studentId: string;
  learnerProfileId: string;
  whiteboardSessionId: string;
  cleanup: () => Promise<void>;
};

export async function seedStartFixture(opts: {
  /** Switches of the v1 ConsentRecord (unlisted switches on). `null` = no record at all. */
  record: Partial<ConsentSwitches> | null;
  /** Also write the create-time snapshot row (matches `record`). Default false (legacy-shaped). */
  snapshot?: boolean;
}): Promise<StartFixture> {
  assertLocalDatabaseUrlForHarness();
  const adminUserId = await seedTestAdmin();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const prisma = new PrismaClient();
  try {
    const holder = await prisma.accountHolder.create({
      data: { email: `pw-c3a-${stamp}@test.local`, emailVerifiedAt: new Date("2026-01-01") },
      select: { id: true },
    });
    const profile = await prisma.learnerProfile.create({
      data: { accountHolderId: holder.id, displayName: `C3a Learner ${stamp}` },
      select: { id: true },
    });
    const student = await prisma.student.create({
      data: { name: `C3a Student ${stamp}`, adminUserId, learnerProfileId: profile.id },
      select: { id: true },
    });
    const session = await prisma.whiteboardSession.create({
      data: {
        adminUserId,
        studentId: student.id,
        consentAcknowledged: true,
        eventsBlobUrl: "https://pw.local/placeholder-whiteboard-events.json",
        sessionPhase: "PENDING",
        sessionMode: "LIVE",
      },
      select: { id: true },
    });

    if (opts.record) {
      const switches: ConsentSwitches = {
        allowLiveSession: opts.record.allowLiveSession ?? true,
        allowAudioRecording: opts.record.allowAudioRecording ?? true,
        allowWhiteboardRecording: opts.record.allowWhiteboardRecording ?? true,
        allowNoteSending: opts.record.allowNoteSending ?? true,
      };
      const record = await prisma.consentRecord.create({
        data: {
          learnerProfileId: profile.id,
          adminUserId,
          version: 1,
          ...switches,
          setByAccountHolderId: holder.id,
          captureMethod: "electronic",
        },
        select: { id: true, version: true },
      });
      if (opts.snapshot) {
        await prisma.sessionConsentSnapshot.create({
          data: {
            whiteboardSessionId: session.id,
            ...switches,
            consentRecordId: record.id,
            consentRecordVersion: record.version,
          },
        });
      }
    }

    return {
      adminUserId,
      studentId: student.id,
      learnerProfileId: profile.id,
      whiteboardSessionId: session.id,
      cleanup: async () => {
        const p = new PrismaClient();
        try {
          const id = session.id;
          await p.productEvent.deleteMany({ where: { whiteboardSessionId: id } });
          await p.sessionConsentSnapshot.deleteMany({ where: { whiteboardSessionId: id } });
          await p.sessionParticipant.deleteMany({ where: { whiteboardSessionId: id } });
          await p.whiteboardSession.deleteMany({ where: { id } });
          await p.consentRecord.deleteMany({ where: { learnerProfileId: profile.id } });
          await p.student.deleteMany({ where: { id: student.id } });
          await p.learnerProfile.deleteMany({ where: { id: profile.id } });
          await p.accountHolder.deleteMany({ where: { id: holder.id } });
        } finally {
          await p.$disconnect();
        }
      },
    };
  } finally {
    await prisma.$disconnect();
  }
}
