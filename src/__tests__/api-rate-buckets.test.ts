import { apiRateBucketForPath } from "@/lib/security/api-rate-buckets";

describe("apiRateBucketForPath", () => {
  test("whiteboard session poll routes use wb-poll bucket", () => {
    const id = "e1bdb258-6548-4ce8-827f-25ccf092e139";
    for (const seg of ["active-ping", "timer-anchor", "join-timer"] as const) {
      const b = apiRateBucketForPath(`/api/whiteboard/${id}/${seg}`);
      expect(b.prefix).toBe("api-wb-poll");
      expect(b.max).toBeGreaterThan(30);
    }
  });

  test("other API paths stay on default bucket", () => {
    const b = apiRateBucketForPath("/api/whiteboard/e1bdb258/snapshot");
    expect(b.prefix).toBe("api");
    expect(b.max).toBe(30);
  });
});
