import {
  TIME_INPUT_STEP_SECONDS,
  formatLocalTimeSnapped,
  formatUtcTimeSnapped,
} from "@/lib/time/snap";

/**
 * Independent oracle — nearest 5-minute boundary (BILL-04 / P2-J2).
 * Duplicated here on purpose so tests never back-derive from impl exports.
 */
function oracleSnapHHMM(hours: number, minutes: number): string {
  const totalMin = hours * 60 + minutes;
  const snapped = Math.round(totalMin / 5) * 5;
  const wrapped = ((snapped % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = Math.floor(wrapped / 60)
    .toString()
    .padStart(2, "0");
  const mm = (wrapped % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Sarah-feedback regression: time pickers must use 5-minute increments,
 * AND prefilled / historical values must snap onto the same grid so
 * HTML5 `step` validation doesn't reject them on submit.
 *
 * If anyone changes the grid (e.g. back to 1-min for "precision") this
 * suite will fail and force them to also revisit Wyzant-parity intent.
 */
describe("time/snap — 5-minute grid for tutor time inputs", () => {
  it("ships a 5-minute step constant (300 seconds)", () => {
    expect(TIME_INPUT_STEP_SECONDS).toBe(300);
  });

  describe("formatUtcTimeSnapped", () => {
    it("returns empty for null", () => {
      expect(formatUtcTimeSnapped(null)).toBe("");
    });

    it("leaves on-grid values alone", () => {
      const d = new Date(Date.UTC(2026, 3, 22, 10, 55, 0));
      expect(formatUtcTimeSnapped(d)).toBe("10:55");
    });

    it("snaps a 10:53 end time UP to 10:55 (Sarah's exact case)", () => {
      const d = new Date(Date.UTC(2026, 3, 22, 10, 53, 0));
      expect(formatUtcTimeSnapped(d)).toBe("10:55");
    });

    it("snaps a 10:52 end time DOWN to 10:50", () => {
      const d = new Date(Date.UTC(2026, 3, 22, 10, 52, 0));
      expect(formatUtcTimeSnapped(d)).toBe("10:50");
    });

    it("rolls 23:58 over to 00:00 cleanly (no NaN, no negative)", () => {
      const d = new Date(Date.UTC(2026, 3, 22, 23, 58, 0));
      expect(formatUtcTimeSnapped(d)).toBe("00:00");
    });

    it("zero-pads single-digit hours and minutes", () => {
      const d = new Date(Date.UTC(2026, 3, 22, 4, 2, 0));
      expect(formatUtcTimeSnapped(d)).toBe("04:00");
    });

    it("snaps 14:07 DOWN to 14:05 (BILL-04 boundary)", () => {
      const d = new Date(Date.UTC(2026, 3, 22, 14, 7, 0));
      const expected = oracleSnapHHMM(14, 7);
      expect(expected).toBe("14:05");
      expect(formatUtcTimeSnapped(d)).toBe(expected);
    });

    it("snaps 14:03 UP to 14:05 (half-step tie rounds up)", () => {
      const d = new Date(Date.UTC(2026, 3, 22, 14, 3, 0));
      expect(formatUtcTimeSnapped(d)).toBe(oracleSnapHHMM(14, 3));
      expect(formatUtcTimeSnapped(d)).toBe("14:05");
    });

    it("snaps 14:02 DOWN to 14:00 (half-step tie rounds down)", () => {
      const d = new Date(Date.UTC(2026, 3, 22, 14, 2, 0));
      expect(formatUtcTimeSnapped(d)).toBe(oracleSnapHHMM(14, 2));
      expect(formatUtcTimeSnapped(d)).toBe("14:00");
    });

    it("leaves on-grid 14:05 unchanged", () => {
      const d = new Date(Date.UTC(2026, 3, 22, 14, 5, 0));
      expect(formatUtcTimeSnapped(d)).toBe("14:05");
    });
  });

  describe("formatLocalTimeSnapped", () => {
    it("returns empty for null", () => {
      expect(formatLocalTimeSnapped(null)).toBe("");
    });

    it("returns empty for an invalid Date", () => {
      expect(formatLocalTimeSnapped(new Date("not a date"))).toBe("");
    });

    it("snaps using LOCAL hours/minutes (not UTC)", () => {
      // Build a Date whose LOCAL wall-clock is 14:53 regardless of the
      // host's TZ, then assert the snap landed on 14:55. Using the
      // local-time constructor ensures Date#getHours/getMinutes return
      // 14/53 even on CI runners in UTC.
      const d = new Date(2026, 3, 22, 14, 53, 0);
      expect(formatLocalTimeSnapped(d)).toBe("14:55");
    });

    it("snaps local 14:07 to 14:05 (BILL-04 Sarah rounding)", () => {
      const d = new Date(2026, 3, 22, 14, 7, 0);
      expect(formatLocalTimeSnapped(d)).toBe(oracleSnapHHMM(14, 7));
      expect(formatLocalTimeSnapped(d)).toBe("14:05");
    });

    it("wraps local 23:58 to 00:00 past midnight", () => {
      const d = new Date(2026, 3, 22, 23, 58, 0);
      expect(formatLocalTimeSnapped(d)).toBe(oracleSnapHHMM(23, 58));
      expect(formatLocalTimeSnapped(d)).toBe("00:00");
    });
  });
});
