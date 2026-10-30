/**
 * Consent wave C0 — harness self-tests over the REAL server (docs/handoff/consent-wave-plan.md § 6
 * "Shared test infrastructure").
 *
 * Proves the shared infra the matrix will lean on, before any matrix row does:
 *   - blob harness list / delete / fault injection, over HTTP and through the product `deleteBlob`
 *     path where reachable
 *   - end-to-end smoke of the seam routes (arm via /api/test/seams, hit via /api/test/seams/probe),
 *     plus the 3 s in-transaction cap. Cross-module proof is the jest isolateModules test in
 *     src/__tests__/test-seams.test.ts
 *   - the `getUserMedia` spy on Chromium (`hasTouch` + fake media, M11/M12 setup) and the WebKit stub (BL1)
 *   - the cron driver (401 without the secret, 200 with it)
 *   - the relay probe against the local relay, with a positive control (W24)
 *
 * Run:
 *   npx playwright test tests/integration/wb-consent-harness-selftest.spec.ts --project=wb-regression --workers=1 --retries=0
 */

import fs from "node:fs";
import { test, expect, webkit, devices } from "@playwright/test";
import { skipWebKitSelfTestForMissingExecutable } from "@/__tests__/helpers/webkit-selftest-skip";
import { TAG } from "../test-tags";
import {
  armFault,
  armHold,
  armReaperMode,
  disarmFault,
  expectReleasedByTest,
  failBlobDeletesMatching,
  failNextBlobDeletes,
  holdState,
  listHarnessBlobs,
  probeSeam,
  releaseHold,
  resetBlobHarness,
  resetSeams,
  runCron,
  seedHarnessBlobs,
  waitUntilParked,
  deleteHarnessBlob,
} from "../helpers/consent-harness";
import { installGetUserMediaSpy, readGetUserMediaSpy } from "../helpers/get-user-media-spy";
import {
  findScenePayloadEvents,
  openRelayClient,
  probeRelayRoom,
} from "../helpers/relay-probe";

test.describe("consent C0 harness: blob harness", {
  tag: [TAG.WB_CONSENT, TAG.WB_SYNC],
}, () => {
  test.beforeEach(async ({ request }) => {
    await resetBlobHarness(request);
  });

  test("list returns only keys under the prefix with real byte sizes, sorted", async ({ request }) => {
    await seedHarnessBlobs(request, [
      { key: "whiteboard-checkpoints/s-1/b.json", text: "bbbb" },
      { key: "whiteboard-checkpoints/s-1/a.json", text: "aa" },
      { key: "whiteboard-checkpoints/s-2/a.json", text: "other session" },
    ]);
    const listed = await listHarnessBlobs(request, "whiteboard-checkpoints/s-1/");
    // sizes are the byte lengths of what we wrote ("aa" = 2, "bbbb" = 4), sorted by key
    expect(listed).toEqual([
      { key: "whiteboard-checkpoints/s-1/a.json", size: 2 },
      { key: "whiteboard-checkpoints/s-1/b.json", size: 4 },
    ]);
    expect((await listHarnessBlobs(request, "")).length).toBe(3);
  });

  test("delete removes exactly one key and reports whether it existed", async ({ request }) => {
    await seedHarnessBlobs(request, [
      { key: "p/one", text: "1" },
      { key: "p/two", text: "2" },
    ]);
    expect(await deleteHarnessBlob(request, "p/one")).toBe(true);
    expect(await deleteHarnessBlob(request, "p/one")).toBe(false);
    expect((await listHarnessBlobs(request, "p/")).map((o) => o.key)).toEqual(["p/two"]);
  });

  test("fault injection: failNextDeletes(n) fails n deletes and keeps the object; reset clears the fault", async ({
    request,
  }) => {
    await seedHarnessBlobs(request, [{ key: "f/one", text: "1" }]);
    await failNextBlobDeletes(request, 1);
    const failed = await request.delete("/api/test/blob/state", {
      params: { key: "f/one" },
      headers: { authorization: `Bearer ${process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret"}` },
    });
    expect(failed.ok()).toBe(false);
    // the object survived the failed delete
    expect((await listHarnessBlobs(request, "f/")).map((o) => o.key)).toEqual(["f/one"]);
    expect(await deleteHarnessBlob(request, "f/one")).toBe(true);

    await seedHarnessBlobs(request, [{ key: "g/one", text: "1" }]);
    await failBlobDeletesMatching(request, "g/");
    await resetBlobHarness(request);
    await seedHarnessBlobs(request, [{ key: "g/one", text: "1" }]);
    expect(await deleteHarnessBlob(request, "g/one")).toBe(true);
  });

  test("the test surfaces refuse a caller without the test secret", async ({ request }) => {
    expect((await request.get("/api/test/blob/state", { params: { prefix: "" } })).status()).toBe(401);
    expect((await request.post("/api/test/seams", { data: { action: "reset" } })).status()).toBe(401);
    expect((await request.post("/api/test/seams/probe", { params: { mode: "reaper" } })).status()).toBe(401);
  });
});

