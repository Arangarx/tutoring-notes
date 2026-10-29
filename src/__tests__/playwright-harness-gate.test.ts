/**
 * @jest-environment node
 *
 * A reused dev server started without PLAYWRIGHT_TEST=1 must fail the
 * Playwright run before any test. The oracle is the harness route status,
 * not a guess about Next's indicator.
 */

const {
  assertPlaywrightDevServers,
  assertPlaywrightTestServer,
} = require("../../scripts/playwright-harness-gate.cjs");

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("playwright harness server gate", () => {
  it("accepts a server that reports playwrightTest", async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, { playwrightTest: true }));
    await expect(
      assertPlaywrightTestServer("http://localhost:3100", { fetchImpl }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:3100/api/test/playwright-harness",
      expect.objectContaining({
        headers: { authorization: "Bearer playwright-test-secret" },
      }),
    );
  });

  it("rejects a reused server that was not started as the Playwright harness", async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(404, { error: "Not found" }));
    await expect(
      assertPlaywrightTestServer("http://localhost:3100", { fetchImpl }),
    ).rejects.toThrow(/PLAYWRIGHT_TEST/);
  });

  it("rejects a server that does not answer", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      assertPlaywrightTestServer("http://127.0.0.1:3100/", { fetchImpl }),
    ).rejects.toThrow(/did not answer/);
  });

  it("checks 3100 and 3101 unless the 3101 server is skipped", async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, { playwrightTest: true }));
    await assertPlaywrightDevServers({ fetchImpl, env: {} });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    fetchImpl.mockClear();
    await assertPlaywrightDevServers({
      fetchImpl,
      env: { WB_SKIP_3101_WEBSERVER: "1" },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toContain(":3100/");
  });
});
