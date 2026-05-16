/**
 * Pure-function tests for the recording lifecycle FSM.
 *
 * Coverage matrix (per master plan Phase 1 Task 1):
 *   - Tutor solo (no sync).
 *   - Tutor + 1 student (the historical 1:1 case).
 *   - Tutor + 2 students (group session canary — NEW).
 *   - Participant joins mid-session.
 *   - One of N participants drops (group session: must NOT pause).
 *   - All participants drop after meeting → paused, all_participants_disconnected.
 *   - Solo rehearsal grace before first participant joins.
 *   - Sustained network outage → paused, network_offline.
 *   - Per-stream health: failed stream is excluded from shouldCapture.
 *   - Multi-stream shouldCapture: tutor:mic + student:peer-X:mic.
 *   - End-session lifecycle (stopping → uploading → done / failed).
 *   - Backwards-compat presentation strings (legacy banner / pill copy).
 *   - Stream id helper conventions (tutor mic constant + student mic builder).
 */

import {
  derivePresentation,
  evaluateLifecycle,
  studentMicStreamId,
  TUTOR_MIC_STREAM_ID,
  type LifecycleInputs,
  type StreamHealth,
} from "@/lib/recording/lifecycle-machine";

const NOW = 12_345;

function baseInputs(overrides: Partial<LifecycleInputs> = {}): LifecycleInputs {
  return {
    tutorWantsRecording: false,
    participants: new Set<string>(),
    everHadParticipants: false,
    soloEnabled: false,
    syncEnabled: true,
    inputStreams: new Map<string, StreamHealth>([
      [TUTOR_MIC_STREAM_ID, "ok"],
    ]),
    networkOk: true,
    audioClockMs: NOW,
    ...overrides,
  };
}

