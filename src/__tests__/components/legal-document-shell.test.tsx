/**
 * @jest-environment jsdom
 *
 * Locks LegalDocumentShell chrome + verbatim legal copy on /privacy and
 * /terms after the Wave A shell extract. Body content must stay byte-identical
 * to pre-extract pages (LEGAL-SYNC honesty — zero tolerance for copy drift).
 */

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { LegalDocumentShell } from "@/components/LegalDocumentShell";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";

jest.mock("next/link", () => {
  return function MockLink({
    href,
    children,
    className,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <a href={href} className={className} {...rest}>
        {children}
      </a>
    );
  };
});

jest.mock("@/components/marketing/MarketingHeader", () => ({
  MarketingHeader: function MockMarketingHeader() {
    return <header data-testid="marketing-header" />;
  },
}));

describe("LegalDocumentShell", () => {
  it("renders MarketingHeader, main chrome, title, Last updated, and children", () => {
    render(
      <LegalDocumentShell title="Privacy Policy" lastUpdated="July 9, 2026">
        <p>shell-child-probe</p>
      </LegalDocumentShell>
    );

    expect(screen.getByTestId("marketing-header")).toBeInTheDocument();

    const main = document.querySelector("main#main-content");
    expect(main).not.toBeNull();
    expect(main).toHaveClass("px-4", "py-10");

    const widthWrap = main!.querySelector(".mx-auto.w-full.max-w-3xl");
    expect(widthWrap).not.toBeNull();

    expect(document.querySelector('[data-slot="card"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="card-header"]')).not.toBeNull();

    const title = document.querySelector('[data-slot="card-title"]');
    expect(title).not.toBeNull();
    expect(title).toHaveClass("heading", "text-3xl", "font-normal");
    expect(title).toHaveTextContent("Privacy Policy");

    const lastUpdated = screen.getByText("Last updated: July 9, 2026");
    expect(lastUpdated).toHaveClass("text-sm", "text-muted-foreground");

    const content = document.querySelector('[data-slot="card-content"]');
    expect(content).not.toBeNull();
    expect(content).toHaveClass("space-y-4");
    expect(within(content as HTMLElement).getByText("shell-child-probe")).toBeInTheDocument();
  });
});

describe("Privacy page — shell + verbatim legal copy", () => {
  it("keeps exact title, Last updated, chrome, and key legal sentences", () => {
    render(<PrivacyPage />);

    expect(screen.getByTestId("marketing-header")).toBeInTheDocument();
    expect(document.querySelector("main#main-content")).toHaveClass("px-4", "py-10");
    expect(document.querySelector('[data-slot="card-title"]')).toHaveTextContent(
      "Privacy Policy"
    );
    expect(screen.getByText("Last updated: November 18, 2026")).toBeInTheDocument();
    expect(screen.queryByText("Last updated: November 17, 2026")).toBeNull();
    expect(screen.queryByText("Last updated: October 12, 2026")).toBeNull();
    expect(
      screen.getByText(
        "During the session, the tutor and the student can both see when audio recording, the whiteboard, or notes are off."
      )
    ).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toContain("which of these are off");

    // Verbatim body locks (distinctive product / umbrella sentences)
    expect(
      screen.getByText(/This policy applies to/, { exact: false })
    ).toHaveTextContent(
      "This policy applies to Mynk, also titled Tutoring Notes, a web application operated by Andrew Mortensen under the Mortensen Apps umbrella. It supplements the umbrella privacy policy at www.mortensenapps.com/privacy with product-specific details. Where this policy is silent, the umbrella policy governs."
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "What Mynk is" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Mynk is the web application these pages describe. It is also titled Tutoring Notes. It helps private tutors run a shared whiteboard session, record what the privacy settings allow, and draft notes when notes are on. When the tutor saves, the parent and student can see what was recorded. That save can be notes and a replay, or a replay with no notes."
      )
    ).toBeInTheDocument();
    const privacyBodyEarly = document.body.textContent ?? "";
    expect(privacyBodyEarly).not.toContain("record it, and draft the notes");
    expect(privacyBodyEarly).not.toContain(
      "transcribed by OpenAI and the notes are drafted automatically"
    );
    expect(privacyBodyEarly).not.toContain(
      "Automated retention schedules may be introduced in the future"
    );
    expect(privacyBodyEarly).not.toContain("before a live session");
    expect(privacyBodyEarly).not.toContain(
      "timestamped stroke logs, optional PDF / image inserts, and a session snapshot used for the parent replay surface"
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "AI note generation (OpenAI)" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Session audio recordings (Vercel Blob)",
      })
    ).toBeInTheDocument();

    // Strong-tagged COPPA retention sentence (whitespace-normalized)
    const retentionStrong = Array.from(document.querySelectorAll("strong")).find(
      (el) =>
        el.textContent?.replace(/\s+/g, " ").trim() ===
        "We do not retain children’s personal information indefinitely."
    );
    expect(retentionStrong).toBeTruthy();

    const limitedUseStrong = Array.from(document.querySelectorAll("strong")).find(
      (el) => el.textContent?.trim() === "Limited use of Google data."
    );
    expect(limitedUseStrong).toBeTruthy();

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /Children.s data and parental rights \(COPPA\)/,
      })
    ).toBeInTheDocument();

    const home = screen.getByRole("link", { name: "Home" });
    expect(home).toHaveAttribute("href", "/");
    const terms = screen.getByRole("link", { name: "Terms" });
    expect(terms).toHaveAttribute("href", "/terms");
    const umbrella = screen.getByRole("link", { name: "Umbrella privacy policy" });
    expect(umbrella).toHaveAttribute(
      "href",
      "https://www.mortensenapps.com/privacy"
    );

    const privacyBody = document.body.textContent ?? "";
    expect(privacyBody).toMatch(
      /do not sell or share SMS opt-in data or personal information with third parties for marketing purposes/i
    );
  });
});

