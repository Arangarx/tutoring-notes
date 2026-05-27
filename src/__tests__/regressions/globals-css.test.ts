/**
 * Lightweight regression tests for src/app/globals.css + src/styles/tokens.css.
 *
 * These guard against three failure modes that have repeatedly caused
 * dark-mode UI bugs (Sarah's recording-share card was invisible / mis-sized
 * across multiple sessions):
 *
 *   1. Inline styles all over the admin UI reference CSS variables named
 *      var(--color-muted), var(--color-border), var(--color-primary),
 *      var(--color-success-*), var(--color-error). Those variables MUST be
 *      defined via tokens.css legacy aliases.
 *
 *   2. The global `input { width: 100%; padding: 10px 12px; ... }` rule
 *      also matches <input type="checkbox">. Without an override, checkboxes
 *      stretch to fill their flex container and push adjacent label text past
 *      the edge of the card.
 *
 *   3. `color-scheme` follows prefers-color-scheme + data-theme overrides
 *      so native form controls match the active theme.
 */

import { readFileSync } from "fs";
import { join } from "path";

const GLOBALS = readFileSync(
  join(__dirname, "..", "..", "app", "globals.css"),
  "utf8"
);
const TOKENS = readFileSync(
  join(__dirname, "..", "..", "styles", "tokens.css"),
  "utf8"
);
const CSS = `${GLOBALS}\n${TOKENS}`;

describe("tokens.css — legacy variable definitions", () => {
  const REQUIRED_VARS = [
    "--color-muted",
    "--color-border",
    "--color-primary",
    "--color-success",
    "--color-success-bg",
    "--color-success-border",
    "--color-error",
    "--color-warning",
    "--color-warning-bg",
    "--color-warning-border",
    "--surface-base",
    "--surface-1",
    "--meter-loud",
  ];

  test.each(REQUIRED_VARS)("defines %s", (varName) => {
    const re = new RegExp(`${varName}\\s*:`, "m");
    expect(re.test(CSS)).toBe(true);
  });
});

describe("globals.css — checkbox/radio sizing override", () => {
  test("includes input[type=\"checkbox\"] override resetting width and padding", () => {
    const checkboxBlockMatch = GLOBALS.match(
      /input\[type="checkbox"\][^{]*\{[^}]*\}/
    );
    expect(checkboxBlockMatch).not.toBeNull();
    const block = checkboxBlockMatch![0];
    expect(block).toMatch(/width\s*:\s*auto/);
    expect(block).toMatch(/padding\s*:\s*0/);
  });

  test("checkbox override applies to radio too", () => {
    expect(GLOBALS).toMatch(/input\[type="radio"\]/);
  });
});

describe("tokens.css — theme + color-scheme", () => {
  test("declares color-scheme: light on :root default", () => {
    expect(TOKENS).toMatch(/:root[\s\S]*color-scheme\s*:\s*light\b/);
  });

  test("declares color-scheme: dark under prefers-color-scheme media", () => {
    expect(TOKENS).toMatch(
      /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*color-scheme\s*:\s*dark\b/
    );
  });

  test("supports explicit data-theme light and dark overrides", () => {
    expect(TOKENS).toMatch(/\[data-theme="light"\]/);
    expect(TOKENS).toMatch(/\[data-theme="dark"\]/);
  });

  test("declares accent-color so checkmark / radio dot is visible", () => {
    expect(TOKENS).toMatch(/accent-color\s*:/);
  });
});

describe("globals.css — imports token layer", () => {
  test("imports tokens.css", () => {
    expect(GLOBALS).toMatch(/@import\s+["'].*tokens\.css["']/);
  });
});
