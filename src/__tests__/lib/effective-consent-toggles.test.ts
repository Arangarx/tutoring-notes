import {
  effectiveConsentToggles,
  type ConsentToggleCeiling,
  type ConsentToggleRestriction,
} from "@/lib/consent-scope";

const ALL_ON: ConsentToggleCeiling = {
  allowLiveSession: true,
  allowAudioRecording: true,
  allowWhiteboardRecording: true,
  allowNoteSending: true,
};

const ALL_OFF: ConsentToggleCeiling = {
  allowLiveSession: false,
  allowAudioRecording: false,
  allowWhiteboardRecording: false,
  allowNoteSending: false,
};

describe("effectiveConsentToggles", () => {
  test("echoes the ceiling when the restriction is missing", () => {
    expect(effectiveConsentToggles(ALL_ON, null)).toEqual(ALL_ON);
    expect(effectiveConsentToggles(ALL_OFF, undefined)).toEqual(ALL_OFF);
    expect(effectiveConsentToggles(ALL_ON, {})).toEqual(ALL_ON);
  });

  test("a false ceiling stays false even when the matching restriction is off", () => {
    const restriction: ConsentToggleRestriction = {
      restrictAudioRecording: false,
      restrictWhiteboardRecording: false,
      restrictNoteSending: false,
    };
    expect(effectiveConsentToggles(ALL_OFF, restriction)).toEqual(ALL_OFF);
  });

  test("audio, whiteboard, and notes are denied when that restriction is on", () => {
    expect(
      effectiveConsentToggles(ALL_ON, { restrictAudioRecording: true })
    ).toEqual({
      ...ALL_ON,
      allowAudioRecording: false,
    });
    expect(
      effectiveConsentToggles(ALL_ON, { restrictWhiteboardRecording: true })
    ).toEqual({
      ...ALL_ON,
      allowWhiteboardRecording: false,
    });
    expect(
      effectiveConsentToggles(ALL_ON, { restrictNoteSending: true })
    ).toEqual({
      ...ALL_ON,
      allowNoteSending: false,
    });
  });

  test("a null restriction field is not a restriction", () => {
    expect(
      effectiveConsentToggles(ALL_ON, {
        restrictAudioRecording: null,
        restrictWhiteboardRecording: null,
        restrictNoteSending: null,
      })
    ).toEqual(ALL_ON);
  });

  test("live session follows the ceiling and the live-session restriction only", () => {
    expect(
      effectiveConsentToggles(
        { ...ALL_ON, allowLiveSession: false },
        {
          restrictAudioRecording: true,
          restrictWhiteboardRecording: true,
          restrictNoteSending: true,
        }
      ).allowLiveSession
    ).toBe(false);
    expect(
      effectiveConsentToggles(ALL_ON, {
        restrictAudioRecording: true,
        restrictWhiteboardRecording: true,
        restrictNoteSending: true,
      }).allowLiveSession
    ).toBe(true);
    expect(
      effectiveConsentToggles(ALL_ON, { restrictLiveSession: true }).allowLiveSession
    ).toBe(false);
    expect(
      effectiveConsentToggles(
        { ...ALL_ON, allowLiveSession: false },
        { restrictLiveSession: true }
      ).allowLiveSession
    ).toBe(false);
  });

  test("whiteboard denial from the record survives an explicit false restriction", () => {
    expect(
      effectiveConsentToggles(
        { ...ALL_ON, allowWhiteboardRecording: false },
        { restrictWhiteboardRecording: false }
      ).allowWhiteboardRecording
    ).toBe(false);
  });

  test("whiteboard stays on only when the record allows it and the restriction is off", () => {
    expect(
      effectiveConsentToggles(ALL_ON, { restrictWhiteboardRecording: false })
        .allowWhiteboardRecording
    ).toBe(true);
    expect(
      effectiveConsentToggles(ALL_ON, { restrictWhiteboardRecording: true })
        .allowWhiteboardRecording
    ).toBe(false);
    expect(
      effectiveConsentToggles(
        { ...ALL_ON, allowWhiteboardRecording: false },
        { restrictWhiteboardRecording: true }
      ).allowWhiteboardRecording
    ).toBe(false);
  });
});
