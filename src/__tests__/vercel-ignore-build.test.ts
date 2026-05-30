import { shouldSkipBuild } from "../../scripts/vercel-ignore-build";

describe("shouldSkipBuild", () => {
  it("skips docs-only changes", () => {
    expect(shouldSkipBuild(["docs/BACKLOG.md"])).toBe(true);
  });

  it("skips .cursor rule-only changes", () => {
    expect(
      shouldSkipBuild([".cursor/rules/orchestrator-discipline.mdc"])
    ).toBe(true);
  });

  it("skips root markdown", () => {
    expect(shouldSkipBuild(["AGENTS.md"])).toBe(true);
  });

  it("skips .mdc anywhere in the tree", () => {
    expect(shouldSkipBuild(["foo/bar/baz.mdc"])).toBe(true);
  });

  it("builds when docs are mixed with code", () => {
    expect(
      shouldSkipBuild(["docs/X.md", "src/app/page.tsx"])
    ).toBe(false);
  });

  it("builds for code-only changes", () => {
    expect(shouldSkipBuild(["src/lib/ai.ts"])).toBe(false);
  });

  it("builds for vercel.json-only changes", () => {
    expect(shouldSkipBuild(["vercel.json"])).toBe(false);
  });

  it("builds for package.json-only changes", () => {
    expect(shouldSkipBuild(["package.json"])).toBe(false);
  });

  it("builds for package-lock.json-only changes", () => {
    expect(shouldSkipBuild(["package-lock.json"])).toBe(false);
  });

  it("builds for prisma schema-only changes", () => {
    expect(shouldSkipBuild(["prisma/schema.prisma"])).toBe(false);
  });

  it("builds for an empty changed-files list", () => {
    expect(shouldSkipBuild([])).toBe(false);
  });

  it("builds for deceptive docs substring in a code path", () => {
    expect(shouldSkipBuild(["src/docs-helper.ts"])).toBe(false);
  });
});
