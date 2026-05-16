import { resolveParticipantLabel } from "@/lib/whiteboard/participant-label";

describe("resolveParticipantLabel — Phase 4d single-student name fallback", () => {
  test("single student peer + known studentName → returns the studentName", () => {
    expect(
      resolveParticipantLabel(
        { role: "student" },
        { studentName: "Liam Mortensen", totalRemotePeers: 1 }
      )
    ).toBe("Liam Mortensen");
  });

  test("multi-peer room (>1) → returns undefined (peerId-derived fallback kicks in)", () => {
    expect(
      resolveParticipantLabel(
        { role: "student" },
        { studentName: "Liam", totalRemotePeers: 2 }
      )
    ).toBeUndefined();
    expect(
      resolveParticipantLabel(
        { role: "student" },
        { studentName: "Liam", totalRemotePeers: 5 }
      )
    ).toBeUndefined();
  });

  test("zero remote peers → returns undefined (no one to label)", () => {
    expect(
      resolveParticipantLabel(
        { role: "student" },
        { studentName: "Liam", totalRemotePeers: 0 }
      )
    ).toBeUndefined();
  });

  test("studentName missing / empty / whitespace-only → returns undefined", () => {
    for (const studentName of [undefined, "", "   ", "\t\n"]) {
      expect(
        resolveParticipantLabel(
          { role: "student" },
          { studentName, totalRemotePeers: 1 }
        )
      ).toBeUndefined();
    }
  });

  test("tutor-role peer → returns undefined by default (we only re-label students)", () => {
    expect(
      resolveParticipantLabel(
        { role: "tutor" },
        { studentName: "Liam", totalRemotePeers: 1 }
      )
    ).toBeUndefined();
  });

  test("tutor-role peer WITH applyToTutors=true → falls back to studentName (future-proof seam)", () => {
    // Today this is only used as a future-proofing affordance.
    expect(
      resolveParticipantLabel(
        { role: "tutor" },
        { studentName: "Liam", totalRemotePeers: 1, applyToTutors: true }
      )
    ).toBe("Liam");
  });

  test("studentName with leading/trailing whitespace is trimmed", () => {
    expect(
      resolveParticipantLabel(
        { role: "student" },
        { studentName: "  Liam  ", totalRemotePeers: 1 }
      )
    ).toBe("Liam");
  });

  test("invariant: never returns an empty string — undefined or non-empty only", () => {
    const cases: Array<Parameters<typeof resolveParticipantLabel>> = [
      [{ role: "student" }, { studentName: undefined, totalRemotePeers: 1 }],
      [{ role: "student" }, { studentName: "", totalRemotePeers: 1 }],
      [{ role: "student" }, { studentName: "Liam", totalRemotePeers: 0 }],
      [{ role: "tutor" }, { studentName: "Liam", totalRemotePeers: 1 }],
      [{ role: "student" }, { studentName: "Liam", totalRemotePeers: 1 }],
    ];
    for (const [participant, ctx] of cases) {
      const got = resolveParticipantLabel(participant, ctx);
      if (got !== undefined) {
        expect(got).not.toBe("");
        expect(got.trim()).toBe(got);
      }
    }
  });
});
