import {
  REGISTERED_ADMIN_REQUIRED_MESSAGE,
  registeredAdminId,
} from "@/lib/whiteboard/require-registered-admin";

describe("registeredAdminId", () => {
  it("refuses an env-only login with the registered-admin message", () => {
    expect(() =>
      registeredAdminId({ kind: "env", email: "legacy@example.com" }, "[test] rid=1")
    ).toThrow(REGISTERED_ADMIN_REQUIRED_MESSAGE);
  });

  it("returns the admin id for a registered tutor", () => {
    expect(
      registeredAdminId(
        { kind: "admin", adminId: "admin-1", email: "tutor@example.com" },
        "[test] rid=1"
      )
    ).toBe("admin-1");
  });
});
