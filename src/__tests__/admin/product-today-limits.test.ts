/**
 * Pilot limits a stranger must be able to read before signup.
 * Today states what is true now. The roadmap states planned direction.
 * The sentences are the product facts, not a copy of the renderer.
 */

import {
  PRODUCT_TODAY_PAGE_TITLE,
  knownIssuesIntro,
  knownIssuesItems,
  productTodayItems,
  recentlyImprovedSections,
  roadmapItems,
} from "@/lib/known-issues-roadmap-content";

const ENGLISH_ONLY = "Session notes and transcription support English only.";
const SPANISH_NEXT =
  "Spanish support for automatic notes is next, then more languages.";

function todayText(): string {
  return productTodayItems.map((item) => `${item.title}. ${item.body}`).join("\n");
}

function roadmapText(): string {
  return roadmapItems.map((parts) => parts.map((part) => part.text).join("")).join("\n");
}

function knownText(): string {
  return [knownIssuesIntro, ...knownIssuesItems.map((item) => `${item.title}. ${item.body}`)].join(
    "\n"
  );
}

function improvedText(): string {
  return recentlyImprovedSections.flatMap((section) => section.items).join("\n");
}

describe("product today limits", () => {
  it("states the pilot limits in one content source", () => {
    const text = todayText();
    expect(PRODUCT_TODAY_PAGE_TITLE).toBe("What Mynk does today");
    expect(text).toContain(ENGLISH_ONLY);
    expect(text).not.toMatch(/Spanish/i);
    expect(text).toMatch(/notes/i);
    expect(text).toMatch(/transcription/i);
    expect(text).toMatch(/approved by Mynk/i);
    expect(text).toMatch(/accept the invite/i);
    expect(text).toMatch(/privacy settings/i);
    expect(text).toMatch(/online or in person/i);
    expect(text).toMatch(/Chrome/);
    expect(text).toMatch(/Edge/);
    expect(text).toMatch(/Safari/);
    expect(text).toMatch(/phone/i);
    expect(text).toMatch(/\bfree\b/i);
  });

  it("puts Spanish on the roadmap and does not claim it works today", () => {
    const today = todayText();
    const roadmap = roadmapText();
    expect(roadmap).toContain(SPANISH_NEXT);
    expect(today).not.toMatch(/Spanish/i);
    expect(roadmap).not.toMatch(/Spanish is available/i);
    expect(roadmap).not.toMatch(/transcription supports Spanish/i);
    expect(roadmap).not.toMatch(/notes support Spanish/i);
    expect(today).not.toMatch(/approved instantly/i);
    expect(today).not.toMatch(/no approval/i);
  });

  it("does not list shipped work or unplanned items as coming", () => {
    const roadmap = roadmapText();
    const known = knownText();
    const improved = improvedText();
    const publicCopy = `${todayText()}\n${roadmap}\n${known}\n${improved}`;

    expect(roadmap).not.toMatch(/tutor settings/i);
    expect(roadmap).not.toMatch(/automatic updates/i);
    expect(roadmap).not.toMatch(/hard-refresh/i);
    expect(roadmap).not.toMatch(/richer billing/i);
    expect(roadmap).not.toMatch(/continued polish/i);
    expect(publicCopy).not.toMatch(/calculus/i);
    expect(known).not.toMatch(/PDF boards/i);
    expect(known).not.toMatch(/Empty review screen/i);
    expect(known).not.toMatch(/working on a fix/i);
    expect(knownIssuesIntro).not.toMatch(/We're on it/);
    expect(improved).not.toMatch(/start from the beginning/i);
  });
});
