/**
 * Pilot limits a stranger must be able to read before signup.
 * The sentences are the product facts, not a copy of the renderer.
 */

import {
  PRODUCT_TODAY_PAGE_TITLE,
  productTodayItems,
} from "@/lib/known-issues-roadmap-content";

function limitsText(): string {
  return productTodayItems.map((item) => `${item.title}. ${item.body}`).join("\n");
}

describe("product today limits", () => {
  it("states the pilot limits in one content source", () => {
    const text = limitsText();
    expect(PRODUCT_TODAY_PAGE_TITLE).toBe("What Mynk does today");
    expect(text).toMatch(/English only/i);
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

  it("does not claim Spanish transcription or approval without a review", () => {
    const text = limitsText();
    expect(text).not.toMatch(/Spanish is available/i);
    expect(text).not.toMatch(/transcription supports Spanish/i);
    expect(text).not.toMatch(/notes support Spanish/i);
    expect(text).not.toMatch(/approved instantly/i);
    expect(text).not.toMatch(/no approval/i);
    expect(text).toMatch(/Spanish is next/i);
  });
});
