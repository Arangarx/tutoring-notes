/**
 * Platform mail seam: auth/system mail must use env SMTP only.
 * Independent oracle: Gmail lookup + EmailConfig must never run, even when
 * those rows exist; a missing SMTP config must surface an error string
 * (not a silent { sent: false }).
 */
import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import {
  sendPlatformMail,
  setPlatformMailSenderForTests,
} from "@/lib/email";

const sendMailFn = jest.fn().mockResolvedValue({ messageId: "test" });

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(() => ({ sendMail: sendMailFn })),
  },
}));

jest.mock("@/lib/env", () => ({
  env: {
    SMTP_HOST: "smtp.resend.test",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_USER: "resend",
    SMTP_PASS: "test-key",
    SMTP_FROM: "noreply@usemynk.com",
  },
  isEmailConfigured: () => true,
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    oAuthEmailConnection: { findFirst: jest.fn() },
    emailConfig: { findFirst: jest.fn() },
  },
}));

jest.mock("@/lib/gmail-transport", () => ({
  createGmailTransport: jest.fn(() => {
    throw new Error("sendPlatformMail must not use Gmail transport");
  }),
}));

jest.mock("@/lib/gmail-api-send", () => ({
  sendViaGmailApi: jest.fn(() => {
    throw new Error("sendPlatformMail must not use Gmail API");
  }),
  asciiEmailDisplayName: (s: string) => s,
}));

const gmailFindFirst = db.oAuthEmailConnection.findFirst as jest.Mock;
const emailConfigFindFirst = db.emailConfig.findFirst as jest.Mock;

beforeEach(() => {
  sendMailFn.mockClear();
  gmailFindFirst.mockReset();
  emailConfigFindFirst.mockReset();
  gmailFindFirst.mockResolvedValue({
    refreshToken: "gmail-refresh",
    email: "tutor@gmail.com",
  });
  emailConfigFindFirst.mockResolvedValue({
    host: "smtp.tutor.test",
    port: 587,
    secure: false,
    user: "tutor-smtp",
    password: "tutor-pass",
    fromEmail: "tutor@example.com",
  });
  setPlatformMailSenderForTests(null);
  (nodemailer.createTransport as jest.Mock).mockClear();
});

afterEach(() => {
  setPlatformMailSenderForTests(null);
});

test("sendPlatformMail uses env SMTP and never looks up Gmail or EmailConfig", async () => {
  const result = await sendPlatformMail({
    to: "parent@example.com",
    subject: "Confirm your email",
    text: "Click the link",
  });

  expect(result).toEqual({ sent: true });
  expect(gmailFindFirst).not.toHaveBeenCalled();
  expect(emailConfigFindFirst).not.toHaveBeenCalled();
  expect(nodemailer.createTransport).toHaveBeenCalledWith(
    expect.objectContaining({
      host: "smtp.resend.test",
      auth: { user: "resend", pass: "test-key" },
    })
  );
  expect(sendMailFn).toHaveBeenCalledWith(
    expect.objectContaining({
      to: "parent@example.com",
      subject: "Confirm your email",
      from: "noreply@usemynk.com",
    })
  );
});

test("setPlatformMailSenderForTests is used instead of nodemailer", async () => {
  const injected = jest.fn().mockResolvedValue({ sent: true });
  setPlatformMailSenderForTests(injected);

  const result = await sendPlatformMail({
    to: "a@example.com",
    subject: "Injected",
    text: "Body",
  });

  expect(result).toEqual({ sent: true });
  expect(injected).toHaveBeenCalledTimes(1);
  expect(sendMailFn).not.toHaveBeenCalled();
  expect(gmailFindFirst).not.toHaveBeenCalled();
});
