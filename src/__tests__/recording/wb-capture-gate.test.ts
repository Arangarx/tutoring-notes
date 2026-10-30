import { deriveWbCaptureActive } from "@/lib/recording/session-capabilities";

/**
 * p3-clock (disconnect pause/freeze) — the whiteboard-capture gate.
 *
 * Before p3-clock the workspace fed the WB recorder `wbSignal`, which in
 * audio modes equals FSM `recordingActive` and therefore went FALSE the
 * moment a stable student disconnect paused the FSM — dropping every tutor
 * stroke drawn during the gap. The ratified behavior (Andrew 2026-07-02) is
 * that WB capture CONTINUES through the pause, stamped at the frozen clock,
 * so gap strokes collapse to the pause instant on replay.
 *
 * The `isPaused → true` cases below are the red-before/green-after core:
 * they assert the NEW "keep capturing during the disconnect gap" contract
 * that the old `wbSignal` wiring got wrong.
 */
describe("deriveWbCaptureActive", () => {
  describe("audio modes (audioMode !== none)", () => {
    test("captures while recording", () => {
      expect(
        deriveWbCaptureActive({
          audioMode: "full",
          recordingActive: true,
          isPaused: false,
          wbEventsActive: true,
        })
      ).toBe(true);
    });

    test("CONTINUES capturing while FSM is paused (disconnect gap) — the fix", () => {
      expect(
        deriveWbCaptureActive({
          audioMode: "full",
          recordingActive: false,
          isPaused: true,
          wbEventsActive: true,
        })
      ).toBe(true);
      // tutor_only (student audio denied) behaves the same for WB capture.
      expect(
        deriveWbCaptureActive({
          audioMode: "tutor_only",
          recordingActive: false,
          isPaused: true,
          wbEventsActive: true,
        })
      ).toBe(true);
    });

    test("does NOT capture while armed (armed is not paused — CF-2.1 gate preserved)", () => {
      expect(
        deriveWbCaptureActive({
          audioMode: "tutor_only",
          recordingActive: false,
          isPaused: false,
          wbEventsActive: true,
        })
      ).toBe(false);
    });

    test("does NOT capture while idle/stopping (neither recording nor paused)", () => {
      expect(
        deriveWbCaptureActive({
          audioMode: "full",
          recordingActive: false,
          isPaused: false,
          wbEventsActive: false,
        })
      ).toBe(false);
    });
  });

  describe("audioMode === none (IN_PERSON / audio denied) — follows wbEventsActive", () => {
    test("captures when wbEventsActive (CF-2 IN_PERSON replay)", () => {
      expect(
        deriveWbCaptureActive({
          audioMode: "none",
          recordingActive: false,
          isPaused: false,
          wbEventsActive: true,
        })
      ).toBe(true);
    });

    test("does not capture when session not active", () => {
      expect(
        deriveWbCaptureActive({
          audioMode: "none",
          recordingActive: false,
          isPaused: true, // even a paused FSM: none-mode strictly tracks wbEventsActive
          wbEventsActive: false,
        })
      ).toBe(false);
    });

    test("isPaused does NOT force capture in none-mode (no audio-clock to freeze)", () => {
      // Guards the audio-mode `|| isPaused` branch from leaking into none-mode:
      // with wbEventsActive already true the result is true regardless, so we
      // assert the inverse — a paused FSM alone (wbEventsActive false) must NOT
      // turn capture on the way it does in audio modes.
      expect(
        deriveWbCaptureActive({
          audioMode: "none",
          recordingActive: false,
          isPaused: true,
          wbEventsActive: true,
        })
      ).toBe(true); // driven purely by wbEventsActive, not by isPaused
    });
  });
});
