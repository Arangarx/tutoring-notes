/**
 * @jest-environment node
 *
 * Env-admin listing is both owner ids null. A new inline Student-scope
 * `adminUserId: null` outside the named helpers fails this guard.
 */
import fs from "node:fs";
import path from "node:path";

import {
  canAccessStudentRow,
  envOnlyEmailMessageWhere,
  envOnlyNullOwnerWhere,
  studentsWhereForScope,
} from "@/lib/student-scope";

const SRC = path.join(process.cwd(), "src");
const ALLOWED = new Set([
  path.normalize("src/lib/student-scope.ts"),
  path.normalize("src/app/api/auth/calendar/callback/route.ts"),
]);

function walk(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(full, out);
      continue;
    }
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(full);
  }
}

describe("env-admin student scope", () => {
  test("env listing requires both owner ids null", () => {
    expect(studentsWhereForScope({ kind: "env", email: "env@test.local" })).toEqual(
      envOnlyNullOwnerWhere()
    );
    expect(envOnlyNullOwnerWhere()).toEqual({ adminUserId: null, organizationId: null });
    expect(
      canAccessStudentRow(
        { kind: "env", email: "env@test.local" },
        { adminUserId: null, organizationId: "org-1" }
      )
    ).toBe(false);
    expect(
      canAccessStudentRow(
        { kind: "env", email: "env@test.local" },
        { adminUserId: null, organizationId: null }
      )
    ).toBe(true);
    expect(
      canAccessStudentRow(
        { kind: "admin", adminId: "tutor-1", email: "tutor@test.local" },
        { adminUserId: null, organizationId: null }
      )
    ).toBe(false);
  });

  test("email outbox helper is not the student helper", () => {
    expect(envOnlyEmailMessageWhere()).toEqual({ adminUserId: null });
    expect(envOnlyEmailMessageWhere()).not.toEqual(envOnlyNullOwnerWhere());
  });

  test("no new inline Student-scope adminUserId null", () => {
    const files: string[] = [];
    walk(SRC, files);
    const hits: string[] = [];
    for (const file of files) {
      const rel = path.normalize(path.relative(process.cwd(), file));
      if (ALLOWED.has(rel)) continue;
      const text = fs.readFileSync(file, "utf8");
      const re = /adminUserId:\s*null/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(text))) {
        const window = text.slice(Math.max(0, match.index - 80), match.index + 80);
        if (!window.includes("organizationId")) hits.push(`${rel}:${match.index}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
