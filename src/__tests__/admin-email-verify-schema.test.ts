/**
 * Additive tutor-email-verify migration + schema fields.
 * Independent oracle: the SQL file on disk + Prisma DMMF, not runtime behavior.
 */
import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";

const migrationPath = path.resolve(
  __dirname,
  "../../prisma/migrations/20260911000000_admin_email_verified/migration.sql"
);

describe("admin emailVerifiedAt migration SQL", () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, "utf-8");
  });

  it("migration file exists", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it("adds AdminUser.emailVerifiedAt", () => {
    expect(sql).toMatch(/ALTER TABLE "AdminUser" ADD COLUMN "emailVerifiedAt"/);
  });

  it("backfills existing AdminUser rows in the same file (lockout prevention)", () => {
    expect(sql).toMatch(
      /UPDATE "AdminUser" SET "emailVerifiedAt" = NOW\(\) WHERE "emailVerifiedAt" IS NULL/
    );
  });

  it("creates AdminUserEmailToken", () => {
    expect(sql).toMatch(/CREATE TABLE "AdminUserEmailToken"/);
  });

  it("does NOT drop any column or table", () => {
    const sqlNoComments = sql.replace(/--[^\n]*/g, "");
    expect(sqlNoComments).not.toMatch(/DROP\s+COLUMN/i);
    expect(sqlNoComments).not.toMatch(/DROP\s+TABLE/i);
  });
});

describe("AdminUser emailVerifiedAt + AdminUserEmailToken in Prisma schema", () => {
  const dmmf = Prisma.dmmf;

  function getModel(name: string) {
    const model = dmmf.datamodel.models.find((m) => m.name === name);
    if (!model) throw new Error(`model ${name} missing`);
    return model;
  }

  function getField(model: string, field: string) {
    const f = getModel(model).fields.find((x) => x.name === field);
    if (!f) throw new Error(`field ${model}.${field} missing`);
    return f;
  }

  it("AdminUser.emailVerifiedAt is optional DateTime", () => {
    const f = getField("AdminUser", "emailVerifiedAt");
    expect(f.isRequired).toBe(false);
    expect(f.type).toBe("DateTime");
  });

  it("AdminUserEmailToken model exists with hashed token + purpose", () => {
    getModel("AdminUserEmailToken");
    expect(getField("AdminUserEmailToken", "tokenHash").isUnique).toBe(true);
    expect(getField("AdminUserEmailToken", "purpose").type).toBe("AdminUserEmailTokenPurpose");
    expect(getField("AdminUserEmailToken", "consumedAt").isRequired).toBe(false);
  });

  it("AdminUserEmailTokenPurpose is SIGNUP_VERIFY only", () => {
    const enumDef = dmmf.datamodel.enums.find((e) => e.name === "AdminUserEmailTokenPurpose");
    expect(enumDef?.values.map((v) => v.name)).toEqual(["SIGNUP_VERIFY"]);
  });
});
