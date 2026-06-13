/**
 * Shared FakeMediaRecorder for recording hook tests.
 */

export type FakeRecorderState = "inactive" | "recording" | "paused";

export class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];

  static lastInstance(): FakeMediaRecorder {
    const last = FakeMediaRecorder.instances.at(-1);
    if (!last) throw new Error("no FakeMediaRecorder created yet");
    return last;
  }

  static reset(): void {
    FakeMediaRecorder.instances = [];
  }

  state: FakeRecorderState = "inactive";
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void | Promise<void>) | null = null;

  startCalls: unknown[][] = [];
  stopCalls = 0;
  pauseCalls = 0;
  resumeCalls = 0;

  constructor(_stream: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? "audio/webm;codecs=opus";
    FakeMediaRecorder.instances.push(this);
  }

  start(...args: unknown[]): void {
    this.startCalls.push(args);
    this.state = "recording";
  }

  pause(): void {
    this.pauseCalls += 1;
    if (this.state === "recording") this.state = "paused";
  }

  resume(): void {
    this.resumeCalls += 1;
    if (this.state === "paused") this.state = "recording";
  }

  stop(): void {
    this.stopCalls += 1;
    this.state = "inactive";
    queueMicrotask(() => {
      this.onstop?.();
    });
  }

  feedData(blob: Blob = new Blob(["ok"], { type: this.mimeType })): void {
    this.ondataavailable?.({ data: blob });
  }
}

export function installFakeMediaRecorder(): void {
  (globalThis as unknown as { MediaRecorder: typeof FakeMediaRecorder }).MediaRecorder =
    FakeMediaRecorder;
  (
    FakeMediaRecorder as unknown as { isTypeSupported: (t: string) => boolean }
  ).isTypeSupported = () => true;
}

export function installMediaDevicesMock(): {
  fakeStream: MediaStream;
  getUserMedia: jest.Mock;
} {
  const fakeTrack = {
    stop: jest.fn(),
    getSettings: () => ({ deviceId: "fake-mic-id" }),
  };
  const fakeStream = {
    getTracks: () => [fakeTrack],
    getAudioTracks: () => [fakeTrack],
  } as unknown as MediaStream;

  const getUserMedia = jest.fn(async () => fakeStream);
  const enumerateDevices = jest.fn(
    async () =>
      [
        {
          kind: "audioinput",
          deviceId: "fake-mic-id",
          label: "Fake Mic",
          groupId: "",
        },
      ] as MediaDeviceInfo[]
  );

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia, enumerateDevices },
  });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: jest.fn(async () => ({ state: "granted" })) },
  });

  return { fakeStream, getUserMedia };
}
