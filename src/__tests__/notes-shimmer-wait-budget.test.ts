import { OUT_OF_TX_HOLD_CAP_MS } from "@/lib/test-seams";
import { IN_FLIGHT_NOTES_UI_WAIT_MS } from "../../tests/helpers/notes-shimmer-budget";

describe("in-flight notes UI wait vs the out-of-tx hold cap", () => {
  test("the wait budget stays at least 15s under the 30s cap", () => {
    expect(OUT_OF_TX_HOLD_CAP_MS).toBe(30_000);
    expect(OUT_OF_TX_HOLD_CAP_MS - IN_FLIGHT_NOTES_UI_WAIT_MS).toBeGreaterThanOrEqual(
      15_000
    );
    expect(IN_FLIGHT_NOTES_UI_WAIT_MS).toBeGreaterThan(0);
  });
});
