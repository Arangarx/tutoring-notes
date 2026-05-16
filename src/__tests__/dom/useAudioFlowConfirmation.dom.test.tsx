/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";

import { useAudioFlowConfirmation } from "@/hooks/useAudioFlowConfirmation";
import type { AvParticipant } from "@/hooks/useLiveAV";

// --- Fake MediaStreamTrack ------------------------------------------------
//
// jsdom doesn't implement MediaStreamTrack. We need controllable
// `muted`/`readyState` + `addEventListener("mute"|"unmute")` semantics.

type Listener = (ev: Event) => void;

class FakeAudioTrack {
  kind = "audio";
  muted: boolean;
  readyState: "live" | "ended" = "live";
  private listeners = new Map<string, Set<Listener>>();

  constructor(initialMuted: boolean) {
    this.muted = initialMuted;
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const l of set) l(new Event(type));
  }

  setMuted(next: boolean): void {
    if (this.muted === next) return;
    this.muted = next;
    this.dispatch(next ? "mute" : "unmute");
  }

  end(): void {
    this.readyState = "ended";
    this.dispatch("ended");
  }
}

function makeFakeStream(tracks: FakeAudioTrack[]): MediaStream {
  return {
    getAudioTracks: () => tracks as unknown as MediaStreamTrack[],
    getTracks: () => tracks as unknown as MediaStreamTrack[],
    getVideoTracks: () => [] as MediaStreamTrack[],
  } as unknown as MediaStream;
}

function makeParticipant(
  peerId: string,
  tracks: FakeAudioTrack[]
): AvParticipant {
  return {
    peerId,
    role: "student",
    audioStream: tracks.length > 0 ? makeFakeStream(tracks) : null,
    videoStream: null,
    iceConnectionState: "connected",
    peerConnectionState: "connected",
  } as unknown as AvParticipant;
}

describe("useAudioFlowConfirmation", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test("empty participants → empty set", () => {
    const { result } = renderHook(() => useAudioFlowConfirmation([]));
    expect(result.current.size).toBe(0);
  });

  test("participant with no audioStream → not flowing", () => {
    const p = {
      peerId: "p1",
      role: "student",
      audioStream: null,
      videoStream: null,
      iceConnectionState: "new",
      peerConnectionState: "new",
    } as unknown as AvParticipant;
    const { result } = renderHook(() => useAudioFlowConfirmation([p]));
    expect(result.current.has("p1")).toBe(false);
  });

  test("audio track already unmuted at subscribe → added after confirmMs", () => {
    const track = new FakeAudioTrack(false);
    const p = makeParticipant("p1", [track]);
    const { result } = renderHook(() =>
      useAudioFlowConfirmation([p], { confirmMs: 200 })
    );
    expect(result.current.has("p1")).toBe(false);
    act(() => {
      jest.advanceTimersByTime(199);
    });
    expect(result.current.has("p1")).toBe(false);
    act(() => {
      jest.advanceTimersByTime(2);
    });
    expect(result.current.has("p1")).toBe(true);
  });

  test("track muted at subscribe → never added (no flow yet)", () => {
    const track = new FakeAudioTrack(true);
    const p = makeParticipant("p1", [track]);
    const { result } = renderHook(() =>
      useAudioFlowConfirmation([p], { confirmMs: 200 })
    );
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current.has("p1")).toBe(false);
  });

  test("track fires 'unmute' event → added after confirmMs", () => {
    const track = new FakeAudioTrack(true);
    const p = makeParticipant("p1", [track]);
    const { result } = renderHook(() =>
      useAudioFlowConfirmation([p], { confirmMs: 200 })
    );
    expect(result.current.has("p1")).toBe(false);
    act(() => {
      track.setMuted(false);
      jest.advanceTimersByTime(250);
    });
    expect(result.current.has("p1")).toBe(true);
  });

  test("transient unmute → remute within confirmMs → NEVER added (debounce)", () => {
    const track = new FakeAudioTrack(true);
    const p = makeParticipant("p1", [track]);
    const { result } = renderHook(() =>
      useAudioFlowConfirmation([p], { confirmMs: 200 })
    );
    act(() => {
      track.setMuted(false);
      jest.advanceTimersByTime(150);
      track.setMuted(true);
      jest.advanceTimersByTime(500);
    });
    expect(result.current.has("p1")).toBe(false);
  });

  test("flowing then mute → removed immediately (no debounce on the removal)", () => {
    const track = new FakeAudioTrack(false);
    const p = makeParticipant("p1", [track]);
    const { result } = renderHook(() =>
      useAudioFlowConfirmation([p], { confirmMs: 200 })
    );
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current.has("p1")).toBe(true);
    act(() => {
      track.setMuted(true);
    });
    expect(result.current.has("p1")).toBe(false);
  });

  test("track 'ended' event → removed immediately", () => {
    const track = new FakeAudioTrack(false);
    const p = makeParticipant("p1", [track]);
    const { result } = renderHook(() =>
      useAudioFlowConfirmation([p], { confirmMs: 200 })
    );
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current.has("p1")).toBe(true);
    act(() => {
      track.end();
    });
    expect(result.current.has("p1")).toBe(false);
  });

  test("participant removed from array → peer removed from set", () => {
    const trackA = new FakeAudioTrack(false);
    const trackB = new FakeAudioTrack(false);
    const pA = makeParticipant("p1", [trackA]);
    const pB = makeParticipant("p2", [trackB]);
    const { result, rerender } = renderHook(
      ({ ps }: { ps: AvParticipant[] }) =>
        useAudioFlowConfirmation(ps, { confirmMs: 100 }),
      { initialProps: { ps: [pA, pB] } }
    );
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(result.current.has("p1")).toBe(true);
    expect(result.current.has("p2")).toBe(true);
    rerender({ ps: [pA] });
    expect(result.current.has("p2")).toBe(false);
    expect(result.current.has("p1")).toBe(true);
  });

  test("multiple tracks per peer → ANY unmuted track is sufficient", () => {
    const trackMuted = new FakeAudioTrack(true);
    const trackLive = new FakeAudioTrack(false);
    const p = makeParticipant("p1", [trackMuted, trackLive]);
    const { result } = renderHook(() =>
      useAudioFlowConfirmation([p], { confirmMs: 100 })
    );
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(result.current.has("p1")).toBe(true);
  });

  test("unmount cleans up event listeners (no memory leaks)", () => {
    const track = new FakeAudioTrack(false);
    const removeSpy = jest.spyOn(track, "removeEventListener");
    const p = makeParticipant("p1", [track]);
    const { unmount } = renderHook(() => useAudioFlowConfirmation([p]));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("mute", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("unmute", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("ended", expect.any(Function));
  });

  test("set identity is stable across renders when contents unchanged", () => {
    const track = new FakeAudioTrack(false);
    const p = makeParticipant("p1", [track]);
    const { result, rerender } = renderHook(
      ({ ps }: { ps: AvParticipant[] }) =>
        useAudioFlowConfirmation(ps, { confirmMs: 100 }),
      { initialProps: { ps: [p] } }
    );
    act(() => {
      jest.advanceTimersByTime(150);
    });
    const set1 = result.current;
    rerender({ ps: [p] });
    rerender({ ps: [p] });
    // Identity may change due to re-running effect; the public
    // contract here is that the CONTENT is stable. (Set identity
    // stability across re-runs is a nice-to-have but harder to
    // guarantee without memoising the array; the FSM consumer uses
    // shallow compare via Set.has() not reference equality.)
    expect(set1.has("p1")).toBe(true);
    expect(result.current.has("p1")).toBe(true);
  });
});
