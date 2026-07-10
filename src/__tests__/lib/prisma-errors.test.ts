import { Prisma } from "@prisma/client";
import { isPrismaUniqueViolation } from "@/lib/db/prisma-errors";

function prismaKnownRequestError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code,
    clientVersion: "test",
  });
}

describe("isPrismaUniqueViolation", () => {
  it("returns true for PrismaClientKnownRequestError with code P2002", () => {
    expect(isPrismaUniqueViolation(prismaKnownRequestError("P2002"))).toBe(true);
  });

  it("returns false for PrismaClientKnownRequestError with code P2001", () => {
    expect(isPrismaUniqueViolation(prismaKnownRequestError("P2001"))).toBe(false);
  });

  it("returns false for PrismaClientKnownRequestError with an unrelated code", () => {
    expect(isPrismaUniqueViolation(prismaKnownRequestError("P2025"))).toBe(false);
  });

  it("returns false for a plain Error without a Prisma code", () => {
    expect(isPrismaUniqueViolation(new Error("Unique constraint failed"))).toBe(false);
  });

  it("returns false for duck-typed objects missing code P2002", () => {
    expect(isPrismaUniqueViolation({ code: "P2001" })).toBe(false);
    expect(isPrismaUniqueViolation({ code: undefined })).toBe(false);
    expect(isPrismaUniqueViolation({})).toBe(false);
  });

  it("returns true for duck-typed objects with code P2002 (matches legacy call sites)", () => {
    expect(isPrismaUniqueViolation(Object.assign(new Error("collision"), { code: "P2002" }))).toBe(
      true
    );
  });

  it("returns false for null, undefined, and non-object primitives", () => {
    expect(isPrismaUniqueViolation(null)).toBe(false);
    expect(isPrismaUniqueViolation(undefined)).toBe(false);
    expect(isPrismaUniqueViolation("P2002")).toBe(false);
    expect(isPrismaUniqueViolation(2002)).toBe(false);
  });
});
