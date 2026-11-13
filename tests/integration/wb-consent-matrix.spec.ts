/**
 * Consent wave — relay harness: audio, notes, whiteboard-live rows (plus the two relay-backed entry rows E15 and E19).
 *
 * C0 SKELETON (docs/handoff/consent-wave-plan.md § 6, § 8 C0): every row below starts as `test.fixme` and is filled in by the wave
 * that owns its behavior. Titles state the rule; each row's oracle is quoted in the comment above it. A row is un-fixme'd only
 * together with its red-before / green-after evidence (exhaustive-testing-mandate.mdc).
 *
 * C2 (server gates + lane identity): A1, A2, A5, A6, A8, A9 and N1–N7 are live. They drive the REAL server entries (the server
 * actions through `/api/test/consent/invoke-action`, the chunk-transcribe queue route, the transcribe-sweep cron) as the signed-in
 * tutor, then read the DATABASE for the oracle (row status, stored `streamId`/`speakerId`, row counts) and the replay route for
 * the audio rows. They never assert on the implementation's own constants: the lanes are literals, the expected statuses come from
 * the plan (§ 2.3 / § 6).
 *
 * Whisper / the notes LLM are not reachable in this environment, so an ALLOWED chunk settles `failed` (or `done` when a key is set).
 * The allow-path oracle is therefore "never refused, lane intact, error is not a consent-gate reason" — the gate's only observable
 * difference between allow and refuse is the terminal `refused` status.
 *
 * Run (after un-fixme): npx playwright test tests/integration/wb-consent-matrix.spec.ts --project=wb-regression --workers=1 --retries=0
 */

