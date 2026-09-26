import {
  endMatchesPlannedLength,
  endTimeForPlannedLength,
} from "@/lib/schedule/planned-end-time";

describe("endTimeForPlannedLength", () => {
  it("adds the planned length to the start", () => {
    expect(endTimeForPlannedLength("16:00", 60)).toBe("17:00");
    expect(endTimeForPlannedLength("16:15", 45)).toBe("17:00");
    expect(endTimeForPlannedLength("15:00", 90)).toBe("16:30");
  });

  it("wraps past midnight as a clock time", () => {
    expect(endTimeForPlannedLength("23:30", 90)).toBe("01:00");
  });

  it("rejects a start that is not HH:MM", () => {
    expect(endTimeForPlannedLength("4:00", 60)).toBeNull();
    expect(endTimeForPlannedLength("", 60)).toBeNull();
  });
});

describe("endMatchesPlannedLength", () => {
  it("is true only when end is exactly start plus the planned length", () => {
    expect(endMatchesPlannedLength("16:00", "17:00", 60)).toBe(true);
    expect(endMatchesPlannedLength("16:00", "17:30", 60)).toBe(false);
  });
});