describe("evaluateLifecycle — core decision tree", () => {
  test("idle when tutor hasn't pressed Start", () => {
    const out = evaluateLifecycle(baseInputs());
    expect(out.state).toBe("idle");
    expect(out.recordingActive).toBe(false);
    expect(out.shouldCaptureWB).toBe(false);
    expect(out.uiPillKind).toBe("off");
    expect(out.shouldCapture(TUTOR_MIC_STREAM_ID)).toBe(false);
  });

  test("tutor-solo mode (no sync) ignores participants — recording = tutorWantsRecording", () => {
    const recording = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        syncEnabled: false,
      })
    );
    expect(recording.state).toBe("recording");
    expect(recording.recordingActive).toBe(true);
    expect(recording.shouldCaptureWB).toBe(true);
    expect(recording.shouldCapture(TUTOR_MIC_STREAM_ID)).toBe(true);

    const paused = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: false,
        syncEnabled: false,
      })
    );
    expect(paused.state).toBe("idle");
    expect(paused.recordingActive).toBe(false);
  });

  test("tutor + 1 student → recording", () => {
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(["peerA"]),
        everHadParticipants: true,
      })
    );
    expect(out.state).toBe("recording");
    expect(out.recordingActive).toBe(true);
    expect(out.uiPillKind).toBe("recording");
  });

  test("tutor + 2 students (group session canary) → recording", () => {
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(["peerA", "peerB"]),
        everHadParticipants: true,
      })
    );
    expect(out.state).toBe("recording");
    expect(out.recordingActive).toBe(true);
  });

  test("group session: one of two students drops → still recording", () => {
    // Started with both peers, then peerB dropped.
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(["peerA"]),
        everHadParticipants: true,
      })
    );
    expect(out.state).toBe("recording");
    expect(out.pausedReason).toBeUndefined();
  });

  test("all participants drop after meeting → paused (all_participants_disconnected)", () => {
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set<string>(),
        everHadParticipants: true,
      })
    );
    expect(out.state).toBe("paused");
    expect(out.pausedReason).toBe("all_participants_disconnected");
    expect(out.recordingActive).toBe(false);
    expect(out.shouldCaptureWB).toBe(false);
    expect(out.shouldCapture(TUTOR_MIC_STREAM_ID)).toBe(false);
  });

  test("tutor pressed Start before any student joined → armed (awaiting_first_participant)", () => {
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set<string>(),
        everHadParticipants: false,
      })
    );
    expect(out.state).toBe("armed");
    expect(out.armedReason).toBe("awaiting_first_participant");
    expect(out.recordingActive).toBe(false);
  });

  test("solo rehearsal grace: tutor wants + soloEnabled + no participant ever → recording", () => {
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set<string>(),
        everHadParticipants: false,
        soloEnabled: true,
      })
    );
    expect(out.state).toBe("recording");
    expect(out.recordingActive).toBe(true);
  });

  test("Phase 4d audio-flow gate: participant present but no audio flowing yet → armed (awaiting_audio_flow)", () => {
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(["peerA"]),
        everHadParticipants: true,
        participantsWithFlowingAudio: new Set<string>(),
      })
    );
    expect(out.state).toBe("armed");
    expect(out.armedReason).toBe("awaiting_audio_flow");
    expect(out.recordingActive).toBe(false);
    expect(out.shouldCaptureWB).toBe(false);
    expect(out.shouldCapture(TUTOR_MIC_STREAM_ID)).toBe(false);
  });

  test("Phase 4d audio-flow gate: participant present AND their audio is flowing → recording", () => {
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(["peerA"]),
        everHadParticipants: true,
        participantsWithFlowingAudio: new Set(["peerA"]),
      })
    );
    expect(out.state).toBe("recording");
    expect(out.recordingActive).toBe(true);
  });

  test("Phase 4d audio-flow gate: 2 peers present, only 1 audio flowing → recording (any peer's audio is enough)", () => {
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(["peerA", "peerB"]),
        everHadParticipants: true,
        participantsWithFlowingAudio: new Set(["peerA"]),
      })
    );
    expect(out.state).toBe("recording");
  });

  test("Phase 4d audio-flow gate: audio-flowing set contains only a NOT-present peer → still armed (intersection is empty)", () => {
    // Defensive: stale entries in `participantsWithFlowingAudio`
    // for peers no longer in `participants` must not pretend the
    // current participants are flowing.
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(["peerA"]),
        everHadParticipants: true,
        participantsWithFlowingAudio: new Set(["peer-gone"]),
      })
    );
    expect(out.state).toBe("armed");
    expect(out.armedReason).toBe("awaiting_audio_flow");
  });

  test("Phase 4d audio-flow gate: everHadAudioFlow=true → gate releases, mid-session audio blip does NOT re-arm", () => {
    // Real-world: once we've started recording, a transient
    // audio-flow drop (network blip, peer's mic glitches for 1s)
    // must NOT cause the FSM to go back to armed and stop the
    // MediaRecorder. The sticky latch is what protects against
    // record-stop/restart churn.
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(["peerA"]),
        everHadParticipants: true,
        participantsWithFlowingAudio: new Set<string>(), // blip — temporarily zero
        everHadAudioFlow: true, // sticky latch from earlier in the session
      })
    );
    expect(out.state).toBe("recording");
  });

  test("Phase 4d audio-flow gate: participantsWithFlowingAudio undefined (legacy callers) → recording on presence (backward compat)", () => {
    // Pre-4d callers (and tests) don't pass the new input; FSM
    // must still produce the legacy behaviour.
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(["peerA"]),
        everHadParticipants: true,
        // participantsWithFlowingAudio: undefined
      })
    );
    expect(out.state).toBe("recording");
  });

  test("Phase 4d audio-flow gate: solo-tutor (sync disabled) bypasses the gate entirely", () => {
    // Tutor solo recording doesn't have remote peers; the gate
    // must not block solo mode regardless of what's threaded in.
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        syncEnabled: false,
        participants: new Set<string>(),
        participantsWithFlowingAudio: new Set<string>(),
      })
    );
    expect(out.state).toBe("recording");
  });

  test("Phase 4d audio-flow gate: derivePresentation surfaces 'Waiting for audio…' copy when awaiting_audio_flow", () => {
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(["peerA"]),
        everHadParticipants: true,
        participantsWithFlowingAudio: new Set<string>(),
      })
    );
    const pres = derivePresentation(out, {
      tutorWantsRecording: true,
      participants: new Set(["peerA"]),
      everHadParticipants: true,
      syncEnabled: true,
      armedReason: out.armedReason,
    });
    expect(pres.pillLabel).toBe("Waiting for audio…");
    expect(pres.pillColor).toBe("amber");
    expect(pres.bannerMessage).toMatch(/Student is here/);
    // awaitingStart === false (student IS here; not "awaiting start").
    expect(pres.awaitingStart).toBe(false);
  });

  test("solo grace expires after first participant has joined", () => {
    // soloEnabled is still true but a student already joined this
    // session and is now gone. We should NOT fall back to solo
    // rehearsal — once everHadParticipants is sticky-true, the gate
    // becomes the standard "need at least one participant".
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set<string>(),
        everHadParticipants: true,
        soloEnabled: true,
      })
    );
    expect(out.state).toBe("paused");
    expect(out.pausedReason).toBe("all_participants_disconnected");
  });

  test("sustained network outage → paused (network_offline)", () => {
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(["peerA"]),
        everHadParticipants: true,
        networkOk: false,
      })
    );
    expect(out.state).toBe("paused");
    expect(out.pausedReason).toBe("network_offline");
  });

  test("participant joins mid-session: armed → recording across two evaluations", () => {
    const before = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set<string>(),
        everHadParticipants: false,
      })
    );
    expect(before.state).toBe("armed");

    const after = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(["peerA"]),
        everHadParticipants: true, // host latches once they appeared
      })
    );
    expect(after.state).toBe("recording");
  });
});

