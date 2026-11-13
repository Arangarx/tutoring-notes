/**
 * Consent wave C6 — the isolated "ended session, family replays it" fixture shared by the replay specs (RP1-RP10).
 *
 * One tutor-owned student, one family (parent account + learner with a PIN login), one READY note, one share link
 * and one ENDED session whose frozen snapshot (or lack of one: a legacy session) says what was recorded. The board
 * events, the final snapshot PNG and the session audio are real blobs in the Playwright blob harness, so a denied
 * replay is denied by the decision, never by missing data. Every row is written straight to Postgres and every
 * oracle is an HTTP status or DOM, never the code under test's own report.
 *
 * What "shape" means (the hand-written spec table, plan § 2.9): which halves of the replay the family may open.
 *   full       board + audio      online, whiteboard on
 *   audio_only audio, no board    online, whiteboard off          (the "audio scrubber only" shape)
 *   board_only board, no audio    in person, audio off, board on
 *   none       nothing            in person, audio off, whiteboard off
 */

import { expect, type Browser, type BrowserContext } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { generateShareToken } from "@/lib/security";
import { seedTestAdmin } from "../visual/helpers";
import {
  loginAccountHolderInContext,
  loginLearnerInContext,
} from "../integration/whiteboard-live-sync.helpers";
import { replayEventsFixture } from "../integration/wb-replay-harness.helpers";
import { seedHarnessBlobs } from "./consent-harness";
import { harnessUrl } from "./consent-board-fixture";

const {
  assertLocalDatabaseUrlForHarness,
} = require("../../scripts/wb-regression-local-db.cjs");

export const REPLAY_AUDIO_MARKER = "consent-c6-replay-audio-oracle-v1";
export const REPLAY_SNAPSHOT_MARKER = "consent-c6-replay-snapshot-oracle-v1";
/** An element id inside the fixture events log (`replayEventsFixture`): a served events body must contain it. */
export const REPLAY_EVENTS_MARKER = "pw-replay-rect";

export const FAMILY_PASSWORD = "ReplayFamilyPw!4567";
export const LEARNER_PIN = "482916";

export type ReplayShape = "full" | "audio_only" | "board_only" | "none";

/** The spec table: what each shape lets the family open. Written by hand, never read from the code under test. */
export const SHAPE_ACCESS: Record<
  ReplayShape,
  { board: boolean; audio: boolean }
> = {
  full: { board: true, audio: true },
  audio_only: { board: false, audio: true },
  board_only: { board: true, audio: false },
  none: { board: false, audio: false },
};

const SHAPE_SNAPSHOT: Record<
  ReplayShape,
  { audio: boolean; whiteboard: boolean; mode: "LIVE" | "IN_PERSON" }
> = {
  full: { audio: true, whiteboard: true, mode: "LIVE" },
  audio_only: { audio: true, whiteboard: false, mode: "LIVE" },
  board_only: { audio: false, whiteboard: true, mode: "IN_PERSON" },
  none: { audio: false, whiteboard: false, mode: "IN_PERSON" },
};

export type Principal = "share" | "learner";

export type ReplayFixture = {
  adminUserId: string;
  studentId: string;
  learnerProfileId: string;
  accountHolderId: string;
  holderEmail: string;
  learnerHandle: string;
  /** Null for a `noNote` fixture (notes off: no note exists until the tutor shares the session). */
  noteId: string | null;
  topics: string;
  sessionId: string;
  recordingId: string;
  shareToken: string;
  cleanup: () => Promise<void>;
};

