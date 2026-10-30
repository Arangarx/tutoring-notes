import { skipWebKitSelfTestForMissingExecutable } from "@/__tests__/helpers/webkit-selftest-skip";

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

  test("does not skip when the executable is installed", () => {
    expect(
      skipWebKitSelfTestForMissingExecutable({ installed: true, ci: false })
    ).toBe(false);
    expect(
      skipWebKitSelfTestForMissingExecutable({ installed: true, ci: true })
    ).toBe(false);
  });
});
