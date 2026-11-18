import nextJest from "next/jest.js";

/**
 * Single-project Jest config so we get next/jest's SWC transform on every
 * test file (TypeScript + JSX). Test environment is `node` by default;
 * jsdom files opt in via the docblock comment:
 *
 *   ```
 *   // @ts-check
 *   /** @jest-environment jsdom *\/
 *   ```
 *
 * Why not `projects: [{ env: node }, { env: jsdom }]`? Because next/jest's
 * `createJestConfig` only applies its SWC transform to the OUTER config —
 * inner project configs fall back to babel and choke on TS types. Pragmas
 * are simpler and keep us on one transform pipeline.
 *
 * `setupFilesAfterEnv` runs in EVERY test (node + jsdom). The setup file
 * just imports `@testing-library/jest-dom`, which registers matchers; it
 * has no jsdom requirement so node tests load it harmlessly.
 */

const createJestConfig = nextJest({ dir: "./" });

// These two refuse tutoring_notes_test. Default `npx jest` skips them.
// `npm run test:org-db` sets JEST_ORG_DB=1 and points at tutoring_notes_org_test.
const orgDbOnlySuites =
  process.env.JEST_ORG_DB === "1"
    ? []
    : [
        "<rootDir>/src/__tests__/org/org-slice1.integration.test.ts",
        "<rootDir>/src/__tests__/org/org-learner.integration.test.ts",
      ];

const customJestConfig = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.setup-env.ts"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup-dom.ts"],
  testPathIgnorePatterns: [
    "<rootDir>/.next/",
    "<rootDir>/node_modules/",
    "<rootDir>/tests/",
    "<rootDir>/test-results/",
    "<rootDir>/src/__tests__/helpers/",
    ...orgDbOnlySuites,
  ],
  globalSetup: "<rootDir>/jest.global-setup.ts",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

export default createJestConfig(customJestConfig);