export type SeedReplayOptions = {
  /** What was recorded (default `full`). With `snapshot: false` this only chooses the session mode. */
  shape?: ReplayShape;
  /** `false` = a legacy session with NO frozen snapshot (default true). */
  snapshot?: boolean;
  /** The family's LIVE consent record (a later change, or a legacy session's only consent). `null` = no record. */
  liveRecord?: { whiteboard: boolean; audio?: boolean } | null;
  /** A child-level whiteboard restriction on the live consent. */
  restrictWhiteboard?: boolean;
  noteStatus?: "DRAFT" | "READY" | "SENT";
  /** Note text; blank strings seed an all-blank note (RP10). */
  note?: {
    topics: string;
    homework: string;
    assessment: string;
    nextSteps: string;
  };
  /** Notes off for the session (snapshot `allowNoteSending` false). */
  notesOff?: boolean;
  /** No SessionNote at all: a notes-off session before the tutor taps "Share session". */
  noNote?: boolean;
  /** A finished AI draft (TutorNote done, with content) on the session, as a notes-on session has after End. */
  generatedTutorNote?: boolean;
  /** Upload the board events, snapshot PNG and audio blobs (default true). */
  withBlobs?: boolean;
};

const stampOf = () =>
  `${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;

async function withPrisma<T>(
  run: (prisma: PrismaClient) => Promise<T>,
): Promise<T> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Seeds the family and an ended session. The blobs go straight into the harness store through a throwaway context.
 */
export async function seedReplay(
  browser: Browser,
  opts: SeedReplayOptions = {},
): Promise<ReplayFixture> {
  const shape = opts.shape ?? "full";
  const snap = SHAPE_SNAPSHOT[shape];
  const stamp = stampOf();
  const adminUserId = await seedTestAdmin();
  const familyId = `c6fam${stamp}`;
  const username = `c${stamp}`;
  const holderEmail = `pw-c6-${stamp}@test.local`;
  const topics = opts.note?.topics ?? `Consent replay ${stamp}`;
  const passwordHash = await bcrypt.hash(FAMILY_PASSWORD, 10);
  const secretHash = await bcrypt.hash(LEARNER_PIN, 10);
  const shareToken = generateShareToken();

  const ids = await withPrisma(async (p) => {
    const holder = await p.accountHolder.create({
      data: {
        email: holderEmail,
        passwordHash,
        familyId,
        emailVerifiedAt: new Date("2026-01-01"),
      },
      select: { id: true },
    });
    const profile = await p.learnerProfile.create({
      data: {
        accountHolderId: holder.id,
        displayName: `C6 Child ${stamp}`,
        isSelfLearner: false,
        accessMode: "child_pin_required",
      },
      select: { id: true },
    });
    await p.learnerCredential.create({
      data: {
        learnerProfileId: profile.id,
        accountHolderId: holder.id,
        username,
        secretHash,
      },
    });
    const student = await p.student.create({
      data: {
        name: `C6 Child ${stamp}`,
        adminUserId,
        learnerProfileId: profile.id,
      },
      select: { id: true },
    });
    await p.shareLink.create({
      data: { studentId: student.id, token: shareToken },
    });
    const note = opts.noNote
      ? null
      : await p.sessionNote.create({
          data: {
            studentId: student.id,
            date: new Date("2026-10-01T00:00:00.000Z"),
            topics,
            homework: opts.note?.homework ?? "",
            assessment: opts.note?.assessment ?? "",
            nextSteps: opts.note?.nextSteps ?? "",
            linksJson: "[]",
            status: opts.noteStatus ?? "READY",
            shareRecordingInEmail: false,
          },
          select: { id: true },
        });
    const session = await p.whiteboardSession.create({
      data: {
        adminUserId,
        studentId: student.id,
        noteId: note?.id ?? null,
        consentAcknowledged: true,
        sessionMode: snap.mode,
        eventsBlobUrl: "https://pw.local/placeholder-whiteboard-events.json",
        startedAt: new Date("2026-10-01T17:00:00.000Z"),
        endedAt: new Date("2026-10-01T18:00:00.000Z"),
        durationSeconds: 3600,
      },
      select: { id: true },
    });
    if (opts.snapshot !== false) {
      await p.sessionConsentSnapshot.create({
        data: {
          whiteboardSessionId: session.id,
          allowLiveSession: snap.mode === "LIVE",
          allowAudioRecording: snap.audio,
          allowWhiteboardRecording: snap.whiteboard,
          allowNoteSending: !opts.notesOff,
        },
      });
    }
    if (opts.generatedTutorNote) {
      await p.tutorNote.create({
        data: {
          sessionId: session.id,
          status: "done",
          content: "A generated draft.",
          generatedAt: new Date(),
        },
      });
    }
    if (opts.liveRecord) {
      await p.consentRecord.create({
        data: {
          learnerProfileId: profile.id,
          adminUserId,
          organizationId: null,
          version: 1,
          allowLiveSession: true,
          allowAudioRecording: opts.liveRecord.audio ?? true,
          allowWhiteboardRecording: opts.liveRecord.whiteboard,
          allowNoteSending: true,
          setByAccountHolderId: holder.id,
          captureMethod: "electronic",
        },
      });
    }
    if (opts.restrictWhiteboard) {
      await p.consentRestriction.create({
        data: {
          learnerProfileId: profile.id,
          restrictWhiteboardRecording: true,
        },
      });
    }
    return {
      holderId: holder.id,
      profileId: profile.id,
      studentId: student.id,
      noteId: note?.id ?? null,
      sessionId: session.id,
    };
  });

  let recordingId = "";
  if (opts.withBlobs !== false) {
    // Written straight into the blob harness store (as `seedBoard` does), not through the upload mint: the upload
    // guard refuses a board upload for a whiteboard-off session, and a denied replay must be proven denied by the
    // decision while the data is still there.
    const prefix = `whiteboard-sessions/${ids.studentId}/${ids.sessionId}/`;
    const eventsKey = `${prefix}1-events.json`;
    const snapshotKey = `${prefix}1-snapshot.png`;
    const audioKey = `audio/${adminUserId}/${ids.studentId}/pw-c6-replay.webm`;
    const tutor = await browser.newContext();
    try {
      await seedHarnessBlobs(tutor.request, [
        { key: eventsKey, text: replayEventsFixture(), contentType: "application/json" },
        { key: snapshotKey, text: REPLAY_SNAPSHOT_MARKER, contentType: "image/png" },
        { key: audioKey, text: REPLAY_AUDIO_MARKER, contentType: "audio/webm" },
      ]);
      const audioUrl = harnessUrl(audioKey);
      recordingId = await withPrisma(async (p) => {
        await p.whiteboardSession.update({
          where: { id: ids.sessionId },
          data: {
            eventsBlobUrl: harnessUrl(eventsKey),
            snapshotBlobUrl: harnessUrl(snapshotKey),
            concatBlobUrl: audioUrl,
            concatDurationSeconds: 3,
          },
        });
        const recording = await p.sessionRecording.create({
          data: {
            adminUserId,
            studentId: ids.studentId,
            whiteboardSessionId: ids.sessionId,
            noteId: ids.noteId,
            blobUrl: audioUrl,
            mimeType: "audio/webm",
            sizeBytes: REPLAY_AUDIO_MARKER.length,
            durationSeconds: 3,
          },
          select: { id: true },
        });
        return recording.id;
      });
    } finally {
      await tutor.close();
    }
  }

  return {
    adminUserId,
    studentId: ids.studentId,
    learnerProfileId: ids.profileId,
    accountHolderId: ids.holderId,
    holderEmail,
    learnerHandle: `${username}@${familyId}`,
    noteId: ids.noteId,
    topics,
    sessionId: ids.sessionId,
    recordingId,
    shareToken,
    cleanup: async () => {
      await withPrisma(async (p) => {
        const run = async (step: () => Promise<unknown>) => {
          try {
            await step();
          } catch {
            // best-effort: a leftover row in the isolated local test database is harmless
          }
        };
        await run(() =>
          p.sessionRecording.deleteMany({
            where: { studentId: ids.studentId },
          }),
        );
        await run(() =>
          p.sessionConsentSnapshot.deleteMany({
            where: { whiteboardSessionId: ids.sessionId },
          }),
        );
        await run(() =>
          p.whiteboardSession.deleteMany({ where: { id: ids.sessionId } }),
        );
        await run(() =>
          p.tutorNote.deleteMany({ where: { sessionId: ids.sessionId } }),
        );
        await run(() =>
          p.sessionNote.deleteMany({ where: { studentId: ids.studentId } }),
        );
        await run(() =>
          p.shareLink.deleteMany({ where: { studentId: ids.studentId } }),
        );
        await run(() => p.student.deleteMany({ where: { id: ids.studentId } }));
        await run(() =>
          p.consentRestriction.deleteMany({
            where: { learnerProfileId: ids.profileId },
          }),
        );
        await run(() =>
          p.consentRecord.deleteMany({
            where: { learnerProfileId: ids.profileId },
          }),
        );
        await run(() =>
          p.learnerCredential.deleteMany({
            where: { learnerProfileId: ids.profileId },
          }),
        );
        await run(() =>
          p.learnerProfile.deleteMany({ where: { id: ids.profileId } }),
        );
        await run(() =>
          p.accountHolder.deleteMany({ where: { id: ids.holderId } }),
        );
      });
    },
  };
}

/** A fresh, signed-in browser context for one principal. The caller closes it. */
export async function openFamilyContext(
  browser: Browser,
  f: ReplayFixture,
  principal: Principal,
): Promise<BrowserContext> {
  const context = await browser.newContext();
  if (principal === "share")
    await loginAccountHolderInContext(context, f.holderEmail, FAMILY_PASSWORD);
  else await loginLearnerInContext(context, f.learnerHandle, LEARNER_PIN);
  return context;
}

/** The replay page path for a principal. */
export const replayPagePath = (
  f: ReplayFixture,
  principal: Principal,
): string =>
  principal === "share"
    ? `/s/${f.shareToken}/whiteboard/${f.sessionId}`
    : `/join/notes/${f.sessionId}/whiteboard`;

/** The four replay reads a principal can make: board events, board snapshot, audio concat and the audio proxy. */
export function replayReadUrls(f: ReplayFixture, principal: Principal) {
  const q = principal === "share" ? `?token=${f.shareToken}` : "";
  return {
    events: `/api/whiteboard/${f.sessionId}/public-events${q}`,
    snapshot: `/api/whiteboard/${f.sessionId}/public-snapshot${q}`,
    concat: `/api/whiteboard/${f.sessionId}/public-concat-audio${q}`,
    audio: `/api/audio/${f.recordingId}${q}`,
  };
}

export type ReplayReads = {
  page: number;
  events: { status: number; served: boolean };
  snapshot: { status: number; served: boolean };
  concat: { status: number; served: boolean };
  audio: { status: number; served: boolean };
};

/**
 * What a principal gets for every replay read. `served` is true only when the real bytes came back (the marker
 * written by the fixture), so a 200 with the wrong body can never pass for access.
 */
export async function readReplay(
  context: BrowserContext,
  f: ReplayFixture,
  principal: Principal,
): Promise<ReplayReads> {
  const urls = replayReadUrls(f, principal);
  const read = async (url: string, marker: string) => {
    const res = await context.request.get(url);
    return {
      status: res.status(),
      served: res.status() === 200 && (await res.text()).includes(marker),
    };
  };
  const page = await context.request.get(replayPagePath(f, principal));
  return {
    page: page.status(),
    events: await read(urls.events, REPLAY_EVENTS_MARKER),
    snapshot: await read(urls.snapshot, REPLAY_SNAPSHOT_MARKER),
    concat: await read(urls.concat, REPLAY_AUDIO_MARKER),
    audio: await read(urls.audio, REPLAY_AUDIO_MARKER),
  };
}

/** The reads the spec table expects for a shape (hand-written). `none` is 404 everywhere, page included. */
export function expectedReads(access: {
  board: boolean;
  audio: boolean;
}): ReplayReads {
  const any = access.board || access.audio;
  const resource = (allowed: boolean) => ({
    status: allowed ? 200 : 404,
    served: allowed,
  });
  return {
    page: any ? 200 : 404,
    events: resource(access.board),
    snapshot: resource(access.board),
    concat: resource(access.audio),
    audio: resource(access.audio),
  };
}

export function expectReads(
  actual: ReplayReads,
  access: { board: boolean; audio: boolean },
  label: string,
): void {
  expect(actual, label).toEqual(expectedReads(access));
}
