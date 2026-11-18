/**
 * @jest-environment jsdom
 *
 * Child detail privacy blurb. Online sessions, not "live".
 */

import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
  usePathname: () => "/account/children/child-1",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/lib/server-session", () => ({
  requireAccountHolderSession: jest.fn(async () => ({ accountHolderId: "ah-1" })),
}));

jest.mock("@/lib/learner-profile-scope", () => ({
  assertOwnsLearnerProfile: jest.fn(async () => undefined),
}));

jest.mock("@/lib/learner-pin-rate-limit", () => ({
  isCredentialHardLocked: jest.fn(async () => false),
}));

jest.mock("@/lib/db", () => ({
  db: {
    accountHolder: {
      findUnique: jest.fn(async () => ({ email: "parent@test.local", familyId: "FAM" })),
    },
    learnerProfile: {
      findUnique: jest.fn(async () => ({
        id: "child-1",
        displayName: "Alex",
        accessMode: "guardian_selects",
        isSelfLearner: false,
        createdAt: new Date("2026-01-01"),
        credential: null,
        students: [],
      })),
    },
    learnerDeviceSession: { count: jest.fn(async () => 0) },
  },
}));

jest.mock("@/app/account/children/[id]/actions", () => ({
  updateLearnerDisplayNameAction: jest.fn(),
}));

jest.mock("@/components/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({ mode: "light", setMode: () => undefined }),
}));

import ChildDetailPage from "@/app/account/children/[id]/page";

describe("Child detail privacy blurb", () => {
  test("names online sessions, recordings, and notes", async () => {
    render(await ChildDetailPage({ params: Promise.resolve({ id: "child-1" }) }));

    expect(
      screen.getByText(
        "Set per-tutor preferences for online sessions, recordings, and session notes. Child restrictions can narrow what you allow."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/live sessions/i)).not.toBeInTheDocument();
  });
});
