/**
 * @jest-environment jsdom
 *
 * Locks exact copy, links, markup classes, and retry wiring for the four
 * error/not-found pages that share ErrorStateCard (dedupe Wave A).
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorStateCard } from "@/components/ErrorStateCard";
import GlobalError from "@/app/error";
import AdminError from "@/app/admin/error";
import NotFound from "@/app/not-found";
import AdminNotFound from "@/app/admin/not-found";

jest.mock("next/link", () => {
  return function MockLink({
    href,
    children,
    className,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <a href={href} className={className} {...rest}>
        {children}
      </a>
    );
  };
});

const noopError = Object.assign(new Error("test"), { digest: "d" });

describe("ErrorStateCard — page prop matrices (exact copy + links)", () => {
  it("global error.tsx: heading, body, Home link, Try again → reset", async () => {
    const reset = jest.fn();
    const user = userEvent.setup();
    render(<GlobalError error={noopError} reset={reset} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Something went wrong" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "An unexpected error occurred. You can try again or go back to the home page."
      )
    ).toBeInTheDocument();

    const home = screen.getByRole("link", { name: "Home" });
    expect(home).toHaveAttribute("href", "/");
    expect(home).toHaveClass("btn");
    expect(home).not.toHaveClass("primary");

    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry).toHaveClass("btn", "primary");
    await user.click(retry);
    expect(reset).toHaveBeenCalledTimes(1);

    // container + card structure
    expect(document.querySelector(".container")).not.toBeNull();
    expect(document.querySelector(".card")).not.toBeNull();
    expect(document.querySelector(".row")).not.toBeNull();
  });

  it("admin/error.tsx: heading, admin body, Students link, Try again → reset", async () => {
    const reset = jest.fn();
    const user = userEvent.setup();
    render(<AdminError error={noopError} reset={reset} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Something went wrong" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("An unexpected error occurred in the admin area.")
    ).toBeInTheDocument();

    const students = screen.getByRole("link", { name: "Students" });
    expect(students).toHaveAttribute("href", "/admin/students");
    expect(students).toHaveClass("btn");
    expect(students).not.toHaveClass("primary");

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);

    // admin pages: no container wrapper
    expect(document.querySelector(".container")).toBeNull();
    expect(document.querySelector(".card")).not.toBeNull();
    expect(document.querySelector(".row")).not.toBeNull();
  });

  it("not-found.tsx: heading, body, Back to home primary link, no retry", () => {
    render(<NotFound />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Page not found" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("This page does not exist or the link may have expired.")
    ).toBeInTheDocument();

    const home = screen.getByRole("link", { name: "Back to home" });
    expect(home).toHaveAttribute("href", "/");
    expect(home).toHaveClass("btn", "primary");

    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(document.querySelector(".container")).not.toBeNull();
    expect(document.querySelector(".row")).toBeNull();
  });

  it("admin/not-found.tsx: heading, body, Back to Students primary link, no retry", () => {
    render(<AdminNotFound />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Not found" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("This item does not exist or may have been deleted.")
    ).toBeInTheDocument();

    const students = screen.getByRole("link", { name: "Back to Students" });
    expect(students).toHaveAttribute("href", "/admin/students");
    expect(students).toHaveClass("btn", "primary");

    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(document.querySelector(".container")).toBeNull();
    expect(document.querySelector(".row")).toBeNull();
  });
});

describe("ErrorStateCard — prop wiring teeth (independent of pages)", () => {
  it("renders title, message, and link exactly as passed", () => {
    render(
      <ErrorStateCard
        title="Custom title"
        message="Custom message body."
        linkHref="/custom"
        linkLabel="Custom link"
        withContainer
      />
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Custom title" })
    ).toBeInTheDocument();
    expect(screen.getByText("Custom message body.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Custom link" });
    expect(link).toHaveAttribute("href", "/custom");
    expect(link).toHaveClass("btn", "primary");
  });

  it("onRetry wires the retry button and uses secondary link class", async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();
    render(
      <ErrorStateCard
        title="T"
        message="M"
        linkHref="/x"
        linkLabel="X"
        onRetry={onRetry}
        retryLabel="Retry now"
      />
    );

    const link = screen.getByRole("link", { name: "X" });
    expect(link).toHaveClass("btn");
    expect(link).not.toHaveClass("primary");

    await user.click(screen.getByRole("button", { name: "Retry now" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
