/**
 * @jest-environment node
 *
 * WS-B server-persist policy — pure cursor/retry/mutex/warning logic (BLOCKER-2 / SF-1 / SF-8).
 */

import {
  computeBackoffMs,
  nextConsecutiveFailures,
  SERVER_PERSIST_MAX_RETRIES,
  SERVER_PERSIST_WARNING_MESSAGE,
  SERVER_PERSIST_WARNING_THRESHOLD,
  shouldAdvanceCursorOnResponse,
  shouldRetryPersist,
  shouldShowPersistWarning,
  shouldSkipPersistTick,
  shouldStopPersistOnResponse,
} from "@/lib/whiteboard/server-persist-policy";

describe("server-persist-policy", () => {
  describe("mutex (SF-1)", () => {
    it("skips interval tick when persist is in flight", () => {
      expect(shouldSkipPersistTick(true)).toBe(true);
      expect(shouldSkipPersistTick(false)).toBe(false);
    });
  });

  describe("cursor advance (BLOCKER-2)", () => {
    it("advances only on 2xx", () => {
      expect(shouldAdvanceCursorOnResponse(200)).toBe(true);
      expect(shouldAdvanceCursorOnResponse(201)).toBe(true);
      expect(shouldAdvanceCursorOnResponse(409)).toBe(false);
      expect(shouldAdvanceCursorOnResponse(500)).toBe(false);
    });

    it("409 stops persist without advancing cursor", () => {
      expect(shouldStopPersistOnResponse(409)).toBe(true);
      expect(shouldStopPersistOnResponse(500)).toBe(false);
    });

    it("retries non-409 errors up to 3 times then stops", () => {
      expect(shouldRetryPersist(500, 0, SERVER_PERSIST_MAX_RETRIES)).toBe(true);
      expect(shouldRetryPersist(500, 2, SERVER_PERSIST_MAX_RETRIES)).toBe(true);
      expect(shouldRetryPersist(500, 3, SERVER_PERSIST_MAX_RETRIES)).toBe(false);
      expect(shouldRetryPersist(409, 0, SERVER_PERSIST_MAX_RETRIES)).toBe(false);
      expect(shouldRetryPersist(200, 0, SERVER_PERSIST_MAX_RETRIES)).toBe(false);
    });

    it("uses exponential backoff between retries", () => {
      expect(computeBackoffMs(0)).toBe(250);
      expect(computeBackoffMs(1)).toBe(500);
      expect(computeBackoffMs(2)).toBe(1000);
    });
  });

  describe("tutor warning (SF-8)", () => {
    it("surfaces warning after ≥3 consecutive failures", () => {
      expect(shouldShowPersistWarning(2)).toBe(false);
      expect(shouldShowPersistWarning(3)).toBe(true);
      expect(shouldShowPersistWarning(4)).toBe(true);
    });

    it("resets consecutive failure counter on success", () => {
      expect(nextConsecutiveFailures(2, true)).toBe(0);
      expect(nextConsecutiveFailures(2, false)).toBe(3);
    });

    it("uses the expected user-facing warning copy", () => {
      expect(SERVER_PERSIST_WARNING_MESSAGE).toContain("local draft");
      expect(SERVER_PERSIST_WARNING_THRESHOLD).toBe(3);
    });
  });
});
