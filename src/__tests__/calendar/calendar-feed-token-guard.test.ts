/**
 * Guardrail: calendar feed tokens mint only via generateShareToken — never inline crypto.randomBytes.
 */
import fs from "fs";
import path from "path";

const mintModulePath = path.resolve(__dirname, "../../lib/calendar-feed-token.ts");

describe("calendar-feed-token mint guardrail", () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(mintModulePath, "utf-8");
  });

  it("imports generateShareToken from security.ts", () => {
    expect(source).toMatch(/from ["']@\/lib\/security["']/);
    expect(source).toMatch(/generateShareToken/);
  });

  it("does not call crypto.randomBytes in the mint module", () => {
    expect(source).not.toMatch(/crypto\.randomBytes/);
    expect(source).not.toMatch(/from ["']crypto["']/);
  });
});
