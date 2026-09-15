// @ts-nocheck — Jest 30 mock factory inference produces `never` return types.
/**
 * SMS seam — pure unit tests (mask, normalize, fail-closed, Twilio HTTP path).
 */

import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

const ORIG_ENV = { ...process.env };

function clearTwilioEnv(): void {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
}

function setTwilioEnv(partial?: {
  sid?: string;
  token?: string;
  from?: string;
}): void {
  if (partial?.sid !== undefined) process.env.TWILIO_ACCOUNT_SID = partial.sid;
  else delete process.env.TWILIO_ACCOUNT_SID;
  if (partial?.token !== undefined) process.env.TWILIO_AUTH_TOKEN = partial.token;
  else delete process.env.TWILIO_AUTH_TOKEN;
  if (partial?.from !== undefined) process.env.TWILIO_FROM_NUMBER = partial.from;
  else delete process.env.TWILIO_FROM_NUMBER;
}

describe("maskE164", () => {
  it("masks +15551234567 as +1•••••4567 (last 4 visible)", async () => {
    const { maskE164 } = await import("@/lib/sms");
    expect(maskE164("+15551234567")).toBe("+1\u2022\u2022\u2022\u2022\u20224567");
  });

  it("never includes the full number as a substring of the output", async () => {
    const { maskE164 } = await import("@/lib/sms");
    const inputs = ["+15551234567", "+1 (555) 123-4567", "15551234567", "+19876543210"];
    for (const input of inputs) {
      const masked = maskE164(input);
      const digitsOnly = input.replace(/\D/g, "");
      expect(masked).not.toContain(digitsOnly);
      if (digitsOnly.length >= 4) {
        expect(masked).toContain(digitsOnly.slice(-4));
      }
    }
  });
});

describe("normalizeUsPhoneToE164", () => {
  it("normalizes valid US phone inputs to +1XXXXXXXXXX", async () => {
    const { normalizeUsPhoneToE164 } = await import("@/lib/sms");
    expect(normalizeUsPhoneToE164("5551234567")).toBe("+15551234567");
    expect(normalizeUsPhoneToE164("(555) 123-4567")).toBe("+15551234567");
    expect(normalizeUsPhoneToE164("1-555-123-4567")).toBe("+15551234567");
    expect(normalizeUsPhoneToE164("+15551234567")).toBe("+15551234567");
  });

  it("returns null for invalid inputs", async () => {
    const { normalizeUsPhoneToE164 } = await import("@/lib/sms");
    expect(normalizeUsPhoneToE164("555123")).toBeNull();
    expect(normalizeUsPhoneToE164("25551234567")).toBeNull();
    expect(normalizeUsPhoneToE164("0551234567")).toBeNull();
    expect(normalizeUsPhoneToE164("1551234567")).toBeNull();
    expect(normalizeUsPhoneToE164("+445551234567")).toBeNull();
    expect(normalizeUsPhoneToE164("")).toBeNull();
  });
});

describe("isValidUsE164", () => {
  it("accepts +1 followed by 10 digits with area code 2-9", async () => {
    const { isValidUsE164 } = await import("@/lib/sms");
    expect(isValidUsE164("+15551234567")).toBe(true);
    expect(isValidUsE164("+19876543210")).toBe(true);
  });

  it("rejects invalid E.164 shapes", async () => {
    const { isValidUsE164 } = await import("@/lib/sms");
    expect(isValidUsE164("5551234567")).toBe(false);
    expect(isValidUsE164("+1555123456")).toBe(false);
    expect(isValidUsE164("+155512345678")).toBe(false);
    expect(isValidUsE164("+11234567890")).toBe(false); // area code starts with 1
    expect(isValidUsE164("+10551234567")).toBe(false); // area code starts with 0
    expect(isValidUsE164("+1555123456a")).toBe(false);
    expect(isValidUsE164("+245551234567")).toBe(false);
  });
});

