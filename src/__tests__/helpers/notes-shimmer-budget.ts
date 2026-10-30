/**
 * Wait for the in-flight notes UI while `notes:reduce:before_resolve` is parked.
 *
 * That point is outside a transaction. `OUT_OF_TX_HOLD_CAP_MS` in
 * `src/lib/test-seams.ts` is 30s. This budget stays 15s under that cap so the
 * ~800ms motion sample and the release still finish before the seam
 * auto-releases. Do not raise it without lowering the gap check in
 * `notes-shimmer-wait-budget.test.ts`.
 */
export const IN_FLIGHT_NOTES_UI_WAIT_MS = 15_000;
