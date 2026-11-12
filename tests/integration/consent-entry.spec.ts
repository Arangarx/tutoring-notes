/**
 * Consent wave — no relay: entry, Start/refreeze, replay visibility, share link.
 *
 * C0 SKELETON (docs/handoff/consent-wave-plan.md § 6, § 8 C0): every row below is `test.fixme` and is filled in by the wave that
 * owns its behavior. Titles state the rule; each row's oracle is quoted in the comment above it. A row is un-fixme'd only together
 * with its red-before / green-after evidence (exhaustive-testing-mandate.mdc).
 *
 * Run (after un-fixme): npx playwright test tests/integration/consent-entry.spec.ts --project=wb-regression --workers=1 --retries=0
 */

import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
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
  armHold,
  expectReleasedByTest,
  invokeConsentAction,
  listHarnessBlobs,
  releaseHold,
  resetSeams,
  waitUntilParked,
} from "../helpers/consent-harness";
import { seedStartFixture, type StartFixture } from "../helpers/consent-start-fixture";
import type { SessionCapabilities } from "../../src/lib/recording/session-capabilities";
import {
  countBackendsWaitingOnLock,
  dropFamilyConsentVersionsAbove,
  readConsentSnapshots,
  saveFamilyConsentVersion,
} from "../helpers/consent-db-oracle";
import { openTutorAndStudent, seedWbPendingLiveSyncSession, waitForWbE2eBridge } from "./whiteboard-live-sync.helpers";
import { blobIntegrationEnabled } from "../helpers/blob-gate";
import { driveVadSilenceCut, injectVadOverrides } from "../helpers/vad-test-meter";
import {
  chooseMode,
  endFromWorkspace,
  laneCreateLines,
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
// 6a. Entry (online switch)
// ---------------------------------------------------------------------------
test.describe("consent 6a: Entry (online switch)", {
  tag: [TAG.WB_CONSENT, TAG.WB_PRESENCE],
}, () => {
  // Oracle: Server response; session 'sessionMode' row
  test.fixme(
    "E1: online off: tutor Start Online is refused and Start in person works",
    async () => {
      // pending: wave that owns E1
    }
  );
  // Oracle: DOM: in-person button visible, online absent; no mode auto-flip event
  test.fixme(
    "E2: online off: Open room works and offers only in person",
    async () => {
      // pending: wave that owns E2
    }
  );
  // Oracle: Same reason line text
  test.fixme(
    "E3: online off: resume of an open session gives the same answer as Start",
    async () => {
      // pending: wave that owns E3
    }
  );
  // Oracle: Redirect + 'ENTRY_BLOCK_COPY' text
  test.fixme(
    "E4: online off: child cannot join, sees a one-line reason",
    async () => {
      // pending: wave that owns E4
    }
  );
  // Oracle: Same
  test.fixme(
    "E5: online off: parent joining as child cannot join",
    async () => {
      // pending: wave that owns E5
    }
  );
  // Oracle: Same; red today
  test.fixme(
    "E6: online off: self-learner cannot join (the /join gap)",
    async () => {
      // pending: wave that owns E6
    }
  );
  // Oracle: Lands on the blocked page, not a room
  test.fixme(
    "E7: online off: old /w/<joinToken> link cannot join",
    async () => {
      // pending: wave that owns E7
    }
  );
  // Oracle: DOM
  test.fixme(
    "E8: online off: schedule Join button is disabled with a reason for every principal",
    async () => {
      // pending: wave that owns E8
    }
  );
  // Oracle: Positive control
  test.fixme(
    "E9: online on: all of the above succeed",
    async () => {
      // pending: wave that owns E9
    }
  );
  // Oracle: Two sessions, one learner profile
  test.fixme(
    "E10: org consent off, private consent on: org session blocked, private session allowed, same learner",
    async () => {
      // pending: wave that owns E10
    }
  );
  // Oracle: Same
  test.fixme(
    "E11: org consent on, private consent off: private session blocked, org session allowed",
    async () => {
      // pending: wave that owns E11
    }
  );
  // Oracle: Live read while PENDING; '[cns]' log
  test.fixme(
    "E12: parent turns online on after the room was opened: child can join without a new session",
    async () => {
      // pending: wave that owns E12
    }
  );
  // Oracle: Same
  test.fixme(
    "E13: child turns online off after the room was opened: child is refused",
    async () => {
      // pending: wave that owns E13
    }
  );
  // Oracle: Accept/refuse of each site vs the brief's table typed into the spec
  test.fixme(
    "E16: one rule, every caller: Start, bridge, /join and issueJoinToken give the same answer for every (toggle, mode) fixture",
    async () => {
      // pending: wave that owns E16
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
  test.fixme(
    "E18: online off: a learner device cannot join any session, including one the tutor runs in person",
    async () => {
      // pending: wave that owns E18
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
  // Oracle: Re-premised by re-review 2 (R1). New code cannot create an unclaimed-learner session ('assertConsentRecordExists' refuses it), so the test seeds a legacy PENDING row directly through the DB oracle helper (a 'WhiteboardSe …
  test.fixme(
    "S6: legacy PENDING session with no snapshot: family claims and turns whiteboard off, tutor Starts, session ends: the board is purged",
    async () => {
      // pending: wave that owns S6
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
  test.fixme(
    "S7b: PENDING session ended without Start: the purge intent is written from that snapshot, and the sweep selects it",
    async () => {
      // pending: wave that owns S7b
    }
  );
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
  // Oracle: oracle: HTTP status of each replay URL plus DOM of the replay card ("audio scrubber only" for audio-only, board+audio for full, none link for none).
  test.fixme(
    "RP1: replay: {shape} is available to {principal}",
    async () => {
      // pending: wave that owns RP1
    }
  );
  // Oracle: compare the set of asset URLs reachable by token vs. by family.
  test.fixme(
    "RP2: replay: share link shows exactly what the family sees, nothing more",
    async () => {
      // pending: wave that owns RP2
    }
  );
  // Oracle: record with whiteboard on, End, then flip the live record off; replay still 200 (the frozen snapshot decides). Red today.
  test.fixme(
    "RP3: replay after consent revoked post-End: a recorded board is still replayable",
    async () => {
      // pending: wave that owns RP3
    }
  );
  // Oracle: the converse.
  test.fixme(
    "RP4: replay after consent granted post-End: an unrecorded board stays unavailable",
    async () => {
      // pending: wave that owns RP4
    }
  );
  // Oracle: table-driven across the loaders, learner/share/parent pages, the audio proxy, and the share proxy (HTTP/DOM per site; oracle is the brief's table, not 'replay-access.ts').
  test.fixme(
    "RP5: all seven replay sites give the same answer for the same session",
    async () => {
      // pending: wave that owns RP5
    }
  );
  test.fixme(
    "RP6: legacy session without a snapshot keeps today's replay behavior",
    async () => {
      // pending: wave that owns RP6
    }
  );
  test.fixme(
    "RP7: notes off: the review screen's \"Share session\" save releases the replay to the family",
    async () => {
      // pending: wave that owns RP7
    }
  );
  test.fixme(
    "RP8: notes off: before \"Share session\" the family sees no replay",
    async () => {
      // pending: wave that owns RP8
    }
  );
  // Oracle: DB oracle: 'aiGenerated = false' and 'aiPromptVersion = null' after a share-only save (today 'notes-actions.ts' 331–332 and 355–356 write 'true' and 'REDUCE_PROMPT_VERSION' unconditionally); control arm: a save from a ge …
  test.fixme(
    "RP9: notes off: a \"Share session\" save does not claim an AI wrote it",
    async () => {
      // pending: wave that owns RP9
    }
  );
  // Oracle: family DOM on the parent and share surfaces: replay card present, no empty notes block. How the family surface renders an all-blank READY note today is **UNVERIFIED**; this test settles it and the fix follows what it fin …
  test.fixme(
    "RP10: notes off: a shared session with blank notes shows the replay and no empty notes block",
    async () => {
      // pending: wave that owns RP10
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
