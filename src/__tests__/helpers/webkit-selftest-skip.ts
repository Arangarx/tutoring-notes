/**
 * The WebKit consent self-test launches Playwright's WebKit binary.
 * A missing binary is a local-machine skip. In CI the launch must fail
 * so a missing browser is not reported as a pass.
 */
export function skipWebKitSelfTestForMissingExecutable(opts: {
  installed: boolean;
  ci: boolean;
}): boolean {
  return !opts.installed && !opts.ci;
}
