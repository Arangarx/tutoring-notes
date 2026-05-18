import { mapWithConcurrency } from "@/lib/transcribe";

describe("mapWithConcurrency", () => {
  test("preserves output order by index", async () => {
    const items = [0, 1, 2];
    const got = await mapWithConcurrency(items, 3, async (n, idx) => {
      await new Promise((r) => setTimeout(r, (3 - idx) * 15));
      return `v${n}`;
    });
    expect(got).toEqual(["v0", "v1", "v2"]);
  });

  test("respects concurrency ceiling", async () => {
    let inflight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      inflight++;
      peak = Math.max(peak, inflight);
      await new Promise((r) => setTimeout(r, 10));
      inflight--;
      return 1;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });
});
