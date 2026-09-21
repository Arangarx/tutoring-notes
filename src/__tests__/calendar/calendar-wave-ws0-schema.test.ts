/**
 * Calendar wave WS0 — additive migration + Prisma DMMF (independent oracle: SQL on disk + DMMF).
 */
import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";

const migrationPath = path.resolve(
  __dirname,
  "../../../prisma/migrations/20260916040000_calendar_wave_ws0/migration.sql"
);

const dmmf = Prisma.dmmf;

function getModel(name: string) {
  const model = dmmf.datamodel.models.find((m) => m.name === name);
  expect(model).toBeDefined();
  return model!;
}

function getField(modelName: string, fieldName: string) {
  const field = getModel(modelName).fields.find((f) => f.name === fieldName);
  expect(field).toBeDefined();
  return field!;
}

describe("calendar wave WS0 migration SQL", () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, "utf-8");
  });

  it("adds Student.icsShowFullName default false", () => {
    expect(sql).toMatch(
      /ALTER TABLE "Student" ADD COLUMN "icsShowFullName" BOOLEAN NOT NULL DEFAULT false/
    );
  });

  it("creates CalendarFeedToken table", () => {
    expect(sql).toMatch(/CREATE TABLE "CalendarFeedToken"/);
  });

  it("adds unique index on OAuthCalendarConnection (provider, adminUserId)", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "OAuthCalendarConnection_provider_adminUserId_key"/
    );
  });

  it("does not DROP columns or tables", () => {
    const sqlNoComments = sql.replace(/--[^\n]*/g, "");
    expect(sqlNoComments).not.toMatch(/DROP\s+COLUMN/i);
    expect(sqlNoComments).not.toMatch(/DROP\s+TABLE/i);
  });
});

describe("calendar wave WS0 Prisma DMMF", () => {
  it("Student.icsShowFullName defaults false at ORM layer", () => {
    const field = getField("Student", "icsShowFullName");
    expect(field.type).toBe("Boolean");
    expect(field.hasDefaultValue).toBe(true);
    expect(field.default).toBe(false);
  });

  it("OAuthCalendarConnection still has calendarCount field", () => {
    expect(getField("OAuthCalendarConnection", "calendarCount").type).toBe("Int");
  });

  it("OAuthCalendarConnection has compound unique provider + adminUserId", () => {
    const model = getModel("OAuthCalendarConnection");
    const unique = model.uniqueFields.find(
      (u) => u.length === 2 && u.includes("provider") && u.includes("adminUserId")
    );
    expect(unique).toBeDefined();
  });

  it("CalendarFeedToken model exists with token unique", () => {
    getModel("CalendarFeedToken");
    expect(getField("CalendarFeedToken", "token").isUnique).toBe(true);
  });
});
