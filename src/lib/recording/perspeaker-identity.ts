/**
 * Per-speaker identity core — the deterministic, isolated logic of p3-perspeaker C.
 *
 * WHY THIS EXISTS (device-switch continuity — Andrew 2026-07-02, recorded in
 * ORCHESTRATOR-STATE): per-speaker transcription must key the SPEAKER on the
 * stable `identityKey` (survives a device switch), NOT on the transport
 * `peerId` (which embeds `deviceId`). The 4b/4c scaffolding
 * (`useRemoteMicRecorders` + `studentMicStreamId(peerId)`) keys the recorder +
 * outbox row on `peerId` — correct for TRANSPORT (one MediaRecorder per
 * physical device stream), but WRONG for the transcript: a device switch
 * (A→B, same learner, new deviceId) would mint a new stream id and fragment
 * one student into two transcript speakers with a discontinuity.
 *
 * This module supplies the three pure pieces that fix that, kept OUT of the
 * fragile runtime (recorder lifecycle + outbox-drain trigger) so they are
 * deterministically unit-testable now, ahead of the hardware-validated wiring:
 *
 *   1. `resolveSpeakerId(peerId)`      — transport peerId → stable speaker identity.
 *   2. `reconcileSpeakers(peers,…)`    — dedup live peers by speaker identity
 *                                        (newest device wins — mirrors the
 *                                        dual-device self-bump); cap by DISTINCT
 *                                        identity, never by raw stream count.
 *   3. `dedupSpeakerSegments(segs)`    — collapse the brief A+B overlap window so
 *                                        the same speech captured on both devices
 *                                        isn't double-counted in the notes.
 *
 * Isomorphic + pure (no React, no IO, no `server-only`): the eventual C wiring
 * (client hook) and any server-side merge both call it. Reuses the existing
 * `parseStudentPeerId` parser (single source of truth for identity extraction).
 */

import { parseStudentPeerId } from "@/lib/whiteboard/local-peer-id";

/** Fixed speaker identity for the (single) tutor mic. */
export const TUTOR_SPEAKER_ID = "tutor";

/**
 * Resolve the STABLE speaker identity for a transport `peerId`.
 *
 * - Student peer (`student-<identityKey>-<deviceId>`) → `identityKey`
 *   (device-independent → the same value across a device switch).
 * - Tutor peer (`tutor-<uuid>`) → {@link TUTOR_SPEAKER_ID}.
 * - Anything else (legacy random peer, empty, unparseable) → the raw `peerId`
 *   (a stable per-connection fallback; never throws — caller may log).
 */
export function resolveSpeakerId(peerId: string): string {
  const parsed = parseStudentPeerId(peerId);
  if (parsed) return parsed.identityKey;
  if (peerId === TUTOR_SPEAKER_ID || peerId.startsWith(`${TUTOR_SPEAKER_ID}-`)) {
    return TUTOR_SPEAKER_ID;
  }
  return peerId;
}

/**
 * Transcript-lane stream id keyed on the STABLE speaker identity.
 *
 * This is deliberately distinct from `studentMicStreamId(peerId)`
 * (`student:peer-<peerId>:mic`, the per-DEVICE transport/recorder id): the
 * transport id may change on a device switch, but the transcript lane must
 * not — so it is keyed on the speaker identity, keeping one continuous
 * transcript per human across devices.
 */
export function speakerTranscriptStreamId(speakerId: string): string {
  return `speaker:${speakerId}:transcript`;
}

/** A live peer as surfaced by `useLiveAV().participants` (minimal shape). */
export type LivePeer = {
  peerId: string;
  /** Epoch ms when the peer minted its session; absent for tutor/legacy peers. */
  joinedAt?: number;
};

export type ReconcileOptions = {
  /**
   * Max DISTINCT speaker identities (incl. the tutor). Defensive ceiling only —
   * 2-party sessions never approach it; real N>2 group support will revisit the
   * cap policy. The tutor identity is never capped.
   */
  maxSpeakers: number;
};

export type ReconcileResult = {
  /** One active peer per distinct speaker identity — newest device per identity. */
  active: LivePeer[];
  /** Peers superseded by a newer device for the SAME identity (old device mid-switch). */
  superseded: LivePeer[];
  /** Peers excluded because the distinct-identity cap was exceeded (defensive). */
  overCap: LivePeer[];
  /** Number of distinct speaker identities among `active`. */
  speakerCount: number;
};

