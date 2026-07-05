/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";

import { SiteFooter } from "@/components/SiteFooter";

describe("SiteFooter — build SHA", () => {
  it("renders buildShortSha as visible monospace when provided", () => {
    render(<SiteFooter buildShortSha="65f326f" />);

    const sha = screen.getByTitle("Build 65f326f");
    expect(sha).toBeVisible();
    expect(sha).toHaveTextContent("65f326f");
    expect(sha).toHaveClass("font-mono", "text-xs");
  });

  it("omits build SHA when buildShortSha is not provided", () => {
    render(<SiteFooter />);

    expect(screen.queryByTitle(/^Build /)).toBeNull();
  });
});
