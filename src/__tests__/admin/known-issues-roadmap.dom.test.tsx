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

  it("renders the limits and the three later section headings", () => {
    expect(screen.getByText("What Mynk does today")).toBeInTheDocument();
    expect(screen.getByTestId("product-today-list")).toHaveTextContent(/English only/i);
    expect(screen.getByText("Recently improved")).toBeInTheDocument();
    expect(screen.getByText("Known issues")).toBeInTheDocument();
    expect(screen.getByText("Roadmap / coming soon")).toBeInTheDocument();
  });

  it("renders recently improved subcategories with representative items", () => {
    const section = screen.getByTestId("known-issues-recently-improved");
    const heading = within(section).getByText("Session notes & replay");
    expect(heading).toHaveClass("font-semibold");
    expect(heading).toHaveClass("text-foreground");
    expect(within(section).getByText("Identity, consent & privacy")).toBeInTheDocument();
    expect(
      within(section).getByText(/session notes are ready almost immediately/)
    ).toBeInTheDocument();
    expect(
      within(section).queryByText(/Replays start from the beginning when you open them/)
    ).not.toBeInTheDocument();
    expect(
      within(section).getByText(
        "Parent or guardian consent is now required and recorded before a session can start, online or in person, with clear consent choices during account setup."
      )
    ).toBeInTheDocument();
    expect(
      within(section).getByText(
        "Ending a session from your sessions list or the resume screen now saves your full recording, the same as ending from inside the session."
      )
    ).toBeInTheDocument();
    expect(
      within(section).getByText(/request deletion of a student's data/)
    ).toBeInTheDocument();
  });

  it("renders the known-issues list with pilot-facing items", () => {
    const list = screen.getByTestId("known-issues-list");
    expect(within(list).queryByText(/PDF boards — occasional stray mark/)).not.toBeInTheDocument();
    expect(
      within(list).getByText(/A child does not need their own login for a parent to join/)
    ).toBeInTheDocument();
    expect(within(list).queryByText(/Empty review screen/)).not.toBeInTheDocument();
    expect(within(list).getByText(/Student microphone volume/)).toBeInTheDocument();
    expect(
      within(list).getByText(
        "A parent signed in on the family account can open that child's online session from Upcoming sessions when the appointment window is open and online sessions are on. They do not need the child's username or PIN. Set up the child's login under Manage only if the child will sign in on their own device."
      )
    ).toBeInTheDocument();
    expect(
      within(list).getByText(
        "Students can turn their own microphone up during a session. We have not finished checking that the tutor hears that boost on a second device."
      )
    ).toBeInTheDocument();
  });

  it("does not list known issues that shipped in the durability wave", () => {
    const list = screen.getByTestId("known-issues-list");
    expect(within(list).queryByText(/Status badge during a session/)).not.toBeInTheDocument();
    expect(within(list).queryByText(/Connection status visibility/)).not.toBeInTheDocument();
    expect(within(list).queryByText(/In-person sessions — waiting message/)).not.toBeInTheDocument();
    expect(
      within(list).queryByText(/can't join live sessions yet/)
    ).not.toBeInTheDocument();
  });

  it("section headings are more prominent than body bullets", () => {
    const section = screen.getByTestId("known-issues-recently-improved");
    const headings = within(section).getAllByTestId("known-issues-section-heading");
    for (const heading of headings) {
      expect(heading).toHaveClass("font-semibold");
      expect(heading).toHaveClass("text-foreground");
      expect(heading).not.toHaveClass("text-muted-foreground");
    }
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
