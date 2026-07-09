/**
 * @jest-environment node
 */

import { DEFAULT_ROUNDING_MODE } from "@/lib/billing/defaults";

describe("billing defaults", () => {
  it("defaults rounding direction to up for new tutors", () => {
    expect(DEFAULT_ROUNDING_MODE).toBe("up");
  });
});
