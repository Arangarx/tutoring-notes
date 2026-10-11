import { safeRelativeReturnPath } from "@/lib/safe-return-path";

describe("safeRelativeReturnPath", () => {
  it("keeps a same-site path", () => {
    expect(safeRelativeReturnPath("/org-invite/abc123")).toBe("/org-invite/abc123");
    expect(safeRelativeReturnPath("/admin/students?tab=1")).toBe("/admin/students?tab=1");
    expect(safeRelativeReturnPath("  /login  ")).toBe("/login");
  });

  it("rejects protocol-relative, backslash, and absolute URLs", () => {
    const rejected = [
      "//host",
      "//host/path",
      "/\\host",
      "/\\host/path",
      "https://evil.example",
      "https://evil.example/phish",
      "http://evil.example",
      "HTTP://evil.example/phish",
      "javascript:alert(1)",
      "\\\\host",
      "/foo\\bar",
    ];
    for (const value of rejected) {
      expect(safeRelativeReturnPath(value)).toBeNull();
    }
    expect(safeRelativeReturnPath(null)).toBeNull();
    expect(safeRelativeReturnPath(undefined)).toBeNull();
    expect(safeRelativeReturnPath("")).toBeNull();
  });
});
