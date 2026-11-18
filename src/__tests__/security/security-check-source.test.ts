/**
 * The Semgrep rulesets, the gitleaks version, and the unreachable database
 * URL for the security Jest run live in scripts/security-check.mjs. CI calls
 * that script. A second copy in the workflow is a drift bug.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "..");
const workflow = readFileSync(join(root, ".github", "workflows", "security.yml"), "utf8");
const script = readFileSync(join(root, "scripts", "security-check.mjs"), "utf8");

describe("security check single source", () => {
  it("keeps the Semgrep rulesets, gitleaks pin, and dummy database URL in the script", () => {
    expect(script).toContain("p/owasp-top-ten");
    expect(script).toContain("p/typescript");
    expect(script).toContain("p/react");
    expect(script).toContain("p/nextjs");
    expect(script).toContain('const GITLEAKS_VERSION = "8.30.1"');
    expect(script).toContain("postgresql://x:x@127.0.0.1:1/x");
  });

  it("makes CI call the script instead of repeating those values", () => {
    expect(workflow).not.toContain("p/owasp-top-ten");
    expect(workflow).not.toContain("8.30.1");
    expect(workflow).not.toContain("postgresql://x:x@127.0.0.1:1/x");
    for (const check of ["semgrep", "gitleaks", "audit", "jest"]) {
      expect(workflow).toContain(`node scripts/security-check.mjs --only ${check}`);
    }
  });
});
