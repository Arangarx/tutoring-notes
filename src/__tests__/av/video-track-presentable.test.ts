import { hasPresentableVideoTrack } from "@/lib/av/video-track-presentable";

function streamWith(track: Partial<MediaStreamTrack>): MediaStream {
  return {
    getVideoTracks: () => [{ enabled: true, muted: false, readyState: "live", ...track }],
  } as unknown as MediaStream;
}

describe("hasPresentableVideoTrack", () => {
  test("no stream is not presentable", () => {
    expect(hasPresentableVideoTrack(null)).toBe(false);
    expect(hasPresentableVideoTrack(undefined, true)).toBe(false);
  });

  test("a live, enabled, unmuted track is presentable whatever the sender reports", () => {
    for (const reported of [undefined, true, false]) {
      expect(hasPresentableVideoTrack(streamWith({}), reported)).toBe(true);
    }
  });

  test("a muted receiver track stays hidden unless the sender reports camOn", () => {
    const muted = streamWith({ muted: true });
    expect(hasPresentableVideoTrack(muted)).toBe(false);
    expect(hasPresentableVideoTrack(muted, false)).toBe(false);
    expect(hasPresentableVideoTrack(muted, true)).toBe(true);
  });

  test("disabled or ended tracks are never presentable, even when the sender reports camOn", () => {
    expect(hasPresentableVideoTrack(streamWith({ enabled: false }), true)).toBe(false);
    expect(hasPresentableVideoTrack(streamWith({ readyState: "ended" }), true)).toBe(false);
  });
});