import { devices, test, expect, webkit, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import {
  PW_CRON_SECRET,
  invokeConsentAction,
  listHarnessBlobs,
  runCron,
  seedHarnessBlobs,
  type ConsentInvokeAction,
} from "../helpers/consent-harness";
import { replayEventsFixture, uploadHarnessBlob } from "./wb-replay-harness.helpers";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  drawTestStrokeOnRole,
  loginLearnerInContext,
  openTutorAndStudent,
  seedWbLiveSyncSession,
  waitForSceneElementIdsContaining,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import { blobIntegrationEnabled, blobIntegrationSkipMessage } from "../helpers/blob-gate";
import { driveVadSilenceCut, injectVadOverrides } from "../helpers/vad-test-meter";
import {
  audioRequests,
  chooseMode,
  endFromWorkspace,
  laneCreateLines,
  micBlockedLines,
  openTutorRoom,
  seedConsentSession,
  setFamilySwitches,
  startFromWaitingRoom,
} from "../helpers/consent-tutor-room";
import { installGetUserMediaSpy, readGetUserMediaSpy } from "../helpers/get-user-media-spy";

// Lane literals are the stored wire format (session-capabilities.ts helpers build the same strings); tests state them as data.
const TUTOR_LANE = "tutor:mic";
const LEARNER_SEGMENT_LANE = "student:peer-pw1:mic";
const LEARNER_TRANSCRIPT_LANE = "speaker:learner-pw1:transcript";
const LEARNER_SPEAKER = "learner-pw1";
const GATE_REASON = /^(audio_off|notes_off|notes_forbidden)$/;
const NOTES_OFF_COPY = "Notes are off for this session";
const MIN_AGO = (m: number) => new Date(Date.now() - m * 60_000);

const prisma = new PrismaClient();
test.afterAll(async () => {
  await prisma.$disconnect();
});

type SeedOpts = {
  audio: boolean;
  notes?: boolean;
  mode?: "LIVE" | "IN_PERSON";
  notesForbidden?: boolean;
  /** Seal the session (ended long ago, past the notes completion window). */
  ended?: boolean;
};

/** A real ACTIVE session owned by the Playwright tutor, with the consent toggles frozen the way the plan's matrix names them. */
async function seedSession(o: SeedOpts): Promise<{ id: string; studentId: string }> {
  const s = await seedWbLiveSyncSession({ sessionMode: o.mode ?? "LIVE" });
  await prisma.sessionConsentSnapshot.update({
    where: { whiteboardSessionId: s.whiteboardSessionId },
    data: { allowAudioRecording: o.audio, allowNoteSending: o.notes ?? true },
  });
  await prisma.whiteboardSession.update({
    where: { id: s.whiteboardSessionId },
    data: {
      notesForbidden: o.notesForbidden ?? false,
      ...(o.ended ? { endedAt: MIN_AGO(30) } : {}),
    },
  });
  return { id: s.whiteboardSessionId, studentId: s.studentId };
}

/** Seal an ACTIVE session (ended long ago, past the notes completion window). */
async function sealSession(id: string) {
  await prisma.whiteboardSession.update({ where: { id }, data: { endedAt: MIN_AGO(30) } });
}

let blobSeq = 0;
/** Seed one harness blob and return the URL the server actions / worker will accept and fetch. */
async function seedBlob(request: APIRequestContext, baseURL: string, studentId: string, text = "pw-audio-bytes") {
  const key = `consent-c2/${studentId}/${Date.now()}-${blobSeq++}.webm`;
  await seedHarnessBlobs(request, [{ key, text }]);
  return `${new URL(baseURL).origin}/api/test/blob/object/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Run one consent-gated server action as the signed-in tutor; returns the action's own return value. */
async function invoke(
  request: APIRequestContext,
  action: ConsentInvokeAction,
  sessionId: string,
  args?: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const res = await invokeConsentAction(request, action, sessionId, args);
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { result: Record<string, unknown> | null }).result;
}

/** POST the chunk-transcribe queue route exactly as the production `after()` hand-off does. */
async function postQueue(request: APIRequestContext, body: Record<string, unknown>) {
  const res = await request.post("/api/queues/chunk-transcribe", {
    data: body,
    headers: { authorization: `Bearer ${PW_CRON_SECRET}` },
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status(), json: json as Record<string, unknown>, text };
}

const chunksOf = (sessionId: string) =>
  prisma.transcriptChunk.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
const recordingsOf = (sessionId: string) =>
  prisma.sessionRecording.findMany({ where: { whiteboardSessionId: sessionId }, orderBy: { createdAt: "asc" } });

// The sweep takes the OLDEST stale rows first, in batches; the shared Playwright DB can hold other specs' leftovers, so every row
// seeded here is backdated to years ago (monotonic, so each test's rows sort ahead of any leftover) and is reached by one sweep run.
let chunkSeq = 0;

/** Seed a transcript chunk row directly (a chunk "already in the outbox / queue"), backdated so the sweep sees it as stale. */
async function seedChunk(
  sessionId: string,
  blobUrl: string,
  lane: { streamId: string; speakerId: string | null },
  o?: { status?: string; updatedAt?: Date; offsetMs?: number }
) {
  return prisma.transcriptChunk.create({
    data: {
      sessionId,
      chunkBlobUrl: blobUrl,
      recordingTimeOffsetMs: o?.offsetMs ?? 0,
      status: o?.status ?? "pending",
      streamId: lane.streamId,
      speakerId: lane.speakerId,
      updatedAt: o?.updatedAt ?? new Date(Date.UTC(2003, 0, 1, 0, 0, chunkSeq++)),
    },
  });
}

/** A chunk is settled once it is no longer waiting on a worker. */
const isSettled = (status: string) => status !== "pending" && status !== "transcribing";

// E15 runs the student on `devices["iPhone 13"]` (studentBrowser: "webkit"); E19 runs for both a join-token learner and a signed-in learner (SF-I).

// ---------------------------------------------------------------------------
// 6a. Entry (online switch)
// ---------------------------------------------------------------------------
test.describe("consent 6a: Entry (online switch)", {
  tag: [TAG.WB_CONSENT, TAG.WB_PRESENCE],
}, () => {
  // Oracle: Student on 'devices["iPhone 13"]'; redirect + copy text
  test(
    "E15: online off: a WebKit (iPhone 13) student at /join is refused with the one-line reason",
    async () => {
      test.setTimeout(150_000);
      // Online switch off in the family's live record; the room is PENDING. Spec-typed family copy (the plan's § 7b table).
      const s = await seedConsentSession({ switches: { allowLiveSession: false }, phase: "PENDING" });
      const webkitBrowser = await webkit.launch();
      // Same context shape the harness uses for the iPhone student: the device profile, and no permission grants (WebKit
      // rejects the project's microphone grant).
      const context = await webkitBrowser.newContext({ ...devices["iPhone 13"], permissions: [] });
      try {
        await loginLearnerInContext(context, s.learnerHandle, s.learnerPin);
        const page = await context.newPage();
        await page.goto(`/join/${s.whiteboardSessionId}#k=AAAAAAAAAAAAAAAAAAAAAA`, { waitUntil: "domcontentloaded" });
        const line = page.getByTestId("join-entry-blocked");
        await expect(line).toBeVisible({ timeout: 60_000 });
        await expect(line).toHaveText("Live sessions are off in privacy settings.");
        await expect(line).toHaveAttribute("data-entry-reason", "live_off");
        await expect(page).toHaveURL(new RegExp(`/join/${s.whiteboardSessionId}`));
        // No room, no A/V: the board never mounts, and no getUserMedia could have been asked for.
        await expect(page.getByTestId("student-whiteboard-canvas-mount")).toHaveCount(0);
        // The refusal is readable on the phone: inside the visible viewport, not clipped off-screen.
        const box = await line.boundingBox();
        const viewport = page.viewportSize();
        expect(box, "refusal line has a box").not.toBeNull();
        expect(viewport, "iPhone viewport").not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
      } finally {
        await context.close();
        await webkitBrowser.close();
        await s.cleanup();
      }
    }
  );
  // Oracle: Q9, B4 channel. Run for both client branches (SF-I): a join-token learner and a signed-in learner session, because each has its own 'JoinUnavailableReason' map ('WhiteboardWorkspaceClient.tsx' 1446–1454 and 1516–1521) an …
  // C3c. Signed-in learner arm here; the join-token arm is the jest DOM render in StudentLiveWorkspaceClient.dom.test.tsx
  // (no page renders the token client) plus the route tests for both branches. The family's switch is saved as a new
  // live-record version (consent-tutor-room `setFamilySwitches`; the family settings action itself is E13's wave).
  // The in-person tutor shows no sync pill, so the drop is read on the learner: its sync client disconnects and its
  // presence heartbeats to the relay stop.
  test(
    "E19: online off: a learner already connected during PENDING is disconnected with a message when the tutor Starts in person",
    async ({ browser }) => {
      test.setTimeout(300_000);
      const s = await seedConsentSession({ switches: {} });
      const pair = await openTutorAndStudent(browser, s, {
        ensureFollow: false,
        prepareContext: (ctx) => installGetUserMediaSpy(ctx, "passthrough"),
      });
      try {
        const learner = pair.studentPage;
        const lines: string[] = [];
        learner.on("console", (m) => lines.push(m.text()));
        const presenceSends = () => lines.filter((l) => /kind=presence send/.test(l)).length;
        await expect(pair.tutorPage.getByTestId("wb-sync-pill")).toHaveText(/student connected/i);
        await expect.poll(presenceSends, { timeout: 15_000 }).toBeGreaterThan(0);
        await setFamilySwitches(s, { allowLiveSession: false }, { snapshot: false });
        await chooseMode(pair.tutorPage, "IN_PERSON");
        await startFromWaitingRoom(pair.tutorPage);

        await expect(learner.getByRole("heading", { name: "You were disconnected" })).toBeVisible({ timeout: 10_000 });
        await expect(learner.getByText("Live sessions are off in privacy settings.")).toBeVisible();
        await expect(learner.getByText("This link isn't usable anymore")).toHaveCount(0);
        await expect
          .poll(() => lines.some((l) => /\[wjg\].*action=sync_disconnect/.test(l)), { timeout: 10_000 })
          .toBe(true);
        const gumAfter = (await readGetUserMediaSpy(learner)).calls.length;
        const sendsAfter = presenceSends();
        await learner.waitForTimeout(8_000);
        expect(presenceSends()).toBe(sendsAfter);
        expect((await readGetUserMediaSpy(learner)).calls.length).toBe(gumAfter);
      } finally {
        await pair.close();
        await s.cleanup();
      }
    }
  );
  test(
    "E19 control: online on, in-person Start keeps the connected learner",
    async ({ browser }) => {
      test.setTimeout(300_000);
      const s = await seedConsentSession({ switches: {} });
      const pair = await openTutorAndStudent(browser, s, { ensureFollow: false });
      try {
        await chooseMode(pair.tutorPage, "IN_PERSON");
        await startFromWaitingRoom(pair.tutorPage);
        await expect(pair.studentPage.getByTestId("wb-waiting-overlay")).not.toBeVisible({ timeout: 10_000 });
        await pair.studentPage.waitForTimeout(8_000);
        await expect(pair.studentPage.getByText("You were disconnected")).toHaveCount(0);
        await expect(pair.studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible();
        await expect(pair.tutorPage.getByTestId("wb-sync-pill")).toHaveText(/student connected/i);
      } finally {
        await pair.close();
        await s.cleanup();
      }
    }
  );
});

