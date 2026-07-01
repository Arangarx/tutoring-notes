/**
 * @jest-environment jsdom
 *
 * CC-2 claim setup page SSR — mandatory consent gate (B-3/B-4), self-learner (T7),
 * pending-invite detection (M-1), dashboard escape (T-new-C).
 *
 * DB: tutoring_notes_test via jest.global-setup.ts
 */

// jsdom lacks Request — page.tsx constructs one for getAccountHolderSession.
if (typeof globalThis.Request === "undefined") {
  class MockHeaders {
    private readonly map = new Map<string, string>();
    constructor(init?: Record<string, string>) {
      if (init) {
        for (const [key, value] of Object.entries(init)) {
          this.map.set(key.toLowerCase(), value);
        }
      }
    }
    get(name: string) {
      return this.map.get(name.toLowerCase()) ?? null;
    }
  }
  class MockRequest {
    readonly headers: MockHeaders;
    constructor(_url: string, init?: { headers?: Record<string, string> }) {
      this.headers = new MockHeaders(init?.headers);
    }
  }
  globalThis.Request = MockRequest as unknown as typeof Request;
}

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next/navigation", () => ({
  __esModule: true,
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

const headersMock = jest.fn();
jest.mock("next/headers", () => ({
  headers: () => headersMock(),
}));

const getAccountHolderSessionMock = jest.fn();
jest.mock("@/lib/account-holder-session", () => {
  const actual = jest.requireActual<typeof import("@/lib/account-holder-session")>(
    "@/lib/account-holder-session"
  );
  return {
    ...actual,
    getAccountHolderSession: (...args: unknown[]) =>
      getAccountHolderSessionMock(...args),
  };
});

import { db } from "@/lib/db";
import { createAccountHolderSession } from "@/lib/account-holder-session";
import { generateRawToken, hashToken, CLAIM_INVITE_TTL_MS } from "@/lib/crypto/session-tokens";
import ClaimSetupPage from "@/app/claim/[token]/setup/page";

let uniqueSuffix = 0;
function uniq(prefix = "csp") {
  return `${prefix}-${Date.now()}-${++uniqueSuffix}`;
}

async function createTutor() {
  return db.adminUser.create({
    data: { email: `${uniq("tutor")}@example.com`, role: "TUTOR" },
  });
}

async function createAccountHolder(opts?: { isSelfLearner?: boolean }) {
  return db.accountHolder.create({
    data: {
      email: `${uniq("ah")}@example.com`,
      emailVerifiedAt: new Date(),
      isSelfLearner: opts?.isSelfLearner ?? false,
    },
  });
}

type FixtureOpts = {
  isSelfLearner?: boolean;
  withCredential?: boolean;
  withConsent?: boolean;
  withOpenSession?: boolean;
  withActiveJoinToken?: boolean;
};

