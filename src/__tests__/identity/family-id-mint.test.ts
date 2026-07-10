import {
  extractSurnameSeed,
  familyIdCandidates,
  pickFamilyIdWithPredicate,
  slugifyFamilyIdBase,
} from "@/lib/family-id";

describe("familyId minting (pure)", () => {
  describe("slugifyFamilyIdBase", () => {
    it("slugifies surname to lowercase alphanumerics only", () => {
      expect(slugifyFamilyIdBase("Mortensen")).toBe("mortensen");
      expect(slugifyFamilyIdBase("Mc Family")).toBe("mcfamily");
      expect(slugifyFamilyIdBase("  O'Brien  ")).toBe("obrien");
    });

    it("returns empty for degenerate input (caller uses family fallback)", () => {
      expect(slugifyFamilyIdBase("---")).toBe("");
      expect(slugifyFamilyIdBase("")).toBe("");
    });
  });

  describe("extractSurnameSeed", () => {
    it("uses last word of display name as surname", () => {
      expect(extractSurnameSeed("Sarah Mortensen", "s@m.com")).toBe("Mortensen");
    });

    it("falls back to email local-part when no display name", () => {
      expect(extractSurnameSeed(null, "smith@example.com")).toBe("smith");
    });
  });

  describe("pickFamilyIdWithPredicate", () => {
    it("returns bare base when nothing is taken", () => {
      const id = pickFamilyIdWithPredicate("Mortensen", () => false);
      expect(id).toBe("mortensen");
    });

    it("uses numeric suffix 2 then 3 on collision", () => {
      const taken = new Set(["mortensen", "mortensen2"]);
      const id = pickFamilyIdWithPredicate("Mortensen", (c) => taken.has(c));
      expect(id).toBe("mortensen3");
    });

    it("uses family fallback when surname slug is empty", () => {
      const id = pickFamilyIdWithPredicate("---", () => false);
      expect(id).toBe("family");
    });

    it("family fallback gets numeric suffix on collision", () => {
      const id = pickFamilyIdWithPredicate("---", (c) => c === "family");
      expect(id).toBe("family2");
    });
  });

  describe("familyIdCandidates", () => {
    it("yields bare then 2, 3 in order", () => {
      const list = [...familyIdCandidates("mortensen")];
      expect(list[0]).toBe("mortensen");
      expect(list[1]).toBe("mortensen2");
      expect(list[2]).toBe("mortensen3");
    });
  });
});
