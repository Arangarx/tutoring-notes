/**
 * @jest-environment node
 */

import { randomBytes } from "crypto";
import { mintServerLiveKey, readServerLiveKey } from "@/lib/whiteboard/live-key";

const prevKey = process.env.TOTP_ENCRYPTION_KEY;
afterEach(() => {
  if (prevKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
  else process.env.TOTP_ENCRYPTION_KEY = prevKey;
  jest.restoreAllMocks();
});

describe("server-held live key", () => {
  beforeEach(() => {
    process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
  });

  it("mints a 32-byte AES key as unpadded base64url and reads it back", () => {
    const minted = mintServerLiveKey("t")!;
    expect(minted.liveKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(minted.liveKey, "base64url")).toHaveLength(32);
    expect(minted.liveKeyEnc).not.toContain(minted.liveKey);
    expect(readServerLiveKey("s1", minted.liveKeyEnc)).toBe(minted.liveKey);
  });

  it("each mint is a different key", () => {
    expect(mintServerLiveKey("t")!.liveKey).not.toBe(mintServerLiveKey("t")!.liveKey);
  });

  it("legacy sessions (no stored key) read as null", () => {
    expect(readServerLiveKey("s1", null)).toBeNull();
    expect(readServerLiveKey("s1", undefined)).toBeNull();
  });

  it("an undecryptable value reads as null and never logs the value", () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const minted = mintServerLiveKey("t")!;
    process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
    expect(readServerLiveKey("s1", minted.liveKeyEnc)).toBeNull();
    const logged = err.mock.calls.flat().join(" ");
    expect(logged).toContain("live_key_decrypt_failed");
    expect(logged).not.toContain(minted.liveKeyEnc);
    expect(logged).not.toContain(minted.liveKey);
  });
});

describe("no root key configured", () => {
  it("mint returns null so the session falls back to the link-fragment key", () => {
    delete process.env.TOTP_ENCRYPTION_KEY;
    jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(mintServerLiveKey("t")).toBeNull();
  });
});
