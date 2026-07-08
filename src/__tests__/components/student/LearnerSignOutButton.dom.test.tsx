/**
 * @jest-environment jsdom
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LearnerSignOutButton } from "@/components/student/LearnerSignOutButton";

const componentSource = readFileSync(
  join(process.cwd(), "src/components/student/LearnerSignOutButton.tsx"),
  "utf8"
);

describe("LearnerSignOutButton", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("renders with learner-sign-out test id", () => {
    render(<LearnerSignOutButton />);
    expect(screen.getByTestId("learner-sign-out")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("POSTs learner logout endpoint on click", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: true } as Response);

    render(<LearnerSignOutButton />);
    fireEvent.click(screen.getByTestId("learner-sign-out"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/auth/learner/logout", {
        method: "POST",
      });
    });
  });

  it("redirects to /students/login after logout (hard navigation)", () => {
    expect(componentSource).toContain('fetch("/api/auth/learner/logout"');
    expect(componentSource).toContain('window.location.href = "/students/login"');
  });
});