// End-to-end smoke of the seam routes (arm via /api/test/seams, hit via /api/test/seams/probe). Cross-module proof is the jest isolateModules test in src/__tests__/test-seams.test.ts.
test.describe("consent C0 harness: end-to-end smoke of the seam routes", {
  tag: [TAG.WB_CONSENT, TAG.WB_SYNC],
}, () => {
  test.beforeEach(async ({ request }) => {
    await resetSeams(request);
  });
  test.afterEach(async ({ request }) => {
    await resetSeams(request);
  });

  test("smoke: a hold armed via /api/test/seams parks a call made from /api/test/seams/probe until released", async ({
    request,
  }) => {
    const sessionId = `selftest-${Date.now()}`;
    await armHold(request, { name: "selftest:probe", sessionId, parkFirstN: 1 });

    let settled = false;
    const first = probeSeam(request, "hold", { sessionId }).then((r) => {
      settled = true;
      return r;
    });
    await waitUntilParked(request, "selftest:probe", sessionId, 1);
    // parked means the probe request has NOT completed (poll-based, no fixed sleep)
    expect(settled).toBe(false);

    // only the first N callers park: a second caller passes straight through (S1's shape)
    const second = await probeSeam(request, "hold", { sessionId });
    expect(await second.json()).toEqual({ passed: true });
    expect((await holdState(request, "selftest:probe", sessionId)).passedThrough).toBe(1);
    expect(settled).toBe(false);

    expect(await releaseHold(request, "selftest:probe", sessionId)).toBe(1);
    const firstRes = await first;
    expect(await firstRes.json()).toEqual({ passed: true });
    await expectReleasedByTest(request, "selftest:probe", sessionId);
  });

  test("a hold for one session does not park another session", async ({ request }) => {
    await armHold(request, { name: "selftest:probe", sessionId: "armed-session" });
    const res = await probeSeam(request, "hold", { sessionId: "other-session" });
    expect(await res.json()).toEqual({ passed: true });
    expect((await holdState(request, "selftest:probe", "armed-session")).parkedTotal).toBe(0);
  });

  test("an in-transaction hold the test never releases auto-releases at 3 s and records it (SF-B cap)", async ({
    request,
  }) => {
    const sessionId = `selftest-tx-${Date.now()}`;
    await armHold(request, { name: "selftest:probe:in_tx", sessionId });
    const startedAt = Date.now();
    const res = await probeSeam(request, "hold", { sessionId, inTx: "1" });
    const elapsed = Date.now() - startedAt;
    expect(await res.json()).toEqual({ passed: true });
    // 3 s cap; generous upper bound for a slow machine, but well under the 30 s out-of-tx cap
    expect(elapsed).toBeGreaterThanOrEqual(2_800);
    expect(elapsed).toBeLessThan(15_000);
    const s = await holdState(request, "selftest:probe:in_tx", sessionId);
    expect(s.autoReleased).toBe(1);
    expect(s.releasedByTest).toBe(0);
    // expectReleasedByTest is the assertion race tests make; it must fail for a cap release
    await expect(expectReleasedByTest(request, "selftest:probe:in_tx", sessionId)).rejects.toThrow();
  });

  test("smoke: a fault armed via /api/test/seams throws on /api/test/seams/probe, session-scoped, and disarms", async ({ request }) => {
    await armFault(request, { name: "selftest:fault", sessionId: "bad" });
    const good = await probeSeam(request, "fault", { sessionId: "good" });
    expect(await good.json()).toEqual({ fault: false });
    const bad = await probeSeam(request, "fault", { sessionId: "bad" });
    expect(bad.status()).toBe(500);
    expect(await bad.json()).toEqual({ fault: true });
    await disarmFault(request, "selftest:fault", "bad");
    expect(await (await probeSeam(request, "fault", { sessionId: "bad" })).json()).toEqual({ fault: false });
  });

  test("armReaperMode is one-shot, null is distinct from not armed, and a typo passes through raw", async ({
    request,
  }) => {
    const read = async () => (await (await probeSeam(request, "reaper")).json()).override;
    expect(await read()).toEqual({ armed: false });
    await armReaperMode(request, "enfroce");
    expect(await read()).toEqual({ armed: true, raw: "enfroce" });
    expect(await read()).toEqual({ armed: false });
    await armReaperMode(request, null);
    expect(await read()).toEqual({ armed: true, raw: null });
  });

  test("arming an unknown point is rejected", async ({ request }) => {
    const res = await request.post("/api/test/seams", {
      data: { action: "armHold", name: "no:such:point", sessionId: "x" },
      headers: { authorization: `Bearer ${process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret"}` },
    });
    expect(res.status()).toBe(400);
    expect(await res.text()).toMatch(/unknown/i);
  });
});

