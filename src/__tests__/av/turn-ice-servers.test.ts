jest.mock("next/headers", () => ({
  cookies: jest.fn(),
}));

import { cookies } from "next/headers";
import {
  getTurnIceServers,
  PW_TURN_ICE_SERVERS_COOKIE,
  TURN_CREDENTIAL_TTL_SECONDS,
} from "@/lib/av/turn-ice-servers";

const KEY_ID = "turn-key-id-123";
const TOKEN = "turn-api-token-secret";
const CREDENTIAL = "short-lived-credential-xyz";

function cloudflareReply(iceServers: unknown, status = 201): typeof fetch {
  return jest.fn(async () =>
    new Response(JSON.stringify({ iceServers }), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  ) as unknown as typeof fetch;
}

/** Shape documented for Cloudflare `generate-ice-servers`. */
const CLOUDFLARE_ICE = [
  { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
  {
    urls: [
      "turn:turn.cloudflare.com:3478?transport=udp",
      "turn:turn.cloudflare.com:53?transport=udp",
      "turn:turn.cloudflare.com:3478?transport=tcp",
      "turns:turn.cloudflare.com:5349?transport=tcp",
      "turns:turn.cloudflare.com:443?transport=tcp",
    ],
    username: "user-abc",
    credential: CREDENTIAL,
  },
];

describe("getTurnIceServers", () => {
  const saved = { ...process.env };
  let logs: string[];

  beforeEach(() => {
    process.env.CLOUDFLARE_TURN_KEY_ID = KEY_ID;
    process.env.CLOUDFLARE_TURN_API_TOKEN = TOKEN;
    delete process.env.PLAYWRIGHT_TEST;
    logs = [];
    for (const level of ["info", "warn", "error", "log"] as const) {
      jest.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      });
    }
    (cookies as jest.Mock).mockReset();
  });

  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  test("asks Cloudflare for credentials that outlive a session, with the bearer token", async () => {
    const fetchImpl = cloudflareReply(CLOUDFLARE_ICE);
    await getTurnIceServers("wbsid=s1", fetchImpl);
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(url).toBe(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${KEY_ID}/credentials/generate-ice-servers`
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body).ttl).toBe(TURN_CREDENTIAL_TTL_SECONDS);
    expect(TURN_CREDENTIAL_TTL_SECONDS).toBeGreaterThanOrEqual(4 * 60 * 60);
  });

  test("returns relay servers with credentials and drops the port 53 URLs browsers refuse", async () => {
    const servers = await getTurnIceServers("wbsid=s1", cloudflareReply(CLOUDFLARE_ICE));
    expect(servers).not.toBeNull();
    const urls = servers!.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));
    expect(urls.some((u) => u.startsWith("turn:"))).toBe(true);
    expect(urls.some((u) => u.startsWith("turns:") && u.includes(":443"))).toBe(true);
    expect(urls.some((u) => /:53(\?|$)/.test(u))).toBe(false);
    const turn = servers!.find((s) =>
      (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => u.startsWith("turn:"))
    );
    expect(turn).toMatchObject({ username: "user-abc", credential: CREDENTIAL });
  });

  test("accepts a single ice server object", async () => {
    const servers = await getTurnIceServers(
      "wbsid=s1",
      cloudflareReply(CLOUDFLARE_ICE[1])
    );
    expect(servers).toHaveLength(1);
    expect(servers![0]).toMatchObject({ username: "user-abc" });
  });

  test("unconfigured key returns null without calling Cloudflare", async () => {
    delete process.env.CLOUDFLARE_TURN_API_TOKEN;
    const fetchImpl = cloudflareReply(CLOUDFLARE_ICE);
    expect(await getTurnIceServers("wbsid=s1", fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("result=unconfigured");
  });

  test.each([
    ["HTTP error", cloudflareReply({ error: "bad token" }, 401)],
    ["empty list", cloudflareReply([])],
    ["garbage list", cloudflareReply([{ nope: 1 }])],
    [
      "network failure",
      jest.fn(async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    ],
  ])("%s falls back to null (STUN only) instead of throwing", async (_label, fetchImpl) => {
    await expect(getTurnIceServers("wbsid=s1", fetchImpl)).resolves.toBeNull();
    expect(logs.join("\n")).toContain("result=error");
  });

  test("a hung Cloudflare call is abandoned rather than holding the page", async () => {
    const fetchImpl = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("timed out", "TimeoutError"))
          );
        })
    ) as unknown as typeof fetch;
    const started = Date.now();
    await expect(getTurnIceServers("wbsid=s1", fetchImpl)).resolves.toBeNull();
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  test("never logs the API token or the issued credential", async () => {
    await getTurnIceServers("wbsid=s1", cloudflareReply(CLOUDFLARE_ICE));
    await getTurnIceServers("wbsid=s1", cloudflareReply({}, 500));
    const all = logs.join("\n");
    expect(all).not.toContain(TOKEN);
    expect(all).not.toContain(CREDENTIAL);
    expect(all).not.toContain(KEY_ID);
  });

  test("the Playwright cookie is ignored outside the Playwright server", async () => {
    (cookies as jest.Mock).mockResolvedValue({
      get: () => ({ value: encodeURIComponent(JSON.stringify([{ urls: "turn:evil:3478" }])) }),
    });
    const servers = await getTurnIceServers("wbsid=s1", cloudflareReply(CLOUDFLARE_ICE));
    const urls = servers!.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));
    expect(urls).not.toContain("turn:evil:3478");
    expect(cookies).not.toHaveBeenCalled();
  });

  test("the Playwright cookie is ignored on a production deploy even if PLAYWRIGHT_TEST leaks", async () => {
    process.env.PLAYWRIGHT_TEST = "1";
    process.env.VERCEL_ENV = "production";
    (cookies as jest.Mock).mockResolvedValue({
      get: () => ({ value: encodeURIComponent(JSON.stringify([{ urls: "turn:evil:3478" }])) }),
    });
    const servers = await getTurnIceServers("wbsid=s1", cloudflareReply(CLOUDFLARE_ICE));
    const urls = servers!.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));
    expect(urls).not.toContain("turn:evil:3478");
  });

  test("on the Playwright server the cookie list is used", async () => {
    process.env.PLAYWRIGHT_TEST = "1";
    (cookies as jest.Mock).mockResolvedValue({
      get: (name: string) =>
        name === PW_TURN_ICE_SERVERS_COOKIE
          ? {
              value: encodeURIComponent(
                JSON.stringify([{ urls: "turn:127.0.0.1:3478", username: "u", credential: "p" }])
              ),
            }
          : undefined,
    });
    const fetchImpl = cloudflareReply(CLOUDFLARE_ICE);
    const servers = await getTurnIceServers("wbsid=s1", fetchImpl);
    expect(servers).toEqual([{ urls: "turn:127.0.0.1:3478", username: "u", credential: "p" }]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
