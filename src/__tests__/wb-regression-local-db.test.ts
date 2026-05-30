const {
  assertLocalDatabaseUrlForHarness,
  parseDatabaseHost,
} = require("../../scripts/wb-regression-local-db.cjs");

describe("wb-regression local database host guard", () => {
  const savedDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (savedDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = savedDatabaseUrl;
    }
  });

  it("allows 127.0.0.1", () => {
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@127.0.0.1:5432/tutoring_notes";
    expect(() => assertLocalDatabaseUrlForHarness()).not.toThrow();
  });

  it("allows localhost", () => {
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/tutoring_notes";
    expect(() => assertLocalDatabaseUrlForHarness()).not.toThrow();
  });

  it("rejects Neon-like hosts", () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require";
    expect(() => assertLocalDatabaseUrlForHarness()).toThrow(
      /Refusing to run the whiteboard regression net against a non-local database \(host=ep-cool-name-123456\.us-east-2\.aws\.neon\.tech\)/
    );
  });

  it("parseDatabaseHost normalizes postgres:// scheme", () => {
    expect(
      parseDatabaseHost(
        "postgres://postgres:postgres@127.0.0.1:5432/tutoring_notes"
      )
    ).toBe("127.0.0.1");
  });
});
