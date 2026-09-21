/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";

const ROUTE_DIR = path.resolve(
  __dirname,
  "../../app/api/calendar/ics/[token]"
);
const LIB_CALENDAR_DIR = path.resolve(__dirname, "../../lib/calendar");

function readSourcesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...readSourcesUnder(full));
    } else if (entry.name.endsWith(".ts")) {
      out.push(fs.readFileSync(full, "utf-8"));
    }
  }
  return out;
}

const mockFindToken = jest.fn();
const mockLoadSessions = jest.fn();
const mockLoadTz = jest.fn();

jest.mock("@/lib/calendar-feed-token", () => ({
  findCalendarFeedTokenByRawToken: (...args: unknown[]) =>
    mockFindToken(...args),
}));

jest.mock("@/lib/calendar/load-ics-feed-sessions", () => ({
  loadIcsFeedSessionsForAdmin: (...args: unknown[]) =>
    mockLoadSessions(...args),
  loadAdminTutorTimezone: (...args: unknown[]) => mockLoadTz(...args),
}));

import { GET } from "@/app/api/calendar/ics/[token]/route";
import { ICS_FEED_NOT_FOUND_BODY } from "@/lib/calendar/ics-feed-response";

function makeCtx(token: string, extraQuery = "") {
  return {
    req: new Request(
      `http://localhost/api/calendar/ics/${token}${extraQuery}`
    ),
    ctx: { params: Promise.resolve({ token }) },
  };
}

const sampleSession = {
  id: "sess-1",
  date: new Date("2026-04-01T00:00:00.000Z"),
  startTime: "10:00",
  endTime: "11:00",
  subject: "Math",
  notes: "Chapter 3",
  location: "Zoom",
  updatedAt: new Date("2026-04-01T12:00:00.000Z"),
  student: { name: "Maya Rodriguez", icsShowFullName: false },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFindToken.mockResolvedValue({
    id: "tok-row",
    adminUserId: "admin-a",
    token: "valid-token-xyz",
    revokedAt: null,
    createdAt: new Date(),
  });
  mockLoadSessions.mockResolvedValue([sampleSession]);
  mockLoadTz.mockResolvedValue("America/Denver");
});

describe("B4a — Cache-Control private no-store on all responses", () => {
  it("200 feed includes private no-store", async () => {
    const { req, ctx } = makeCtx("valid-token-xyz");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Content-Type")).toContain("text/calendar");
  });

  it("404 denial includes private no-store", async () => {
    mockFindToken.mockResolvedValue(null);
    const { req, ctx } = makeCtx("missing");
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("B4b — adminUserId from token row only", () => {
  it("loads sessions for token admin even when query spoofs another admin", async () => {
    mockFindToken.mockResolvedValue({
      id: "tok-row",
      adminUserId: "admin-from-token",
      token: "tok",
      revokedAt: null,
      createdAt: new Date(),
    });
    const { req, ctx } = makeCtx("tok", "?adminUserId=admin-spoof");
    await GET(req, ctx);
    expect(mockLoadSessions).toHaveBeenCalledWith("admin-from-token");
    expect(mockLoadSessions).not.toHaveBeenCalledWith("admin-spoof");
  });
});

describe("B4c — missing vs revoked byte-identical denial", () => {
  it("missing and revoked tokens return identical status and body", async () => {
    mockFindToken.mockResolvedValue(null);
    const missingCtx = makeCtx("no-such-token");
    const missing = await GET(missingCtx.req, missingCtx.ctx);
    const missingBody = await missing.text();

    mockFindToken.mockResolvedValue(null);
    const revokedCtx = makeCtx("revoked-token");
    const revoked = await GET(revokedCtx.req, revokedCtx.ctx);
    const revokedBody = await revoked.text();

    expect(missing.status).toBe(revoked.status);
    expect(missingBody).toBe(revokedBody);
    expect(missingBody).toBe(ICS_FEED_NOT_FOUND_BODY);
  });
});

describe("B4d — no PII in ICS route/generator logs", () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("emits [ics] prefix with truncated token on success", async () => {
    const { req, ctx } = makeCtx("abcdefgh12345678");
    await GET(req, ctx);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[ics\] ics=abcdefgh action=feed_served adminUserId=admin-a/)
    );
  });

  it("grep guard: route and calendar lib sources avoid student.name in log calls", () => {
    const routeSource = fs.readFileSync(
      path.join(ROUTE_DIR, "route.ts"),
      "utf-8"
    );
    const libSources = readSourcesUnder(LIB_CALENDAR_DIR).join("\n");
    const combined = `${routeSource}\n${libSources}`;
    expect(combined).not.toMatch(/console\.(log|error|warn)\([^)]*student\.name/s);
    expect(combined).not.toMatch(/console\.error\(\s*err\s*\)/);
  });
});