// ---------------------------------------------------------------------------
// 6c. Audio
// ---------------------------------------------------------------------------
test.describe("consent 6c: Audio", {
  tag: [TAG.WB_CONSENT, TAG.WB_RECORDING],
}, () => {
  // Oracle: 'TranscriptChunk' rows by 'streamId'
  // A1 GATES the wave: it is the allow path. The same server entries that refuse in A2/A5/A6 must still save and transcribe both voices.
  // (The real-browser two-party flow — student speaks → transcription-only upload — is wb-vad-per-speaker-durability.spec.ts.)
  test(
    "A1: audio on: tutor and learner voices are both saved and transcribed (online)",
    async ({ request, baseURL }) => {
      const { id, studentId } = await seedSession({ audio: true });

      // Saved: a tutor-lane segment and a learner-lane segment both register.
      for (const lane of [TUTOR_LANE, LEARNER_SEGMENT_LANE]) {
        const blobUrl = await seedBlob(request, baseURL!, studentId);
        const result = await invoke(request, "registerSegment", id, {
          blobUrl,
          mimeType: "audio/webm",
          sizeBytes: 14,
          streamId: lane,
          audioStartedAtMs: 0,
        });
        expect(result, `register ${lane}`).toMatchObject({ ok: true });
      }
      expect((await recordingsOf(id)).map((r) => r.streamId).sort()).toEqual([LEARNER_SEGMENT_LANE, TUTOR_LANE].sort());

      // Transcribed: the tutor mixdown (the real client sends NO lane) and a learner transcription-only chunk both get a row on
      // their own lane and are never refused.
      const tutorChunk = await seedBlob(request, baseURL!, studentId);
      const learnerChunk = await seedBlob(request, baseURL!, studentId);
      await invoke(request, "enqueueChunk", id, { chunkBlobUrl: tutorChunk, recordingTimeOffsetMs: 0 });
      await invoke(request, "enqueueChunk", id, {
        chunkBlobUrl: learnerChunk,
        recordingTimeOffsetMs: 1000,
        streamId: LEARNER_TRANSCRIPT_LANE,
        speakerId: LEARNER_SPEAKER,
      });
      await expect.poll(async () => (await chunksOf(id)).length, { timeout: 15_000 }).toBe(2);
      await expect
        .poll(async () => (await chunksOf(id)).every((c) => isSettled(c.status)), { timeout: 60_000 })
        .toBe(true);

      const rows = await chunksOf(id);
      const byUrl = new Map(rows.map((c) => [c.chunkBlobUrl, c]));
      expect(byUrl.get(tutorChunk)).toMatchObject({ streamId: TUTOR_LANE, speakerId: null });
      expect(byUrl.get(learnerChunk)).toMatchObject({ streamId: LEARNER_TRANSCRIPT_LANE, speakerId: LEARNER_SPEAKER });
      for (const c of rows) {
        expect(c.status, `${c.streamId} must not be refused`).not.toBe("refused");
        expect(c.error ?? "").not.toMatch(GATE_REASON);
      }
    }
  );
  // Oracle: No 'speaker:*' rows in 'SessionRecording' or 'TranscriptChunk'; no learner upload request observed
  // (server half. The "no learner upload request observed" client half is C3b — A2b/A3/A4 stay fixme below.)
  test(
    "A2: audio off, online: only the tutor's track is saved; learner voice is never transcribed",
    async ({ request, baseURL }) => {
      const { id, studentId } = await seedSession({ audio: false, mode: "LIVE" });

      const tutorBlob = await seedBlob(request, baseURL!, studentId);
      expect(
        await invoke(request, "registerSegment", id, {
          blobUrl: tutorBlob,
          mimeType: "audio/webm",
          sizeBytes: 14,
          streamId: TUTOR_LANE,
          audioStartedAtMs: 0,
        })
      ).toMatchObject({ ok: true });

      for (const lane of [LEARNER_SEGMENT_LANE, LEARNER_TRANSCRIPT_LANE]) {
        const result = await invoke(request, "registerSegment", id, {
          blobUrl: await seedBlob(request, baseURL!, studentId),
          mimeType: "audio/webm",
          sizeBytes: 14,
          streamId: lane,
          speakerId: LEARNER_SPEAKER,
          audioStartedAtMs: 0,
        });
        expect(result, `learner lane ${lane}`).toMatchObject({ ok: false, refused: true });
      }
      // The learner's transcription-only chunk is dropped before it is even a row.
      await invoke(request, "enqueueChunk", id, {
        chunkBlobUrl: await seedBlob(request, baseURL!, studentId),
        recordingTimeOffsetMs: 0,
        streamId: LEARNER_TRANSCRIPT_LANE,
        speakerId: LEARNER_SPEAKER,
      });

      expect((await recordingsOf(id)).map((r) => r.streamId)).toEqual([TUTOR_LANE]);
      expect(await chunksOf(id)).toEqual([]);
      // Whatever lands later for this session must still never carry a learner lane.
      await runCron(request, "/api/cron/transcribe-sweep");
      for (const c of await chunksOf(id)) expect(c.streamId).toBe(TUTOR_LANE);
    }
  );
  // Oracle: No lane recorder before the Start response is adopted
  // Audio ON (the only mode where a learner lane may ever exist): during PENDING the learner is connected and sending
  // audio, but no lane recorder is created until the tutor adopts Start's capabilities. Positive control: it is
  // created after Start, so the PENDING silence is not vacuous.
  test(
    "A2b: learner lane is not created before capability is known",
    { tag: [TAG.WB_AV] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      const s = await seedConsentSession({ switches: { allowAudioRecording: true } });
      const tutorLines: string[] = [];
      let contexts = 0;
      const pair = await openTutorAndStudent(browser, s, {
        ensureFollow: false,
        // The tutor context is prepared first; only its console carries the lane recorder.
        prepareContext: async (ctx: BrowserContext) => {
          if (contexts++ === 0) ctx.on("console", (m) => tutorLines.push(m.text()));
        },
      });
      try {
        await chooseMode(pair.tutorPage, "LIVE");
        await pair.tutorPage.waitForTimeout(8_000);
        expect(laneCreateLines(tutorLines)).toEqual([]);
        await startFromWaitingRoom(pair.tutorPage);
        await expect.poll(() => laneCreateLines(tutorLines).length, { timeout: 30_000 }).toBeGreaterThan(0);
      } finally {
        await pair.close();
        await s.cleanup();
      }
    }
  );
  // Oracle: Spy count of audio 'getUserMedia' = 0; no segments
  // The recorder is driven through a speech → silence cut while ACTIVE, so an open mic would have produced a segment.
  test(
    "A3: audio off, in person: no audio is saved and the mic is never opened",
    { tag: [TAG.WB_AV] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      const s = await seedConsentSession({ switches: { allowAudioRecording: false } });
      const room = await openTutorRoom(browser, s, { prepare: (_ctx, page) => injectVadOverrides(page) });
      try {
        await chooseMode(room.page, "IN_PERSON");
        await startFromWaitingRoom(room.page);
        await room.page.waitForTimeout(2_000);
        await driveVadSilenceCut(room.page);
        await endFromWorkspace(room.page);
        expect(await audioRequests(room.page)).toBe(0);
        expect(await recordingsOf(s.whiteboardSessionId)).toEqual([]);
        expect(await chunksOf(s.whiteboardSessionId)).toEqual([]);
      } finally {
        await room.close();
        await s.cleanup();
      }
    }
  );
  // Oracle: Same spy
  // No click: the waiting room's own preview (the recorder's mount-time acquire) is what is blocked, and it says so.
  test(
    "A4: audio off, in person: waiting-room mic preview does not open the mic",
    { tag: [TAG.WB_AV] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const s = await seedConsentSession({ switches: { allowAudioRecording: false }, mode: "IN_PERSON" });
      const room = await openTutorRoom(browser, s);
      try {
        await chooseMode(room.page, "IN_PERSON");
        await room.page.waitForTimeout(6_000);
        expect(await audioRequests(room.page)).toBe(0);
        expect(micBlockedLines(room.consoleLines).length).toBeGreaterThan(0);
        await expect(room.page.getByTestId("wb-waiting-overlay")).toBeVisible();
      } finally {
        await room.close();
        await s.cleanup();
      }
    }
  );
  // Oracle: HTTP status + DB
  test(
    "A5: audio off: server rejects a learner-lane segment posted by a tampered client",
    async ({ request, baseURL }) => {
      // Online, audio off: tutor lane still stored, a learner-labelled segment is refused and leaves no row.
      const online = await seedSession({ audio: false, mode: "LIVE" });
      const learnerBlob = await seedBlob(request, baseURL!, online.studentId);
      const refused = await invoke(request, "registerSegment", online.id, {
        blobUrl: learnerBlob,
        mimeType: "audio/webm",
        sizeBytes: 14,
        streamId: LEARNER_SEGMENT_LANE,
        audioStartedAtMs: 0,
      });
      expect(refused).toMatchObject({ ok: false, refused: true });
      expect(await recordingsOf(online.id)).toEqual([]);

      // An UNKNOWN lane label is also treated as learner (fails closed) — it cannot smuggle audio past the gate.
      const unknown = await invoke(request, "registerSegment", online.id, {
        blobUrl: await seedBlob(request, baseURL!, online.studentId),
        mimeType: "audio/webm",
        sizeBytes: 14,
        streamId: "mystery:lane",
        audioStartedAtMs: 0,
      });
      expect(unknown).toMatchObject({ ok: false, refused: true });
      expect(await recordingsOf(online.id)).toEqual([]);

      // In person, audio off: no audio at all, not even the tutor lane.
      const inPerson = await seedSession({ audio: false, mode: "IN_PERSON" });
      const tutorRefused = await invoke(request, "registerSegment", inPerson.id, {
        blobUrl: await seedBlob(request, baseURL!, inPerson.studentId),
        mimeType: "audio/webm",
        sizeBytes: 14,
        streamId: TUTOR_LANE,
        audioStartedAtMs: 0,
      });
      expect(tutorRefused).toMatchObject({ ok: false, refused: true });
      expect(await recordingsOf(inPerson.id)).toEqual([]);
    }
  );
  // Oracle: DB rows after End. End re-checks every segment's lane: the outbox re-sends a segment refused mid-session, and a
  // tampered client can post one only at End, so the per-lane rule must hold at End too, not just at mid-session registration.
  test(
    "A5 (End): audio off, online: End stores the tutor segment and drops the learner-lane segment",
    async ({ request, baseURL }) => {
      const { id, studentId } = await seedSession({ audio: false, mode: "LIVE" });
      const segment = async (streamId: string, audioStartedAtMs: number) => ({
        blobUrl: await seedBlob(request, baseURL!, studentId),
        mimeType: "audio/webm",
        sizeBytes: 14,
        audioStartedAtMs,
        streamId,
        segmentId: `pw-end-${streamId}`,
        durationSeconds: 2,
      });
      const tutor = await segment(TUTOR_LANE, 0);
      const learner = await segment(LEARNER_SEGMENT_LANE, 1);

      const ended = await invoke(request, "endSession", id, { extraSegments: [tutor, learner] });
      expect(ended, "the session still closes").toMatchObject({ ok: true });

      const rows = await recordingsOf(id);
      expect(rows.filter((r) => r.streamId === LEARNER_SEGMENT_LANE), "no learner-lane row").toEqual([]);
      expect(rows.some((r) => r.blobUrl === learner.blobUrl), "the learner blob is not stored under any lane").toBe(false);
      expect(rows.map((r) => ({ streamId: r.streamId, blobUrl: r.blobUrl }))).toEqual([
        { streamId: TUTOR_LANE, blobUrl: tutor.blobUrl },
      ]);
      expect((await prisma.whiteboardSession.findUniqueOrThrow({ where: { id } })).endedAt).not.toBeNull();

      // Allow path: audio on, the same End stores both lanes.
      const on = await seedSession({ audio: true, mode: "LIVE" });
      const onTutor = { ...tutor, blobUrl: await seedBlob(request, baseURL!, on.studentId) };
      const onLearner = { ...learner, blobUrl: await seedBlob(request, baseURL!, on.studentId) };
      expect(await invoke(request, "endSession", on.id, { extraSegments: [onTutor, onLearner] })).toMatchObject({ ok: true });
      expect((await recordingsOf(on.id)).map((r) => r.streamId).sort()).toEqual([LEARNER_SEGMENT_LANE, TUTOR_LANE].sort());
    }
  );
  // Oracle: Queue route status; no 'TranscriptChunk'
  test(
    "A6: audio off: server transcription refuses a learner-lane chunk already in the outbox",
    async ({ request, baseURL }) => {
      const online = await seedSession({ audio: false, mode: "LIVE" });

      // The outbox replays a learner chunk through the queue route: refused (200, not retried), and no row is created.
      const learnerChunk = await seedBlob(request, baseURL!, online.studentId);
      const learner = await postQueue(request, {
        sessionId: online.id,
        chunkBlobUrl: learnerChunk,
        recordingTimeOffsetMs: 0,
        streamId: LEARNER_TRANSCRIPT_LANE,
        speakerId: LEARNER_SPEAKER,
      });
      expect(learner.status, learner.text).toBe(200);
      expect(learner.json).toMatchObject({ outcome: "refused" });
      expect(await chunksOf(online.id)).toEqual([]);

      // No lane at all and no stored row: skipped (never defaulted to the tutor lane), still no row.
      const noLane = await postQueue(request, {
        sessionId: online.id,
        chunkBlobUrl: await seedBlob(request, baseURL!, online.studentId),
        recordingTimeOffsetMs: 0,
      });
      expect(noLane.status, noLane.text).toBe(200);
      expect(noLane.json).toMatchObject({ outcome: "skipped" });
      expect(await chunksOf(online.id)).toEqual([]);

      // In person with audio off, even a tutor-lane chunk is refused.
      const inPerson = await seedSession({ audio: false, mode: "IN_PERSON" });
      const tutor = await postQueue(request, {
        sessionId: inPerson.id,
        chunkBlobUrl: await seedBlob(request, baseURL!, inPerson.studentId),
        recordingTimeOffsetMs: 0,
        streamId: TUTOR_LANE,
      });
      expect(tutor.status, tutor.text).toBe(200);
      expect(tutor.json).toMatchObject({ outcome: "refused" });
      expect(await chunksOf(inPerson.id)).toEqual([]);
    }
  );
  // Oracle: Rows
  // Positive control for the in-person gate: with audio on, the room's voices are one tutor-mic lane that is saved
  // and transcribed (never refused), and no learner lane exists.
  test(
    "A7: audio on, in person: voices are captured on the tutor mic and transcribed",
    { tag: [TAG.WB_AV] },
    async ({ browser }) => {
      test.setTimeout(300_000);
      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());
      const s = await seedConsentSession({ switches: { allowAudioRecording: true } });
      const room = await openTutorRoom(browser, s, { prepare: (_ctx, page) => injectVadOverrides(page) });
      try {
        await chooseMode(room.page, "IN_PERSON");
        await expect.poll(() => audioRequests(room.page), { timeout: 20_000 }).toBeGreaterThan(0);
        await startFromWaitingRoom(room.page);
        await room.page.waitForTimeout(2_000);
        await driveVadSilenceCut(room.page);
        await endFromWorkspace(room.page);
        const id = s.whiteboardSessionId;
        await expect.poll(async () => (await recordingsOf(id)).length, { timeout: 60_000 }).toBeGreaterThan(0);
        for (const r of await recordingsOf(id)) expect(r.streamId).toBe(TUTOR_LANE);
        await expect.poll(async () => (await chunksOf(id)).length, { timeout: 60_000 }).toBeGreaterThan(0);
        for (const c of await chunksOf(id)) {
          expect(c.streamId).toBe(TUTOR_LANE);
          expect(c.status).not.toBe("refused");
        }
      } finally {
        await room.close();
        await s.cleanup();
      }
    }
  );
  // Oracle: Stored 'streamId' / 'speakerId' unchanged after sweep and after 'kickSessionChunksAction'; refused row status terminal
  test(
    "A8: audio off: a swept or kicked learner chunk keeps its lane and is refused, not relabeled tutor:mic",
    async ({ request, baseURL }) => {
      const swept = await seedSession({ audio: false, mode: "LIVE" });
      const learnerUrl = await seedBlob(request, baseURL!, swept.studentId);
      const tutorUrl = await seedBlob(request, baseURL!, swept.studentId);
      await seedChunk(swept.id, learnerUrl, { streamId: LEARNER_TRANSCRIPT_LANE, speakerId: LEARNER_SPEAKER });
      await seedChunk(swept.id, tutorUrl, { streamId: TUTOR_LANE, speakerId: null });

      expect((await runCron(request, "/api/cron/transcribe-sweep")).status).toBe(200);
      await expect
        .poll(async () => (await chunksOf(swept.id)).every((c) => isSettled(c.status)), { timeout: 60_000 })
        .toBe(true);

      const afterSweep = new Map((await chunksOf(swept.id)).map((c) => [c.chunkBlobUrl, c]));
      // Learner: refused, lane untouched (the bug relabeled it tutor:mic because the sweep dropped the lane).
      expect(afterSweep.get(learnerUrl)).toMatchObject({
        status: "refused",
        streamId: LEARNER_TRANSCRIPT_LANE,
        speakerId: LEARNER_SPEAKER,
      });
      // Tutor lane is allowed online with audio off (tutor_only): never refused, lane intact.
      expect(afterSweep.get(tutorUrl)).toMatchObject({ streamId: TUTOR_LANE });
      expect(afterSweep.get(tutorUrl)?.status).not.toBe("refused");

      // The same through "kick": a pending learner chunk is refused and keeps its lane.
      const kicked = await seedSession({ audio: false, mode: "LIVE", ended: true });
      const kickLearnerUrl = await seedBlob(request, baseURL!, kicked.studentId);
      await seedChunk(kicked.id, kickLearnerUrl, { streamId: LEARNER_TRANSCRIPT_LANE, speakerId: LEARNER_SPEAKER });
      const kickResult = await invoke(request, "kick", kicked.id);
      expect(kickResult).toMatchObject({ refused: 1 });
      await expect
        .poll(async () => (await chunksOf(kicked.id))[0]?.status, { timeout: 30_000 })
        .toBe("refused");
      expect((await chunksOf(kicked.id))[0]).toMatchObject({
        streamId: LEARNER_TRANSCRIPT_LANE,
        speakerId: LEARNER_SPEAKER,
      });
    }
  );
  // Oracle: Unit + DB: re-upsert with default args leaves 'streamId'/'speakerId' as created
  // (The DB-level proof is src/__tests__/recording/consent-lane-db.test.ts "A9"; this is the same rule through the real HTTP route.)
  test(
    "A9: transcript upsert never overwrites a stored lane",
    async ({ request, baseURL }) => {
      const { id, studentId } = await seedSession({ audio: true });
      const url = await seedBlob(request, baseURL!, studentId);
      await seedChunk(id, url, { streamId: LEARNER_TRANSCRIPT_LANE, speakerId: LEARNER_SPEAKER }, { status: "failed" });

      // A retry arrives claiming the tutor lane and no speaker (an old / tampered client re-sending the chunk).
      await postQueue(request, {
        sessionId: id,
        chunkBlobUrl: url,
        recordingTimeOffsetMs: 0,
        streamId: TUTOR_LANE,
        speakerId: null,
      });
      await invoke(request, "enqueueChunk", id, { chunkBlobUrl: url, recordingTimeOffsetMs: 0 }); // default-lane re-enqueue

      await expect
        .poll(async () => (await chunksOf(id)).every((c) => isSettled(c.status)), { timeout: 60_000 })
        .toBe(true);
      const rows = await chunksOf(id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ streamId: LEARNER_TRANSCRIPT_LANE, speakerId: LEARNER_SPEAKER });
    }
  );
});

