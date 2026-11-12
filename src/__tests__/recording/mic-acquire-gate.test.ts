/**
 * Consent wave C3b — the pure mic gate (plan § 4.1). The browser behavior (no `getUserMedia` call, control disabled,
 * release on flip) is Playwright: tests/integration/wb-consent-mic.spec.ts.
 */
import { deriveSessionCapabilities } from "@/lib/recording/session-capabilities";
import { logMicRequestBlocked, micRequestBlockedReason } from "@/lib/recording/mic-acquire-gate";

describe("micRequestBlockedReason", () => {
  it("opens the mic only for yes", () => {
    expect(micRequestBlockedReason("yes")).toBeNull();
    expect(micRequestBlockedReason("defer")).toBe("defer");
    expect(micRequestBlockedReason("no")).toBe("no");
  });

  // Spec rows (plan § 2.2 table): audio off + in person → no; audio off + mode unknown → defer; audio off + online
  // → yes (the mic is still used live, M8); audio on → yes in every mode.
  it.each([
    [false, "IN_PERSON", "no"],
    [false, "UNKNOWN", "defer"],
    [false, "LIVE", null],
    [true, "IN_PERSON", null],
    [true, "UNKNOWN", null],
    [true, "LIVE", null],
  ] as const)("audio=%s mode=%s → %s", (audio, sessionMode, expected) => {
    const caps = deriveSessionCapabilities({
      hasConsentSnapshot: true,
      toggles: { audio, whiteboard: true, notes: true },
      sessionMode,
      notesForbidden: false,
    });
    expect(micRequestBlockedReason(caps.mic.acquire)).toBe(expected);
  });
});

describe("logMicRequestBlocked", () => {
  it("prints the [avx] line with reason and source", () => {
    const spy = jest.spyOn(console, "info").mockImplementation(() => {});
    logMicRequestBlocked({ sessionId: "s1", reason: "no", source: "requestMic" });
    expect(spy).toHaveBeenCalledWith("[avx] avx=s1 action=mic_request_blocked reason=no source=requestMic");
    spy.mockRestore();
  });
});