describe("evaluateLifecycle — multi-stream shouldCapture", () => {
  test("captures all healthy streams when recording", () => {
    const studentId = studentMicStreamId("peerA");
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(["peerA"]),
        everHadParticipants: true,
        inputStreams: new Map([
          [TUTOR_MIC_STREAM_ID, "ok" as StreamHealth],
          [studentId, "ok" as StreamHealth],
        ]),
      })
    );
    expect(out.shouldCapture(TUTOR_MIC_STREAM_ID)).toBe(true);
    expect(out.shouldCapture(studentId)).toBe(true);
    // Unknown stream id → don't capture (the FSM has no idea about it).
    expect(out.shouldCapture("ghost:cam")).toBe(false);
  });

  test("degraded streams are still captured (warning state, not failed)", () => {
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(["peerA"]),
        everHadParticipants: true,
        inputStreams: new Map([[TUTOR_MIC_STREAM_ID, "degraded" as StreamHealth]]),
      })
    );
    expect(out.shouldCapture(TUTOR_MIC_STREAM_ID)).toBe(true);
  });

  test("failed streams are excluded from shouldCapture even while recording", () => {
    const studentId = studentMicStreamId("peerA");
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(["peerA"]),
        everHadParticipants: true,
        inputStreams: new Map([
          [TUTOR_MIC_STREAM_ID, "ok" as StreamHealth],
          [studentId, "failed" as StreamHealth],
        ]),
      })
    );
    expect(out.state).toBe("recording");
    expect(out.shouldCapture(TUTOR_MIC_STREAM_ID)).toBe(true);
    expect(out.shouldCapture(studentId)).toBe(false);
  });

  test("a single failed mic does NOT flip global state to paused (Phase 1 scope)", () => {
    // We may add an "all-streams-failed → paused" axis later; Phase 1
    // intentionally keeps stream health out of the global gate.
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(["peerA"]),
        everHadParticipants: true,
        inputStreams: new Map([[TUTOR_MIC_STREAM_ID, "failed" as StreamHealth]]),
      })
    );
    expect(out.state).toBe("recording");
    expect(out.shouldCapture(TUTOR_MIC_STREAM_ID)).toBe(false);
    // Whiteboard event capture is independent of input streams.
    expect(out.shouldCaptureWB).toBe(true);
  });
});

