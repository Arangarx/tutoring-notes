"use strict";

/**
 * CHECK constraints and partial consent indexes.
 * The statements are read from the stage 3 migration so there is one copy.
 * prisma db push creates the columns and does not apply those statements.
 * DROP IF EXISTS and CREATE INDEX IF NOT EXISTS make a second local run safe.
 * The self-learner backfill INSERT stays in the migration file and is not run here.
 * Local databases only. Refuses a non-local host.
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { assertLocalDatabaseUrlForHarness } = require("./wb-regression-local-db.cjs");

const MIGRATION_PATH = path.join(
  __dirname,
  "..",
  "prisma",
  "migrations",
  "20261011130000_org_learner",
  "migration.sql"
);

const GUARD_NAMES = [
  "student_single_owner",
  "consent_record_single_owner",
  "ConsentRecord_tutor_version_key",
  "ConsentRecord_org_version_key",
];

function statementsFromMigration(sql) {
  const parts = sql
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  return GUARD_NAMES.map((name) => {
    const matches = parts.filter((part) => part.includes(name));
    if (matches.length !== 1) {
      throw new Error(`Expected one migration statement for ${name}, found ${matches.length}`);
    }
    return matches[0];
  });
}

function idempotent(statement) {
  const constraint = statement.match(
    /ALTER TABLE\s+("[A-Za-z0-9_]+")\s+ADD CONSTRAINT\s+([A-Za-z0-9_]+)/
  );
  if (constraint) {
    return `ALTER TABLE ${constraint[1]} DROP CONSTRAINT IF EXISTS ${constraint[2]};\n${statement};`;
  }
  if (/CREATE UNIQUE INDEX\s+"[A-Za-z0-9_]+"/.test(statement)) {
    return `${statement.replace(
      /CREATE UNIQUE INDEX\s+/,
      "CREATE UNIQUE INDEX IF NOT EXISTS "
    )};`;
  }
  throw new Error("Org learner guard statement is not a CHECK or partial unique index");
}

function guardSql(migrationSql) {
  return statementsFromMigration(migrationSql).map(idempotent).join("\n");
}

function main() {
  assertLocalDatabaseUrlForHarness();
  const migrationSql = fs.readFileSync(MIGRATION_PATH, "utf8");
  const file = path.join(os.tmpdir(), `org-learner-guards-${process.pid}.sql`);
  fs.writeFileSync(file, guardSql(migrationSql));
  try {
    execSync(
      `npx prisma db execute --file "${file}" --schema prisma/schema.prisma`,
      { stdio: "inherit", env: process.env }
    );
  } finally {
    fs.unlinkSync(file);
  }
}

if (require.main === module) {
  main();
}

module.exports = { guardSql, statementsFromMigration, MIGRATION_PATH };
