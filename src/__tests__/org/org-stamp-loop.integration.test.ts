/**
 * @jest-environment node
 *
 * Consent wave O1, C4b (docs/handoff/consent-wave-plan.md § 3.2): the org stamp loops
 * (`setOrganizationStatus`, `removeOrgMember`) end every live session inside ONE transaction under the
 * org row lock, so the per-session stamp must do O(1) extra work for the board purge: the intent only,
 * never the batch-row delete (End does that) and never a blob call (the purge runs after the response).
 *
 * Oracles: the statement count of the real stamp against the real test database for 1 vs 500 batch
 * rows; zero `whiteboardEventBatch.deleteMany`; zero blob calls; a pinned ceiling. Then the real
 * suspend-now path over 100 whiteboard-off sessions must finish inside its transaction budget.
 */
jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
jest.mock("next/cache", () => ({ __esModule: true, revalidatePath: jest.fn() }));
const mockGetServerSession = jest.fn();
jest.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }));
jest.mock("@/auth-options", () => ({ authOptions: {} }));
const blobCalls: string[] = [];
jest.mock("@vercel/blob", () => ({
  __esModule: true,
  put: jest.fn(async () => {
    blobCalls.push("put");
    return { url: "https://blob.vercel-storage.com/x" };
  }),
  del: jest.fn(async () => {
    blobCalls.push("del");
  }),
  list: jest.fn(async () => {
    blobCalls.push("list");
    return { blobs: [], hasMore: false };
  }),
}));
jest.mock("@/lib/blob", () => ({
  __esModule: true,
  deleteBlob: jest.fn(async () => {
    blobCalls.push("deleteBlob");
  }),
}));
jest.mock("@/lib/blob-list", () => ({
  __esModule: true,
  listBlobsByPrefix: jest.fn(async () => {
    blobCalls.push("listBlobsByPrefix");
    return [];
  }),
}));
// The org callers hand the purge to after(); outside a request it is a no-op here (the purge has its own tests).
jest.mock("next/server", () => ({ ...jest.requireActual("next/server"), after: jest.fn() }));

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { ORG_STAMP_TX_TIMEOUT_MS, setOrganizationStatus } from "@/lib/org-scope";
import { stampStaleWhiteboardSessionEnd } from "@/lib/whiteboard/stale-session-stamp";
import { uniq } from "../helpers/unique-test-token";

/** Pinned ceiling (statements one stale stamp may issue, intent included). Raise only with a reviewed reason. */
const STAMP_MAX_STATEMENTS_PER_SESSION = 12;
/** Andrew's floor: an org of this many live sessions must fit in one suspend-now transaction. */
const MIN_SESSIONS_IN_BUDGET = 100;