describe("evaluateLifecycle — end-session takes precedence", () => {
  test.each([
    ["stopping", "stopping", "saving"],
    ["uploading", "uploading", "saving"],
    ["done", "done", "off"],
  ] as const)(
    "endIntent=%s → state=%s pillKind=%s",
    (endIntent, expectedState, expectedPill) => {
      const out = evaluateLifecycle(
        baseInputs({
          tutorWantsRecording: true,
          participants: new Set(["peerA"]),
          everHadParticipants: true,
          endIntent,
        })
      );
      expect(out.state).toBe(expectedState);
      expect(out.uiPillKind).toBe(expectedPill);
      // shouldCaptureWB false in stopping/uploading/done — no new
      // events should be appended after End is initiated.
      expect(out.shouldCaptureWB).toBe(false);
      // shouldCapture true ONLY for stopping (final segments still
      // flush). Uploading + done are post-flush.
      const expectCapture = endIntent === "stopping";
      expect(out.shouldCapture(TUTOR_MIC_STREAM_ID)).toBe(expectCapture);
    }
  );

  test("endIntent=failed → state=failed pillKind=error", () => {
    const out = evaluateLifecycle(
      baseInputs({ tutorWantsRecording: true, endIntent: "failed" })
    );
    expect(out.state).toBe("failed");
    expect(out.uiPillKind).toBe("error");
  });
});

describe("evaluateLifecycle — passthrough fields", () => {
  test("wbClockMs mirrors audioClockMs input", () => {
    const out = evaluateLifecycle(baseInputs({ audioClockMs: 999_999 }));
    expect(out.wbClockMs).toBe(999_999);
  });

  test("inFlightStreamCount mirrors input (default 0)", () => {
    const out0 = evaluateLifecycle(baseInputs());
    expect(out0.inFlightStreamCount).toBe(0);
    const out2 = evaluateLifecycle(baseInputs({ inFlightStreamCount: 2 }));
    expect(out2.inFlightStreamCount).toBe(2);
  });
});

