/**
 * Operator mail on a new tutor signup.
 * Production sets ADMIN_EMAIL and leaves OPERATOR_EMAILS unset.
 */

describe("notifyOperatorsOfNewSignup", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => {
    jest.resetModules();
    warn.mockClear();
  });

  afterAll(() => {
    warn.mockRestore();
  });

  async function loadNotify(envShape: {
    OPERATOR_EMAILS?: string;
    ADMIN_EMAIL?: string;
  }) {
    const sendPlatformMail = jest.fn().mockResolvedValue({ sent: true });
    jest.doMock("@/lib/email", () => ({ sendPlatformMail }));
    jest.doMock("@/lib/env", () => ({
      env: {
        OPERATOR_EMAILS: envShape.OPERATOR_EMAILS,
        ADMIN_EMAIL: envShape.ADMIN_EMAIL,
        NEXTAUTH_URL: "https://app.example.com",
      },
    }));
    const mod = await import("@/lib/notify-operator-new-signup");
    return { notifyOperatorsOfNewSignup: mod.notifyOperatorsOfNewSignup, sendPlatformMail };
  }

  async function notify(envShape: { OPERATOR_EMAILS?: string; ADMIN_EMAIL?: string }) {
    const loaded = await loadNotify(envShape);
    await loaded.notifyOperatorsOfNewSignup({
      email: "new-tutor@example.com",
      displayName: "New Tutor",
      method: "credentials",
    });
    return loaded.sendPlatformMail;
  }

  it("sends when OPERATOR_EMAILS is set and ADMIN_EMAIL is unset", async () => {
    const sendPlatformMail = await notify({ OPERATOR_EMAILS: "ops@example.com" });
    expect(sendPlatformMail).toHaveBeenCalledTimes(1);
    expect(sendPlatformMail.mock.calls[0][0].to).toBe("ops@example.com");
    expect(warn).not.toHaveBeenCalled();
  });

  it("sends when OPERATOR_EMAILS is unset and ADMIN_EMAIL is set", async () => {
    const sendPlatformMail = await notify({ ADMIN_EMAIL: "admin@example.com" });
    expect(sendPlatformMail).toHaveBeenCalledTimes(1);
    expect(sendPlatformMail.mock.calls[0][0].to).toContain("admin@example.com");
    expect(sendPlatformMail.mock.calls[0][0].subject).toMatch(/WAITLISTED/i);
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs a warning and does not throw when neither address is set", async () => {
    const sendPlatformMail = await notify({});
    expect(sendPlatformMail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/operator_notify_skipped/)
    );
  });
});
