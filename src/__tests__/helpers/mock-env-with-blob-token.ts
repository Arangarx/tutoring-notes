export const TEST_BLOB_RW_TOKEN = "test_blob_rw_token";

/**
 * Body of `jest.mock("@/lib/env", () => require(...).envModuleWithBlobToken())`.
 * Call it from inside the factory. The factory is hoisted above imports, so the
 * test file must `require` this module there rather than closing over an import.
 */
export function envModuleWithBlobToken() {
  const actual = jest.requireActual<typeof import("@/lib/env")>("@/lib/env");
  return {
    ...actual,
    env: { ...actual.env, BLOB_READ_WRITE_TOKEN: TEST_BLOB_RW_TOKEN },
  };
}
