/**
 * Unit tests for `composeBridgeState` — the pure precedence rollup
 * that lets the End-session button know whether the workspace can
 * call `endWhiteboardSession` yet.
 *
 * Why these exist (and not just the DOM test):
 *   - The DOM test covers happy + timeout. Everything in between
 *     (hook uploading layered on top of an outbox row, the "failed"
 *     short-circuit, the "registering" vs "idle" distinction) is
 *     easier to assert without React.
 *   - The matrix grows when Phase 4 adds student-mic streams; this
 *     suite is the regression net for that work.
 */

import { composeBridgeState } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceAudioBridge";
import type { UseAudioRecorderReturn } from "@/hooks/useAudioRecorder";
import type { OutboxObserverState } from "@/lib/recording/upload-outbox";

function makeAudio(
  state: UseAudioRecorderReturn["state"],
  error: string | null = null
): UseAudioRecorderReturn {
  // We only need the two fields composeBridgeState reads; the cast
  // tolerates the rest. Keeping the test file lean beats a 50-line
  // mock factory just for two booleans.
  return { state, error } as unknown as UseAudioRecorderReturn;
}

function makeOutbox(
  overrides: Partial<OutboxObserverState> = {}
): OutboxObserverState {
  return {
    state: "idle",
    inFlightStreamCount: 0,
    byStream: new Map<string, number>(),
    lastError: null,
    ...overrides,
  };
}

describe("composeBridgeState", () => {
  test("idle when hook is ready and outbox is empty", () => {
    const result = composeBridgeState(makeAudio("ready"), makeOutbox());
    expect(result.kind).toBe("idle");
    expect(result.inFlightCount).toBe(0);
    expect(result.lastError).toBeNull();
  });

  test("hook recording dominates outbox state", () => {
    const result = composeBridgeState(
      makeAudio("recording"),
      makeOutbox({ state: "uploading", inFlightStreamCount: 3 })
    );
    expect(result.kind).toBe("recording");
    expect(result.inFlightCount).toBe(3);
  });

  test("hook uploading adds 1 to outbox in-flight count", () => {
    const result = composeBridgeState(
      makeAudio("uploading"),
      makeOutbox({
        state: "uploading",
        inFlightStreamCount: 2,
        byStream: new Map([["tutor:mic", 2]]),
      })
    );
    expect(result.kind).toBe("uploading");
    // 2 (outbox queued) + 1 (hook is mid-upload pre-enqueue)
    expect(result.inFlightCount).toBe(3);
  });

  test("outbox failed surfaces as bridge failed", () => {
    const result = composeBridgeState(
      makeAudio("ready"),
      makeOutbox({ state: "failed", lastError: "permanent upload failure" })
    );
    expect(result.kind).toBe("failed");
    expect(result.lastError).toBe("permanent upload failure");
  });

  test("hook error surfaces as failed even if outbox is idle", () => {
    const result = composeBridgeState(
      makeAudio("error", "mic permission revoked"),
      makeOutbox()
    );
    expect(result.kind).toBe("failed");
    expect(result.lastError).toBe("mic permission revoked");
  });

  test("hook error trumps outbox lastError priority", () => {
    const result = composeBridgeState(
      makeAudio("error", "from hook"),
      makeOutbox({ state: "uploading", lastError: "from outbox" })
    );
    // Hook wins error precedence — the hook is closer to the user's
    // immediate action than the outbox worker.
    expect(result.lastError).toBe("from hook");
  });

  test("outbox uploading shows uploading", () => {
    const result = composeBridgeState(
      makeAudio("ready"),
      makeOutbox({
        state: "uploading",
        inFlightStreamCount: 1,
        byStream: new Map([["tutor:mic", 1]]),
      })
    );
    expect(result.kind).toBe("uploading");
    expect(result.inFlightCount).toBe(1);
    expect(result.inFlightByStream.get("tutor:mic")).toBe(1);
  });

  test("outbox registering shows registering with inFlightCount=0", () => {
    const result = composeBridgeState(
      makeAudio("ready"),
      makeOutbox({ state: "registering", inFlightStreamCount: 0 })
    );
    expect(result.kind).toBe("registering");
    expect(result.inFlightCount).toBe(0);
  });

  test("multi-stream breakdown surfaces per-stream counts", () => {
    const result = composeBridgeState(
      makeAudio("ready"),
      makeOutbox({
        state: "uploading",
        inFlightStreamCount: 3,
        byStream: new Map([
          ["tutor:mic", 1],
          ["student:peer-abc:mic", 2],
        ]),
      })
    );
    expect(result.inFlightByStream.get("tutor:mic")).toBe(1);
    expect(result.inFlightByStream.get("student:peer-abc:mic")).toBe(2);
  });
});