async function createClaimedSetupFixture(opts: FixtureOpts = {}) {
  const tutor = await createTutor();
  const ah = await createAccountHolder({ isSelfLearner: opts.isSelfLearner });
  const student = await db.student.create({
    data: { name: "Test Student", adminUserId: tutor.id },
  });
  const rawToken = await generateRawToken();
  const invite = await db.studentClaimInvite.create({
    data: {
      studentId: student.id,
      adminUserId: tutor.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + CLAIM_INVITE_TTL_MS),
    },
  });

  const profile = await db.learnerProfile.create({
    data: {
      accountHolderId: ah.id,
      displayName: student.name,
      isSelfLearner: opts.isSelfLearner ?? false,
    },
  });
  await db.student.update({
    where: { id: student.id },
    data: { learnerProfileId: profile.id },
  });
  await db.studentClaimInvite.update({
    where: { id: invite.id },
    data: {
      claimedAt: new Date(),
      claimedByAccountHolderId: ah.id,
    },
  });

  if (opts.withCredential) {
    await db.learnerCredential.create({
      data: {
        learnerProfileId: profile.id,
        accountHolderId: ah.id,
        username: uniq("user"),
        secretHash: "hash",
      },
    });
  }

  if (opts.withConsent && !opts.isSelfLearner) {
    await db.consentRecord.create({
      data: {
        learnerProfileId: profile.id,
        adminUserId: tutor.id,
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: ah.id,
        captureMethod: "electronic",
      },
    });
  }

  if (opts.withOpenSession) {
    const session = await db.whiteboardSession.create({
      data: {
        adminUserId: tutor.id,
        studentId: student.id,
        consentAcknowledged: true,
        eventsBlobUrl: `https://blob.vercel-storage.com/test-${uniq()}.json`,
        eventsSchemaVersion: 1,
        sessionPhase: "PENDING",
      },
    });

    if (opts.withActiveJoinToken) {
      await db.whiteboardJoinToken.create({
        data: {
          whiteboardSessionId: session.id,
          token: uniq("join"),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
    }
  }

  const { rawToken: ahSessionToken } = await createAccountHolderSession(ah.id);

  return { rawToken, ahSessionToken, ah, student, profile, tutor };
}

async function renderSetupPage(rawToken: string, accountHolderId: string) {
  headersMock.mockResolvedValue({
    get: (name: string) =>
      name === "cookie" ? `mynk_ah_session=session-token` : null,
  });
  getAccountHolderSessionMock.mockResolvedValue({ accountHolderId });

  const element = await ClaimSetupPage({
    params: Promise.resolve({ token: rawToken }),
  });
  render(element);
}

beforeAll(async () => {
  process.env.AH_SESSION_HMAC_SECRET =
    process.env.AH_SESSION_HMAC_SECRET ??
    "test-ah-session-secret-minimum-32-bytes-xxxx";
});

describe("Claim setup page — T-new-C dashboard gate (B-3)", () => {
  it("does not render Go to dashboard when credential set but consent unsaved", async () => {
    const fx = await createClaimedSetupFixture({
      withCredential: true,
      withConsent: false,
    });

    await renderSetupPage(fx.rawToken, fx.ah.id);

    expect(
      screen.queryByRole("link", { name: /go to dashboard/i })
    ).not.toBeInTheDocument();
  });

  it("renders Go to dashboard when credential set and consent saved", async () => {
    const fx = await createClaimedSetupFixture({
      withCredential: true,
      withConsent: true,
    });

    await renderSetupPage(fx.rawToken, fx.ah.id);

    expect(screen.getByRole("link", { name: /go to dashboard/i })).toHaveAttribute(
      "href",
      "/account/dashboard"
    );
  });
});

describe("Claim setup page — T7 self-learner exemption (L-2)", () => {
  it("skips consent form and allows dashboard when self-learner with credential", async () => {
    const fx = await createClaimedSetupFixture({
      isSelfLearner: true,
      withCredential: true,
      withConsent: false,
    });

    await renderSetupPage(fx.rawToken, fx.ah.id);

    expect(
      screen.queryByRole("button", { name: /save preferences/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/parental privacy preferences do not apply/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to dashboard/i })).toBeInTheDocument();
  });
});

describe("Claim setup page — T8 enforcement affordances", () => {
  it("hides Set up later on credential form until consent saved", async () => {
    const fx = await createClaimedSetupFixture({
      withCredential: false,
      withConsent: false,
    });

    await renderSetupPage(fx.rawToken, fx.ah.id);

    expect(screen.queryByRole("link", { name: /set up later/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save preferences/i })).toBeInTheDocument();
  });
});

describe("Claim setup page — M-1 pending session invite detection", () => {
  it("variant (a): open session with active join token shows pending-invite decline copy", async () => {
    const fx = await createClaimedSetupFixture({
      withOpenSession: true,
      withActiveJoinToken: true,
      withConsent: false,
    });

    await renderSetupPage(fx.rawToken, fx.ah.id);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /no consent now, i'll review later/i })
    );

    expect(
      await screen.findByText(/session they've already been invited to/i)
    ).toBeInTheDocument();
  });

  it("variant (b): open session without join token uses plain decline copy", async () => {
    const fx = await createClaimedSetupFixture({
      withOpenSession: true,
      withActiveJoinToken: false,
      withConsent: false,
    });

    await renderSetupPage(fx.rawToken, fx.ah.id);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /no consent now, i'll review later/i })
    );

    expect(
      await screen.findByText(
        /cannot participate in live tutoring sessions with this tutor/i
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/session they've already been invited to/i)
    ).not.toBeInTheDocument();
  });
});
