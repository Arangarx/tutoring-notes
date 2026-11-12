/**
 * The learner's "room unavailable" card (consent wave C3c, Q9 / E19). The server's `live: false` reason picks the
 * copy; `online_off` uses the family line of the `live_off` entry reason (plan § 2.5 copy table, typed here).
 */

import {
  joinUnavailableCopy,
  joinUnavailableReasonFromServer,
} from "@/lib/whiteboard/join-unavailable-copy";

describe("joinUnavailableReasonFromServer", () => {
  test.each(["session_ended", "token_revoked", "token_expired", "online_off"] as const)(
    "%s keeps its own reason",
    (raw) => {
      expect(joinUnavailableReasonFromServer(raw)).toBe(raw);
    }
  );

  test.each([undefined, null, "", "some_future_reason", 42])(
    "an unknown reason (%p) is 'unavailable', never a bad link",
    (raw) => {
      const reason = joinUnavailableReasonFromServer(raw);
      expect(reason).toBe("unavailable");
      expect(joinUnavailableCopy(reason, "Ms. Tutor").title).not.toBe(
        joinUnavailableCopy("link_invalid", "Ms. Tutor").title
      );
    }
  );
});

describe("joinUnavailableCopy — online_off", () => {
  test("says the learner was disconnected because live sessions are off", () => {
    expect(joinUnavailableCopy("online_off", "Ms. Tutor")).toEqual({
      title: "You were disconnected",
      body: "Live sessions are off in privacy settings.",
    });
  });

  test("the unknown-reason card reads as unavailable and points at the tutor", () => {
    expect(joinUnavailableCopy("unavailable", "Ms. Tutor")).toEqual({
      title: "This session isn't available right now.",
      body: "Ask Ms. Tutor what to do next.",
    });
  });
});
