/**
 * SMS seam — Twilio Programmable SMS via HTTP fetch (no `twilio` npm package).
 *
 * Mirrors the `sendPlatformMail` / `setPlatformMailSenderForTests` pattern in
 * src/lib/email.ts: fail-closed when unconfigured, injectable for tests so
 * CI never talks to real Twilio.
 *
 * Fail-closed: missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
 * TWILIO_FROM_NUMBER returns `{ sent: false, error }` — never a silent miss,
 * never throws.
 *
 * Never log plaintext OTP codes or a full E.164 number — use maskE164() for
 * any log/UI surface.
 * SERVER-ONLY.
 */

export type SmsResult = { sent: true } | { sent: false; error: string };

export type SmsSender = (options: { toE164: string; body: string }) => Promise<SmsResult>;

let smsSenderOverride: SmsSender | null = null;

/** Test-only seam. Pass `null` to restore the default Twilio HTTP implementation. */
export function setSmsSenderForTests(sender: SmsSender | null): void {
  smsSenderOverride = sender;
}

function twilioEnvConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
    process.env.TWILIO_AUTH_TOKEN?.trim() &&
    process.env.TWILIO_FROM_NUMBER?.trim()
  );
}

function twilioMissingError(): string {
  return "SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.";
}

/** Masks a US E.164 number for logs/UI: +1XXXXXXXXXX -> +1•••••XXXX (last 4 digits only). */
export function maskE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return `+1\u2022\u2022\u2022\u2022\u2022${last4}`;
}

/** Normalizes free-form US phone input to E.164 (+1XXXXXXXXXX). Returns null if invalid. */
export function normalizeUsPhoneToE164(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  let tenDigits: string;
  if (digits.length === 10) {
    tenDigits = digits;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    tenDigits = digits.slice(1);
  } else {
    return null;
  }
  // Reject obviously-invalid NANP area codes (leading 0/1) — cheap sanity check,
  // not a full NANP validator.
  if (tenDigits[0] === "0" || tenDigits[0] === "1") return null;
  return `+1${tenDigits}`;
}

/** True when `phone` is exactly US E.164 format: +1 followed by 10 digits. */
export function isValidUsE164(phone: string): boolean {
  return /^\+1[2-9]\d{9}$/.test(phone);
}

async function sendViaTwilioHttp(toE164: string, body: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM_NUMBER!;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const basicAuth = Buffer.from(`${sid}:${token}`).toString("base64");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: toE164, From: from, Body: body }).toString(),
    });
    if (!res.ok) {
      // Never echo the response body verbatim — Twilio error payloads can include
      // the destination number. Keep the failure generic.
      return { sent: false, error: `Twilio send failed (status ${res.status}).` };
    }
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, error: message };
  }
}

/**
 * Sends an SMS via Twilio Programmable SMS (HTTP fetch — no twilio SDK).
 * Fail-closed if Twilio env is not fully configured (SID + TOKEN + FROM_NUMBER).
 */
export async function sendSms(options: { toE164: string; body: string }): Promise<SmsResult> {
  if (smsSenderOverride) {
    return smsSenderOverride(options);
  }
  if (!twilioEnvConfigured()) {
    return { sent: false, error: twilioMissingError() };
  }
  return sendViaTwilioHttp(options.toE164, options.body);
}