/**
 * Reconcile live peers into active speakers.
 *
 * Two-stage, and the ORDER is the whole point:
 *
 *   Stage 1 — dedup by speaker identity: group peers by {@link resolveSpeakerId},
 *   keep the NEWEST `joinedAt` per identity (mirrors the dual-device self-bump
 *   where the older device yields to the newer). Ties (equal/absent `joinedAt`)
 *   break on the lexicographically-smallest `peerId` for determinism.
 *
 *   Stage 2 — cap by DISTINCT identity (never raw stream count). Because stage 1
 *   already collapsed a device switch to one peer per identity, a transient
 *   A+B overlap can NEVER trip the cap — so the incoming device is never
 *   pre-killed by a "3>2" count. The tutor is always retained; surplus STUDENT
 *   identities beyond the cap (sorted earliest-joined first = most established)
 *   spill to `overCap`.
 */
export function reconcileSpeakers(
  peers: LivePeer[],
  opts: ReconcileOptions
): ReconcileResult {
  const superseded: LivePeer[] = [];

  // Stage 1: group by speaker identity; newest device wins.
  const byIdentity = new Map<string, LivePeer>();
  const groups = new Map<string, LivePeer[]>();
  for (const p of peers) {
    const id = resolveSpeakerId(p.peerId);
    const list = groups.get(id);
    if (list) list.push(p);
    else groups.set(id, [p]);
  }
  for (const [id, list] of groups.entries()) {
    let winner = list[0];
    for (const cand of list.slice(1)) {
      if (isNewerDevice(cand, winner)) winner = cand;
    }
    for (const p of list) {
      if (p !== winner) superseded.push(p);
    }
    byIdentity.set(id, winner);
  }

  // Stage 2: cap by distinct identity. Tutor always kept.
  const tutor = [...byIdentity.entries()].filter(
    ([id]) => id === TUTOR_SPEAKER_ID
  );
  const students = [...byIdentity.entries()].filter(
    ([id]) => id !== TUTOR_SPEAKER_ID
  );
  // Most-established (earliest joinedAt) first; missing joinedAt = oldest (0).
  students.sort((a, b) => joinedAtOf(a[1]) - joinedAtOf(b[1]));

  const studentBudget = Math.max(0, opts.maxSpeakers - tutor.length);
  const keptStudents = students.slice(0, studentBudget);
  const overCap = students.slice(studentBudget).map(([, p]) => p);

  const active = [...tutor, ...keptStudents].map(([, p]) => p);

  return {
    active,
    superseded,
    overCap,
    speakerCount: active.length,
  };
}

function joinedAtOf(p: LivePeer): number {
  return typeof p.joinedAt === "number" ? p.joinedAt : 0;
}

/** True when `cand` should supersede `current` (newer device, deterministic tie-break). */
function isNewerDevice(cand: LivePeer, current: LivePeer): boolean {
  const cj = joinedAtOf(cand);
  const wj = joinedAtOf(current);
  if (cj !== wj) return cj > wj;
  // Tie on joinedAt → deterministic: keep the lexicographically-smallest peerId.
  return cand.peerId < current.peerId;
}

/** A transcript segment on the shared monotonic session clock. */
export type SpeakerSegment = {
  speakerId: string;
  /** Segment start offset (ms) on the single monotonic session clock. */
  offsetMs: number;
  /** Segment end offset (ms) on the same clock. */
  endMs: number;
};

/**
 * Collapse the brief A+B device-switch overlap.
 *
 * Within a single device, a speaker's chunks are sequential (non-overlapping)
 * by construction, so a time OVERLAP between two same-`speakerId` segments only
 * happens when the same speech was captured on two devices during a switch.
 * Such an overlap is treated as a duplicate: the segment with LESS coverage is
 * dropped (keep the longer). Boundary touch (`offsetMs === prev.endMs`) is NOT
 * an overlap. Different speakers are never compared/merged.
 *
 * Output is sorted by `(speakerId, offsetMs)`. Stable + deterministic.
 */
export function dedupSpeakerSegments<T extends SpeakerSegment>(
  segments: T[]
): T[] {
  if (segments.length === 0) return [];

  const sorted = [...segments].sort((a, b) => {
    if (a.speakerId !== b.speakerId) return a.speakerId < b.speakerId ? -1 : 1;
    if (a.offsetMs !== b.offsetMs) return a.offsetMs - b.offsetMs;
    return a.endMs - b.endMs;
  });

  const kept: T[] = [];
  for (const seg of sorted) {
    const last = kept[kept.length - 1];
    const overlapsLast =
      last !== undefined &&
      last.speakerId === seg.speakerId &&
      seg.offsetMs < last.endMs; // strict: boundary touch is not overlap
    if (!overlapsLast) {
      kept.push(seg);
      continue;
    }
    // Overlapping duplicate for the same speaker → keep the longer coverage.
    const lastLen = last.endMs - last.offsetMs;
    const segLen = seg.endMs - seg.offsetMs;
    if (segLen > lastLen) kept[kept.length - 1] = seg;
    // else: drop `seg` (keep `last`).
  }
  return kept;
}
