/**
 * @jest-environment jsdom
 */

/**
 * P1-J8 / smokebook item 16 — WS-K notes shimmer computed-style contract.
 *
 * Behavior oracle: while TutorNote.status = generating, the shimmer overlay is
 * ACTUALLY styled (non-transparent gradient + animation), not merely present in
 * the DOM. The prior WS-K regression used undefined CSS custom properties
 * (`--surface-muted` / `--surface-hover` → transparent gradient stops) that
 * passed a DOM-presence check while the animation was invisible.
 *
 * jsdom limitation (documented): `getComputedStyle(el, "::after")` is NOT
 * implemented — pseudo-element computed styles cannot be read. Motion over time
 * is covered by Playwright `tests/integration/wb-notes-shimmer.spec.ts` (P1-WB-5).
 * This suite uses jsdom-feasible oracles:
 *   (1) design-token custom properties the gradient depends on are DEFINED on :root;
 *   (2) a real-element gradient probe using the same `var()` stops yields a non-`none`
 *       `background-image` linear-gradient (jsdom does not resolve `var()` to colors);
 *   (3) parsed base stylesheet rule for `.tn-notes-generating-wrap::after` declares
 *       `tn-notes-shimmer` animation, opacity, and z-index;
 *   (4) parsed `@media (prefers-reduced-motion: reduce)` rule for the same selector
 *       sets `animation: none` (matchMedia mocked to `reduce`).
 *
 * RED-BEFORE: `--surface-muted` / `--surface-hover` are absent from :root and from
 * shimmer CSS source — restoring the pre-WS-K CSS would fail `assertShimmerCssUsesDefinedTokens`
 * and reintroduce transparent gradient stops in real browsers.
 */

import fs from "node:fs";
import path from "node:path";

import React from "react";
import { render, screen } from "@testing-library/react";

import TutorNotesSection from "@/components/whiteboard/TutorNotesSection";

const TOKENS_CSS_PATH = path.resolve(__dirname, "../../styles/tokens.css");
const SHIMMER_CSS_PATH = path.resolve(__dirname, "../../styles/tutor-notes-shimmer.css");

const SHIMMER_GRADIENT_VARS =
  "linear-gradient(90deg, var(--surface-2) 0%, var(--accent-soft) 35%, var(--surface-3) 50%, var(--accent-soft) 65%, var(--surface-2) 100%)";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/app/admin/students/[id]/whiteboard/notes-actions", () => ({
  getTutorNoteStatusAction: jest.fn(),
  regenerateNotesAction: jest.fn(),
  saveSessionNotesAction: jest.fn(),
  deleteWhiteboardSessionAndDataAction: jest.fn(),
}));

function mockMatchMedia(reducedMotion: boolean) {
  window.matchMedia = ((query: string) => ({
    matches:
      reducedMotion && /prefers-reduced-motion:\s*reduce/.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function installShimmerStyles(reducedMotion = false) {
  mockMatchMedia(reducedMotion);
  document.querySelector("#tn-shimmer-test-styles")?.remove();

  const tokensCss = fs.readFileSync(TOKENS_CSS_PATH, "utf8");
  const shimmerCss = fs.readFileSync(SHIMMER_CSS_PATH, "utf8");

  const style = document.createElement("style");
  style.id = "tn-shimmer-test-styles";
  style.textContent = tokensCss + shimmerCss;
  document.head.appendChild(style);
}

function readRootToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function assertShimmerTokensDefined(): void {
  for (const token of ["--surface-2", "--surface-3", "--accent-soft"] as const) {
    const value = readRootToken(token);
    expect(value).not.toBe("");
    expect(value).not.toMatch(/^transparent$/i);
  }
}

function createGradientProbe(): HTMLDivElement {
  const probe = document.createElement("div");
  probe.setAttribute("data-testid", "tn-shimmer-gradient-probe");
  probe.style.backgroundImage = SHIMMER_GRADIENT_VARS;
  document.body.appendChild(probe);
  return probe;
}

function assertShimmerCssUsesDefinedTokens(): void {
  const shimmerCss = fs.readFileSync(SHIMMER_CSS_PATH, "utf8");
  expect(shimmerCss).toContain("--surface-2");
  expect(shimmerCss).toContain("--surface-3");
  expect(shimmerCss).toContain("--accent-soft");
  expect(shimmerCss).not.toContain("--surface-muted");
  expect(shimmerCss).not.toContain("--surface-hover");
}

function findBaseAfterRule(): CSSStyleRule | undefined {
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (
        rule instanceof CSSStyleRule &&
        rule.selectorText.includes("tn-notes-generating-wrap::after")
      ) {
        return rule;
      }
    }
  }
  return undefined;
}

function findReducedMotionAfterRule(): CSSStyleRule | undefined {
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (
        rule instanceof CSSMediaRule &&
        /prefers-reduced-motion/.test(rule.media.mediaText)
      ) {
        for (const inner of Array.from(rule.cssRules)) {
          if (
            inner instanceof CSSStyleRule &&
            inner.selectorText.includes("tn-notes-generating-wrap::after")
          ) {
            return inner;
          }
        }
      }
    }
  }
  return undefined;
}

