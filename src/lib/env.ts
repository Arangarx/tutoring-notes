import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().min(1).optional(),
  // Optional when using first-run setup (AdminUser in DB)
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(6).optional(),
  /** Production: set a long random value; open /setup?token=… to create first admin. Empty = unset. */
  SETUP_SECRET: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(16).optional()
  ),
  // Optional: when set, real email is sent via SMTP
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  // Optional: for "Connect Gmail" OAuth (deployer sets once; users never touch)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Comma-separated admin emails allowed to use Connect Gmail. If unset, all admins may try. Use to keep OAuth off for random signups. */
  GMAIL_CONNECT_ALLOWLIST: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional()
  ),
  /** Comma-separated emails that may open global feedback inbox + waitlist. `ADMIN_EMAIL` is always included. */
  OPERATOR_EMAILS: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional()
  ),
  /** OpenAI API key. Optional — if absent, AI features degrade gracefully. */
  OPENAI_API_KEY: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional()
  ),
  /** Vercel Blob read/write token. Optional — if absent, audio upload is disabled. */
  BLOB_READ_WRITE_TOKEN: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional()
  ),
  /**
   * AES-256-GCM key for TOTP secret encryption (Identity Phase 1).
   * Must decode to exactly 32 bytes when interpreted as base64url.
   * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   * REQUIRED in production for any deployment with real admins.
   * Losing this key requires re-enrolling all tutors — see docs/PLATFORM-ASSUMPTIONS.md.
   * Optional in local dev (2FA enrollment will fail gracefully if missing).
   */
  TOTP_ENCRYPTION_KEY: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .refine(
        (v) => {
          try {
            return Buffer.from(v, "base64url").length === 32;
          } catch {
            return false;
          }
        },
        { message: "must be a base64url string that decodes to exactly 32 bytes" }
      )
      .optional()
  ),
  /**
   * URL of the excalidraw-room sync server (Phase 1 whiteboard live
   * collaboration). Format: `wss://wb.example.com` — no trailing
   * slash. Optional in dev: when unset, the whiteboard runs in
   * tutor-solo mode (no live student join, recording still works).
   * Production must set this; the workspace UI reflects the missing
   * URL with a copy hint pointing at the `whiteboard-sync` repo README
   * (`agentic-projects/whiteboard-sync/README.md` when checked out next to this app).
   */
  WHITEBOARD_SYNC_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .url()
      .refine((u) => u.startsWith("wss://") || u.startsWith("ws://"), {
        message: "must start with wss:// (prod) or ws:// (dev)",
      })
      .optional()
  ),
  /**
   * HMAC-SHA-256 signing secret for AccountHolder session tokens (Identity Phase 2a).
   * 32+ bytes random, base64 encoded.
   * Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   * Optional at build time — fails-closed at request time if unset in auth paths.
   */
  AH_SESSION_HMAC_SECRET: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional()
  ),
  /**
   * HMAC-SHA-256 signing secret for LearnerDeviceSession tokens (Identity Phase 2a).
   * 32+ bytes random, base64 encoded.
   * Optional at build time — fails-closed at request time if unset in auth paths.
   */
  LEARNER_SESSION_HMAC_SECRET: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional()
  ),
  /**
   * HMAC-SHA-256 signing secret for AdminTrustedDevice tokens (2FA remember-device).
   * 32+ bytes random. Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   * Optional at build time — fails-closed at request time if unset:
   *   mintAdminTrustedDevice throws; validateAdminTrustedDevice returns null → TOTP required.
   * REQUIRED in production for the remember-device feature to work.
   * Rotation: rotating this secret instantly invalidates ALL existing trusted-device rows
   *   (stored tokenHash values were computed with the old secret). All users will be prompted
   *   for TOTP on their next login. Plan a maintenance window or notify users if rotating.
   *   See docs/PLATFORM-ASSUMPTIONS.md for the full rotation story.
   */
  ADMIN_TFA_DEVICE_HMAC_SECRET: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional()
  ),
  /**
   * AES-256-GCM key for AccountHolder TOTP secret encryption (Phase 6).
   * Isolated from TOTP_ENCRYPTION_KEY so rotating tutor 2FA doesn't affect parent 2FA.
   * Reserved in Phase 2a so Phase 6 executor doesn't pick a conflicting name.
   * Optional at build time — Phase 6 enrollment will fail if unset.
   */
  AH_TOTP_ENCRYPTION_KEY: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .refine(
        (v) => {
          try {
            return Buffer.from(v, "base64url").length === 32;
          } catch {
            return false;
          }
        },
        { message: "must be a base64url string that decodes to exactly 32 bytes" }
      )
      .optional()
  ),
});

const parsed = EnvSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  SETUP_SECRET: process.env.SETUP_SECRET,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GMAIL_CONNECT_ALLOWLIST: process.env.GMAIL_CONNECT_ALLOWLIST,
  OPERATOR_EMAILS: process.env.OPERATOR_EMAILS,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  TOTP_ENCRYPTION_KEY: process.env.TOTP_ENCRYPTION_KEY,
  WHITEBOARD_SYNC_URL: process.env.WHITEBOARD_SYNC_URL,
  AH_SESSION_HMAC_SECRET: process.env.AH_SESSION_HMAC_SECRET,
  LEARNER_SESSION_HMAC_SECRET: process.env.LEARNER_SESSION_HMAC_SECRET,
  ADMIN_TFA_DEVICE_HMAC_SECRET: process.env.ADMIN_TFA_DEVICE_HMAC_SECRET,
  AH_TOTP_ENCRYPTION_KEY: process.env.AH_TOTP_ENCRYPTION_KEY,
});

if (!parsed.success) {
  throw new Error("Invalid env: " + JSON.stringify(parsed.error.flatten()));
}

export const env = parsed.data;

/** True if SMTP is configured so we can send real email. */
export function isEmailConfigured(): boolean {
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}