// ---------------------------------------------------------------------------
// 6e. Whiteboard
// ---------------------------------------------------------------------------
test.describe("consent 6e: Whiteboard", {
  tag: [TAG.WB_CONSENT, TAG.WB_SYNC, TAG.WB_STROKES],
}, () => {
  // Oracle: Replay HTTP 200 per principal
  // Tutor principal here, after End and after the cleanup cron has run (whiteboard on writes no purge intent, so the store and
  // the batch rows are untouched). The family principal's read of the same stored board is
  // parent-child-notes-whiteboard-replay.spec.ts (it needs the seeded parent sign-in state).
  test(
    "W1: whiteboard on: strokes persist and replay is available to tutor and family",
    async ({ request, baseURL }) => {
      const { id, studentId } = await seedSession({ audio: true });
      await prisma.sessionConsentSnapshot.update({
        where: { whiteboardSessionId: id },
        data: { allowWhiteboardRecording: true },
      });
      const prefix = `whiteboard-sessions/${studentId}/${id}/`;
      const origin = new URL(baseURL!).origin;
      const url = (key: string) => `${origin}/api/test/blob/object/${key.split("/").map(encodeURIComponent).join("/")}`;
      const eventsKey = `${prefix}1-events.json`;
      const snapshotKey = `${prefix}1-snapshot.png`;
      await seedHarnessBlobs(request, [
        { key: eventsKey, text: replayEventsFixture(), contentType: "application/json" },
        { key: snapshotKey, text: "pw-w1-snapshot", contentType: "image/png" },
      ]);
      await prisma.whiteboardEventBatch.create({
        data: {
          whiteboardSessionId: id,
          batchSeq: 1,
          fromEventIndex: 0,
          toEventIndex: 1,
          eventsJson: [{ t: 0, type: "add", id: "pw-w1" }],
          boardDocumentJson: { pages: [] },
          schemaVersion: 1,
        },
      });
      await invoke(request, "endWhiteboardSession", id, {
        finalEventsBlobUrl: url(eventsKey),
        opts: { snapshotBlobUrl: url(snapshotKey) },
      });
      await runCron(request, "/api/cron/session-cleanup");

      const events = await request.get(`/api/whiteboard/${id}/events`);
      expect(events.status()).toBe(200);
      expect(((await events.json()) as { events: unknown[] }).events).toHaveLength(
        JSON.parse(replayEventsFixture()).events.length
      );
      const snapshot = await request.get(`/api/whiteboard/${id}/snapshot`);
      expect(snapshot.status()).toBe(200);
      expect(await prisma.whiteboardEventBatch.count({ where: { whiteboardSessionId: id } })).toBe(1);
      expect((await listHarnessBlobs(request, prefix)).map((o) => o.key).sort()).toEqual([eventsKey, snapshotKey].sort());
    }
  );
  // Oracle: Relay peer state; scene after reload
  // CHARACTERIZATION (C3b keeps it green): "whiteboard off" only stops storing the board after the session; during
  // the session the live board, a tutor reload and a student rejoin all still carry the strokes.
  test(
    "W2: whiteboard off: board works live, including a reload and a student rejoin",
    async ({ browser }) => {
      test.setTimeout(300_000);
      const s = await seedConsentSession({ switches: { allowWhiteboardRecording: false } });
      const pair = await openTutorAndStudent(browser, s, { ensureFollow: false, autoStart: true });
      try {
        const id = `w2-tutor-${Date.now()}`;
        await drawTestStrokeOnRole(pair.tutorPage, "tutor", id, 120, 120, 320, 220);
        await waitForSceneElementIdsContaining(pair.studentPage, "student", id, 20_000);

        await pair.tutorPage.reload({ waitUntil: "domcontentloaded" });
        await expect(pair.tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({ timeout: 90_000 });
        await waitForWbE2eBridge(pair.tutorPage, "tutor");
        await waitForSceneElementIdsContaining(pair.tutorPage, "tutor", id, 45_000);

        await pair.studentPage.reload({ waitUntil: "domcontentloaded" });
        await expect(pair.studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({ timeout: 90_000 });
        await waitForWbE2eBridge(pair.studentPage, "student");
        await waitForSceneElementIdsContaining(pair.studentPage, "student", id, 45_000);
      } finally {
        await pair.close();
        await s.cleanup();
      }
    }
  );
  // Oracle: Audio scrubber 200
  // Characterization: the board purge deletes by the whiteboard prefixes only, so the audio survives End and both sweeps.
  test(
    "W9: whiteboard off: audio replay still works",
    async ({ request, baseURL }) => {
      const { id, studentId } = await seedSession({ audio: true });
      await prisma.sessionConsentSnapshot.update({
        where: { whiteboardSessionId: id },
        data: { allowWhiteboardRecording: false },
      });
      const audioText = "pw-w9-audio-bytes-0123456789";
      expect(
        await invoke(request, "registerSegment", id, {
          blobUrl: await seedBlob(request, baseURL!, studentId, audioText),
          mimeType: "audio/webm",
          sizeBytes: audioText.length,
          streamId: TUTOR_LANE,
          audioStartedAtMs: 0,
        })
      ).toMatchObject({ ok: true });
      const { eventsBlobUrl } = await prisma.whiteboardSession.findUniqueOrThrow({ where: { id }, select: { eventsBlobUrl: true } });
      await invoke(request, "endWhiteboardSession", id, { finalEventsBlobUrl: eventsBlobUrl });
      // Status not asserted: the route is new in this wave. Run it twice so a second pass would have had its chance.
      await runCron(request, "/api/cron/session-cleanup");
      await prisma.whiteboardSession.updateMany({
        where: { id, boardPurgeFirstPassAt: { not: null } },
        data: { boardPurgeFirstPassAt: MIN_AGO(120) },
      });
      await runCron(request, "/api/cron/session-cleanup");

      const [recording] = await recordingsOf(id);
      expect(recording).toBeDefined();
      const replay = await request.get(`/api/audio/admin/${recording.id}`);
      expect(replay.status()).toBe(200);
      expect((await replay.body()).length).toBe(audioText.length);
    }
  );
  // Oracle: Characterization (green before; regression guard). Scrubber max ≈ fixture audio duration (independent oracle: the fixture file's length)
  test(
    "W20: audio-only replay with the empty placeholder log scrubs to the audio length",
    { tag: [TAG.WB_ASSETS, TAG.WB_RECORDING] },
    async ({ page, request, baseURL }) => {
      test.setTimeout(180_000);
      const { id, studentId } = await seedSession({ audio: true });
      const row = await prisma.whiteboardSession.findUniqueOrThrow({ where: { id }, select: { adminUserId: true } });
      await prisma.sessionConsentSnapshot.update({
        where: { whiteboardSessionId: id },
        data: { allowWhiteboardRecording: false },
      });
      // The create-time placeholder: an empty log outside the session prefix.
      const origin = new URL(baseURL!).origin;
      const placeholderKey = `whiteboard-sessions/${row.adminUserId}/${studentId}/${Date.now()}-events.json`;
      const placeholderUrl = `${origin}/api/test/blob/object/${placeholderKey.split("/").map(encodeURIComponent).join("/")}`;
      await seedHarnessBlobs(request, [
        {
          key: placeholderKey,
          text: JSON.stringify({ schemaVersion: 1, startedAt: "2026-11-12T18:00:00.000Z", durationMs: 0, events: [] }),
          contentType: "application/json",
        },
      ]);
      await prisma.whiteboardSession.update({
        where: { id },
        data: { eventsBlobUrl: placeholderUrl },
      });

      // Independent oracle: the fixture's own length, from its RIFF header (data bytes / byte rate).
      const wav = readFileSync(path.join(__dirname, "..", "fixtures", "pw-fake-mic.wav"));
      const byteRate = wav.readUInt32LE(28);
      const dataAt = wav.indexOf("data", 12, "ascii");
      const fixtureSec = wav.readUInt32LE(dataAt + 4) / byteRate;
      expect(fixtureSec).toBeGreaterThan(1);

      const blobUrl = await uploadHarnessBlob({
        request,
        pathname: `audio/${row.adminUserId}/${studentId}/pw-w20.wav`,
        body: wav,
        contentType: "audio/wav",
        clientPayload: { kind: "audio", studentId },
      });
      await invoke(request, "registerSegment", id, {
        blobUrl,
        mimeType: "audio/wav",
        sizeBytes: wav.length,
        streamId: TUTOR_LANE,
        audioStartedAtMs: 0,
      });
      await invoke(request, "endWhiteboardSession", id, { finalEventsBlobUrl: placeholderUrl });
      await runCron(request, "/api/cron/session-cleanup");

      await page.goto(`/admin/students/${studentId}/whiteboard/${id}/workspace`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({ timeout: 60_000 });
      await page.getByTestId("wb-review-enter-replay").click();
      await expect(page.getByTestId("wb-replay-in-frame")).toBeVisible({ timeout: 30_000 });
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="wb-replay-audio"]') as HTMLAudioElement | null;
          return el != null && Number.isFinite(el.duration) && el.duration > 0;
        },
        { timeout: 90_000 }
      );
      const audioSec = await page.evaluate(
        () => (document.querySelector('[data-testid="wb-replay-audio"]') as HTMLAudioElement).duration
      );
      expect(Math.abs(audioSec - fixtureSec), `audio ${audioSec}s vs fixture ${fixtureSec}s`).toBeLessThan(0.5);
      // The scrubber spans the audio, not the empty log (the label is whole seconds). Polled: the label can
      // render the log's 0 s before the audio duration reaches the timeline.
      const scrubberTotalSec = () =>
        page.evaluate(() => {
          const label = document.querySelector(".mynk-wb-replay-timeline__elapsed")?.textContent ?? "";
          const total = (label.split("/")[1] ?? "").trim();
          const bits = total.split(":").map(Number);
          return bits.length === 3 ? bits[0]! * 3600 + bits[1]! * 60 + bits[2]! : bits.length === 2 ? bits[0]! * 60 + bits[1]! : 0;
        });
      await expect
        .poll(async () => Math.abs((await scrubberTotalSec()) - fixtureSec), {
          message: "scrubber total vs fixture audio length",
          timeout: 15_000,
        })
        .toBeLessThanOrEqual(1.5);
    }
  );
});

