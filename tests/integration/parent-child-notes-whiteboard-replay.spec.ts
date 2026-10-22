/**
 * Item 9 — parent Manage → Session notes → View whiteboard opens the replay.
 *
 * An ended session uses the student's active share token. A still-live session
 * on the same note must not get a link. A missing token must not produce /s//.
 * Whiteboard-recording consent denied hides the link.
 *
 * Run:
 *   npx playwright test tests/integration/parent-child-notes-whiteboard-replay.spec.ts --project=wb-regression --workers=1
 */

import { expect, test } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import { generateShareToken } from "@/lib/security";
import { seedTestAdmin } from "../visual/helpers";
import { seedParentAccountHolder } from "./identity/identity.helpers";
import {
  uploadHarnessBlob,
  uploadReplayEvents,
} from "./wb-replay-harness.helpers";

const { assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

const PARENT_STATE = "tests/integration/.auth/parent.json";
const TUTOR_STATE = "tests/integration/.auth/tutor.json";
/** Bytes stored in the harness. A served concat or recording must equal this. */
const SHARE_REPLAY_AUDIO_MARKER = "parent-share-replay-audio-oracle-v1";
/** Bytes stored as the final-snapshot PNG. A served snapshot must equal this. */
const SHARE_REPLAY_SNAPSHOT_MARKER = "parent-share-replay-snapshot-oracle-v1";

async function attachShareReplayAudio(args: {
  request: import("@playwright/test").APIRequestContext;
  adminUserId: string;
  studentId: string;
  whiteboardSessionId: string;
}): Promise<string> {
  const blobUrl = await uploadHarnessBlob({
    request: args.request,
    pathname: `audio/${args.adminUserId}/${args.studentId}/pw-parent-share-replay.webm`,
    body: SHARE_REPLAY_AUDIO_MARKER,
    contentType: "audio/webm",
    clientPayload: { kind: "audio", studentId: args.studentId },
  });
  const prisma = new PrismaClient();
  try {
    await prisma.whiteboardSession.update({
      where: { id: args.whiteboardSessionId },
      data: { concatBlobUrl: blobUrl, concatDurationSeconds: 3 },
    });
    const recording = await prisma.sessionRecording.create({
      data: {
        adminUserId: args.adminUserId,
        studentId: args.studentId,
        whiteboardSessionId: args.whiteboardSessionId,
        blobUrl,
        mimeType: "audio/webm",
        sizeBytes: SHARE_REPLAY_AUDIO_MARKER.length,
        durationSeconds: 3,
      },
      select: { id: true },
    });
    return recording.id;
  } finally {
    await prisma.$disconnect();
  }
}

async function attachShareReplaySnapshot(args: {
  request: import("@playwright/test").APIRequestContext;
  adminUserId: string;
  studentId: string;
  whiteboardSessionId: string;
}): Promise<void> {
  const blobUrl = await uploadHarnessBlob({
    request: args.request,
    pathname: `whiteboard-sessions/${args.adminUserId}/${args.studentId}/pw-parent-share-snapshot.png`,
    body: SHARE_REPLAY_SNAPSHOT_MARKER,
    contentType: "image/png",
    clientPayload: {
      kind: "whiteboard-snapshot",
      whiteboardSessionId: args.whiteboardSessionId,
      studentId: args.studentId,
    },
  });
  const prisma = new PrismaClient();
  try {
    await prisma.whiteboardSession.update({
      where: { id: args.whiteboardSessionId },
      data: { snapshotBlobUrl: blobUrl },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function setNoteStatus(
  noteId: string,
  status: "DRAFT" | "READY" | "SENT"
): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.sessionNote.update({
      where: { id: noteId },
      data: { status },
    });
  } finally {
    await prisma.$disconnect();
  }
}

type ReplayFixture = {
  learnerProfileId: string;
  studentId: string;
  adminUserId: string;
  noteId: string;
  endedSessionId: string;
  liveSessionId: string | null;
  shareToken: string | null;
  topics: string;
};

async function seedParentNotesReplay(opts: {
  withShareToken: boolean;
  withLiveSession: boolean;
  allowWhiteboardRecording: boolean | null;
  restrictWhiteboardRecording?: boolean;
  recordAllowWhiteboard?: boolean | null;
  isSelfLearner?: boolean;
  noteStatus?: "DRAFT" | "READY" | "SENT";
}): Promise<ReplayFixture> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const topics = `Parent whiteboard replay ${suffix}`;
  try {
    const accountHolderId = await seedParentAccountHolder();
    const adminUserId = await seedTestAdmin();
    const profile = await prisma.learnerProfile.create({
      data: {
        accountHolderId,
        displayName: `Replay Child ${suffix}`,
        isSelfLearner: opts.isSelfLearner ?? false,
      },
      select: { id: true },
    });
    const student = await prisma.student.create({
      data: {
        name: `Replay Child ${suffix}`,
        adminUserId,
        learnerProfileId: profile.id,
      },
      select: { id: true },
    });
    const note = await prisma.sessionNote.create({
      data: {
        studentId: student.id,
        date: new Date("2026-10-01T00:00:00.000Z"),
        topics,
        homework: "",
        assessment: "",
        nextSteps: "",
        linksJson: "[]",
        status: opts.noteStatus ?? "READY",
        shareRecordingInEmail: false,
      },
      select: { id: true },
    });
    const shareToken = opts.withShareToken ? generateShareToken() : null;
    if (shareToken) {
      await prisma.shareLink.create({
        data: { studentId: student.id, token: shareToken },
      });
    }
    const ended = await prisma.whiteboardSession.create({
      data: {
        adminUserId,
        studentId: student.id,
        noteId: note.id,
        consentAcknowledged: true,
        eventsBlobUrl: "https://pw.local/placeholder-whiteboard-events.json",
        endedAt: new Date("2026-10-01T18:00:00.000Z"),
        durationSeconds: 60,
      },
      select: { id: true },
    });
    let liveSessionId: string | null = null;
    if (opts.withLiveSession) {
      const live = await prisma.whiteboardSession.create({
        data: {
          adminUserId,
          studentId: student.id,
          noteId: note.id,
          consentAcknowledged: true,
          eventsBlobUrl: "https://pw.local/placeholder-live-events.json",
          endedAt: null,
        },
        select: { id: true },
      });
      liveSessionId = live.id;
    }
    if (opts.allowWhiteboardRecording !== null) {
      await prisma.sessionConsentSnapshot.create({
        data: {
          whiteboardSessionId: ended.id,
          allowLiveSession: true,
          allowAudioRecording: true,
          allowWhiteboardRecording: opts.allowWhiteboardRecording,
          allowNoteSending: true,
        },
      });
    }
    if (opts.restrictWhiteboardRecording) {
      await prisma.consentRestriction.create({
        data: {
          learnerProfileId: profile.id,
          restrictWhiteboardRecording: true,
        },
      });
    }
    if (opts.recordAllowWhiteboard != null) {
      await prisma.consentRecord.create({
        data: {
          learnerProfileId: profile.id,
          adminUserId,
          organizationId: null,
          version: 1,
          allowLiveSession: true,
          allowAudioRecording: true,
          allowWhiteboardRecording: opts.recordAllowWhiteboard,
          allowNoteSending: true,
          setByAccountHolderId: accountHolderId,
          captureMethod: "electronic",
        },
      });
    }
    return {
      learnerProfileId: profile.id,
      studentId: student.id,
      adminUserId,
      noteId: note.id,
      endedSessionId: ended.id,
      liveSessionId,
      shareToken,
      topics,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function seedOwnerSplitReplay() {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tutorTopics = `Tutor owner replay ${suffix}`;
  const orgTopics = `Org owner replay ${suffix}`;
  try {
    const accountHolderId = await seedParentAccountHolder();
    const adminUserId = await seedTestAdmin();
    const org = await prisma.organization.create({
      data: {
        name: `Replay Org ${suffix}`,
        createdByOperatorId: "playwright-operator@test.local",
      },
      select: { id: true },
    });
    const profile = await prisma.learnerProfile.create({
      data: {
        accountHolderId,
        displayName: `Split Child ${suffix}`,
        isSelfLearner: false,
      },
      select: { id: true },
    });
    const tutorStudent = await prisma.student.create({
      data: {
        name: `Tutor Child ${suffix}`,
        adminUserId,
        learnerProfileId: profile.id,
      },
      select: { id: true },
    });
    const orgStudent = await prisma.student.create({
      data: {
        name: `Org Child ${suffix}`,
        organizationId: org.id,
        learnerProfileId: profile.id,
      },
      select: { id: true },
    });
    const noteData = {
      date: new Date("2026-10-01T00:00:00.000Z"),
      homework: "",
      assessment: "",
      nextSteps: "",
      linksJson: "[]",
      status: "READY" as const,
      shareRecordingInEmail: false,
    };
    const tutorNote = await prisma.sessionNote.create({
      data: { ...noteData, studentId: tutorStudent.id, topics: tutorTopics },
      select: { id: true },
    });
    const orgNote = await prisma.sessionNote.create({
      data: { ...noteData, studentId: orgStudent.id, topics: orgTopics },
      select: { id: true },
    });
    const tutorToken = generateShareToken();
    const orgToken = generateShareToken();
    await prisma.shareLink.createMany({
      data: [
        { studentId: tutorStudent.id, token: tutorToken },
        { studentId: orgStudent.id, token: orgToken },
      ],
    });
    const endedAt = new Date("2026-10-01T18:00:00.000Z");
    const tutorSession = await prisma.whiteboardSession.create({
      data: {
        adminUserId,
        studentId: tutorStudent.id,
        noteId: tutorNote.id,
        consentAcknowledged: true,
        eventsBlobUrl: "https://pw.local/placeholder-tutor-events.json",
        endedAt,
        durationSeconds: 60,
      },
      select: { id: true },
    });
    const orgSession = await prisma.whiteboardSession.create({
      data: {
        adminUserId,
        studentId: orgStudent.id,
        noteId: orgNote.id,
        consentAcknowledged: true,
        eventsBlobUrl: "https://pw.local/placeholder-org-events.json",
        endedAt,
        durationSeconds: 60,
      },
      select: { id: true },
    });
    await prisma.sessionConsentSnapshot.createMany({
      data: [tutorSession.id, orgSession.id].map((whiteboardSessionId) => ({
        whiteboardSessionId,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
      })),
    });
    const flags = {
      allowLiveSession: true,
      allowAudioRecording: true,
      allowNoteSending: true,
      setByAccountHolderId: accountHolderId,
      captureMethod: "electronic" as const,
    };
    await prisma.consentRecord.createMany({
      data: [
        {
          ...flags,
          learnerProfileId: profile.id,
          adminUserId,
          organizationId: null,
          version: 1,
          allowWhiteboardRecording: false,
        },
        {
          ...flags,
          learnerProfileId: profile.id,
          adminUserId,
          organizationId: null,
          version: 2,
          allowWhiteboardRecording: true,
        },
        {
          ...flags,
          learnerProfileId: profile.id,
          adminUserId: null,
          organizationId: org.id,
          version: 1,
          allowWhiteboardRecording: true,
        },
        {
          ...flags,
          learnerProfileId: profile.id,
          adminUserId: null,
          organizationId: org.id,
          version: 2,
          allowWhiteboardRecording: false,
        },
      ],
    });
    return {
      learnerProfileId: profile.id,
      tutorTopics,
      orgTopics,
      tutorSessionId: tutorSession.id,
      orgSessionId: orgSession.id,
      tutorToken,
      orgToken,
    };
  } finally {
    await prisma.$disconnect();
  }
}

test.describe(
  "parent child notes whiteboard replay",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test.use({ storageState: PARENT_STATE });

    test("View whiteboard on an ended session opens the replay and never uses an empty token", async ({
      page,
      browser,
    }) => {
      test.setTimeout(180_000);

      const fixture = await seedParentNotesReplay({
        withShareToken: true,
        withLiveSession: true,
        allowWhiteboardRecording: true,
      });
      const tutor = await browser.newContext({ storageState: TUTOR_STATE });
      try {
        await uploadReplayEvents({
          request: tutor.request,
          adminUserId: fixture.adminUserId,
          studentId: fixture.studentId,
          whiteboardSessionId: fixture.endedSessionId,
        });
      } finally {
        await tutor.close();
      }

      await page.goto(`/account/children/${fixture.learnerProfileId}/notes`);
      await expect(page.getByText(fixture.topics)).toBeVisible({ timeout: 20_000 });

      const links = page.locator("[data-testid='share-wb-replay-links'] a");
      await expect(links).toHaveCount(1);
      await expect(links).toHaveAttribute(
        "href",
        `/s/${fixture.shareToken}/whiteboard/${fixture.endedSessionId}`
      );
      await expect(page.locator("a[href*='/s//']")).toHaveCount(0);
      if (fixture.liveSessionId) {
        await expect(
          page.locator(`a[href*='${fixture.liveSessionId}']`)
        ).toHaveCount(0);
      }

      await links.click();
      await expect(page).toHaveURL(
        new RegExp(
          `/s/${fixture.shareToken}/whiteboard/${fixture.endedSessionId}$`
        ),
        { timeout: 30_000 }
      );
      await expect(page.getByTestId("wb-replay-in-frame")).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByText("404")).toHaveCount(0);
      await expect(page.locator("a[href*='/s//']")).toHaveCount(0);
    });

    test("a missing share token does not render an empty /s// whiteboard link", async ({
      page,
    }) => {
      test.setTimeout(60_000);
      const fixture = await seedParentNotesReplay({
        withShareToken: false,
        withLiveSession: false,
        allowWhiteboardRecording: null,
      });

      await page.goto(`/account/children/${fixture.learnerProfileId}/notes`);
      await expect(page.getByText(fixture.topics)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("link", { name: /watch the whiteboard recording/i })).toHaveCount(
        0
      );
      await expect(page.locator("a[href*='/s//']")).toHaveCount(0);
    });

    test("whiteboard recording denied for the learner hides View whiteboard", async ({
      page,
    }) => {
      test.setTimeout(60_000);
      const fixture = await seedParentNotesReplay({
        withShareToken: true,
        withLiveSession: false,
        allowWhiteboardRecording: false,
      });

      await page.goto(`/account/children/${fixture.learnerProfileId}/notes`);
      await expect(page.getByText(fixture.topics)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("link", { name: /watch the whiteboard recording/i })).toHaveCount(
        0
      );
      await expect(page.locator("a[href*='/s//']")).toHaveCount(0);
    });

    test("a whiteboard restriction hides View whiteboard even when the record and snapshot allow it", async ({
      page,
    }) => {
      test.setTimeout(60_000);
      const fixture = await seedParentNotesReplay({
        withShareToken: true,
        withLiveSession: false,
        allowWhiteboardRecording: true,
        restrictWhiteboardRecording: true,
        recordAllowWhiteboard: true,
      });

      await page.goto(`/account/children/${fixture.learnerProfileId}/notes`);
      await expect(page.getByText(fixture.topics)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("link", { name: /watch the whiteboard recording/i })).toHaveCount(
        0
      );
    });

    test("the latest consent record hides View whiteboard when the snapshot still allows it", async ({
      page,
    }) => {
      test.setTimeout(60_000);
      const fixture = await seedParentNotesReplay({
        withShareToken: true,
        withLiveSession: false,
        allowWhiteboardRecording: true,
        recordAllowWhiteboard: false,
      });

      await page.goto(`/account/children/${fixture.learnerProfileId}/notes`);
      await expect(page.getByText(fixture.topics)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("link", { name: /watch the whiteboard recording/i })).toHaveCount(
        0
      );
    });

    test("the latest consent record hides View whiteboard when the session has no snapshot", async ({
      page,
    }) => {
      test.setTimeout(60_000);
      const fixture = await seedParentNotesReplay({
        withShareToken: true,
        withLiveSession: false,
        allowWhiteboardRecording: null,
        recordAllowWhiteboard: false,
      });

      await page.goto(`/account/children/${fixture.learnerProfileId}/notes`);
      await expect(page.getByText(fixture.topics)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("link", { name: /watch the whiteboard recording/i })).toHaveCount(
        0
      );
    });

    test("org-owned and tutor-owned rows are read from the student owner, latest version", async ({
      page,
    }) => {
      test.setTimeout(60_000);
      const fixture = await seedOwnerSplitReplay();

      await page.goto(`/account/children/${fixture.learnerProfileId}/notes`);
      await expect(page.getByText(fixture.tutorTopics)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(fixture.orgTopics)).toBeVisible();

      const tutorCard = page.locator("article", { hasText: fixture.tutorTopics });
      const orgCard = page.locator("article", { hasText: fixture.orgTopics });
      await expect(
        tutorCard.getByRole("link", { name: /watch the whiteboard recording/i })
      ).toHaveAttribute(
        "href",
        `/s/${fixture.tutorToken}/whiteboard/${fixture.tutorSessionId}`
      );
      await expect(
        orgCard.getByRole("link", { name: /watch the whiteboard recording/i })
      ).toHaveCount(0);
      await expect(page.locator(`a[href*='${fixture.orgSessionId}']`)).toHaveCount(0);
    });

    test("a self-learner who turned whiteboard recording off has no View whiteboard link", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      const denied = await seedParentNotesReplay({
        withShareToken: true,
        withLiveSession: false,
        allowWhiteboardRecording: true,
        recordAllowWhiteboard: false,
        isSelfLearner: true,
      });
      await page.goto(`/account/children/${denied.learnerProfileId}/notes`);
      await expect(page.getByText(denied.topics)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("link", { name: /watch the whiteboard recording/i })).toHaveCount(
        0
      );

      const allowed = await seedParentNotesReplay({
        withShareToken: true,
        withLiveSession: false,
        allowWhiteboardRecording: null,
        recordAllowWhiteboard: true,
        isSelfLearner: true,
      });
      await page.goto(`/account/children/${allowed.learnerProfileId}/notes`);
      await expect(page.getByText(allowed.topics)).toBeVisible({ timeout: 20_000 });
      await expect(
        page.getByRole("link", { name: /watch the whiteboard recording/i })
      ).toHaveAttribute(
        "href",
        `/s/${allowed.shareToken}/whiteboard/${allowed.endedSessionId}`
      );
    });

    test("DRAFT-linked ended session is 404 on the parent share replay and its APIs", async ({
      page,
      browser,
    }) => {
      test.setTimeout(180_000);
      const fixture = await seedParentNotesReplay({
        withShareToken: true,
        withLiveSession: false,
        allowWhiteboardRecording: true,
        noteStatus: "DRAFT",
      });
      if (!fixture.shareToken) throw new Error("expected a share token");

      const tutor = await browser.newContext({ storageState: TUTOR_STATE });
      let recordingId: string;
      try {
        await uploadReplayEvents({
          request: tutor.request,
          adminUserId: fixture.adminUserId,
          studentId: fixture.studentId,
          whiteboardSessionId: fixture.endedSessionId,
        });
        recordingId = await attachShareReplayAudio({
          request: tutor.request,
          adminUserId: fixture.adminUserId,
          studentId: fixture.studentId,
          whiteboardSessionId: fixture.endedSessionId,
        });
        await attachShareReplaySnapshot({
          request: tutor.request,
          adminUserId: fixture.adminUserId,
          studentId: fixture.studentId,
          whiteboardSessionId: fixture.endedSessionId,
        });
      } finally {
        await tutor.close();
      }

      const replayPath = `/s/${fixture.shareToken}/whiteboard/${fixture.endedSessionId}`;
      const eventsUrl = `/api/whiteboard/${fixture.endedSessionId}/public-events?token=${fixture.shareToken}`;
      const concatUrl = `/api/whiteboard/${fixture.endedSessionId}/public-concat-audio?token=${fixture.shareToken}`;
      const snapshotUrl = `/api/whiteboard/${fixture.endedSessionId}/public-snapshot?token=${fixture.shareToken}`;
      const audioUrl = `/api/audio/${recordingId}?token=${fixture.shareToken}`;

      const hidden = await page.goto(replayPath, { waitUntil: "domcontentloaded" });
      expect(hidden?.status()).toBe(404);
      await expect(page.getByTestId("wb-share-replay-page")).toHaveCount(0);

      const events = await page.request.get(eventsUrl);
      const concat = await page.request.get(concatUrl);
      const snapshot = await page.request.get(snapshotUrl);
      const audio = await page.request.get(audioUrl);
      expect(events.status()).toBe(404);
      expect(concat.status()).toBe(404);
      expect(snapshot.status()).toBe(404);
      expect(audio.status()).toBe(404);
      expect(await events.text()).not.toContain("pw-replay-rect");
      expect(await concat.text()).not.toBe(SHARE_REPLAY_AUDIO_MARKER);
      expect(await snapshot.text()).not.toBe(SHARE_REPLAY_SNAPSHOT_MARKER);
      expect(await audio.text()).not.toBe(SHARE_REPLAY_AUDIO_MARKER);

      await setNoteStatus(fixture.noteId, "READY");

      const shown = await page.goto(replayPath, { waitUntil: "domcontentloaded" });
      expect(shown?.status()).toBe(200);
      await expect(page.getByTestId("wb-share-replay-page")).toBeVisible({
        timeout: 30_000,
      });
      const eventsReady = await page.request.get(eventsUrl);
      const concatReady = await page.request.get(concatUrl);
      const snapshotReady = await page.request.get(snapshotUrl);
      const audioReady = await page.request.get(audioUrl);
      expect(eventsReady.status()).toBe(200);
      expect(concatReady.status()).toBe(200);
      expect(snapshotReady.status()).toBe(200);
      expect(audioReady.status()).toBe(200);
      expect(await eventsReady.text()).toContain("pw-replay-rect");
      expect(await concatReady.text()).toBe(SHARE_REPLAY_AUDIO_MARKER);
      expect(await snapshotReady.text()).toBe(SHARE_REPLAY_SNAPSHOT_MARKER);
      expect(await audioReady.text()).toBe(SHARE_REPLAY_AUDIO_MARKER);
    });
  }
);
