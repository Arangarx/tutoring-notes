import { firstNameLastInitial } from "@/lib/display-name-prefill";

describe("firstNameLastInitial", () => {
  it("returns empty for blank input", () => {
    expect(firstNameLastInitial("")).toBe("");
    expect(firstNameLastInitial(null)).toBe("");
  });

  it("returns single name unchanged", () => {
    expect(firstNameLastInitial("Madison")).toBe("Madison");
  });

  it("returns first name and last initial", () => {
    expect(firstNameLastInitial("Jordan Smith")).toBe("Jordan S.");
  });
});