describe("Terms page — shell + verbatim legal copy", () => {
  it("keeps exact title, Last updated, chrome, and key legal sentences", () => {
    render(<TermsPage />);

    expect(screen.getByTestId("marketing-header")).toBeInTheDocument();
    expect(document.querySelector("main#main-content")).toHaveClass("px-4", "py-10");
    expect(document.querySelector('[data-slot="card-title"]')).toHaveTextContent(
      "Terms of Use"
    );
    expect(screen.getByText("Last updated: November 17, 2026")).toBeInTheDocument();
    expect(screen.queryByText("Last updated: October 12, 2026")).toBeNull();

    expect(
      screen.getByText(/These terms govern your use of/, { exact: false })
    ).toHaveTextContent(
      // Page uses &ldquo;/&rdquo; — assert the decoded curly-quote form
      "These terms govern your use of Mynk, also titled Tutoring Notes, a web application operated by Andrew Mortensen (“Operator,” “we,” “us”) under the Mortensen Apps umbrella. They supplement the umbrella terms of service at www.mortensenapps.com/terms. By using the app, you agree to these terms."
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Eligibility and accounts" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/You must be able to form a binding contract/, {
        exact: false,
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { level: 2, name: "Gmail integration" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Google Calendar integration" })
    ).toBeInTheDocument();
    const termsBody = document.body.textContent ?? "";
    expect(termsBody).not.toMatch(/not live yet/i);
    expect(termsBody).toMatch(/calendar\.events\.owned/);
    expect(
      screen.getByText(
        /If you connect your Gmail account, the app sends email on your behalf only when you click Email a reminder/
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { level: 2, name: "Limitation of liability" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /fifty U\.S\.\s*dollars, if you have not paid a fee\./
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { level: 2, name: "Indemnity" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /You will defend and indemnify the Operator against claims arising from/
      )
    ).toBeInTheDocument();

    const home = screen.getByRole("link", { name: "Home" });
    expect(home).toHaveAttribute("href", "/");
    const privacy = screen.getByRole("link", { name: "Privacy" });
    expect(privacy).toHaveAttribute("href", "/privacy");
    const umbrella = screen.getByRole("link", { name: "Umbrella terms of service" });
    expect(umbrella).toHaveAttribute(
      "href",
      "https://www.mortensenapps.com/terms"
    );

    expect(termsBody).toContain(
      "record what the privacy settings allow, and draft notes when notes are on"
    );
    expect(termsBody).not.toContain("record it, and draft the notes");
    expect(termsBody).not.toContain("before a live session");
    expect(termsBody).not.toContain("when you finalize a note");
    expect(termsBody).toContain("Mynk completes that request within 30 days.");
    expect(termsBody).toContain(
      "when session notes are on, processing that audio through the transcription provider"
    );
    expect(termsBody).toMatch(/Message and data rates may apply/i);
    expect(termsBody).toMatch(/\bSTOP\b/);
    expect(termsBody).toMatch(/\bHELP\b/);
    expect(
      screen.getByRole("heading", { level: 2, name: "Mynk two-factor texts (SMS)" })
    ).toBeInTheDocument();
  });
});
