/**
 * Regression guards for site-wide theme plumbing (Phase A′).
 */

import { readFileSync } from "fs";
import { join } from "path";

import {
  DEV_THEME_STORAGE_KEY,
  THEME_STORAGE_KEY,
  getThemeBootstrapScript,
  isThemeMode,
  resolveTheme,
} from "@/lib/theme";

const GLOBALS = readFileSync(
  join(__dirname, "..", "..", "app", "globals.css"),
  "utf8"
);

describe("theme plumbing — storage keys", () => {
  test("production key is distinct from dev legacy key", () => {
    expect(THEME_STORAGE_KEY).toBe("mynk-theme");
    expect(DEV_THEME_STORAGE_KEY).toBe("tutoring-notes-dev-theme");
    expect(THEME_STORAGE_KEY).not.toBe(DEV_THEME_STORAGE_KEY);
  });
});

describe("theme plumbing — bootstrap script", () => {
  const script = getThemeBootstrapScript();

  test("reads production localStorage key before paint", () => {
    expect(script).toContain(THEME_STORAGE_KEY);
  });

  test("supports dev ?theme= override", () => {
    expect(script).toContain('p.get("theme")');
    expect(script).toContain(DEV_THEME_STORAGE_KEY);
  });

  test("removes data-theme for system / unset (media-query fallback)", () => {
    expect(script).toContain('removeAttribute("data-theme")');
  });
});

describe("theme plumbing — mode resolution", () => {
  test("isThemeMode accepts light, dark, system only", () => {
    expect(isThemeMode("light")).toBe(true);
    expect(isThemeMode("dark")).toBe(true);
    expect(isThemeMode("system")).toBe(true);
    expect(isThemeMode("sepia")).toBe(false);
    expect(isThemeMode(null)).toBe(false);
  });

  test("resolveTheme maps explicit modes", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });
});

describe("globals.css — Tailwind dark variant follows data-theme", () => {
  test("declares @custom-variant dark keyed to [data-theme=dark]", () => {
    expect(GLOBALS).toMatch(
      /@custom-variant\s+dark\s+\(&:where\(\[data-theme=dark\],\s*\[data-theme=dark\]\s*\*\)\)/
    );
  });
});
