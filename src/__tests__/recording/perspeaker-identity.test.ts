/**
 * perspeaker-identity — deterministic CORE of per-speaker capture (Phase 4 / p3-perspeaker C).
 *
 * These pure functions encode the hard-won device-switch identity invariant
 * (ORCHESTRATOR-STATE, 2026-07-02): a per-speaker transcript must be keyed on
 * the STABLE `identityKey` (survives a device switch), NOT on the transport
 * `peerId` (which embeds `deviceId`). The fragile runtime wiring
 * (recorder lifecycle + outbox-drain trigger) is intentionally NOT here — this
 * module is the isolated, deterministically-testable core.
 */

import {
  TUTOR_SPEAKER_ID,
  resolveSpeakerId,
  speakerTranscriptStreamId,
  reconcileSpeakers,
  dedupSpeakerSegments,
  type LivePeer,
  type SpeakerSegment,
} from "@/lib/recording/perspeaker-identity";

// identityKey = sha256(learnerProfileId:sessionId)[:12] (hex, no hyphens);
// deviceId = 8-hex (no hyphens). peerId = `student-<identityKey>-<deviceId>`.
const IDENTITY_A = "abc123def456";
const IDENTITY_B = "0011223344ff";
const DEVICE_1 = "a1b2c3d4";
const DEVICE_2 = "99887766";
const studentPeer = (identity: string, device: string) =>
  `student-${identity}-${device}`;
const TUTOR_PEER = "tutor-550e8400-e29b-41d4-a716-446655440000";

describe("resolveSpeakerId — stable speaker identity across devices", () => {
  it("maps a student peerId to its identityKey (device-independent)", () => {
    expect(resolveSpeakerId(studentPeer(IDENTITY_A, DEVICE_1))).toBe(IDENTITY_A);
  });

  it("returns the SAME speaker id for the same learner on two different devices (device switch)", () => {
    const onDeviceA = resolveSpeakerId(studentPeer(IDENTITY_A, DEVICE_1));
    const onDeviceB = resolveSpeakerId(studentPeer(IDENTITY_A, DEVICE_2));
    expect(onDeviceA).toBe(onDeviceB);
    expect(onDeviceA).toBe(IDENTITY_A);
  });

  it("distinguishes two different learners", () => {
    expect(resolveSpeakerId(studentPeer(IDENTITY_A, DEVICE_1))).not.toBe(
      resolveSpeakerId(studentPeer(IDENTITY_B, DEVICE_1))
    );
  });

  it("maps a tutor peerId to the fixed tutor speaker id", () => {
    expect(resolveSpeakerId(TUTOR_PEER)).toBe(TUTOR_SPEAKER_ID);
  });

  it("falls back to the raw peerId for a legacy/unparseable peerId (stable, no throw)", () => {
    expect(resolveSpeakerId("legacy-abc")).toBe("legacy-abc");
    expect(resolveSpeakerId("")).toBe("");
  });
});

describe("speakerTranscriptStreamId — transcript lane keyed on identity, not peer", () => {
  it("is stable across devices for the same learner", () => {
    const a = speakerTranscriptStreamId(
      resolveSpeakerId(studentPeer(IDENTITY_A, DEVICE_1))
    );
    const b = speakerTranscriptStreamId(
      resolveSpeakerId(studentPeer(IDENTITY_A, DEVICE_2))
    );
    expect(a).toBe(b);
  });

  it("differs from the per-device transport stream id shape (student:peer-<peerId>:mic)", () => {
    const laneId = speakerTranscriptStreamId(IDENTITY_A);
    expect(laneId).not.toContain(DEVICE_1);
    expect(laneId).toContain(IDENTITY_A);
  });
});

