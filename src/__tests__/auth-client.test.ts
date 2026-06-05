import { parseRetryAfterSeconds } from "@/lib/auth-client";

function mockResponse(retryAfter: string | null, status = 429): Response {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status,
    headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
  });
}

describe("parseRetryAfterSeconds", () => {
  it("reads Retry-After header", () => {
    expect(parseRetryAfterSeconds(mockResponse("37"))).toBe(37);
  });

  it("falls back when header missing or invalid", () => {
    expect(parseRetryAfterSeconds(mockResponse(null))).toBe(60);
    expect(parseRetryAfterSeconds(mockResponse("0"))).toBe(60);
    expect(parseRetryAfterSeconds(mockResponse("nope"))).toBe(60);
  });
});
