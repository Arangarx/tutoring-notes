/**
 * @jest-environment node
 *
 * Google Calendar OAuth connect flow — separate from NextAuth sign-in scopes.
 */
import { NextRequest } from "next/server";
import { getGoogleCalendarConnectionForTutor } from "@/lib/calendar-oauth";

const mockGetServerSession = jest.fn();
jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

const mockGetAdminByEmail = jest.fn();
jest.mock("@/lib/auth-db", () => ({
  getAdminByEmail: (...args: unknown[]) => mockGetAdminByEmail(...args),
}));

const mockEnv = {
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
};
jest.mock("@/lib/env", () => ({
  env: mockEnv,
}));

const mockDeleteMany = jest.fn();
const mockCreate = jest.fn();
const mockUpsert = jest.fn();
const mockTransaction = jest.fn();
jest.mock("@/lib/db", () => ({
  db: {
    oAuthCalendarConnection: {
      findFirst: jest.fn(),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

/** Tyson 2026-09-17: Connect was sending NEXTAUTH_URL (legacy vercel.app), not this tab. */
const CALENDAR_WAVE_PREVIEW_HOST =
  "tutoring-notes-git-feat-calendar-wave-arangarx-5209s-projects.vercel.app";

function calendarConnectRequest(
  headers: Record<string, string> = {
    host: "localhost:3000",
    "x-forwarded-proto": "http",
  }
) {
  return new NextRequest("http://localhost:3000/api/auth/calendar/connect", {
    headers,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXTAUTH_URL = "http://localhost:3000";
  mockGetServerSession.mockResolvedValue({ user: { email: "tutor@example.com" } });
  mockGetAdminByEmail.mockResolvedValue({ id: "admin-1" });
  mockDeleteMany.mockResolvedValue({ count: 0 });
  mockCreate.mockResolvedValue({ id: "conn-1" });
  mockUpsert.mockResolvedValue({ id: "conn-1" });
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      oAuthCalendarConnection: {
        deleteMany: mockDeleteMany,
        create: mockCreate,
        upsert: mockUpsert,
      },
    };
    return fn(tx);
  });
});

describe("NextAuth Google provider scopes", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "replace-me";
    process.env.NEXTAUTH_SECRET = "test-secret-32-chars-minimum-pad";
    process.env.DATABASE_URL = "file:./test.db";
    process.env.DIRECT_URL = "file:./test.db";
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  });

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it("keeps sign-in scope to openid email profile only (no calendar scopes)", async () => {
    const { authOptions } = await import("@/auth-options");
    const googleProvider = authOptions.providers?.find(
      (p) => (p as { id?: string }).id === "google"
    ) as { options?: { authorization?: { params?: { scope?: string } } } } | undefined;
    expect(googleProvider).toBeDefined();
    const scope = googleProvider?.options?.authorization?.params?.scope ?? "";
    expect(scope).toBe("openid email profile");
    expect(scope.toLowerCase()).not.toContain("calendar");
  });
});

