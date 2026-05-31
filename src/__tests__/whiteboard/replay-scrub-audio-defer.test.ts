/**
 * @jest-environment jsdom
 */

import { fireEvent } from "@testing-library/react";
import { attachReplayScrubAudioDefer } from "@/lib/whiteboard/replay-scrub-audio-defer";

describe("attachReplayScrubAudioDefer", () => {
  function createAudio(initialSec = 0) {
    const audio = document.createElement("audio");
    document.body.appendChild(audio);
    let currentTime = initialSec;
    Object.defineProperty(audio, "currentTime", {
      configurable: true,
      get: () => currentTime,
      set: (v: number) => {
        currentTime = v;
      },
    });
    return {
      audio,
      getCurrentTime: () => currentTime,
      cleanup: () => audio.remove(),
    };
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function scrubPointerDown(audio: HTMLAudioElement) {
    fireEvent.pointerDown(audio, { button: 0, pointerId: 1, pointerType: "mouse" });
  }

  function scrubPointerUp() {
    fireEvent.pointerUp(window, { button: 0, pointerId: 1, pointerType: "mouse" });
  }

  it("does not commit audio during drag seeking ticks; commits once on pointerup", () => {
    const { audio } = createAudio(0);
    const commits: Array<{ sec: number; generation: number }> = [];
    let committedSec = 0;

    attachReplayScrubAudioDefer(audio, {
      getCommittedSec: () => committedSec,
      setCommittedSec: (sec) => {
        committedSec = sec;
      },
      onVisualSeekMs: () => undefined,
      onAudioCommitSec: (sec, generation) => {
        commits.push({ sec, generation });
      },
    });

    scrubPointerDown(audio);
    audio.currentTime = 10;
    fireEvent.seeking(audio);
    audio.currentTime = 20;
    fireEvent.seeking(audio);
    expect(commits).toHaveLength(0);

    scrubPointerUp();
    expect(commits).toHaveLength(1);
    expect(commits[0]!.sec).toBe(20);
  });

  it("reverts currentTime to committed position during drag seeking", () => {
    const { audio, getCurrentTime } = createAudio(5);
    let committedSec = 5;

    attachReplayScrubAudioDefer(audio, {
      getCommittedSec: () => committedSec,
      setCommittedSec: (sec) => {
        committedSec = sec;
      },
      onVisualSeekMs: () => undefined,
      onAudioCommitSec: () => undefined,
    });

    scrubPointerDown(audio);
    audio.currentTime = 42;
    fireEvent.seeking(audio);
    expect(getCurrentTime()).toBe(5);
  });

  it("commits once on seeked for click-to-seek when pointer is already up", () => {
    const { audio } = createAudio(0);
    const commits: number[] = [];
    let committedSec = 0;

    attachReplayScrubAudioDefer(audio, {
      getCommittedSec: () => committedSec,
      setCommittedSec: (sec) => {
        committedSec = sec;
      },
      onVisualSeekMs: () => undefined,
      onAudioCommitSec: (sec) => {
        commits.push(sec);
      },
    });

    audio.currentTime = 30;
    fireEvent.seeking(audio);
    fireEvent.seeked(audio);
    expect(commits).toEqual([30]);
  });

  it("ignores superseded commit generation in host (contract)", () => {
    const { audio } = createAudio(0);
    const generations: number[] = [];
    let committedSec = 0;

    attachReplayScrubAudioDefer(audio, {
      getCommittedSec: () => committedSec,
      setCommittedSec: (sec) => {
        committedSec = sec;
      },
      onVisualSeekMs: () => undefined,
      onAudioCommitSec: (_sec, generation) => {
        generations.push(generation);
      },
    });

    scrubPointerDown(audio);
    audio.currentTime = 10;
    fireEvent.seeking(audio);
    scrubPointerUp();

    scrubPointerDown(audio);
    audio.currentTime = 50;
    fireEvent.seeking(audio);
    scrubPointerUp();

    expect(generations).toEqual([1, 2]);
    expect(generations[1]).toBeGreaterThan(generations[0]!);
  });
});
