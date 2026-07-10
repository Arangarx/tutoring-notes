import { deriveSyncPillState } from "@/lib/whiteboard/sync-pill-presentation";

describe("deriveSyncPillState — Phase 4d waiting-for-student dedupe", () => {
  test("bothPartiesInRoom → green 'Student connected' pill (positive affirmation)", () => {
    const state = deriveSyncPillState({
      tutorSyncConnected: true,
      bothPartiesInRoom: true,
    });
    expect(state.show).toBe(true);
    expect(state.label).toBe("Student connected");
    expect(state.color).toBe("green");
    expect(state.reason).toBe("student-connected");
  });

  // UI-honesty: brief window after join shows "syncing board…" so the tutor
  // isn't falsely told the board is already in sync before the welcome push
  // has been applied by the student.
  test("bothPartiesInRoom + boardSyncing → amber 'Student connected — syncing board…' pill", () => {
    const state = deriveSyncPillState({
      tutorSyncConnected: true,
      bothPartiesInRoom: true,
      boardSyncing: true,
    });
    expect(state.show).toBe(true);
    expect(state.label).toBe("Student connected \u2014 syncing board\u2026");
    expect(state.color).toBe("amber");
    expect(state.reason).toBe("student-connected-syncing");
  });

  test("bothPartiesInRoom + boardSyncing=false → green 'Student connected' (syncing window ended)", () => {
    const state = deriveSyncPillState({
      tutorSyncConnected: true,
      bothPartiesInRoom: true,
      boardSyncing: false,
    });
    expect(state.show).toBe(true);
    expect(state.label).toBe("Student connected");
    expect(state.color).toBe("green");
    expect(state.reason).toBe("student-connected");
  });

  test("sync-server not yet connected → grey 'Sync connecting…' pill (distinct signal from awaiting-student)", () => {
    const state = deriveSyncPillState({
      tutorSyncConnected: false,
      bothPartiesInRoom: false,
    });
    expect(state.show).toBe(true);
    expect(state.label).toBe("Sync connecting…");
    expect(state.color).toBe("grey");
    expect(state.reason).toBe("sync-connecting");
  });

  test("awaiting-student → show=false (banner + recording-pill cover this; sync-pill collapses)", () => {
    const state = deriveSyncPillState({
      tutorSyncConnected: true,
      bothPartiesInRoom: false,
    });
    expect(state.show).toBe(false);
    expect(state.reason).toBe("awaiting-student");
    // We still carry the would-be label + colour so the workspace
    // can fall through to alternate UI cheaply if a future polish
    // wants to surface the awaiting-student state in a different
    // form factor — but no live caller renders this today.
    expect(state.label).toBe("Awaiting student");
    expect(state.color).toBe("amber");
  });

  test("invariant: a green pill ONLY appears when both parties are in the room AND boardSyncing is not active", () => {
    const notGreenCases = [
      { tutorSyncConnected: false, bothPartiesInRoom: false },
      { tutorSyncConnected: true, bothPartiesInRoom: false },
      // boardSyncing=true is amber, not green, even when in-room
      { tutorSyncConnected: true, bothPartiesInRoom: true, boardSyncing: true },
    ];
    for (const inputs of notGreenCases) {
      expect(deriveSyncPillState(inputs).color).not.toBe("green");
    }
    expect(
      deriveSyncPillState({
        tutorSyncConnected: true,
        bothPartiesInRoom: true,
        boardSyncing: false,
      }).color
    ).toBe("green");
  });

  test("invariant: bothPartiesInRoom always renders, regardless of tutorSyncConnected (defensive — bothPartiesInRoom shouldn't be true without sync connected, but if upstream gives us that input we still surface the positive state)", () => {
    // Theoretically unreachable in production (bothPartiesInRoom
    // is derived from `tutorSyncConnected && peerCount >= 1`), but
    // the helper is defensive: if a future refactor changes the
    // derivation, the green pill remains correct.
    const state = deriveSyncPillState({
      tutorSyncConnected: false,
      bothPartiesInRoom: true,
    });
    expect(state.show).toBe(true);
    expect(state.color).toBe("green");
  });
});
