import { maskEmailForDisplay } from "@/lib/mask-email";

describe("maskEmailForDisplay", () => {
  it("keeps the first character, the domain's first character, and the TLD", () => {
    expect(maskEmailForDisplay("andrew@domain.com")).toBe("a***@d***.com");
    expect(maskEmailForDisplay("Ada@Example.ORG")).toBe("A***@E***.ORG");
  });

  it("does not return the full local part or domain", () => {
    const masked = maskEmailForDisplay("playwright-parent-login@test.local");
    expect(masked).toBe("p***@t***.local");
    expect(masked).not.toContain("playwright");
    expect(masked).not.toContain("parent");
    expect(masked).not.toContain("test");
  });
});