describe("derivePresentation — backwards-compat UI strings", () => {
  test("tutor-solo Recording / Paused (no banner ever)", () => {
    const recording = evaluateLifecycle(
      baseInputs({ tutorWantsRecording: true, syncEnabled: false })
    );
    const ui = derivePresentation(recording, {
      tutorWantsRecording: true,
      participants: new Set(),
      everHadParticipants: false,
      syncEnabled: false,
    });
    expect(ui.recordingActive).toBe(true);
    expect(ui.pillLabel).toBe("Recording");
    expect(ui.pillColor).toBe("red");
    expect(ui.bannerMessage).toBe("");
    expect(ui.autoPaused).toBe(false);

    const paused = evaluateLifecycle(
      baseInputs({ tutorWantsRecording: false, syncEnabled: false })
    );
    const uiPaused = derivePresentation(paused, {
      tutorWantsRecording: false,
      participants: new Set(),
      everHadParticipants: false,
      syncEnabled: false,
    });
    expect(uiPaused.pillLabel).toBe("Paused");
    expect(uiPaused.pillColor).toBe("grey");
    expect(uiPaused.bannerMessage).toBe("");
  });

  test("waiting for student before any join — 'will start' copy + amber pill", () => {
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(),
        everHadParticipants: false,
      })
    );
    const ui = derivePresentation(out, {
      tutorWantsRecording: true,
      participants: new Set(),
      everHadParticipants: false,
      syncEnabled: true,
    });
    expect(ui.recordingActive).toBe(false);
    expect(ui.autoPaused).toBe(true);
    expect(ui.awaitingStart).toBe(true);
    expect(ui.pillLabel).toBe("Waiting for student");
    expect(ui.pillColor).toBe("amber");
    expect(ui.bannerMessage).toMatch(/start automatically/i);
    expect(ui.bannerMessage).toMatch(/student to join/i);
  });

  test("student dropped after meeting — 'will resume' copy distinct from 'will start'", () => {
    const startCopy = derivePresentation(
      evaluateLifecycle(
        baseInputs({
          tutorWantsRecording: true,
          participants: new Set(),
          everHadParticipants: false,
        })
      ),
      {
        tutorWantsRecording: true,
        participants: new Set(),
        everHadParticipants: false,
        syncEnabled: true,
      }
    );
    const resumeCopy = derivePresentation(
      evaluateLifecycle(
        baseInputs({
          tutorWantsRecording: true,
          participants: new Set(),
          everHadParticipants: true,
        })
      ),
      {
        tutorWantsRecording: true,
        participants: new Set(),
        everHadParticipants: true,
        syncEnabled: true,
      }
    );
    expect(resumeCopy.bannerMessage).toMatch(/resume automatically/i);
    expect(resumeCopy.pillLabel).toMatch(/Auto-paused/);
    expect(startCopy.bannerMessage).not.toBe(resumeCopy.bannerMessage);
  });

  test("solo rehearsal pill + banner when soloEnabled and no peer", () => {
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(),
        everHadParticipants: false,
        soloEnabled: true,
      })
    );
    const ui = derivePresentation(out, {
      tutorWantsRecording: true,
      participants: new Set(),
      everHadParticipants: false,
      syncEnabled: true,
    });
    expect(ui.recordingActive).toBe(true);
    expect(ui.pillLabel).toBe("Solo rehearsal");
    expect(ui.pillColor).toBe("amber");
    expect(ui.bannerMessage).toMatch(/Solo rehearsal/i);
  });

  test("network offline pill + banner", () => {
    const out = evaluateLifecycle(
      baseInputs({
        tutorWantsRecording: true,
        participants: new Set(["peerA"]),
        everHadParticipants: true,
        networkOk: false,
      })
    );
    const ui = derivePresentation(out, {
      tutorWantsRecording: true,
      participants: new Set(["peerA"]),
      everHadParticipants: true,
      syncEnabled: true,
    });
    expect(ui.pillLabel).toMatch(/Auto-paused.*offline/i);
    expect(ui.bannerMessage).toMatch(/offline/i);
    expect(ui.bannerMessage).toMatch(/resume automatically/i);
  });

  test("end-session lifecycle UI: Saving… → Saved", () => {
    const stopping = derivePresentation(
      evaluateLifecycle(baseInputs({ tutorWantsRecording: true, endIntent: "stopping" })),
      {
        tutorWantsRecording: true,
        participants: new Set(),
        everHadParticipants: true,
        syncEnabled: true,
      }
    );
    expect(stopping.pillLabel).toBe("Saving…");
    expect(stopping.pillColor).toBe("grey");

    const done = derivePresentation(
      evaluateLifecycle(baseInputs({ tutorWantsRecording: true, endIntent: "done" })),
      {
        tutorWantsRecording: true,
        participants: new Set(),
        everHadParticipants: true,
        syncEnabled: true,
      }
    );
    expect(done.pillLabel).toBe("Saved");
  });
});

describe("stream id helpers", () => {
  test("TUTOR_MIC_STREAM_ID is the stable literal", () => {
    expect(TUTOR_MIC_STREAM_ID).toBe("tutor:mic");
  });

  test("studentMicStreamId composes a unique id per peer", () => {
    expect(studentMicStreamId("alpha")).toBe("student:peer-alpha:mic");
    expect(studentMicStreamId("alpha")).not.toBe(studentMicStreamId("beta"));
  });
});
