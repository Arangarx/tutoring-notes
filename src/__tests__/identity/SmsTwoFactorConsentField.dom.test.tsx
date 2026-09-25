/**
 * @jest-environment jsdom
 *
 * The consent sentence is one paragraph. Separate flex children lay the
 * words and the Privacy / Terms links out in columns.
 */

import { render } from "@testing-library/react";

import { SmsTwoFactorConsentField } from "@/components/identity/SmsTwoFactorConsentField";

describe("SmsTwoFactorConsentField", () => {
  it("keeps the consent sentence and legal links in one text block", () => {
    render(
      <SmsTwoFactorConsentField
        id="sms-consent"
        checked={false}
        onCheckedChange={() => {}}
      />
    );

    const label = document.querySelector("label[for='sms-consent']");
    expect(label).toBeTruthy();
    const block = Array.from(label!.children).find((el) => el.tagName === "SPAN");
    expect(block).toBeTruthy();
    expect(block).toHaveTextContent("Reply STOP to opt out");
    expect(block!.querySelector("a[href='/privacy']")).toHaveTextContent("Privacy Policy");
    expect(block!.querySelector("a[href='/terms']")).toHaveTextContent("Terms of Use");
    expect(Array.from(label!.children).some((el) => el.tagName === "A" || el.tagName === "STRONG")).toBe(
      false
    );
  });
});
