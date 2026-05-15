import { DEFAULT_ICE_SERVERS } from "@/lib/av/peer-mesh";
import { getIceServersForBrowser } from "@/lib/av/webrtc-ice-from-env";

describe("getIceServersForBrowser", () => {
  const prev = process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS_JSON;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS_JSON;
    } else {
      process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS_JSON = prev;
    }
  });

  test("returns defaults when env unset", () => {
    delete process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS_JSON;
    const s = getIceServersForBrowser();
    expect(s).toEqual(DEFAULT_ICE_SERVERS);
  });

  test("appends TURN from JSON after defaults", () => {
    process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS_JSON = JSON.stringify([
      {
        urls: "turn:relay.example:3478",
        username: "u1",
        credential: "secret",
      },
    ]);
    const s = getIceServersForBrowser();
    expect(s.length).toBe(DEFAULT_ICE_SERVERS.length + 1);
    expect(s[s.length - 1]).toMatchObject({
      urls: "turn:relay.example:3478",
      username: "u1",
      credential: "secret",
    });
  });

  test("invalid JSON falls back to defaults", () => {
    process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS_JSON = "not-json";
    expect(getIceServersForBrowser()).toEqual(DEFAULT_ICE_SERVERS);
  });
});
