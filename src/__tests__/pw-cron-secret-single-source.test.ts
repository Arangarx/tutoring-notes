import fs from "node:fs";
import path from "node:path";
import { PW_CRON_SECRET } from "../../tests/helpers/pw-cron-secret";

const MUST_IMPORT = [
  "playwright.config.ts",
  "tests/integration/wb-chunk-transcribe-queue.spec.ts",
  "tests/helpers/consent-harness.ts",
];

/** The selftest calls `runCron`, which uses the shared constant. It must not inline the literal. */
const MUST_NOT_REPEAT = [
  ...MUST_IMPORT,
  "tests/integration/wb-consent-harness-selftest.spec.ts",
];

describe("PW_CRON_SECRET has one definition", () => {
  test("the webServer, queue spec, and cron driver import it and do not repeat the literal", () => {
    expect(PW_CRON_SECRET.length).toBeGreaterThan(8);
    const definition = fs.readFileSync(
      path.join(process.cwd(), "tests/helpers/pw-cron-secret.ts"),
      "utf8"
    );
    const definitions = definition.split(PW_CRON_SECRET).length - 1;
    expect(definitions).toBe(1);

    for (const rel of MUST_IMPORT) {
      const text = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect({
        file: rel,
        importsSharedConstant: text.includes("PW_CRON_SECRET"),
        repeatsLiteral: text.includes(PW_CRON_SECRET),
      }).toEqual({
        file: rel,
        importsSharedConstant: true,
        repeatsLiteral: false,
      });
    }
    for (const rel of MUST_NOT_REPEAT) {
      if (MUST_IMPORT.includes(rel)) continue;
      const text = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect({
        file: rel,
        repeatsLiteral: text.includes(PW_CRON_SECRET),
      }).toEqual({
        file: rel,
        repeatsLiteral: false,
      });
    }
  });
});