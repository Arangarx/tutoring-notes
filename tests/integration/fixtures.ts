import { test as base, expect } from "@playwright/test";

/**
 * Integration tests (`npm run test:integration`) use `storageState` from
 * `integration-setup` (see `auth.setup.ts`). Extend this module when
 * integration tests need shared fixtures beyond the default `page` + `baseURL`.
 */
export const test = base;
export { expect };
