/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock("@/components/PageShell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { JoinAuthGate } from "@/app/join/[sessionId]/JoinAuthGate";

describe("JoinAuthGate", () => {
  it("child session offers child and parent sign-in", () => {
    render(<JoinAuthGate sessionId="sess-abc" isSelfLearner={false} />);
    expect(screen.getByTestId("join-auth-gate")).toBeInTheDocument();
    expect(screen.getByTestId("join-auth-gate-child-sign-in")).toHaveAttribute(
      "href",
      "/students/login?returnTo=%2Fjoin%2Fsess-abc"
    );
    expect(screen.getByTestId("join-auth-gate-parent-sign-in")).toHaveAttribute(
      "href",
      "/account/login?returnTo=%2Fjoin%2Fsess-abc"
    );
  });

  it("self-learner session offers account sign-in only", () => {
    render(<JoinAuthGate sessionId="sess-self" isSelfLearner={true} />);
    expect(screen.getByTestId("join-auth-gate-self-sign-in")).toHaveAttribute(
      "href",
      "/account/login?returnTo=%2Fjoin%2Fsess-self"
    );
    expect(screen.queryByTestId("join-auth-gate-child-sign-in")).toBeNull();
  });
});
