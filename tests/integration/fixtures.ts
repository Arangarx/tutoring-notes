import { test as base, expect } from "@playwright/test";
import {
  blobIntegrationEnabled,
} from "../helpers/blob-gate";

/**
 * Integration tests (`npm run test:integration`) use `storageState` from
 * `integration-setup` (see `auth.setup.ts`). Extend this module when
 * integration tests need shared fixtures beyond the default `page` + `baseURL`.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    if (blobIntegrationEnabled()) {
      const res = await page.request.post("/api/test/blob/reset");
      if (!res.ok()) {
        throw new Error(`Harness reset failed: ${res.status()} ${await res.text()}`);
      }
    }
    await use(page);
  },
});
export { expect };
