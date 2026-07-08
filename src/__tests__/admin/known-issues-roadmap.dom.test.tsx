/**
 * @jest-environment jsdom
 *
 * Known issues & roadmap — Sarah-facing sections render; internal appendix does not.
 */

import fs from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";

import { KnownIssuesRoadmapView } from "@/components/admin/KnownIssuesRoadmapView";

describe("KnownIssuesRoadmapView — Sarah-facing content", () => {
  beforeEach(() => {
    render(<KnownIssuesRoadmapView />);
  });

  it("renders the three section headings", () => {
    expect(screen.getByText("Recently improved")).toBeInTheDocument();
    expect(screen.getByText("Known issues we're still working on")).toBeInTheDocument();
    expect(screen.getByText("Roadmap / coming soon")).toBeInTheDocument();
  });

  it("renders the known-issues list with pilot-facing items", () => {
    const list = screen.getByTestId("known-issues-list");
    expect(within(list).getByText(/PDF boards — occasional stray mark/)).toBeInTheDocument();
    expect(within(list).getByText(/Empty review screen/)).toBeInTheDocument();
  });

  it("does not render internal engineering appendix markers", () => {
    const root = screen.getByTestId("known-issues-roadmap");
    expect(root).not.toHaveTextContent("Appendix — Internal engineering reference");
    expect(root).not.toHaveTextContent("Intentionally omitted");
    expect(root).not.toHaveTextContent("WS-K");
    expect(root).not.toHaveTextContent("859f695");
    expect(root).not.toHaveTextContent("wb-wave5-execution-queue");
  });
});

describe("Known issues settings route — nav wiring", () => {
  it("settings index links to /admin/settings/known-issues", () => {
    const settingsPagePath = path.resolve(
      __dirname,
      "../../app/admin/settings/page.tsx"
    );
    const content = fs.readFileSync(settingsPagePath, "utf-8");
    expect(content).toMatch(/href:\s*["']\/admin\/settings\/known-issues["']/);
  });

  it("known-issues page module exists at the expected route", () => {
    const pagePath = path.resolve(
      __dirname,
      "../../app/admin/settings/known-issues/page.tsx"
    );
    expect(fs.existsSync(pagePath)).toBe(true);
    const content = fs.readFileSync(pagePath, "utf-8");
    expect(content).toContain("KnownIssuesRoadmapView");
    expect(content).not.toContain("WS-");
  });
});
