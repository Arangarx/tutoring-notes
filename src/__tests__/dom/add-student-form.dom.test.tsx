/**
 * @jest-environment jsdom
 *
 * Add learner form composes RadioGroup and Alert, and the retry email form
 * is not nested inside the create form.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("@/app/admin/students/actions", () => ({
  createStudent: jest.fn(),
  retryStudentClaimInvite: jest.fn(),
}));

import { AddStudentForm } from "@/components/admin/AddStudentForm";
import { createStudent, retryStudentClaimInvite } from "@/app/admin/students/actions";

const createMock = createStudent as jest.Mock;
const retryMock = retryStudentClaimInvite as jest.Mock;

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("AddStudentForm", () => {
  beforeEach(() => {
    createMock.mockReset();
    retryMock.mockReset();
  });

  it("offers the two learner kinds as one radio group", () => {
    render(<AddStudentForm />);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(document.querySelectorAll("form")).toHaveLength(1);
  });

  it("shows an error alert and keeps a single form", async () => {
    createMock.mockResolvedValue({ status: "error", message: "A valid email address is required." });
    render(<AddStudentForm />);
    fireEvent.submit(document.querySelector("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A valid email address is required."
    );
    expect(document.body.innerHTML).not.toMatch(/text-green-700|dark:text-green/);
    expect(document.querySelectorAll("form")).toHaveLength(1);
  });

  it("puts the invitation retry form outside the create form", async () => {
    createMock.mockResolvedValue({
      status: "invite_send_failed",
      studentId: "stu-1",
      message: "The invitation email could not be sent.",
    });
    render(<AddStudentForm />);
    fireEvent.submit(document.querySelector("form")!);
    const retry = await screen.findByRole("button", { name: "Retry invitation email" });
    const retryForm = retry.closest("form");
    expect(retryForm).not.toBeNull();
    expect(retryForm!.parentElement?.closest("form")).toBeNull();
    await waitFor(() => {
      expect(document.querySelectorAll("form")).toHaveLength(2);
    });
  });
});