// ---------------------------------------------------------------------------
// 6f. Notes
// ---------------------------------------------------------------------------
test.describe("consent 6f: Notes", {
  tag: [TAG.WB_CONSENT, TAG.WB_RECORDING],
}, () => {
  // Oracle: 'TranscriptChunk' = 0, 'TutorNote' = 0
  test(
    "N1: notes off: no transcript rows and no drafted notes, even if audio is on",
    async ({ request, baseURL }) => {
      const { id, studentId } = await seedSession({ audio: true, notes: false });

      // Audio is still saved…
      expect(
        await invoke(request, "registerSegment", id, {
          blobUrl: await seedBlob(request, baseURL!, studentId),
          mimeType: "audio/webm",
          sizeBytes: 14,
          streamId: TUTOR_LANE,
          audioStartedAtMs: 0,
        })
      ).toMatchObject({ ok: true });

      // …but nothing is transcribed or drafted: enqueue (tutor + learner lane), kick, trigger, sweep.
      await invoke(request, "enqueueChunk", id, {
        chunkBlobUrl: await seedBlob(request, baseURL!, studentId),
        recordingTimeOffsetMs: 0,
      });
      await invoke(request, "enqueueChunk", id, {
        chunkBlobUrl: await seedBlob(request, baseURL!, studentId),
        recordingTimeOffsetMs: 0,
        streamId: LEARNER_TRANSCRIPT_LANE,
        speakerId: LEARNER_SPEAKER,
      });
      await sealSession(id);
      await invoke(request, "triggerNotes", id);
      await invoke(request, "kick", id);
      await runCron(request, "/api/cron/transcribe-sweep");

      expect(await chunksOf(id)).toEqual([]);
      expect(await prisma.tutorNote.count({ where: { sessionId: id } })).toBe(0);
    }
  );
  // Oracle: Replay 200
  test(
    "N2: notes off, audio on: audio replay is still available",
    async ({ request, baseURL }) => {
      const { id, studentId } = await seedSession({ audio: true, notes: false });
      const audioText = "pw-replay-audio-bytes-0123456789";
      expect(
        await invoke(request, "registerSegment", id, {
          blobUrl: await seedBlob(request, baseURL!, studentId, audioText),
          mimeType: "audio/webm",
          sizeBytes: audioText.length,
          streamId: TUTOR_LANE,
          audioStartedAtMs: 0,
        })
      ).toMatchObject({ ok: true });
      await sealSession(id);
      const [recording] = await recordingsOf(id);
      expect(recording).toBeDefined();

      const replay = await request.get(`/api/audio/admin/${recording.id}`);
      expect(replay.status()).toBe(200);
      expect((await replay.body()).length).toBe(audioText.length);
    }
  );
  // Oracle: the review card's visible copy, read at first paint, with no TutorNote row in the database. Notes off never creates
  // a row, so a card that treats "no row + audio" as in-flight would spin "Preparing your notes..." for its 5-minute timeout.
  test(
    "N2b: notes off, audio on: the review card says notes are off at once, with no spinner and no Regenerate",
    async ({ page, request, baseURL }) => {
      test.setTimeout(180_000);
      const { id, studentId } = await seedSession({ audio: true, notes: false });
      expect(
        await invoke(request, "registerSegment", id, {
          blobUrl: await seedBlob(request, baseURL!, studentId),
          mimeType: "audio/webm",
          sizeBytes: 14,
          streamId: TUTOR_LANE,
          audioStartedAtMs: 0,
        })
      ).toMatchObject({ ok: true });
      await sealSession(id);
      expect(await prisma.tutorNote.count({ where: { sessionId: id } })).toBe(0);

      await page.goto(`/admin/students/${studentId}/whiteboard/${id}/workspace`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({ timeout: 90_000 });
      const card = page.getByTestId("tutor-notes-section");
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("tutor-notes-skipped")).toHaveText(NOTES_OFF_COPY, { timeout: 2_000 });
      await expect(card).not.toContainText("Preparing your notes");
      await expect(page.getByTestId("tutor-notes-generating")).toHaveCount(0);
      await expect(page.getByTestId("tn-note-field-skeleton")).toHaveCount(0);
      await expect(page.getByTestId("wb-regenerate-notes")).toHaveCount(0);

      // Still terminal after a poll interval would have fired, and still no row was created to say so.
      await page.waitForTimeout(4_000);
      await expect(page.getByTestId("tutor-notes-skipped")).toHaveText(NOTES_OFF_COPY);
      await expect(card).not.toContainText("Preparing your notes");
      expect(await prisma.tutorNote.count({ where: { sessionId: id } })).toBe(0);
    }
  );
  // Oracle: the visible skipped sentence on the legacy review URL, read as soon as the notes card is on screen.
  // The status poll is 3s, so a first paint of "Preparing your notes..." cannot pass a check that gives up before that.
  test(
    "N2c: notes off, no TutorNote row: the legacy review page shows notes are off on first paint",
    { tag: [TAG.WB_CONSENT, TAG.WB_RECORDING] },
    async ({ page, request, baseURL }) => {
      test.setTimeout(180_000);
      const { id, studentId } = await seedSession({ audio: true, notes: false });
      expect(
        await invoke(request, "registerSegment", id, {
          blobUrl: await seedBlob(request, baseURL!, studentId),
          mimeType: "audio/webm",
          sizeBytes: 14,
          streamId: TUTOR_LANE,
          audioStartedAtMs: 0,
        })
      ).toMatchObject({ ok: true });
      await sealSession(id);
      expect(await prisma.tutorNote.count({ where: { sessionId: id } })).toBe(0);

      await page.goto(`/admin/students/${studentId}/whiteboard/${id}`, { waitUntil: "domcontentloaded" });
      const card = page.getByTestId("tutor-notes-section");
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card).not.toContainText("Preparing your notes", { timeout: 500 });
      await expect(page.getByTestId("tutor-notes-skipped")).toHaveText(NOTES_OFF_COPY, { timeout: 2_000 });
      expect(await prisma.tutorNote.count({ where: { sessionId: id } })).toBe(0);
    }
  );
  // Oracle: Server action result
  test(
    "N3: notes off: manual generate-notes call is refused",
    async ({ request }) => {
      const { id } = await seedSession({ audio: true, notes: false, ended: true });
      for (const action of ["generateNotes", "triggerNotes", "regenerateNotes"] as const) {
        const result = await invoke(request, action, id);
        expect(result, action).toMatchObject({ ok: false, error: NOTES_OFF_COPY });
      }
      expect(await prisma.tutorNote.count({ where: { sessionId: id } })).toBe(0);
    }
  );
  // Oracle: Sweep run; rows
  test(
    "N4: notes off: the transcribe sweep does not create transcripts",
    async ({ request, baseURL }) => {
      const { id, studentId } = await seedSession({ audio: true, notes: false, ended: true });
      const url = await seedBlob(request, baseURL!, studentId);
      await seedChunk(id, url, { streamId: TUTOR_LANE, speakerId: null });

      expect((await runCron(request, "/api/cron/transcribe-sweep")).status).toBe(200);
      await expect
        .poll(async () => (await chunksOf(id)).every((c) => isSettled(c.status)), { timeout: 60_000 })
        .toBe(true);

      const [row] = await chunksOf(id);
      expect(row).toMatchObject({ status: "refused", transcript: "" });
      expect(row.transcribedAt).toBeNull();
      expect(await prisma.transcriptChunkExtraction.count({ where: { chunk: { sessionId: id } } })).toBe(0);
      expect(await prisma.tutorNote.count({ where: { sessionId: id } })).toBe(0);
    }
  );
  // Oracle: 'TutorNote' = 0 (the 'totalChunks === 0' path)
  test(
    "N5: audio off in person, notes on: no placeholder note is drafted",
    async ({ request }) => {
      const { id } = await seedSession({ audio: false, notes: true, mode: "IN_PERSON", ended: true });

      expect(await invoke(request, "triggerNotes", id)).toMatchObject({ ok: false });
      expect(await invoke(request, "generateNotes", id)).toMatchObject({ ok: false });
      expect(await invoke(request, "regenerateNotes", id)).toMatchObject({ ok: false });
      await runCron(request, "/api/cron/transcribe-sweep");

      expect(await prisma.tutorNote.count({ where: { sessionId: id } })).toBe(0);
      expect(await chunksOf(id)).toEqual([]);
    }
  );
  // Oracle: Seed more refused rows than the sweep batch; newer eligible rows still processed; refused status terminal; 'notes-worker' does not wait on them
  // (The notes-worker half — a refused chunk does not hold the reduce in `pending` — is consent-lane-db.test.ts "N6".)
  test(
    "N6: refused rows reach a terminal state and the sweep is not starved by them",
    async ({ request, baseURL }) => {
      // (1) Chunk sweep: 25 refused rows (more than one sweep batch), all OLDER than one eligible pending tutor chunk. If the sweep
      // re-selected refused rows it would spend its whole batch on them and never reach the eligible chunk.
      const { id, studentId } = await seedSession({ audio: true });
      const refusedIds: string[] = [];
      for (let i = 0; i < 25; i++) {
        const row = await seedChunk(
          id,
          `https://example.invalid/consent-c2/refused-${Date.now()}-${i}.webm`,
          { streamId: LEARNER_TRANSCRIPT_LANE, speakerId: LEARNER_SPEAKER },
          { status: "refused", updatedAt: new Date(Date.UTC(2001, 0, 1, 0, 0, i)), offsetMs: i }
        );
        refusedIds.push(row.id);
      }
      const eligibleUrl = await seedBlob(request, baseURL!, studentId);
      const eligible = await seedChunk(
        id,
        eligibleUrl,
        { streamId: TUTOR_LANE, speakerId: null },
        { updatedAt: new Date(Date.UTC(2002, 0, 1)), offsetMs: 99 }
      );

      expect((await runCron(request, "/api/cron/transcribe-sweep")).status).toBe(200);
      await expect
        .poll(async () => (await prisma.transcriptChunk.findUniqueOrThrow({ where: { id: eligible.id } })).status, {
          timeout: 60_000,
        })
        .not.toBe("pending");
      const refused = await prisma.transcriptChunk.findMany({ where: { id: { in: refusedIds } } });
      expect(refused).toHaveLength(25);
      for (const r of refused) expect(r.status).toBe("refused");

      // (2) Notes sweep: 12 sealed notes-off sessions each holding a `pending` TutorNote (more than the notes sweep batch of 10).
      // Every one must end terminal `skipped` within two sweeps; none may stay `pending` or be re-picked forever.
      const seeded = await prisma.whiteboardSession.findUniqueOrThrow({
        where: { id },
        select: { adminUserId: true, studentId: true },
      });
      const noteSessionIds: string[] = [];
      for (let i = 0; i < 12; i++) {
        const s = await prisma.whiteboardSession.create({
          data: {
            adminUserId: seeded.adminUserId,
            studentId: seeded.studentId,
            consentAcknowledged: true,
            eventsBlobUrl: "https://pw.local/placeholder-whiteboard-events.json",
            sessionPhase: "ACTIVE",
            sessionMode: "LIVE",
            activatedAt: MIN_AGO(60),
            endedAt: MIN_AGO(30),
            notesForbidden: true,
          },
          select: { id: true },
        });
        await prisma.sessionConsentSnapshot.create({
          data: {
            whiteboardSessionId: s.id,
            allowLiveSession: true,
            allowAudioRecording: true,
            allowWhiteboardRecording: true,
            allowNoteSending: false,
          },
        });
        await prisma.tutorNote.create({
          data: { sessionId: s.id, status: "pending", createdAt: new Date(Date.UTC(2001, 0, 1, 0, 0, i)) },
        });
        noteSessionIds.push(s.id);
      }
      await runCron(request, "/api/cron/transcribe-sweep");
      await runCron(request, "/api/cron/transcribe-sweep");
      await expect
        .poll(
          async () =>
            (await prisma.tutorNote.findMany({ where: { sessionId: { in: noteSessionIds } } })).map((n) => n.status),
          { timeout: 60_000 }
        )
        .toEqual(Array(12).fill("skipped"));
    }
  );
  // Oracle: Rows = 0 even with all four toggles on
  test(
    "N7: org \"no notes\" session (notesForbidden): nothing is transcribed or drafted",
    async ({ request, baseURL }) => {
      const { id, studentId } = await seedSession({ audio: true, notes: true, notesForbidden: true });

      await invoke(request, "enqueueChunk", id, {
        chunkBlobUrl: await seedBlob(request, baseURL!, studentId),
        recordingTimeOffsetMs: 0,
      });
      await sealSession(id);
      expect(await invoke(request, "triggerNotes", id)).toMatchObject({ ok: false, error: NOTES_OFF_COPY });
      expect(await invoke(request, "generateNotes", id)).toMatchObject({ ok: false, error: NOTES_OFF_COPY });

      // A chunk already queued (e.g. enqueued before the org flag flipped) is refused by the sweep, not transcribed.
      const url = await seedBlob(request, baseURL!, studentId);
      await seedChunk(id, url, { streamId: TUTOR_LANE, speakerId: null });
      await runCron(request, "/api/cron/transcribe-sweep");
      await expect
        .poll(async () => (await chunksOf(id)).every((c) => isSettled(c.status)), { timeout: 60_000 })
        .toBe(true);

      const rows = await chunksOf(id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: "refused", transcript: "" });
      expect(await prisma.tutorNote.count({ where: { sessionId: id } })).toBe(0);
    }
  );
});