test.describe("consent C0 harness: getUserMedia spy", {
  tag: [TAG.WB_CONSENT, TAG.WB_RECORDING],
}, () => {
  test("Chromium hasTouch + fake media: counts audio calls, hands out live real tracks, pointer is coarse (M11/M12 setup)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ hasTouch: true, permissions: ["microphone", "camera"] });
    try {
      await installGetUserMediaSpy(context, "passthrough");
      const page = await context.newPage();
      await page.goto("/");

      // the touch bundle path (`isTouchPrimaryDevice`) is reachable: hasTouch => pointer: coarse
      expect(await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches)).toBe(true);

      expect((await readGetUserMediaSpy(page)).audioCalls).toBe(0);
      const kinds = await page.evaluate(async () => {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        return s.getTracks().map((t) => ({ kind: t.kind, readyState: t.readyState }));
      });
      expect(kinds).toEqual([{ kind: "audio", readyState: "live" }]);

      const snap = await readGetUserMediaSpy(page);
      expect(snap.audioCalls).toBe(1);
      expect(snap.videoCalls).toBe(0);
      expect(snap.calls[0].constraints).toEqual({ audio: true });
      expect(snap.calls[0].outcome).toBe("granted");
      expect(snap.tracks).toEqual([expect.objectContaining({ kind: "audio", readyState: "live" })]);

      // the spy exposes readyState transitions: a stopped track reads "ended"
      await page.evaluate(() => {
        const w = window as unknown as { __consentGumSpy: { tracks: MediaStreamTrack[] } };
        w.__consentGumSpy.tracks.forEach((t) => t.stop());
      });
      expect((await readGetUserMediaSpy(page)).tracks[0].readyState).toBe("ended");
    } finally {
      await context.close();
    }
  });

  test("WebKit (iPhone 13) stub: records constraints and returns a stream without touching hardware (BL1)", async () => {
    let webkitInstalled = false;
    try {
      webkitInstalled = fs.existsSync(webkit.executablePath());
    } catch {
      webkitInstalled = false;
    }
    test.skip(
      skipWebKitSelfTestForMissingExecutable({
        installed: webkitInstalled,
        ci: Boolean(process.env.CI),
      }),
      "Playwright WebKit executable is not installed locally"
    );
    const wk = await webkit.launch();
    try {
      // The project `use.permissions` grants microphone; WebKit rejects that grant ("Unknown
      // permission: microphone") and has no fake mic, so override it (same as openTutorAndStudent).
      const context = await wk.newContext({
        ...devices["iPhone 13"],
        permissions: [],
        storageState: { cookies: [], origins: [] },
      });
      await installGetUserMediaSpy(context, "stub");
      const page = await context.newPage();
      await page.goto("/");
      const result = await page.evaluate(async () => {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true },
          video: { facingMode: "user" },
        });
        return {
          hasMediaStream: typeof MediaStream !== "undefined",
          kinds: s.getTracks().map((t) => t.kind).sort(),
        };
      });
      // Playwright WebKit builds without a MediaStream constructor (Windows) get a stream-shaped
      // object with no tracks; builds that have one get a canvas-captured video track. Either way
      // the call is counted, which is all E15 / M10 / M13 (spy-only rows) assert.
      if (result.hasMediaStream) expect(result.kinds).toContain("video");
      const snap = await readGetUserMediaSpy(page);
      expect(snap.videoCalls).toBe(1);
      expect(snap.audioCalls).toBe(1);
      expect(snap.calls[0].constraints).toEqual({
        audio: { echoCancellation: true },
        video: { facingMode: "user" },
      });
      await context.close();
    } finally {
      await wk.close();
    }
  });
});

test.describe("consent C0 harness: cron driver", {
  tag: [TAG.WB_CONSENT, TAG.WB_RECORDING],
}, () => {
  test("the untouched transcription cron answers 401 without the secret or with a wrong one, 200 with the test CRON_SECRET", async ({
    request,
  }) => {
    const none = await runCron(request, "/api/cron/transcribe-sweep", { secret: null });
    expect(none.status).toBe(401);
    const wrong = await runCron(request, "/api/cron/transcribe-sweep", { secret: "not-the-secret" });
    expect(wrong.status).toBe(401);
    const ok = await runCron(request, "/api/cron/transcribe-sweep");
    // a 401 here means the dev server was started without CRON_SECRET (a reused :3100/:3101 server): restart it
    expect(ok.status, `body: ${ok.text}`).toBe(200);
    expect(ok.body).toMatchObject({ ok: true });
  });
});

test.describe("consent C0 harness: relay probe (the live W24 row is in wb-consent-board-purge.spec.ts)", {
  tag: [TAG.WB_CONSENT, TAG.WB_SYNC],
}, () => {
  test("positive control: a broadcast in a live room reaches a peer, and the probe flags it as a scene payload", async () => {
    const roomId = `c0-probe-live-${Date.now()}`;
    const listener = await openRelayClient();
    const sender = await openRelayClient();
    try {
      listener.emit("join-room", roomId);
      sender.emit("join-room", roomId);
      await listener.settle(800);
      sender.emit("server-broadcast", roomId, "ZW5jcnlwdGVkLXNjZW5lLWJ5dGVz", "aXY=");
      await listener.settle(1_000);
      const flagged = findScenePayloadEvents(listener.events);
      // if the probe could not see a scene broadcast, "no scene for a late joiner" would prove nothing
      expect(flagged.map((e) => e.name)).toContain("client-broadcast");
    } finally {
      listener.close();
      sender.close();
    }
  });
});