function renderGeneratingNotesSection() {
  render(
    <TutorNotesSection
      whiteboardSessionId="wbs-shimmer"
      studentId="stu-shimmer"
      hasAudio={true}
      initialNote={{
        found: true,
        status: "generating",
        content: null,
        isPartial: false,
        error: null,
        generatedAt: null,
      }}
    />
  );
}

describe("P1-J8 — TutorNotesSection shimmer computed-style contract", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.querySelectorAll("style").forEach((el) => el.remove());
  });

  it("generating state: shimmer tokens defined, gradient + animation oracles, wrapper layout", () => {
    installShimmerStyles(false);
    renderGeneratingNotesSection();

    const generatingWrap = screen.getByTestId("tutor-notes-generating");
    expect(generatingWrap).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("tutor-notes-status")).toHaveTextContent("Writing notes…");

    const wrapStyle = getComputedStyle(generatingWrap);
    expect(wrapStyle.position).toBe("relative");
    expect(wrapStyle.isolation).toBe("isolate");

    assertShimmerTokensDefined();
    assertShimmerCssUsesDefinedTokens();

    const gradientProbe = createGradientProbe();
    const gradientStyle = getComputedStyle(gradientProbe);
    expect(gradientStyle.backgroundImage).not.toBe("none");
    expect(gradientStyle.backgroundImage).toContain("linear-gradient");

    const afterRule = findBaseAfterRule();
    expect(afterRule).toBeDefined();
    expect(afterRule!.style.animation).toContain("tn-notes-shimmer");
    expect(afterRule!.style.animationDuration || afterRule!.style.animation).toMatch(
      /1\.5s/
    );
    expect(afterRule!.style.opacity).not.toBe("");
    expect(Number.parseFloat(afterRule!.style.opacity)).toBeGreaterThan(0.4);
    expect(afterRule!.cssText).toMatch(/z-index:\s*10/);
  });

  it("RED-BEFORE guard: pre-WS-K undefined tokens absent; shimmer CSS avoids them", () => {
    installShimmerStyles(false);
    expect(readRootToken("--surface-muted")).toBe("");
    expect(readRootToken("--surface-hover")).toBe("");
    assertShimmerCssUsesDefinedTokens();
    expect(readRootToken("--surface-2")).toMatch(/^#/);
    expect(readRootToken("--surface-3")).not.toBe("");
    expect(readRootToken("--accent-soft")).not.toBe("");
    // Restoring --surface-muted / --surface-hover in tutor-notes-shimmer.css would fail
    // assertShimmerCssUsesDefinedTokens and reintroduce transparent gradient stops in
    // real browsers — the invisible-shimmer bug smokebook item 16 caught in WS-K.
  });

  it("prefers-reduced-motion: stylesheet ::after branch disables animation", () => {
    installShimmerStyles(true);

    const reducedAfterRule = findReducedMotionAfterRule();
    expect(reducedAfterRule).toBeDefined();
    expect(reducedAfterRule!.style.animation).toBe("none");

    assertShimmerCssUsesDefinedTokens();
  });
});
