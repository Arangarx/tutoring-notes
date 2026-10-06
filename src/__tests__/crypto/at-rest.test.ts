/**
 * @jest-environment node
 *
 * at-rest.ts — purpose-separated AES-256-GCM. Oracles are node:crypto
 * directly (the stored format and the HKDF derivation), not the module.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";
import { decryptAtRest, encryptAtRest } from "@/lib/crypto/at-rest";
import { decryptTotpSecret, encryptTotpSecret } from "@/lib/crypto/totp-secret";

const ROOT = randomBytes(32);
const prevKey = process.env.TOTP_ENCRYPTION_KEY;

beforeAll(() => {
  process.env.TOTP_ENCRYPTION_KEY = ROOT.toString("base64url");
});
afterAll(() => {
  if (prevKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
  else process.env.TOTP_ENCRYPTION_KEY = prevKey;
});

function openWith(key: Buffer, stored: string): string {
  const [ivB64, ctB64] = stored.split(".");
  const iv = Buffer.from(ivB64!, "base64url");
  const ct = Buffer.from(ctB64!, "base64url");
  const d = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  d.setAuthTag(ct.subarray(ct.length - 16));
  return Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString("utf8");
}

describe("encryptAtRest / decryptAtRest", () => {
  it("round-trips per purpose", () => {
    for (const purpose of ["totp", "wb-live-key"] as const) {
      const stored = encryptAtRest(purpose, "hello-secret");
      expect(stored).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      expect(decryptAtRest(purpose, stored)).toBe("hello-secret");
    }
  });

  it("uses a fresh IV each call", () => {
    expect(encryptAtRest("wb-live-key", "x")).not.toBe(encryptAtRest("wb-live-key", "x"));
  });

  it("a ciphertext for one purpose never decrypts under another", () => {
    const live = encryptAtRest("wb-live-key", "k");
    expect(() => decryptAtRest("totp", live)).toThrow();
    const totp = encryptAtRest("totp", "k");
    expect(() => decryptAtRest("wb-live-key", totp)).toThrow();
  });

  it("totp uses the root key directly (existing enrolled secrets stay readable)", () => {
    expect(openWith(ROOT, encryptTotpSecret("JBSWY3DPEHPK3PXP"))).toBe("JBSWY3DPEHPK3PXP");

    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", ROOT, iv, { authTagLength: 16 });
    const body = Buffer.concat([c.update("LEGACY", "utf8"), c.final(), c.getAuthTag()]);
    const legacy = `${iv.toString("base64url")}.${body.toString("base64url")}`;
    expect(decryptTotpSecret(legacy)).toBe("LEGACY");
  });

  it("decrypts a literal secret stored by the pre-branch totp-secret.ts (9182f3f8)", () => {
    // Key = 32 bytes of 0x07, IV = 12 bytes of 0x03, plaintext JBSWY3DPEHPK3PXP,
    // produced with the 9182f3f8 encryptTotpSecret algorithm.
    const prev = process.env.TOTP_ENCRYPTION_KEY;
    process.env.TOTP_ENCRYPTION_KEY = "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc";
    try {
      const stored = "AwMDAwMDAwMDAwMD.b7zwVAMbGhI_CBMX2AenXCJQypKgoE984na17nC1r24";
      expect(decryptTotpSecret(stored)).toBe("JBSWY3DPEHPK3PXP");
      expect(decryptAtRest("totp", stored)).toBe("JBSWY3DPEHPK3PXP");
    } finally {
      process.env.TOTP_ENCRYPTION_KEY = prev;
    }
  });

  it("wb-live-key uses an HKDF-SHA256 subkey of the root", () => {
    const sub = Buffer.from(hkdfSync("sha256", ROOT, Buffer.alloc(0), "mynk-at-rest:wb-live-key", 32));
    expect(openWith(sub, encryptAtRest("wb-live-key", "abc"))).toBe("abc");
    expect(() => openWith(ROOT, encryptAtRest("wb-live-key", "abc"))).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const stored = encryptAtRest("wb-live-key", "abc");
    const [iv, ct] = stored.split(".");
    const bytes = Buffer.from(ct!, "base64url");
    bytes[0] = bytes[0]! ^ 0xff;
    expect(() => decryptAtRest("wb-live-key", `${iv}.${bytes.toString("base64url")}`)).toThrow();
  });
});
