/**
 * The WebKit consent self-test launches Playwright's WebKit binary.
 * A missing binary is a local-machine skip. In CI the launch must fail
 * so a missing browser is not reported as a pass.
 *
 * `CI=false`, `CI=0`, and an empty `CI` are not CI. `Boolean("false")` is
 * true, so the raw env string has to be read here.
 */
function envIsCi(ci: boolean | string | null | undefined): boolean {
  if (typeof ci === "boolean") return ci;
  if (ci == null) return false;
  const normalized = ci.trim().toLowerCase();
  return normalized !== "" && normalized !== "false" && normalized !== "0";
}

export function skipWebKitSelfTestForMissingExecutable(opts: {
  installed: boolean;
  ci: boolean | string | null | undefined;
}): boolean {
  return !opts.installed && !envIsCi(opts.ci);
}