describe("GET /api/auth/calendar/connect", () => {
  it("redirects unauthenticated users to login", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/auth/calendar/connect/route");
    const res = await GET(calendarConnectRequest());
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("302 includes owned calendar scope on the Google authorize URL", async () => {
    const { GET } = await import("@/app/api/auth/calendar/connect/route");
    const res = await GET(calendarConnectRequest());
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("accounts.google.com");
    expect(location).toContain("calendar.events.owned");
    expect(location).not.toContain("calendar.readonly");
    expect(location).toContain("userinfo.email");
    expect(location).toContain("access_type=offline");
    expect(location).toContain("prompt=consent");
    expect(location).toContain(
      encodeURIComponent("http://localhost:3000/api/auth/calendar/callback")
    );
  });

  it("redirect_uri follows the allowlisted preview host, not NEXTAUTH_URL", async () => {
    process.env.NEXTAUTH_URL = "https://tutoring-notes.vercel.app";
    const { GET } = await import("@/app/api/auth/calendar/connect/route");
    const res = await GET(
      calendarConnectRequest({
        "x-forwarded-host": CALENDAR_WAVE_PREVIEW_HOST,
        "x-forwarded-proto": "https",
      })
    );
    const location = res.headers.get("location") ?? "";
    const previewCallback = `https://${CALENDAR_WAVE_PREVIEW_HOST}/api/auth/calendar/callback`;
    expect(location).toContain(encodeURIComponent(previewCallback));
    expect(location).not.toContain(
      encodeURIComponent("https://tutoring-notes.vercel.app/api/auth/calendar/callback")
    );
  });

  it("redirect_uri follows preview.usemynk.com, not NEXTAUTH_URL", async () => {
    process.env.NEXTAUTH_URL = "https://tutoring-notes.vercel.app";
    const { GET } = await import("@/app/api/auth/calendar/connect/route");
    const res = await GET(
      calendarConnectRequest({
        "x-forwarded-host": "preview.usemynk.com",
        "x-forwarded-proto": "https",
      })
    );
    const location = res.headers.get("location") ?? "";
    expect(location).toContain(
      encodeURIComponent("https://preview.usemynk.com/api/auth/calendar/callback")
    );
    expect(location).not.toContain(
      encodeURIComponent("https://tutoring-notes.vercel.app/api/auth/calendar/callback")
    );
  });

  it("forged Host is not reflected into redirect_uri", async () => {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    const { GET } = await import("@/app/api/auth/calendar/connect/route");
    const res = await GET(
      calendarConnectRequest({
        host: "evil.com",
        "x-forwarded-proto": "https",
      })
    );
    const location = res.headers.get("location") ?? "";
    expect(location).not.toContain("evil.com");
    expect(location).toContain(
      encodeURIComponent("http://localhost:3000/api/auth/calendar/callback")
    );
  });
});

describe("GET /api/auth/calendar/callback", () => {
  it("stores refresh token and email after successful exchange", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          refresh_token: "refresh-abc",
          access_token: "access-abc",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ email: "calendar@example.com" }),
      });

    const { GET } = await import("@/app/api/auth/calendar/callback/route");
    const req = new NextRequest(
      "http://localhost:3000/api/auth/calendar/callback?code=oauth-code-123"
    );
    const res = await GET(req);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location")).toContain("connected=google_calendar");
    const tokenBody = String(mockFetch.mock.calls[0]?.[1]?.body ?? "");
    expect(tokenBody).toContain(
      encodeURIComponent("http://localhost:3000/api/auth/calendar/callback")
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
    for (const call of mockFetch.mock.calls) {
      const url = String(call[0]);
      expect(url).not.toContain("calendarList");
      expect(url).not.toContain("calendar/v3");
    }
    expect(mockUpsert).toHaveBeenCalledWith({
      where: {
        provider_adminUserId: { provider: "google", adminUserId: "admin-1" },
      },
      create: {
        provider: "google",
        refreshToken: "refresh-abc",
        email: "calendar@example.com",
        adminUserId: "admin-1",
        reconnectRequiredAt: null,
      },
      update: {
        refreshToken: "refresh-abc",
        email: "calendar@example.com",
        reconnectRequiredAt: null,
      },
    });
    expect(mockCreate).not.toHaveBeenCalled();
    const upsertPayload = JSON.stringify(mockUpsert.mock.calls[0]?.[0] ?? {});
    expect(upsertPayload).not.toContain("calendarCount");
  });

  it("double callback uses upsert twice (no duplicate create path)", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        return {
          ok: true,
          json: async () => ({
            refresh_token: "refresh-abc",
            access_token: "access-abc",
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ email: "calendar@example.com" }),
      };
    });

    const { GET } = await import("@/app/api/auth/calendar/callback/route");
    const req = new NextRequest(
      "http://localhost:3000/api/auth/calendar/callback?code=oauth-code-123"
    );
    await GET(req);
    await GET(req);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("redirects with db_not_ready when OAuthCalendarConnection model is missing", async () => {
    jest.resetModules();
    jest.doMock("@/lib/db", () => ({ db: {} }));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        refresh_token: "refresh-abc",
        access_token: "access-abc",
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ email: "calendar@example.com" }),
    });

    const { GET } = await import("@/app/api/auth/calendar/callback/route");
    const req = new NextRequest(
      "http://localhost:3000/api/auth/calendar/callback?code=oauth-code-123"
    );
    const res = await GET(req);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location")).toContain("error=db_not_ready");
  });

  it("token exchange redirect_uri follows the allowlisted preview host, not NEXTAUTH_URL", async () => {
    process.env.NEXTAUTH_URL = "https://tutoring-notes.vercel.app";
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          refresh_token: "refresh-abc",
          access_token: "access-abc",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ email: "calendar@example.com" }),
      });

    const { GET } = await import("@/app/api/auth/calendar/callback/route");
    const previewCallback = `https://${CALENDAR_WAVE_PREVIEW_HOST}/api/auth/calendar/callback`;
    const req = new NextRequest(`${previewCallback}?code=oauth-code-123`, {
      headers: {
        "x-forwarded-host": CALENDAR_WAVE_PREVIEW_HOST,
        "x-forwarded-proto": "https",
      },
    });
    await GET(req);
    const tokenBody = String(mockFetch.mock.calls[0]?.[1]?.body ?? "");
    expect(tokenBody).toContain(encodeURIComponent(previewCallback));
    expect(tokenBody).not.toContain(
      encodeURIComponent("https://tutoring-notes.vercel.app/api/auth/calendar/callback")
    );
  });
});

