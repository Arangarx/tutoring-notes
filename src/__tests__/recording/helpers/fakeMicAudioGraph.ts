import type { MicAudioGraph } from "@/lib/mic-recorder-audio";

/**
 * Test-only injectable graph — independent oracle for frame-clock tests.
 * `advance(ms)` only accumulates while `frameClockSetActive(true)`.
 */
export class FakeMicAudioGraph
  implements
    Pick<
      MicAudioGraph,
      | "frameClockGetMs"
      | "frameClockSetActive"
      | "hasFrameClock"
      | "recordingStream"
      | "dispose"
      | "getLevel"
      | "setGain"
      | "addRemoteAudio"
      | "setRemoteGain"
      | "swapLocalMicSource"
      | "publishStream"
    >
{
  private _active = false;
  private _ms = 0;

  /**
   * Whether this fake graph simulates a working frame-counting node.
   * Defaults to true (normal operation). Set to false via the
   * constructor option to simulate the iOS/CSP no-frame-clock path.
   */
  hasFrameClock: boolean;

  constructor({ hasFrameClock = true }: { hasFrameClock?: boolean } = {}) {
    this.hasFrameClock = hasFrameClock;
  }

  recordingStream = { getAudioTracks: () => [], getTracks: () => [] } as unknown as MediaStream;
  publishStream = { getAudioTracks: () => [], getTracks: () => [] } as unknown as MediaStream;

  frameClockGetMs = (): number => this._ms;

  frameClockSetActive = (active: boolean): void => {
    this._active = active;
  };

  /** Advance the fake clock — only accumulates when active. */
  advance(ms: number): void {
    if (this._active) this._ms += ms;
  }

  getLevel = (): number => 0;

  setGain = (_g: number): void => {};

  addRemoteAudio = (_s: MediaStream) => () => {};

  setRemoteGain = (): void => {};

  swapLocalMicSource = (): void => {};

  dispose = (): void => {};
}