beforeEach(() => {
  blobCalls.length = 0;
  mockGetServerSession.mockReset();
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

type Counted = { ops: string[] };

/** Wraps a real transaction client and records every statement it is asked to run. */
function counting(tx: Prisma.TransactionClient, into: Counted): Prisma.TransactionClient {
  return new Proxy(tx, {
    get(target, model: string | symbol, receiver) {
      const real = Reflect.get(target, model, receiver);
      if (typeof model !== "string") return real;
      if (model === "$queryRaw" || model === "$executeRaw" || model === "$queryRawUnsafe" || model === "$executeRawUnsafe") {
        return (...args: unknown[]) => {
          into.ops.push(model);
          return (real as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      if (real && typeof real === "object") {
        return new Proxy(real as object, {
          get(m, method: string | symbol, r) {
            const fn = Reflect.get(m, method, r);
            if (typeof method !== "string" || typeof fn !== "function") return fn;
            return (...args: unknown[]) => {
              into.ops.push(`${model}.${method}`);
              return (fn as (...a: unknown[]) => unknown).apply(m, args);
            };
          },
        });
      }
      return real;
    },
  }) as Prisma.TransactionClient;
}

async function seedOrgSession(opts: { organizationId?: string; instructorId: string; batches: number }) {
  const ah = await db.accountHolder.create({ data: { email: `${uniq("o1ah")}@example.com`, emailVerifiedAt: new Date() } });
  const profile = await db.learnerProfile.create({ data: { accountHolderId: ah.id, displayName: "O1 Learner" } });
  const student = await db.student.create({
    data: {
      name: "O1 Learner",
      adminUserId: opts.organizationId ? null : opts.instructorId,
      organizationId: opts.organizationId ?? null,
      learnerProfileId: profile.id,
    },
  });
  const switches = {
    allowLiveSession: true,
    allowAudioRecording: true,
    allowWhiteboardRecording: false,
    allowNoteSending: true,
  };
  const record = await db.consentRecord.create({
    data: {
      learnerProfileId: profile.id,
      adminUserId: opts.organizationId ? null : opts.instructorId,
      organizationId: opts.organizationId ?? null,
      version: 1,
      ...switches,
      setByAccountHolderId: ah.id,
      captureMethod: "electronic",
    },
  });
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: opts.instructorId,
      studentId: student.id,
      consentAcknowledged: true,
      eventsBlobUrl: "https://blob.vercel-storage.com/events.json",
      sessionPhase: "ACTIVE",
      activatedAt: new Date(),
    },
  });
  await db.sessionConsentSnapshot.create({
    data: { whiteboardSessionId: session.id, ...switches, consentRecordId: record.id, consentRecordVersion: 1 },
  });
  if (opts.batches > 0) {
    await db.whiteboardEventBatch.createMany({
      data: Array.from({ length: opts.batches }, (_, i) => ({
        whiteboardSessionId: session.id,
        batchSeq: i + 1,
        fromEventIndex: i,
        toEventIndex: i + 1,
        eventsJson: [{ t: i }],
        boardDocumentJson: { pages: [] },
        schemaVersion: 1,
      })),
    });
  }
  return session.id;
}

async function seedInstructor() {
  return db.adminUser.create({
    data: {
      email: `${uniq("o1t")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
      emailVerifiedAt: new Date("2026-01-01"),
      displayName: "O1 Tutor",
      isTestAccount: false,
    },
  });
}

async function stampCounted(sessionId: string): Promise<Counted> {
  const counted: Counted = { ops: [] };
  await db.$transaction((tx) => stampStaleWhiteboardSessionEnd(counting(tx, counted), sessionId, new Date(), false, "forced"), {
    timeout: 30_000,
  });
  return counted;
}

describe("O1 org stamp loops: O(1) extra work per session", () => {
  it("same statement count for 1 and 500 batch rows, zero batch deleteMany, zero blob calls, under the pinned ceiling", async () => {
    const tutor = await seedInstructor();
    const small = await seedOrgSession({ instructorId: tutor.id, batches: 1 });
    const large = await seedOrgSession({ instructorId: tutor.id, batches: 500 });

    const a = await stampCounted(small);
    const b = await stampCounted(large);

    expect(b.ops).toEqual(a.ops);
    expect(a.ops).not.toContain("whiteboardEventBatch.deleteMany");
    expect(a.ops.length).toBeLessThanOrEqual(STAMP_MAX_STATEMENTS_PER_SESSION);
    expect(blobCalls).toEqual([]);
    // The intent was written (the stamp is not O(1) by skipping it), and the rows are left for the purge.
    const row = await db.whiteboardSession.findUniqueOrThrow({ where: { id: large }, select: { boardPurgeRequestedAt: true } });
    expect(row.boardPurgeRequestedAt).not.toBeNull();
    expect(await db.whiteboardEventBatch.count({ where: { whiteboardSessionId: large } })).toBe(500);
  });

  it(`suspend "now" over ${MIN_SESSIONS_IN_BUDGET} whiteboard-off sessions fits inside the org stamp transaction budget`, async () => {
    const owner = await seedInstructor();
    const org = await db.organization.create({
      data: {
        name: `O1 org ${uniq("org")}`,
        status: "active",
        timezone: "America/Denver",
        statusChangedAt: new Date(),
        createdByOperatorId: "org-operator@example.com",
        members: { create: [{ adminUserId: owner.id, roles: ["owner", "instructor"] }] },
      },
    });
    const ids: string[] = [];
    for (let i = 0; i < MIN_SESSIONS_IN_BUDGET; i++) {
      ids.push(await seedOrgSession({ organizationId: org.id, instructorId: owner.id, batches: 3 }));
    }
    const email = env.ADMIN_EMAIL;
    if (!email) throw new Error("ADMIN_EMAIL is required to suspend an organization");
    mockGetServerSession.mockResolvedValue({
      user: { email, id: "operator-session", name: email, isImpersonating: false },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });

    const start = Date.now();
    await setOrganizationStatus(org.id, "suspended", "now");
    const ms = Date.now() - start;
    process.stdout.write(`[O1] sessions=${ids.length} ms=${ms} msPerSession=${(ms / ids.length).toFixed(1)}\n`);

    expect(ms).toBeLessThan(ORG_STAMP_TX_TIMEOUT_MS);
    const ended = await db.whiteboardSession.count({ where: { id: { in: ids }, endedAt: { not: null }, boardPurgeRequestedAt: { not: null } } });
    expect(ended).toBe(ids.length);
    expect(blobCalls).toEqual([]);
  }, 120_000);
});