describe("disconnectGoogleCalendar server action", () => {
  const mockRequireStudentScope = jest.fn();
  const mockRevalidatePath = jest.fn();
  const mockRedirect = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.doMock("@/lib/student-scope", () => ({
      requireStudentScope: (...args: unknown[]) => mockRequireStudentScope(...args),
    }));
    jest.doMock("next/cache", () => ({
      revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
    }));
    jest.doMock("next/navigation", () => ({
      redirect: (...args: unknown[]) => {
        mockRedirect(...args);
        throw new Error("NEXT_REDIRECT");
      },
    }));
    jest.doMock("@/lib/db", () => ({
      db: {
        oAuthCalendarConnection: {
          findFirst: jest.fn(),
          deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
          create: (...args: unknown[]) => mockCreate(...args),
        },
      },
    }));
    mockRequireStudentScope.mockResolvedValue({ kind: "admin", adminId: "admin-1" });
    mockDeleteMany.mockResolvedValue({ count: 1 });
  });

  it("deletes the google calendar row for the admin", async () => {
    const { disconnectGoogleCalendar } = await import(
      "@/app/admin/settings/integrations/actions"
    );
    await expect(disconnectGoogleCalendar()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { provider: "google", adminUserId: "admin-1" },
    });
    expect(mockRedirect).toHaveBeenCalledWith("/admin/settings/integrations");
  });
});

describe("calendar-oauth defensive paths", () => {
  it("getGoogleCalendarConnectionForTutor returns null when table throws", async () => {
    jest.resetModules();
    const err = new Error(
      "The table `main.OAuthCalendarConnection` does not exist in the current database."
    );
    err.name = "PrismaClientKnownRequestError";
    jest.doMock("@/lib/db", () => ({
      db: {
        oAuthCalendarConnection: {
          findFirst: jest.fn().mockRejectedValue(err),
        },
      },
    }));
    const { getGoogleCalendarConnectionForTutor: getConn } = await import("@/lib/calendar-oauth");
    const result = await getConn("admin-1");
    expect(result).toBeNull();
  });
});