describe("reconcileSpeakers — dedup by identity, newest device wins, never pre-kill incoming device", () => {
  it("collapses two peers with the same identityKey into ONE active speaker (device switch), keeping the newest joinedAt", () => {
    const peers: LivePeer[] = [
      { peerId: studentPeer(IDENTITY_A, DEVICE_1), joinedAt: 1000 }, // device A (older)
      { peerId: studentPeer(IDENTITY_A, DEVICE_2), joinedAt: 2000 }, // device B (newer)
    ];
    const res = reconcileSpeakers(peers, { maxSpeakers: 4 });
    expect(res.active).toHaveLength(1);
    expect(res.active[0].peerId).toBe(studentPeer(IDENTITY_A, DEVICE_2)); // newest wins
    expect(res.superseded.map((p) => p.peerId)).toEqual([
      studentPeer(IDENTITY_A, DEVICE_1),
    ]);
    expect(res.speakerCount).toBe(1);
  });

  it("does NOT drop the incoming device based on raw stream count (the 3>2 pre-kill bug)", () => {
    // tutor + student device A + student device B = 3 raw streams, but only 2 identities.
    const peers: LivePeer[] = [
      { peerId: TUTOR_PEER },
      { peerId: studentPeer(IDENTITY_A, DEVICE_1), joinedAt: 1000 },
      { peerId: studentPeer(IDENTITY_A, DEVICE_2), joinedAt: 2000 },
    ];
    const res = reconcileSpeakers(peers, { maxSpeakers: 2 });
    // 2 distinct identities (tutor + student A) — within cap; incoming device B is the surviving one.
    expect(res.overCap).toHaveLength(0);
    expect(res.speakerCount).toBe(2);
    const activeStudent = res.active.find(
      (p) => resolveSpeakerId(p.peerId) === IDENTITY_A
    );
    expect(activeStudent?.peerId).toBe(studentPeer(IDENTITY_A, DEVICE_2));
  });

  it("keeps every distinct speaker when under the cap", () => {
    const peers: LivePeer[] = [
      { peerId: TUTOR_PEER },
      { peerId: studentPeer(IDENTITY_A, DEVICE_1), joinedAt: 1000 },
      { peerId: studentPeer(IDENTITY_B, DEVICE_1), joinedAt: 1500 },
    ];
    const res = reconcileSpeakers(peers, { maxSpeakers: 4 });
    expect(res.speakerCount).toBe(3);
    expect(res.overCap).toHaveLength(0);
  });

  it("never caps the tutor; drops surplus student identities beyond the cap (defensive guard)", () => {
    const peers: LivePeer[] = [
      { peerId: TUTOR_PEER },
      { peerId: studentPeer(IDENTITY_A, DEVICE_1), joinedAt: 1000 },
      { peerId: studentPeer(IDENTITY_B, DEVICE_1), joinedAt: 3000 }, // latest surplus
    ];
    const res = reconcileSpeakers(peers, { maxSpeakers: 2 });
    expect(res.speakerCount).toBe(2);
    // tutor always kept
    expect(res.active.some((p) => resolveSpeakerId(p.peerId) === TUTOR_SPEAKER_ID)).toBe(
      true
    );
    // the surplus (latest-joined) student identity is over cap
    expect(res.overCap.map((p) => resolveSpeakerId(p.peerId))).toEqual([IDENTITY_B]);
  });

  it("is deterministic when joinedAt is missing (stable peerId tiebreak, no throw)", () => {
    const peers: LivePeer[] = [
      { peerId: studentPeer(IDENTITY_A, DEVICE_2) },
      { peerId: studentPeer(IDENTITY_A, DEVICE_1) },
    ];
    const res = reconcileSpeakers(peers, { maxSpeakers: 4 });
    expect(res.active).toHaveLength(1);
    // tie on joinedAt → deterministic pick = lexicographically smallest peerId.
    // DEVICE_2 ("99887766") < DEVICE_1 ("a1b2c3d4") since digits precede letters in ASCII.
    expect(res.active[0].peerId).toBe(studentPeer(IDENTITY_A, DEVICE_2));
  });
});

describe("dedupSpeakerSegments — collapse the brief A+B device-switch overlap", () => {
  type Seg = SpeakerSegment & { text: string };

  it("drops an overlapping same-speaker segment, keeping the longer coverage", () => {
    const segs: Seg[] = [
      { speakerId: IDENTITY_A, offsetMs: 1000, endMs: 4000, text: "device A capture" },
      { speakerId: IDENTITY_A, offsetMs: 2000, endMs: 3000, text: "device B overlap" },
    ];
    const out = dedupSpeakerSegments(segs);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("device A capture"); // longer coverage kept
  });

  it("never merges segments from DIFFERENT speakers even if their times overlap", () => {
    const segs: Seg[] = [
      { speakerId: IDENTITY_A, offsetMs: 1000, endMs: 3000, text: "student A" },
      { speakerId: TUTOR_SPEAKER_ID, offsetMs: 1500, endMs: 3500, text: "tutor" },
    ];
    const out = dedupSpeakerSegments(segs);
    expect(out).toHaveLength(2);
  });

  it("keeps adjacent, non-overlapping same-speaker segments (boundary touch is not overlap)", () => {
    const segs: Seg[] = [
      { speakerId: IDENTITY_A, offsetMs: 0, endMs: 1000, text: "first" },
      { speakerId: IDENTITY_A, offsetMs: 1000, endMs: 2000, text: "second" },
    ];
    const out = dedupSpeakerSegments(segs);
    expect(out).toHaveLength(2);
  });

  it("returns segments sorted by (speakerId, offsetMs) and is a no-op on an empty list", () => {
    expect(dedupSpeakerSegments([])).toEqual([]);
    const segs: Seg[] = [
      { speakerId: IDENTITY_A, offsetMs: 5000, endMs: 6000, text: "late" },
      { speakerId: IDENTITY_A, offsetMs: 0, endMs: 1000, text: "early" },
    ];
    const out = dedupSpeakerSegments(segs);
    expect(out.map((s) => s.offsetMs)).toEqual([0, 5000]);
  });
});
