/**
 * @jest-environment node
 *
 * Spec lock for getCookieFromRequest — canonical cookie reader used by
 * learner-session and account-holder-session auth paths.
 *
 * Independent oracle: expected values are the literal cookie strings we put
 * on the request (or null). Not derived from the implementation under test.
 */

import { getCookieFromRequest } from "@/lib/http/cookies";

/** Minimal NextRequest-shaped stand-in: cookies.get(name) → { value } | undefined */
function nextRequestLike(
  cookies: Record<string, string | undefined>
): { cookies: { get: (name: string) => { value: string } | undefined }; headers: Headers } {
  return {
    cookies: {
      get(name: string) {
        const value = cookies[name];
        return value === undefined ? undefined : { value };
      },
    },
    headers: new Headers(),
  };
}

function plainRequest(cookieHeader: string | null): Request {
  const headers = new Headers();
  if (cookieHeader !== null) {
    headers.set("cookie", cookieHeader);
  }
  return new Request("http://localhost/", { headers });
}

describe("getCookieFromRequest", () => {
  describe("NextRequest-style (cookies.get)", () => {
    it("returns the cookie value when present", () => {
      const req = nextRequestLike({ mynk_ah_session: "token-abc" });
      expect(getCookieFromRequest(req as never, "mynk_ah_session")).toBe("token-abc");
    });

    it("returns null when the named cookie is absent", () => {
      const req = nextRequestLike({ other: "x" });
      expect(getCookieFromRequest(req as never, "mynk_ah_session")).toBeNull();
    });

    it("returns null when cookies.get returns undefined", () => {
      const req = nextRequestLike({});
      expect(getCookieFromRequest(req as never, "mynk_learner_session")).toBeNull();
    });
  });

  describe("plain Request (Cookie header parse)", () => {
    it("returns the cookie value when present", () => {
      const req = plainRequest("mynk_learner_session=raw-token-1");
      expect(getCookieFromRequest(req, "mynk_learner_session")).toBe("raw-token-1");
    });

    it("returns null when Cookie header is absent", () => {
      const req = plainRequest(null);
      expect(getCookieFromRequest(req, "mynk_ah_session")).toBeNull();
    });

    it("returns null when Cookie header is empty string", () => {
      const req = plainRequest("");
      expect(getCookieFromRequest(req, "mynk_ah_session")).toBeNull();
    });

    it("returns null when the named cookie is not among present cookies", () => {
      const req = plainRequest("foo=1; bar=2");
      expect(getCookieFromRequest(req, "mynk_ah_session")).toBeNull();
    });

    it("parses multiple cookies separated by semicolons", () => {
      const req = plainRequest("a=1; mynk_ah_session=ah-tok; b=2");
      expect(getCookieFromRequest(req, "mynk_ah_session")).toBe("ah-tok");
    });

    it("tolerates spaces around cookie pairs", () => {
      const req = plainRequest("  foo=1 ;  mynk_learner_session=spaced-tok  ; bar=2 ");
      expect(getCookieFromRequest(req, "mynk_learner_session")).toBe("spaced-tok");
    });

    it("returns first match when duplicate cookie names appear (linear scan)", () => {
      // Locks the historical first-match behavior both session modules used.
      const req = plainRequest(
        "mynk_ah_session=first-value; mynk_ah_session=second-value"
      );
      expect(getCookieFromRequest(req, "mynk_ah_session")).toBe("first-value");
    });

    it("preserves values that contain '=' (split only on first '=')", () => {
      const req = plainRequest("mynk_ah_session=abc=def=ghi");
      expect(getCookieFromRequest(req, "mynk_ah_session")).toBe("abc=def=ghi");
    });
  });
});
