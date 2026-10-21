import {
  endMatchesPlannedLength,
  endTimeForPlannedLength,
  hhmmToMinutes,
  isLongSessionSpan,
  sessionSpanMinutes,
} from "@/lib/schedule/planned-end-time";

describe("hhmmToMinutes", () => {
  it("converts zero-padded 24h clock times", () => {
    expect(hhmmToMinutes("00:00")).toBe(0);
    expect(hhmmToMinutes("23:59")).toBe(23 * 60 + 59);
  });

  it("rejects malformed or out-of-range clocks", () => {
    expect(hhmmToMinutes("9:00")).toBeNull();
    expect(hhmmToMinutes("24:00")).toBeNull();
    expect(hhmmToMinutes("12:60")).toBeNull();
  });
});

describe("sessionSpanMinutes", () => {
  it("measures a same-day span", () => {
    expect(sessionSpanMinutes("16:00", "17:30")).toBe(90);
  });

  it("measures an end clock before the start as ending the next day", () => {
    expect(sessionSpanMinutes("23:30", "01:00")).toBe(90);
    expect(sessionSpanMinutes("10:00", "09:00")).toBe(23 * 60);
  });

  it("is zero for equal clocks and null for malformed input", () => {
    expect(sessionSpanMinutes("16:00", "16:00")).toBe(0);
    expect(sessionSpanMinutes("4:00", "05:00")).toBeNull();
  });
});

describe("isLongSessionSpan", () => {
  it("does not flag a normal lesson, including one crossing midnight", () => {
    expect(isLongSessionSpan("16:00", "17:00")).toBe(false);
    expect(isLongSessionSpan("23:30", "01:00")).toBe(false);
    expect(isLongSessionSpan("12:00", "16:00")).toBe(false);
  });

  it("flags a span over four hours, same day or overnight", () => {
    expect(isLongSessionSpan("12:00", "16:01")).toBe(true);
    expect(isLongSessionSpan("10:00", "09:00")).toBe(true);
    expect(isLongSessionSpan("14:00", "03:00")).toBe(true);
  });
});

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
