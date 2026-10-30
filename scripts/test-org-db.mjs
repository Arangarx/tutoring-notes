/**
 * Org Jest suites against tutoring_notes_org_test, one process.
 * slice1 leaves org-operator@example.com; the learner suite upserts that row.
 *
 *   npm run test:org-db
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jestBin = path.join(root, "node_modules", "jest", "bin", "jest.js");
const orgDb = "postgresql://postgres:postgres@127.0.0.1:5432/tutoring_notes_org_test";

const env = {
  ...process.env,
  TEST_DATABASE_URL: orgDb,
  DATABASE_URL: orgDb,
  DIRECT_URL: orgDb,
  ADMIN_EMAIL: "org-operator@example.com",
  OPERATOR_EMAILS: "env-operator@example.com",
};

const child = spawn(
  process.execPath,
  [
    jestBin,
    "src/__tests__/org/org-slice1.integration.test.ts",
    "src/__tests__/org/org-learner.integration.test.ts",
    "--runInBand",
  ],
  { cwd: root, env, stdio: "inherit" }
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
