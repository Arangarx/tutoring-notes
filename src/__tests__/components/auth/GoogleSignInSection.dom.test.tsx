/**
 * @jest-environment jsdom
 *
 * Clicking Sign up / Sign in with Google must POST to NextAuth.
 * A GET of /api/auth/signin/google is rewritten to /login?error=google
 * when pages.signIn is set, which never opens Google's account list.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GoogleSignInSection } from "@/components/auth/GoogleSignInSection";
import { followBrowserRedirect } from "@/lib/auth/google-oauth-start";

jest.mock("@/lib/auth/google-oauth-start", () => {
  const actual = jest.requireActual("@/lib/auth/google-oauth-start");
  return {
    ...actual,
    followBrowserRedirect: jest.fn(),
  };
});

const GOOGLE_URL =
  "https://accounts.google.com/o/oauth2/v2/auth?prompt=select_account&scope=openid%20email%20profile";

describe("GoogleSignInSection", () => {
  beforeEach(() => {
    jest.mocked(followBrowserRedirect).mockReset();
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/auth/csrf")) {
        return { ok: true, json: async () => ({ csrfToken: "csrf-test-token" }) } as Response;
      }
      if (url.endsWith("/api/auth/signin/google") && init?.method === "POST") {
        return { ok: true, json: async () => ({ url: GOOGLE_URL }) } as Response;
      }
      throw new Error(`unexpected fetch ${init?.method ?? "GET"} ${url}`);
    }) as typeof fetch;
  });

  it("posts the signup click to Google instead of following a GET link", async () => {
    render(
      <GoogleSignInSection
        callbackUrl="/admin/pending-approval"
        noticeVariant="sign-up"
      />
    );

    expect(screen.queryByRole("link", { name: "Sign up with Google" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Sign up with Google" }));

    const post = (global.fetch as jest.Mock).mock.calls.find(
      (call) => String(call[0]).endsWith("/api/auth/signin/google")
    );
    expect(post?.[1]?.method).toBe("POST");
    const body = String(post?.[1]?.body ?? "");
    expect(body).toContain("csrfToken=csrf-test-token");
    expect(body).toContain("callbackUrl=%2Fadmin%2Fpending-approval");
    expect(followBrowserRedirect).toHaveBeenCalledWith(GOOGLE_URL);
  });
});
