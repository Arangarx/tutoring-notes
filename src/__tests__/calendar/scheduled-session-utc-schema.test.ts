/**
 * @jest-environment node
 *
 * Additive startAt/endAt migration — SQL on disk + DMMF.
 */
import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";

const migrationPath = path.resolve(
  __dirname,
  "../../../prisma/migrations/20260917180000_scheduled_session_utc/migration.sql"
);

describe("scheduled session UTC instants migration", () => {
  it("adds startAt/endAt and backfills from wall clock", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");
    expect(sql).toMatch(/ADD COLUMN "startAt" TIMESTAMPTZ\(3\)/);
    expect(sql).toMatch(/ADD COLUMN "endAt" TIMESTAMPTZ\(3\)/);
    expect(sql).toMatch(/AT TIME ZONE/);
    const sqlNoComments = sql.replace(/--[^\n]*/g, "");
    expect(sqlNoComments).not.toMatch(/DROP\s+COLUMN/i);
    expect(sqlNoComments).not.toMatch(/DROP\s+TABLE/i);
  });

  it("exposes optional DateTime startAt/endAt on ScheduledSession", () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "ScheduledSession");
    expect(model).toBeDefined();
    const startAt = model!.fields.find((f) => f.name === "startAt");
    const endAt = model!.fields.find((f) => f.name === "endAt");
    expect(startAt?.type).toBe("DateTime");
    expect(startAt?.isRequired).toBe(false);
    expect(endAt?.type).toBe("DateTime");
    expect(endAt?.isRequired).toBe(false);
  });
});
