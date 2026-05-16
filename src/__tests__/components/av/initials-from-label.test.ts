import {
  getDeterministicColorFromPeerId,
  getInitialsFromLabel,
  _testing,
} from "@/components/av/initials-from-label";

describe("getInitialsFromLabel — Phase 4d initials placeholder", () => {
  test.each([
    ["Sarah", "tutor", "S"],
    ["Sarah Johnson", "student", "SJ"],
    ["Liam P. Mortensen", "student", "LM"],
    ["李明", "student", "李"], // CJK single character — Unicode letter
    ["  Anya   Petrov  ", "student", "AP"], // collapses whitespace
    ["x", "student", "X"], // single letter normalises to uppercase
  ] as const)(
    "%s (role=%s) → %s",
    (label, role, expected) => {
      expect(getInitialsFromLabel(label, role as "tutor" | "student")).toBe(
        expected
      );
    }
  );

  test("empty / whitespace / nullish label falls back to role initial", () => {
    expect(getInitialsFromLabel("", "tutor")).toBe("T");
    expect(getInitialsFromLabel("   ", "student")).toBe("S");
    expect(getInitialsFromLabel(undefined, "tutor")).toBe("T");
    expect(getInitialsFromLabel(null, "student")).toBe("S");
  });

  test("nullish label AND missing role falls back to '?'", () => {
    expect(getInitialsFromLabel(undefined)).toBe("?");
    expect(getInitialsFromLabel(null)).toBe("?");
    expect(getInitialsFromLabel("")).toBe("?");
  });

  test("punctuation-only segments skip to the first alphanumeric character", () => {
    // "  .Liam  --  Mortensen!" → first word starts with `.` then L;
    // last word starts with M.
    expect(getInitialsFromLabel(".Liam -- Mortensen!", "student")).toBe("LM");
  });

  test("middle words are skipped — only first + last contribute initials", () => {
    expect(
      getInitialsFromLabel("Alpha Beta Gamma Delta", "student")
    ).toBe("AD");
  });
});

describe("getDeterministicColorFromPeerId — stable palette hash", () => {
  test("same peerId always returns the same colour (deterministic)", () => {
    const first = getDeterministicColorFromPeerId("peer-abc-123");
    const second = getDeterministicColorFromPeerId("peer-abc-123");
    expect(first).toBe(second);
  });

  test("returns a colour from the published palette (no off-palette drift)", () => {
    const samples = [
      "peer-1",
      "peer-2",
      "peer-3",
      "peer-a",
      "peer-b",
      "peer-c",
      "peer-d",
      "peer-e",
      "peer-f",
      "00000000-1111-2222-3333-444444444444",
    ];
    for (const id of samples) {
      expect(_testing.PALETTE).toContain(getDeterministicColorFromPeerId(id));
    }
  });

  test("hash distributes across the full palette over a moderate sample", () => {
    // 200 random-ish peer IDs should cover every slot at least
    // once. Tight pass condition: at least 6 of 8 slots seen.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(getDeterministicColorFromPeerId(`peer-${i}-suffix-${i * 7}`));
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  test("adjacent inputs (peer-1, peer-2, peer-3) do not all collide on one slot", () => {
    const colors = ["peer-1", "peer-2", "peer-3", "peer-4"].map(
      getDeterministicColorFromPeerId
    );
    const unique = new Set(colors);
    expect(unique.size).toBeGreaterThan(1);
  });

  test("hash is safe on empty and pathological inputs (returns palette[0])", () => {
    expect(getDeterministicColorFromPeerId("")).toBe(_testing.PALETTE[0]);
    expect(getDeterministicColorFromPeerId(undefined as unknown as string)).toBe(
      _testing.PALETTE[0]
    );
    expect(getDeterministicColorFromPeerId(null as unknown as string)).toBe(
      _testing.PALETTE[0]
    );
  });
});