describe("sendSms fail-closed (no test override)", () => {
  let fetchSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    clearTwilioEnv();
  });

  afterEach(async () => {
    fetchSpy?.mockRestore();
    const { setSmsSenderForTests } = await import("@/lib/sms");
    setSmsSenderForTests(null);
    process.env = { ...ORIG_ENV };
  });

  async function expectFailClosedWithoutFetch(
    env: { sid?: string; token?: string; from?: string }
  ): Promise<void> {
    setTwilioEnv(env);
    fetchSpy = jest.spyOn(global, "fetch");
    const { sendSms } = await import("@/lib/sms");
    const result = await sendSms({ toE164: "+15551234567", body: "test" });
    expect(result.sent).toBe(false);
    if (!result.sent) {
      expect(result.error).toMatch(/SMS is not configured/i);
      expect(result.error).toMatch(/TWILIO_/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  }

  it("returns unconfigured error when all three env vars are unset", async () => {
    await expectFailClosedWithoutFetch({});
  });

  it("returns unconfigured error when only SID is set", async () => {
    await expectFailClosedWithoutFetch({ sid: "ACtest" });
  });

  it("returns unconfigured error when only TOKEN is set", async () => {
    await expectFailClosedWithoutFetch({ token: "secret" });
  });

  it("returns unconfigured error when only FROM_NUMBER is set", async () => {
    await expectFailClosedWithoutFetch({ from: "+15550001111" });
  });

  it("returns unconfigured error when only SID + TOKEN are set", async () => {
    await expectFailClosedWithoutFetch({ sid: "ACtest", token: "secret" });
  });

  it("returns unconfigured error when only SID + FROM_NUMBER are set", async () => {
    await expectFailClosedWithoutFetch({ sid: "ACtest", from: "+15550001111" });
  });

  it("returns unconfigured error when only TOKEN + FROM_NUMBER are set", async () => {
    await expectFailClosedWithoutFetch({ token: "secret", from: "+15550001111" });
  });
});

describe("setSmsSenderForTests override", () => {
  beforeEach(() => {
    clearTwilioEnv();
  });

  afterEach(async () => {
    const { setSmsSenderForTests } = await import("@/lib/sms");
    setSmsSenderForTests(null);
    process.env = { ...ORIG_ENV };
  });

  it("calls the override instead of fetch and passes through { sent: true }", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");
    const mockSender = jest.fn().mockResolvedValue({ sent: true });
    const { setSmsSenderForTests, sendSms } = await import("@/lib/sms");
    setSmsSenderForTests(mockSender);

    const result = await sendSms({ toE164: "+15559876543", body: "hello" });

    expect(result).toEqual({ sent: true });
    expect(mockSender).toHaveBeenCalledWith({ toE164: "+15559876543", body: "hello" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("passes through override { sent: false, error } unchanged", async () => {
    const mockSender = jest.fn().mockResolvedValue({ sent: false, error: "carrier rejected" });
    const { setSmsSenderForTests, sendSms } = await import("@/lib/sms");
    setSmsSenderForTests(mockSender);

    const result = await sendSms({ toE164: "+15551112222", body: "fail me" });

    expect(result).toEqual({ sent: false, error: "carrier rejected" });
  });

  it("restores fail-closed default after setSmsSenderForTests(null)", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");
    const { setSmsSenderForTests, sendSms } = await import("@/lib/sms");
    setSmsSenderForTests(jest.fn().mockResolvedValue({ sent: true }));
    await sendSms({ toE164: "+15550000001", body: "x" });

    setSmsSenderForTests(null);
    const result = await sendSms({ toE164: "+15550000002", body: "y" });

    expect(result.sent).toBe(false);
    if (!result.sent) {
      expect(result.error).toMatch(/SMS is not configured/i);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("sendSms Twilio HTTP path (mocked fetch)", () => {
  let fetchSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    setTwilioEnv({ sid: "ACtest123", token: "auth-token-secret", from: "+15550009999" });
  });

  afterEach(async () => {
    fetchSpy?.mockRestore();
    const { setSmsSenderForTests } = await import("@/lib/sms");
    setSmsSenderForTests(null);
    process.env = { ...ORIG_ENV };
  });

  it("POSTs to api.twilio.com with Basic auth and URL-encoded body on success", async () => {
    fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    const { sendSms } = await import("@/lib/sms");
    const result = await sendSms({ toE164: "+15551234567", body: "Mynk: code 123456" });

    expect(result).toEqual({ sent: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("api.twilio.com");
    expect(url).toContain("ACtest123");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic /);
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("To=%2B15551234567");
    expect(String(init.body)).toContain("From=%2B15550009999");
    expect(String(init.body)).toContain("Body=");
  });

  it("returns generic error on non-ok response without echoing response body", async () => {
    fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "To=+15551234567 is not a valid phone number",
    } as Response);

    const { sendSms } = await import("@/lib/sms");
    const result = await sendSms({ toE164: "+15551234567", body: "test" });

    expect(result.sent).toBe(false);
    if (!result.sent) {
      expect(result.error).toMatch(/Twilio send failed \(status 400\)/);
      expect(result.error).not.toContain("+15551234567");
      expect(result.error).not.toContain("not a valid phone");
    }
  });
});
