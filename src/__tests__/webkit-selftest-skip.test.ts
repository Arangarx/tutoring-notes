import { skipWebKitSelfTestForMissingExecutable } from "../../tests/helpers/webkit-selftest-skip";

describe("skipWebKitSelfTestForMissingExecutable", () => {
  test("skips a missing WebKit executable only when not in CI", () => {
    expect(
      skipWebKitSelfTestForMissingExecutable({ installed: false, ci: false })
    ).toBe(true);
  });

  test("does not skip in CI when the executable is missing", () => {
    expect(
      skipWebKitSelfTestForMissingExecutable({ installed: false, ci: true })
    ).toBe(false);
  });

  test("treats CI=false, CI=0, and an empty CI as not CI", () => {
    for (const ci of ["false", "FALSE", "0", ""] as const) {
      expect(
        skipWebKitSelfTestForMissingExecutable({ installed: false, ci })
      ).toBe(true);
    }
  });

  test("treats CI=true and CI=1 as CI", () => {
    expect(
      skipWebKitSelfTestForMissingExecutable({ installed: false, ci: "true" })
    ).toBe(false);
    expect(
      skipWebKitSelfTestForMissingExecutable({ installed: false, ci: "1" })
    ).toBe(false);
  });

  test("does not skip when the executable is installed", () => {
    expect(
      skipWebKitSelfTestForMissingExecutable({ installed: true, ci: false })
    ).toBe(false);
    expect(
      skipWebKitSelfTestForMissingExecutable({ installed: true, ci: true })
    ).toBe(false);
    expect(
      skipWebKitSelfTestForMissingExecutable({ installed: true, ci: "false" })
    ).toBe(false);
  });
});
