"use client";

/**
 * Whiteboard live-sync client — the bridge between the tutor's
 * workspace and the student's share page over our self-hosted
 * `excalidraw-room` (socket.io) relay at `WHITEBOARD_SYNC_URL`.
 *
 * Trust model (re-read this before changing anything):
 *
 *   - The relay sees only opaque encrypted bytes. AES-GCM-256 with a
 *     32-byte key passed in the URL fragment (`#k=...`) of the join
 *     link. Fragments are never sent in HTTP requests — even if our
 *     server is compromised, the key never reaches it. Same model
 *     Excalidraw uses for excalidraw.com itself.
 *
 *   - A relay compromise can: drop messages, take down live collab,
 *     observe traffic patterns. It cannot: read scene contents,
 *     forge legitimate scene updates (decryption fails on tampered
 *     payload via the GCM auth tag).
 *
 *   - Recording is independent of sync. If the relay is down the
 *     tutor still records normally; `sync-disconnect` markers land
 *     in the event log so post-hoc replay can show what happened.
 *
 * Wire protocol (compatible with upstream `excalidraw-room`):
 *
 *   client → server:
 *     - `join-room`          (roomId)
 *     - `server-broadcast`   (roomId, encryptedBytes, iv)
 *     - `disconnect`         (no payload)
 *
 *   server → client:
 *     - `init-room`          fired right after join
 *     - `first-in-room`      we are alone in the room
 *     - `new-user`           (peerSocketId) — someone else joined
 *     - `room-user-change`   (string[]) — current member list
 *     - `client-broadcast`   (encryptedBytes, iv)
 *
 * The room id and encryption key are generated once when the tutor
 * issues a join token (server action, separate todo). Both the
 * student URL and the tutor's workspace receive the same pair.
 *
 * Tests: `src/__tests__/whiteboard/sync-client.test.ts` (jsdom).
 */

import { io, type Socket } from "socket.io-client";
import type { PageViewState } from "@/lib/whiteboard/board-document-snapshot";
import type { ExcalidrawLikeElement } from "./excalidraw-adapter";

// -----------------------------------------------------------------
// Wire message — what we encrypt and send
// -----------------------------------------------------------------

/**
 * Decrypted wire payload. Kept intentionally small and stable: the
 * recorder + replay only care about the canonical scene snapshot;
 * the relay forwards opaque bytes so it does not constrain this
 * shape at all.
 */
export type WhiteboardWireMessage = {
  /** Schema version — bump and branch on read if we ever evolve this. */
  v: 1;
  /** Stable peer id (NOT the socket id) so reconnects keep attribution. */
  peerId: string;
  /** Author label for UI ("Tutor" / "Student"). */
  role: "tutor" | "student";
  /** Canonical scene snapshot — receiver runs the diff itself. */
  elements: ExcalidrawLikeElement[];
};

/** Tutor camera + zoom for peer “follow me” (wire v2). */
export type WhiteboardWireFollow = {
  scrollX: number;
  scrollY: number;
  /** Excalidraw stores zoom in appState as `{ value: number }` — we send the scalar. */
  zoom: number;
};

/** Page tabs: tutor’s active list + which tab is on screen. */
export type WhiteboardWirePage = {
  activePageId: string;
  pageList: {
    id: string;
    title: string;
    section?: string;
    /** Phase 5 task 8 — tutor-authoritative per-page pan/zoom (optional). */
    viewState?: PageViewState;
  }[];
  /** Optional registry for grouped strip sections (PDF imports). */
  sections?: Record<string, { label: string }>;
};

/**
 * Follow + page UI + which page the `elements` snapshot is for.
 * `scenePageId` can differ from `page.activePageId` when the scene
 * diff is throttled behind a tab switch — receivers must merge
 * `elements` into `scenePageId`, not the tutor’s current tab alone.
 */
export type WhiteboardDocumentWireV3 = {
  rev: number;
  pages: Readonly<Record<string, ReadonlyArray<ExcalidrawLikeElement>>>;
};

export type WhiteboardWireRemoteDetails = {
  follow?: WhiteboardWireFollow;
  page?: WhiteboardWirePage;
  scenePageId?: string;
  /** v3: apply this instead of the single `elements` array. */
  document?: WhiteboardDocumentWireV3;
};

/**
 * v2: optional `follow` + `page` — backward compatible: old clients
 * only understand `elements` (treat v2 as v1 for scene).
 */
export type WhiteboardWireMessageV2 = {
  v: 2;
  peerId: string;
  role: "tutor" | "student";
  elements: ExcalidrawLikeElement[];
  follow?: WhiteboardWireFollow;
  page?: WhiteboardWirePage;
  /** Page the `elements` array belongs to (may lag `page.activePageId`). */
  scenePageId?: string;
};

/**
 * v3: one authoritative **multi-page document** per message. The tutor (and
 * optionally other peers) sends the full per-tab `pages` map with a
 * monotonic `rev` so clients can drop stale reordered packets. This replaces
 * the v2 pattern of a single `elements[]` + `scenePageId` (fragile for
 * multi-tab, single-slot throttling, and out-of-order follow vs merge).
 */
export type WhiteboardWireMessageV3 = {
  v: 3;
  peerId: string;
  role: "tutor" | "student";
  /** Increments on every v3 document send from that peer. */
  rev: number;
  /** All board tabs → scene elements (ids are tab ids, e.g. p1, p2). */
  pages: Record<string, ExcalidrawLikeElement[]>;
  page: WhiteboardWirePage;
  follow?: WhiteboardWireFollow;
};

export type AnyWhiteboardWireMessage =
  | WhiteboardWireMessage
  | WhiteboardWireMessageV2
  | WhiteboardWireMessageV3
  | WhiteboardWireSignal
  | WhiteboardWirePresence
  | WhiteboardWirePageViewStateMsg;

/** Extras attached to each `broadcastScene` (throttled on the tutor). */
export type WhiteboardWireBroadcastExtras = {
  follow?: WhiteboardWireFollow;
  page?: WhiteboardWirePage;
  scenePageId?: string;
};

// -----------------------------------------------------------------
// Phase 4a — webrtc-signal envelope (additive)
// -----------------------------------------------------------------
//
// Carried inside the same AES-GCM envelope as scene/document messages.
// The relay never sees plaintext SDP or ICE — same trust model as
// scene frames. Discriminated from scene messages by the presence of
// `kind: "webrtc-signal"`; older scene wire messages have no `kind`
// field, so the validator treats `kind` as the high-priority
// discriminator and falls through to v1/v2/v3 scene validation when
// it is absent.
//
// `peerId` is the SENDER's stable peer id (same field as scene
// messages — receivers can suppress own echoes uniformly). The
// relay broadcasts to ALL room members; demultiplexing to the
// correct recipient happens at the `signaling.ts` layer via
// `targetPeerId === localPeerId`. Sync-client just delivers every
// non-self signal to its subscribers.

/**
 * SDP / ICE / leave — the only payload shapes legal inside a
 * `webrtc-signal` envelope. Schema is intentionally minimal so an
 * older client receiving a signal it doesn't understand can still
 * reject cleanly (validator drops with a warning log).
 */
export type WhiteboardWireSignalPayload =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  /** `candidate: null` represents end-of-candidates per the WebRTC spec. */
  | { type: "ice"; candidate: RTCIceCandidateInit | null }
  | { type: "leave" };

/**
 * Wire envelope for a single WebRTC signaling exchange between two
 * peers. `v: 1` here is independent of the scene-message version
 * line — this is a brand-new schema; if it ever evolves, bump `v`
 * and branch on read.
 */
export type WhiteboardWireSignal = {
  v: 1;
  kind: "webrtc-signal";
  /** Sender's stable peer id. Receivers filter out own echoes by this. */
  peerId: string;
  /**
   * Intended recipient. The relay still broadcasts to all room
   * members; the recipient-side demux (see `signaling.ts`) drops
   * signals not addressed to itself.
   */
  targetPeerId: string;
  payload: WhiteboardWireSignalPayload;
};

// -----------------------------------------------------------------
// Phase 4b — presence envelope (additive)
// -----------------------------------------------------------------
//
// Carries the (stable peer id, role, optional label) tuple for every
// participant in the room. Peers re-broadcast their presence on every
// `connect` event (initial join AND reconnect) and on every `new-user`
// arrival (so the newcomer immediately learns about every existing
// peer). The relay never sees plaintext — the envelope rides the same
// AES-GCM channel as scene + signal messages.
//
// Discriminated from other envelopes by `kind: "presence"`. The
// validator treats `kind` as a high-priority discriminator (same
// pattern as `webrtc-signal`), so older sync-client builds that don't
// understand `presence` reject the frame cleanly (drop+warn) rather
// than crash.
//
// Why a separate envelope (vs. embedding role in scene messages):
//   - Scene messages are throttled (50ms trailing-edge). Presence
//     must be delivered without throttle gates: a new-user packet
//     racing the next scene tick would arrive at the joiner with
//     no identity attached.
//   - Joiners that haven't drawn anything yet wouldn't broadcast a
//     scene message at all (only the tutor does for a typical
//     session) — students would be invisible to the tutor's
//     presence map. Presence is a separate flow.
//   - The 4a peer-mesh module needs stable peer ids BEFORE any
//     scene-level data races up; presence is the "I exist with id X"
//     announcement that lets the mesh start `addPeer` calls.
//
// Presence is intentionally minimal: no media-state, no mute flags,
// no cursor positions. Those would belong in a future "live-state"
// envelope on a faster cadence; presence is identity-only.

/**
 * Wire envelope announcing a participant's stable identity in the
 * room. Emitted at least on initial `connect`, on every `new-user`,
 * and on every reconnect. Never throttled.
 */
export type WhiteboardWirePresence = {
  v: 1;
  kind: "presence";
  /** Sender's stable peer id (same field as scene + signal). */
  peerId: string;
  /** Sender's role in the session. */
  role: "tutor" | "student";
  /**
   * Optional human-readable label (e.g. "Sarah" or "Student A"). When
   * absent, UI falls back to "Tutor"/"Student" derived from `role`.
   * Carried on every broadcast so a late joiner doesn't need a
   * separate "label changed" event.
   */
  label?: string;
};

/**
 * Per-page viewport patch (debounced on tutor). Immediate envelope — not
 * subject to the v3 document throttle. Phase 5 task 8.
 */
export type WhiteboardWirePageViewStateMsg = {
  v: 1;
  kind: "pageViewState";
  peerId: string;
  role: "tutor" | "student";
  pageId: string;
  panX: number;
  panY: number;
  zoom: number;
};

/**
 * Public shape exposed via `onRoomPeersChange`. The internal map
 * carries an extra `lastSeenMs` for prune bookkeeping; that field is
 * intentionally NOT in the public surface so consumers can't accidentally
 * couple to it.
 */
export type RoomPeer = {
  peerId: string;
  role: "tutor" | "student";
  label?: string;
};

// -----------------------------------------------------------------
// Public API
// -----------------------------------------------------------------

export type WhiteboardSyncClientOptions = {
  /** Sync host base URL — `wss://wb.mortensenapps.com` (or local). */
  url: string;
  /**
   * Room id — random, server-server visible. Generated alongside the
   * encryption key by the join-token server action.
   */
  roomId: string;
  /**
   * Base64url-encoded 32-byte AES-GCM key. The relay never sees this;
   * it lives in the URL fragment of the student join link.
   */
  encryptionKeyBase64Url: string;
  /** Author label — see WhiteboardWireMessage.role. */
  role: "tutor" | "student";
  /** Stable peer id across reconnects. Defaults to a random uuid. */
  peerId?: string;
  /**
   * Outbound throttle. We coalesce broadcastScene() calls to at most
   * one wire message per `broadcastIntervalMs` (trailing-edge). 50 ms
   * is the same cadence Excalidraw's own collab client uses.
   */
  broadcastIntervalMs?: number;
  /**
   * For tests: inject a fake `io()` constructor. Production callers
   * leave this undefined.
   */
  _ioFactory?: typeof io;
  /**
   * Optional logger override; defaults to console.* with a wbsync= prefix.
   */
  _logger?: {
    log: (msg: string, ...rest: unknown[]) => void;
    warn: (msg: string, ...rest: unknown[]) => void;
    error: (msg: string, ...rest: unknown[]) => void;
  };
  /**
   * Tutor only: a second peer (usually the student) just joined. Use this to
   * drain the on-canvas throttled `broadcastScene` queue and re-snapshot the
   * *visible* page so the welcome packet matches `activePageId` and is not
   * still held at 50ms throttle — otherwise a reload/new tab can be blank
   * until the next stroke.
   */
  onNewRemotePeer?: () => void | Promise<void>;
  /**
   * Phase 4b — optional human-readable label that travels with every
   * `WhiteboardWirePresence` we broadcast. Lets the tutor see "Sarah"
   * instead of "Student" in participant tiles. Absent fields fall
   * back to role-derived defaults at the UI layer.
   */
  localPeerLabel?: string;
  /**
   * Phase 4b — override the 5-second grace window applied before a
   * peer is dropped from the room-peer map after a `room-user-change`
   * shrink. Production uses the 5s default (covers transient socket
   * flaps); tests inject a small value to keep the suite snappy. The
   * grace timer is the only timer in sync-client besides the
   * broadcast throttle.
   */
  presencePruneGraceMs?: number;
  /**
   * Test-only: override `setTimeout` so prune-window tests can
   * advance the timer deterministically without Jest fake timers
   * (which would also slow the broadcast throttle). Production omits.
   */
  _setTimeoutFn?: (cb: () => void, ms: number) => unknown;
  /** Test-only: matched override for `clearTimeout`. */
  _clearTimeoutFn?: (id: unknown) => void;
};

export type WhiteboardSyncClient = {
  /** True after the WS handshake completes. */
  isConnected: () => boolean;
  /** Subscribe to peer scene updates. Returns an unsubscriber. */
  onRemoteScene: (
    cb: (
      peerId: string,
      elements: ReadonlyArray<ExcalidrawLikeElement>,
      details?: WhiteboardWireRemoteDetails
    ) => void
  ) => () => void;
  /** Subscribe to "I am now connected" notifications. */
  onConnect: (cb: () => void) => () => void;
  /** Subscribe to "I just disconnected" notifications. */
  onDisconnect: (cb: () => void) => () => void;
  /**
   * Subscribe to changes in the number of OTHER peers in the room
   * (i.e. excludes our own socket). `count >= 1` means at least one
   * other party (typically the student) is connected to the relay
   * and sharing the room with us.
   *
   * Implementation note: excalidraw-room delivers the FULL members
   * list on `room-user-change`. We subtract self before exposing the
   * count; see the room-user-change handler in this file for the
   * regression context (Sarah-pilot Apr 24 2026).
   */
  onPeerCountChange: (cb: (count: number) => void) => () => void;
  /**
   * Queue an outbound scene broadcast. Throttled internally —
   * callers can fire on every diff without measuring.
   */
  broadcastScene: (
    elements: ReadonlyArray<ExcalidrawLikeElement>,
    extras?: WhiteboardWireBroadcastExtras
  ) => void;
  /**
   * Tutor: queue a **full multi-page** document (v3 wire). One payload carries
   * every tab’s elements — not subject to the v2 one-scene+scenePageId split.
   * Throttled like `broadcastScene` (one pending slot, whole board).
   */
  broadcastDocument: (doc: {
    rev: number;
    pages: Record<string, ExcalidrawLikeElement[]>;
    page: WhiteboardWirePage;
    follow?: WhiteboardWireFollow;
  }) => void;
  /**
   * Send any pending `broadcastScene` or `broadcastDocument` immediately
   * instead of waiting for the trailing-edge timer.
   */
  flushPendingBroadcast: () => boolean;
  /**
   * Phase 4a — emit a WebRTC signal (offer / answer / ICE / leave)
   * addressed to a specific peer. Bypasses the scene throttle: signals
   * are delivered immediately on the same outbound chain as scene
   * frames, preserving wire-order. The relay never sees plaintext;
   * the recipient demuxes by `targetPeerId` at the signaling layer.
   *
   * Caller does NOT supply their own peerId — sync-client injects it
   * from the closure's `peerId` so identity-spoofing is impossible
   * from the client API surface.
   */
  broadcastSignal: (
    targetPeerId: string,
    payload: WhiteboardWireSignalPayload
  ) => void;
  /**
   * Tutor: immediate per-page viewport patch (debounced by caller ~200ms).
   * Phase 5 task 8 — not throttled with v3 document payloads.
   */
  broadcastPageViewState: (patch: {
    pageId: string;
    panX: number;
    panY: number;
    zoom: number;
  }) => void;
  /**
   * Phase 4a — subscribe to inbound signals. Fires for EVERY non-self
   * signal observed in the room; the recipient-side filtering by
   * `targetPeerId` happens in `signaling.ts`, not here. Returns an
   * unsubscriber.
   */
  onRemoteSignal: (
    cb: (
      fromPeerId: string,
      targetPeerId: string,
      payload: WhiteboardWireSignalPayload
    ) => void
  ) => () => void;
  /** Subscribe to inbound per-page viewport patches (Phase 5 task 8). */
  onRemotePageViewState: (
    cb: (fromPeerId: string, msg: WhiteboardWirePageViewStateMsg) => void
  ) => () => void;
  /**
   * Phase 4b — subscribe to changes in the room's participant set.
   * Fires once per material change in the per-peer roster (add /
   * remove / role-or-label edit). Self is EXCLUDED from the emitted
   * list (same convention as {@link onPeerCountChange}).
   *
   * Membership is reconciled from inbound `WhiteboardWirePresence`
   * envelopes; a `room-user-change` shrink starts a 5-second grace
   * timer (overridable via {@link WhiteboardSyncClientOptions.presencePruneGraceMs})
   * before a peer is dropped, so a transient socket flap whose
   * re-`connect`-presence-broadcast arrives within the window does
   * NOT fire a remove+re-add cycle.
   *
   * The callback receives a fresh array each time; consumers may
   * keep the reference but MUST treat it as immutable. Ordering is
   * lexicographic by `peerId` for deterministic snapshot tests +
   * deterministic React keys.
   */
  onRoomPeersChange: (
    cb: (peers: ReadonlyArray<RoomPeer>) => void
  ) => () => void;
  /** Tear down the WS, drop subscriptions. Idempotent. */
  disconnect: () => void;
};

// -----------------------------------------------------------------
// Crypto helpers — AES-GCM-256 via WebCrypto
// -----------------------------------------------------------------

/**
 * Decode a base64url string (no padding, `-`/`_` alphabet) into bytes.
 *
 * We accept padded base64 too because some hand-crafted dev keys
 * arrive with `=` padding from older tooling.
 */
export function decodeBase64Url(input: string): Uint8Array {
  // Normalise to standard base64
  let s = input.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  if (typeof atob === "function") {
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  // Node fallback
  const buf = Buffer.from(s, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** Generate a fresh 32-byte AES-GCM key as base64url for a join link. */
export function generateEncryptionKeyBase64Url(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  if (rawKey.length !== 32) {
    throw new Error(
      `[sync-client] expected 32-byte AES-GCM key, got ${rawKey.length}`
    );
  }
  // Copy into a fresh ArrayBuffer to satisfy TS 5.7's strict
  // BufferSource typing (rawKey may be backed by a SharedArrayBuffer).
  const keyBuf = new ArrayBuffer(rawKey.length);
  new Uint8Array(keyBuf).set(rawKey);
  return crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptMessage(
  key: CryptoKey,
  msg: AnyWhiteboardWireMessage
): Promise<{ data: ArrayBuffer; iv: ArrayBuffer }> {
  // Allocate the IV inside an ArrayBuffer so the lib.dom typings line
  // up with `BufferSource` exactly (TS 5.7+ disambiguates SharedArrayBuffer).
  const ivBuf = new ArrayBuffer(12);
  const iv = new Uint8Array(ivBuf);
  crypto.getRandomValues(iv);
  const plaintext = new TextEncoder().encode(JSON.stringify(msg));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBuf },
    key,
    plaintext as unknown as ArrayBuffer
  );
  return { data: ct, iv: ivBuf };
}

function toArrayBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  // Copy the view into a fresh ArrayBuffer to satisfy strict BufferSource
  // typing (the source might be backed by a SharedArrayBuffer).
  const out = new ArrayBuffer(input.byteLength);
  new Uint8Array(out).set(input);
  return out;
}

/**
 * Validate a `webrtc-signal` payload. Throws on any malformed shape;
 * the caller (`validateWireMessage`) is responsible for catching and
 * surfacing as a `decrypt/parse failed` log warning.
 */
function validateWireSignalPayload(payload: unknown): WhiteboardWireSignalPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("[sync-client] signal payload: not an object");
  }
  const type = (payload as { type?: unknown }).type;
  if (type === "offer" || type === "answer") {
    const sdp = (payload as { sdp?: unknown }).sdp;
    if (typeof sdp !== "string") {
      throw new Error(`[sync-client] signal payload ${type}: bad sdp`);
    }
    return { type, sdp };
  }
  if (type === "ice") {
    const candidate = (payload as { candidate?: unknown }).candidate;
    if (candidate === null) {
      return { type: "ice", candidate: null };
    }
    if (!candidate || typeof candidate !== "object") {
      throw new Error("[sync-client] signal payload ice: bad candidate");
    }
    const c = candidate as {
      candidate?: unknown;
      sdpMid?: unknown;
      sdpMLineIndex?: unknown;
      usernameFragment?: unknown;
    };
    if (typeof c.candidate !== "string") {
      throw new Error("[sync-client] signal payload ice: bad candidate.candidate");
    }
    const out: RTCIceCandidateInit = { candidate: c.candidate };
    if (c.sdpMid === null || typeof c.sdpMid === "string") {
      out.sdpMid = c.sdpMid as string | null | undefined;
    } else if (typeof c.sdpMid !== "undefined") {
      throw new Error("[sync-client] signal payload ice: bad sdpMid");
    }
    if (c.sdpMLineIndex === null || typeof c.sdpMLineIndex === "number") {
      out.sdpMLineIndex = c.sdpMLineIndex as number | null | undefined;
    } else if (typeof c.sdpMLineIndex !== "undefined") {
      throw new Error("[sync-client] signal payload ice: bad sdpMLineIndex");
    }
    if (
      c.usernameFragment === null ||
      typeof c.usernameFragment === "string" ||
      typeof c.usernameFragment === "undefined"
    ) {
      if (typeof c.usernameFragment !== "undefined") {
        out.usernameFragment = c.usernameFragment as string | null;
      }
    } else {
      throw new Error("[sync-client] signal payload ice: bad usernameFragment");
    }
    return { type: "ice", candidate: out };
  }
  if (type === "leave") {
    return { type: "leave" };
  }
  throw new Error(`[sync-client] signal payload: bad type '${String(type)}'`);
}

function validateWireSignal(parsed: unknown): WhiteboardWireSignal {
  const p = parsed as Partial<WhiteboardWireSignal>;
  if (p.v !== 1) {
    throw new Error("[sync-client] signal envelope: bad v");
  }
  if (typeof p.peerId !== "string" || p.peerId.length === 0) {
    throw new Error("[sync-client] signal envelope: bad peerId");
  }
  if (typeof p.targetPeerId !== "string" || p.targetPeerId.length === 0) {
    throw new Error("[sync-client] signal envelope: bad targetPeerId");
  }
  const payload = validateWireSignalPayload(p.payload);
  return {
    v: 1,
    kind: "webrtc-signal",
    peerId: p.peerId,
    targetPeerId: p.targetPeerId,
    payload,
  };
}

/**
 * Validate a `presence` envelope. Throws on any malformed shape; the
 * caller (`validateWireMessage`) is responsible for catching and
 * surfacing as a `decrypt/parse failed` log warning.
 */
function validateWirePresence(parsed: unknown): WhiteboardWirePresence {
  const p = parsed as Partial<WhiteboardWirePresence>;
  if (p.v !== 1) {
    throw new Error("[sync-client] presence envelope: bad v");
  }
  if (typeof p.peerId !== "string" || p.peerId.length === 0) {
    throw new Error("[sync-client] presence envelope: bad peerId");
  }
  if (p.role !== "tutor" && p.role !== "student") {
    throw new Error("[sync-client] presence envelope: bad role");
  }
  const out: WhiteboardWirePresence = {
    v: 1,
    kind: "presence",
    peerId: p.peerId,
    role: p.role,
  };
  if (typeof p.label === "string") {
    out.label = p.label;
  } else if (typeof p.label !== "undefined") {
    throw new Error("[sync-client] presence envelope: bad label");
  }
  return out;
}

function validateWirePageRowViewState(vs: unknown): PageViewState {
  if (!vs || typeof vs !== "object") {
    throw new Error("[sync-client] decoded payload v3: bad page row viewState");
  }
  const o = vs as { panX?: unknown; panY?: unknown; zoom?: unknown };
  if (
    typeof o.panX !== "number" ||
    !Number.isFinite(o.panX) ||
    typeof o.panY !== "number" ||
    !Number.isFinite(o.panY) ||
    typeof o.zoom !== "number" ||
    !Number.isFinite(o.zoom)
  ) {
    throw new Error(
      "[sync-client] decoded payload v3: bad page row viewState fields"
    );
  }
  return { panX: o.panX, panY: o.panY, zoom: o.zoom };
}

function validateWirePageViewState(parsed: unknown): WhiteboardWirePageViewStateMsg {
  const p = parsed as Partial<WhiteboardWirePageViewStateMsg>;
  if (p.v !== 1) {
    throw new Error("[sync-client] pageViewState envelope: bad v");
  }
  if (p.kind !== "pageViewState") {
    throw new Error("[sync-client] pageViewState envelope: bad kind");
  }
  if (typeof p.peerId !== "string" || p.peerId.length === 0) {
    throw new Error("[sync-client] pageViewState envelope: bad peerId");
  }
  if (p.role !== "tutor" && p.role !== "student") {
    throw new Error("[sync-client] pageViewState envelope: bad role");
  }
  if (typeof p.pageId !== "string" || p.pageId.length === 0) {
    throw new Error("[sync-client] pageViewState envelope: bad pageId");
  }
  if (
    typeof p.panX !== "number" ||
    !Number.isFinite(p.panX) ||
    typeof p.panY !== "number" ||
    !Number.isFinite(p.panY) ||
    typeof p.zoom !== "number" ||
    !Number.isFinite(p.zoom)
  ) {
    throw new Error("[sync-client] pageViewState envelope: bad pan/zoom");
  }
  return {
    v: 1,
    kind: "pageViewState",
    peerId: p.peerId,
    role: p.role,
    pageId: p.pageId,
    panX: p.panX,
    panY: p.panY,
    zoom: p.zoom,
  };
}

function validateWireMessage(parsed: unknown): AnyWhiteboardWireMessage {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("[sync-client] decoded payload: not an object");
  }
  // Discriminate by `kind` BEFORE `v`: scene messages (v1/v2/v3) have
  // no `kind` field, so its absence selects the scene-validator path.
  // A present-but-unknown `kind` rejects cleanly so future-additive
  // envelopes from a newer client don't crash an older one — they
  // log a `decrypt/parse failed` warning and the listener doesn't
  // fire.
  const kind = (parsed as { kind?: unknown }).kind;
  if (kind === "webrtc-signal") {
    return validateWireSignal(parsed);
  }
  if (kind === "presence") {
    return validateWirePresence(parsed);
  }
  if (kind === "pageViewState") {
    return validateWirePageViewState(parsed);
  }
  if (typeof kind !== "undefined") {
    throw new Error(
      `[sync-client] decoded payload: unknown kind '${String(kind)}'`
    );
  }
  const v = (parsed as { v?: unknown }).v;
  if (v === 3) {
    const p = parsed as WhiteboardWireMessageV3;
    if (typeof p.peerId !== "string" || (p.role !== "tutor" && p.role !== "student")) {
      throw new Error("[sync-client] decoded payload v3: bad peerId/role");
    }
    if (typeof p.rev !== "number" || !Number.isFinite(p.rev) || p.rev < 0) {
      throw new Error("[sync-client] decoded payload v3: bad rev");
    }
    if (
      !p.page ||
      typeof p.page.activePageId !== "string" ||
      !Array.isArray(p.page.pageList)
    ) {
      throw new Error("[sync-client] decoded payload v3: bad page");
    }
    if (!p.pages || typeof p.pages !== "object") {
      throw new Error("[sync-client] decoded payload v3: bad pages");
    }
    for (const [pid, els] of Object.entries(p.pages)) {
      if (typeof pid !== "string" || !Array.isArray(els)) {
        throw new Error(`[sync-client] decoded payload v3: bad pages.${pid}`);
      }
    }
    for (const row of p.page.pageList) {
      if (!row || typeof row !== "object") {
        throw new Error("[sync-client] decoded payload v3: bad page row");
      }
      const r = row as { viewState?: unknown };
      if (typeof r.viewState !== "undefined") {
        validateWirePageRowViewState(r.viewState);
      }
    }
    return p;
  }
  if (v !== 1 && v !== 2) {
    throw new Error("[sync-client] decoded payload: bad v");
  }
  if (typeof (parsed as { peerId?: unknown }).peerId !== "string") {
    throw new Error("[sync-client] decoded payload: bad peerId");
  }
  if (!Array.isArray((parsed as { elements?: unknown }).elements)) {
    throw new Error("[sync-client] decoded payload: bad elements");
  }
  if (v === 2) {
    return parsed as WhiteboardWireMessageV2;
  }
  return parsed as WhiteboardWireMessage;
}

async function decryptMessage(
  key: CryptoKey,
  data: ArrayBuffer | Uint8Array,
  iv: ArrayBuffer | Uint8Array
): Promise<AnyWhiteboardWireMessage> {
  const ivBytes = toArrayBuffer(iv);
  const ctBytes = toArrayBuffer(data);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    key,
    ctBytes
  );
  const json = new TextDecoder().decode(pt);
  const parsed = JSON.parse(json) as unknown;
  return validateWireMessage(parsed);
}

// -----------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------

function makeRandomPeerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // fallthrough
    }
  }
  return `peer_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

const DEFAULT_BROADCAST_INTERVAL_MS = 50;
/**
 * Default grace window before a peer is dropped from the room-peer
 * map after a `room-user-change` shrink. A socket flap that
 * reconnects within this window — and re-broadcasts presence on its
 * own `connect` — restores the entry without firing remove+re-add
 * callbacks, so consumers (Phase 4b's `useLiveAV`, peer-mesh) see a
 * stable peer set across brief network blips.
 */
const PRESENCE_PRUNE_GRACE_MS_DEFAULT = 5_000;

export function createWhiteboardSyncClient(
  opts: WhiteboardSyncClientOptions
): WhiteboardSyncClient {
  const {
    url,
    roomId,
    encryptionKeyBase64Url,
    role,
    broadcastIntervalMs = DEFAULT_BROADCAST_INTERVAL_MS,
    _ioFactory,
    _logger,
    onNewRemotePeer,
    localPeerLabel,
    presencePruneGraceMs = PRESENCE_PRUNE_GRACE_MS_DEFAULT,
  } = opts;
  const peerId = opts.peerId ?? makeRandomPeerId();
  const setTimeoutFn: (cb: () => void, ms: number) => unknown =
    opts._setTimeoutFn ??
    ((cb, ms) => globalThis.setTimeout(cb, ms) as unknown);
  const clearTimeoutFn: (id: unknown) => void =
    opts._clearTimeoutFn ??
    ((id) =>
      globalThis.clearTimeout(
        id as ReturnType<typeof globalThis.setTimeout>
      ));

  const log = _logger ?? {
    log: (msg: string, ...rest: unknown[]) =>
      console.log(`[sync-client] wbsync=${roomId.slice(0, 8)} ${msg}`, ...rest),
    warn: (msg: string, ...rest: unknown[]) =>
      console.warn(`[sync-client] wbsync=${roomId.slice(0, 8)} ${msg}`, ...rest),
    error: (msg: string, ...rest: unknown[]) =>
      console.error(`[sync-client] wbsync=${roomId.slice(0, 8)} ${msg}`, ...rest),
  };

  // ---------------------------------------------------------------
  // Subscribers
  // ---------------------------------------------------------------

  type RemoteSceneCb = (
    peerId: string,
    elements: ReadonlyArray<ExcalidrawLikeElement>,
    details?: WhiteboardWireRemoteDetails
  ) => void;
  type RemoteSignalCb = (
    fromPeerId: string,
    targetPeerId: string,
    payload: WhiteboardWireSignalPayload
  ) => void;
  type RemotePageViewStateCb = (
    fromPeerId: string,
    msg: WhiteboardWirePageViewStateMsg
  ) => void;
  type RoomPeersCb = (peers: ReadonlyArray<RoomPeer>) => void;
  const remoteSceneSubs = new Set<RemoteSceneCb>();
  const remoteSignalSubs = new Set<RemoteSignalCb>();
  const remotePageViewStateSubs = new Set<RemotePageViewStateCb>();
  const connectSubs = new Set<() => void>();
  const disconnectSubs = new Set<() => void>();
  const peerCountSubs = new Set<(count: number) => void>();
  const roomPeersSubs = new Set<RoomPeersCb>();

  /**
   * Ingest can race AES key import (async IIFE). Dropping a packet here
   * loses the tutor's new-user re-broadcast — student shows Connected but
   * blank until the next stroke. Queue until the key is ready.
   */
  type QueuedClientBroadcast = { data: ArrayBuffer; iv: ArrayBuffer };
  const MAX_PENDING_CLIENT_BROADCASTS = 20;
  const pendingClientBroadcasts: QueuedClientBroadcast[] = [];

  /**
   * The relay may deliver a full scene before React subscribes to
   * onRemoteScene (useEffect after paint). Cache the latest decrypted
   * remote message so a late subscriber still receives a snapshot once.
   */
  type LastRemoteSceneSnapshot = {
    peerId: string;
    elements: ReadonlyArray<ExcalidrawLikeElement>;
    details?: WhiteboardWireRemoteDetails;
  };
  let lastRemoteScene: LastRemoteSceneSnapshot | null = null;

  /**
   * **May 15 hotfix #3 — buffer inbound webrtc-signals for late
   * subscribers.**
   *
   * `onRoomPeersChange` already replays its last snapshot via a
   * microtask when a new subscriber attaches (see further down). The
   * webrtc-signal stream had no such buffer — signals were fanned to
   * `remoteSignalSubs` and any signal arriving before the (typically
   * `useLiveAV`-driven) `signaling.ts` layer subscribed was silently
   * dropped. That stranded the late-mounting peer on "Connecting…":
   * the early peer sent an offer that hit zero subscribers on the
   * late peer's sync-client; the late peer eventually subscribed
   * but only saw FUTURE signals.
   *
   * Fix: buffer every webrtc-signal addressed to OR from any peer
   * (we don't filter by `targetPeerId` here because signaling.ts is
   * the layer that does that — keeping this layer payload-agnostic
   * preserves the original layering rule documented at the top of
   * `signaling.ts`). On first subscribe to `onRemoteSignal`, replay
   * the buffered signals via `queueMicrotask` so the subscriber
   * catches up. Bounded by TTL + count so a never-subscribed buffer
   * cannot leak memory (e.g. the tutor opens the workspace, never
   * starts a live-A/V session, signals from a curious browser
   * extension would otherwise pile up forever).
   *
   * TTL chosen at 8s: long enough to cover slow cold-mount of
   * `useLiveAV` on cellular (mic permission prompt + `getUserMedia`
   * can easily eat 3-5s), short enough that stale signals from a
   * peer who already left don't get replayed minutes later.
   * Count cap of 64: a typical SDP exchange + ICE trickle is
   * ~10-30 messages per peer, 64 covers a 2-peer mesh's worst-case
   * burst with room for retries before eviction kicks in.
   */
  const SIGNAL_BUFFER_TTL_MS = 8_000;
  const SIGNAL_BUFFER_MAX = 64;
  type BufferedRemoteSignal = {
    fromPeerId: string;
    targetPeerId: string;
    payload: WhiteboardWireSignalPayload;
    capturedAtMs: number;
  };
  const bufferedRemoteSignals: BufferedRemoteSignal[] = [];

  function bufferRemoteSignal(
    fromPeerId: string,
    targetPeerId: string,
    payload: WhiteboardWireSignalPayload
  ): void {
    const now = Date.now();
    bufferedRemoteSignals.push({
      fromPeerId,
      targetPeerId,
      payload,
      capturedAtMs: now,
    });
    // Evict by TTL from the head. The array is naturally ordered by
    // capturedAtMs because we only ever push (never insert).
    while (
      bufferedRemoteSignals.length > 0 &&
      now - bufferedRemoteSignals[0]!.capturedAtMs > SIGNAL_BUFFER_TTL_MS
    ) {
      bufferedRemoteSignals.shift();
    }
    // Evict by count cap from the head (oldest-first).
    while (bufferedRemoteSignals.length > SIGNAL_BUFFER_MAX) {
      bufferedRemoteSignals.shift();
    }
  }

  function getReplayableSignals(): ReadonlyArray<BufferedRemoteSignal> {
    const now = Date.now();
    // Same TTL gate as eviction — a subscriber attaching at the
    // tail end of the window still sees only fresh entries.
    return bufferedRemoteSignals.filter(
      (s) => now - s.capturedAtMs <= SIGNAL_BUFFER_TTL_MS
    );
  }

  function fan<T extends (...args: never[]) => void>(
    set: Set<T>,
    ...args: Parameters<T>
  ) {
    for (const cb of set) {
      try {
        // T is constrained to (...args: never[]) => void so this cast is sound:
        // we erase the never[] for the call site, but every subscriber was
        // registered with a matching signature when the Set was typed.
        (cb as (...a: Parameters<T>) => void)(...args);
      } catch (err) {
        log.warn("subscriber threw:", (err as Error)?.message ?? String(err));
      }
    }
  }

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------

  let connected = false;
  let disposed = false;
  let socket: Socket | null = null;
  let aesKey: CryptoKey | null = null;
  let aesKeyError: string | null = null;
  type PendingPayload =
    | {
        kind: "v2";
        elements: ExcalidrawLikeElement[];
        extras?: WhiteboardWireBroadcastExtras;
      }
    | {
        kind: "v3";
        doc: {
          rev: number;
          pages: Record<string, ExcalidrawLikeElement[]>;
          page: WhiteboardWirePage;
          follow?: WhiteboardWireFollow;
        };
      };
  let pendingPayload: PendingPayload | null = null;
  // Cache the most recent scene we broadcast so that when a new
  // peer joins after the tutor has been drawing for a while, we can
  // immediately re-broadcast the current state. Without this the
  // student would see a blank canvas until the tutor's next stroke.
  let lastBroadcastPayload: PendingPayload | null = null;
  let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  // Serialise outbound encrypts so two rapid changes don't race a
  // GCM IV reuse situation (different IV per call so safe, but we
  // still want strict ordering on the wire).
  let outboundChain: Promise<unknown> = Promise.resolve();

  // ---------------------------------------------------------------
  // Presence reconciliation (Phase 4b)
  // ---------------------------------------------------------------
  //
  // `presenceMap` keys on stable peerId — NOT socket.id. Two reasons:
  //   1. Socket.io's `client-broadcast` doesn't expose the sender's
  //      socket.id, so there's no clean place to learn the mapping.
  //   2. peerId is intentionally stable across reconnects (random
  //      uuid at construction, retained for the client's lifetime).
  //      socket.id rolls on every reconnect, so a socket-keyed map
  //      would force a remove+re-add for every flap even when nothing
  //      semantically changed.
  //
  // Disappearance detection is driven by `room-user-change` shrinks:
  // when the room member count drops, every remote peer in the map
  // is marked `pendingPrune`. After `presencePruneGraceMs` (5s prod
  // default), any peer still in `pendingPrune` is removed. A peer
  // that re-`connect`s within the window broadcasts a fresh presence
  // frame; we clear them from `pendingPrune` and the prune timer is
  // a no-op for them — no add/remove churn for transient flaps.
  type RoomPeerEntry = RoomPeer & { lastSeenMs: number };
  const presenceMap = new Map<string, RoomPeerEntry>();
  const pendingPrune = new Set<string>();
  let pruneTimer: unknown = null;
  let lastRoomMemberCount = 0;
  let lastRoomPeersSnapshot: ReadonlyArray<RoomPeer> = [];

  function getRoomPeersSnapshot(): ReadonlyArray<RoomPeer> {
    const out: RoomPeer[] = [];
    for (const entry of presenceMap.values()) {
      if (entry.peerId === peerId) continue; // exclude self
      const peer: RoomPeer = { peerId: entry.peerId, role: entry.role };
      if (entry.label !== undefined) peer.label = entry.label;
      out.push(peer);
    }
    out.sort((a, b) =>
      a.peerId < b.peerId ? -1 : a.peerId > b.peerId ? 1 : 0
    );
    return out;
  }

  function roomPeersEqual(
    a: ReadonlyArray<RoomPeer>,
    b: ReadonlyArray<RoomPeer>
  ): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i]!;
      const y = b[i]!;
      if (x.peerId !== y.peerId || x.role !== y.role || x.label !== y.label) {
        return false;
      }
    }
    return true;
  }

  function fireRoomPeersIfChanged(): void {
    const next = getRoomPeersSnapshot();
    if (roomPeersEqual(lastRoomPeersSnapshot, next)) return;
    lastRoomPeersSnapshot = next;
    fan(roomPeersSubs, next);
  }

  function clearPruneTimer(): void {
    if (pruneTimer !== null) {
      clearTimeoutFn(pruneTimer);
      pruneTimer = null;
    }
  }

  function handleInboundPresence(msg: WhiteboardWirePresence): void {
    // Self-echo guard: presence carries our own peerId on the
    // sender's broadcast, but the caller (`handleDecryptedWireMessage`)
    // already drops self-echoes upstream. Defensive guard here so a
    // refactor that bypasses the upstream check still stays clean.
    if (msg.peerId === peerId) return;
    pendingPrune.delete(msg.peerId);
    const existing = presenceMap.get(msg.peerId);
    const next: RoomPeerEntry = {
      peerId: msg.peerId,
      role: msg.role,
      ...(msg.label !== undefined ? { label: msg.label } : {}),
      lastSeenMs: Date.now(),
    };
    presenceMap.set(msg.peerId, next);
    if (
      !existing ||
      existing.role !== next.role ||
      existing.label !== next.label
    ) {
      log.log(
        `kind=presence recv peerId=${msg.peerId} role=${msg.role}${
          msg.label ? ` label=${msg.label}` : ""
        } total=${presenceMap.size}`
      );
      fireRoomPeersIfChanged();
    }
  }

  function broadcastPresence(): void {
    if (disposed) return;
    if (aesKeyError || !aesKey || !socket) return;
    const msg: WhiteboardWirePresence = {
      v: 1,
      kind: "presence",
      peerId,
      role,
      ...(localPeerLabel !== undefined ? { label: localPeerLabel } : {}),
    };
    log.log(
      `kind=presence send peerId=${peerId} role=${role}${
        localPeerLabel ? ` label=${localPeerLabel}` : ""
      }`
    );
    void encryptAndEmitImmediate(msg);
  }

  function schedulePruneIfShrunk(currentMemberCount: number): void {
    // currentMemberCount includes self. Grew (or stayed the same) →
    // nothing to prune; new entries are added by inbound presence
    // frames, not by member count alone.
    if (currentMemberCount >= lastRoomMemberCount) {
      lastRoomMemberCount = currentMemberCount;
      return;
    }
    lastRoomMemberCount = currentMemberCount;
    // Shrunk — mark every remote peer as a prune candidate. Each
    // peer's own `connect → broadcastPresence` (which the remote
    // sync-client fires after reconnecting) removes them from this
    // set before the timer fires, so a clean flap leaves no trace.
    for (const pid of presenceMap.keys()) {
      if (pid !== peerId) pendingPrune.add(pid);
    }
    clearPruneTimer();
    pruneTimer = setTimeoutFn(() => {
      pruneTimer = null;
      if (disposed) return;
      let dropped = 0;
      for (const pid of pendingPrune) {
        if (presenceMap.delete(pid)) dropped += 1;
      }
      pendingPrune.clear();
      if (dropped > 0) {
        log.log(
          `presence prune fired dropped=${dropped} remaining=${presenceMap.size}`
        );
        fireRoomPeersIfChanged();
      }
    }, presencePruneGraceMs);
  }

  // ---------------------------------------------------------------
  // Crypto bootstrap (best-effort; failure leaves us in a degraded
  // mode where we never send/receive but the recorder still works.)
  // ---------------------------------------------------------------

  function isWireSignal(msg: AnyWhiteboardWireMessage): msg is WhiteboardWireSignal {
    return (msg as Partial<WhiteboardWireSignal>).kind === "webrtc-signal";
  }

  function isWirePresence(
    msg: AnyWhiteboardWireMessage
  ): msg is WhiteboardWirePresence {
    return (msg as Partial<WhiteboardWirePresence>).kind === "presence";
  }

  function handleDecryptedWireMessage(msg: AnyWhiteboardWireMessage): void {
    if (msg.peerId === peerId) return;
    if (isWirePresence(msg)) {
      handleInboundPresence(msg);
      return;
    }
    if (isWireSignal(msg)) {
      // Phase 4a: signal envelope. Sync-client delivers every non-self
      // signal to its subscribers; the `targetPeerId === localPeerId`
      // filter lives in signaling.ts, not here. Logging carries the
      // wbsync= room tag plus the signal subkeys so prod debugging
      // can grep `wbsync=… kind=webrtc-signal …` across tabs.
      log.log(
        `kind=webrtc-signal from=${msg.peerId} target=${msg.targetPeerId} type=${msg.payload.type}`
      );
      // May 15 hotfix #3 — buffer for late subscribers. See the
      // BufferedRemoteSignal docblock for the full rationale; the
      // tl;dr is that signaling.ts may not be subscribed yet when
      // a peer joins, and dropping the signal here means the peer
      // stays stuck on "Connecting…" until refresh.
      bufferRemoteSignal(msg.peerId, msg.targetPeerId, msg.payload);
      fan(remoteSignalSubs, msg.peerId, msg.targetPeerId, msg.payload);
      return;
    }
    if ((msg as Partial<WhiteboardWirePageViewStateMsg>).kind === "pageViewState") {
      const m = msg as WhiteboardWirePageViewStateMsg;
      log.log(
        `kind=pageViewState recv from=${m.peerId} pageId=${m.pageId} panX=${m.panX} panY=${m.panY} zoom=${m.zoom}`
      );
      for (const cb of remotePageViewStateSubs) {
        try {
          cb(m.peerId, m);
        } catch (err) {
          log.warn(
            "onRemotePageViewState subscriber threw:",
            (err as Error)?.message ?? String(err)
          );
        }
      }
      return;
    }
    if (msg.v === 3) {
      const m = msg as WhiteboardWireMessageV3;
      const details: WhiteboardWireRemoteDetails = {
        follow: m.follow,
        page: m.page,
        document: { rev: m.rev, pages: m.pages },
      };
      lastRemoteScene = { peerId: m.peerId, elements: [], details };
      fan(remoteSceneSubs, m.peerId, [], details);
      return;
    }
    const details: WhiteboardWireRemoteDetails = {};
    if (msg.v === 2) {
      if (msg.follow) details.follow = msg.follow;
      if (msg.page) details.page = msg.page;
      if (typeof (msg as WhiteboardWireMessageV2).scenePageId === "string") {
        details.scenePageId = (msg as WhiteboardWireMessageV2).scenePageId;
      }
    }
    const has = Object.keys(details).length > 0;
    const sceneMsg = msg as WhiteboardWireMessage | WhiteboardWireMessageV2;
    lastRemoteScene = {
      peerId: sceneMsg.peerId,
      elements: sceneMsg.elements,
      details: has ? details : undefined,
    };
    fan(
      remoteSceneSubs,
      sceneMsg.peerId,
      sceneMsg.elements,
      has ? details : undefined
    );
  }

  void (async () => {
    try {
      const raw = decodeBase64Url(encryptionKeyBase64Url);
      aesKey = await importAesKey(raw);
      const queued = pendingClientBroadcasts.splice(0, pendingClientBroadcasts.length);
      for (const q of queued) {
        if (disposed) return;
        if (!aesKey) break;
        try {
          const msg = await decryptMessage(aesKey, q.data, q.iv);
          handleDecryptedWireMessage(msg);
        } catch (err) {
          log.warn(
            "decrypt/parse failed (queued client-broadcast):",
            (err as Error)?.message ?? String(err)
          );
        }
      }
      // If the connect handler fired before the key was ready, its
      // broadcastPresence() call no-op'd. Re-fire now so the room
      // sees our identity.
      if (!disposed && connected) {
        broadcastPresence();
      }
    } catch (err) {
      aesKeyError = (err as Error)?.message ?? String(err);
      pendingClientBroadcasts.length = 0;
      log.error(
        "AES key import failed — sync will be inert:",
        aesKeyError
      );
    }
  })();

  // ---------------------------------------------------------------
  // Socket lifecycle
  // ---------------------------------------------------------------

  const ioFactory = _ioFactory ?? io;
  socket = ioFactory(url, {
    transports: ["websocket"],
    // Auto-reconnect with exponential backoff, capped — matches
    // excalidraw-room's expectations and our reliability bar.
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 10_000,
    timeout: 15_000,
  });

  socket.on("connect", () => {
    if (disposed) return;
    connected = true;
    log.log(`connected sid=${socket?.id ?? "?"} role=${role}`);
    socket?.emit("join-room", roomId);
    fan(connectSubs);
    // Announce our presence on every connect (initial join + every
    // reconnect). When `aesKey` isn't ready yet, broadcastPresence
    // no-ops cleanly — the key import IIFE re-fires presence once
    // ready (see below).
    broadcastPresence();
    // If we already have a scene to share (reconnect mid-session),
    // re-emit it so the relay propagates and any peer that stayed
    // connected picks it up immediately.
    if (lastBroadcastPayload && aesKey) {
      void encryptAndEmit(lastBroadcastPayload);
    }
  });

  socket.on("disconnect", (reason: string) => {
    if (disposed) return;
    connected = false;
    log.warn(`disconnected reason=${reason}`);
    fan(disconnectSubs);
  });

  socket.on("connect_error", (err: Error) => {
    if (disposed) return;
    log.warn(`connect_error: ${err?.message ?? String(err)}`);
  });

  socket.on("first-in-room", () => {
    if (disposed) return;
    log.log("first-in-room (waiting for peer)");
  });

  socket.on("new-user", (peerSocketId: string) => {
    if (disposed) return;
    log.log(`new-user ${peerSocketId} — re-emitting current scene + presence`);
    // Re-announce our identity so the newcomer's presence map
    // populates immediately (their inbound presence frame from us
    // races their initial scene packet; without this they would
    // know there's "someone in the room" via room-user-change but
    // not who).
    broadcastPresence();
    // Send our current scene so the new joiner doesn't see a blank
    // canvas. Cheap; runs once per join.
    void (async () => {
      if (role === "tutor" && onNewRemotePeer) {
        try {
          await onNewRemotePeer();
        } catch (err) {
          log.warn(
            "onNewRemotePeer failed:",
            (err as Error)?.message ?? String(err)
          );
        }
      }
      if (disposed) return;
      const flushed = tryFlushPendingBroadcastNow();
      if (!flushed && lastBroadcastPayload && aesKey) {
        void encryptAndEmit(lastBroadcastPayload);
      }
    })();
  });

  socket.on("room-user-change", (members: unknown) => {
    if (disposed) return;
    // CRITICAL: the count we report MUST exclude our own socket so
    // callers can use `peerCount >= 1` to mean "another party is in
    // the room with me." Excalidraw-room sends the FULL members list
    // (including the recipient), so naively reporting members.length
    // makes the tutor's own join trip the "Student connected" UI
    // (Sarah-pilot regression, Apr 24 2026: green pill lit up at
    // t=7s of a fresh session with no student present).
    //
    // We filter by socket id where possible (most precise — handles
    // any future relay change that re-orders or deduplicates the
    // members array), and fall back to `length - 1` when the id
    // isn't known (defensive: room-user-change should always fire
    // post-connect, so socket.id should always be set, but the
    // fallback keeps us safe under any test-fake or future relay
    // tweak that fires the event mid-handshake).
    if (!Array.isArray(members)) {
      fan(peerCountSubs, 0);
      schedulePruneIfShrunk(0);
      return;
    }
    const mySocketId = socket?.id;
    const others = mySocketId
      ? members.filter((m) => m !== mySocketId).length
      : Math.max(0, members.length - 1);
    fan(peerCountSubs, others);
    // Total member count (self included) drives the prune scheduler.
    // Self-only (length === 1) is a shrink to 0 remote peers — prune
    // every entry that hasn't re-announced within the grace window.
    schedulePruneIfShrunk(members.length);
  });

  socket.on(
    "client-broadcast",
    async (data: ArrayBuffer | Uint8Array, iv: ArrayBuffer | Uint8Array) => {
      if (disposed) return;
      if (aesKeyError) return;
      if (!aesKey) {
        if (pendingClientBroadcasts.length >= MAX_PENDING_CLIENT_BROADCASTS) {
          pendingClientBroadcasts.shift();
          log.warn(
            "pending client-broadcast queue overflow; dropped oldest frame"
          );
        }
        pendingClientBroadcasts.push({
          data: toArrayBuffer(data),
          iv: toArrayBuffer(iv),
        });
        return;
      }
      try {
        const msg = await decryptMessage(aesKey, data, iv);
        handleDecryptedWireMessage(msg);
      } catch (err) {
        log.warn(
          "decrypt/parse failed:",
          (err as Error)?.message ?? String(err)
        );
      }
    }
  );

  // ---------------------------------------------------------------
  // Outbound: throttle → encrypt → emit
  // ---------------------------------------------------------------

  /**
   * Clears the trailing-edge throttle and sends any queued `broadcastScene`
   * immediately. Returns true if a packet was (async) sent.
   */
  function tryFlushPendingBroadcastNow(): boolean {
    if (broadcastTimer !== null) {
      clearTimeout(broadcastTimer);
      broadcastTimer = null;
    }
    const payload = pendingPayload;
    pendingPayload = null;
    if (!payload || !aesKey || !socket) return false;
    void encryptAndEmit(payload);
    return true;
  }

  function flushBroadcast() {
    void tryFlushPendingBroadcastNow();
  }

  function encryptAndEmit(p: PendingPayload): Promise<void> {
    lastBroadcastPayload = p;
    const job = (async () => {
      if (!aesKey || !socket) return;
      let msg: AnyWhiteboardWireMessage;
      if (p.kind === "v3") {
        const d = p.doc;
        msg = {
          v: 3,
          peerId,
          role,
          rev: d.rev,
          pages: d.pages,
          page: d.page,
          ...(d.follow ? { follow: d.follow } : {}),
        } as WhiteboardWireMessageV3;
      } else {
        const base = {
          peerId,
          role,
          elements: p.elements,
        };
        const ext = p.extras;
        msg = ext
          ? {
              v: 2,
              ...base,
              ...(ext.follow ? { follow: ext.follow } : {}),
              ...(ext.page ? { page: ext.page } : {}),
              ...(ext.scenePageId ? { scenePageId: ext.scenePageId } : {}),
            }
          : { v: 2, ...base };
      }
      try {
        const { data, iv } = await encryptMessage(aesKey, msg);
        socket.emit("server-broadcast", roomId, data, iv);
      } catch (err) {
        log.warn(
          "encrypt/emit failed:",
          (err as Error)?.message ?? String(err)
        );
      }
    })();
    outboundChain = outboundChain.then(() => job).catch(() => undefined);
    return job;
  }

  function broadcastScene(
    elements: ReadonlyArray<ExcalidrawLikeElement>,
    extras?: WhiteboardWireBroadcastExtras
  ) {
    if (disposed) return;
    if (aesKeyError) return; // inert mode
    pendingPayload = {
      kind: "v2",
      elements: elements.slice() as ExcalidrawLikeElement[],
      extras,
    };
    if (broadcastTimer === null) {
      broadcastTimer = setTimeout(flushBroadcast, broadcastIntervalMs);
    }
  }

  function broadcastDocument(args: {
    rev: number;
    pages: Record<string, ExcalidrawLikeElement[]>;
    page: WhiteboardWirePage;
    follow?: WhiteboardWireFollow;
  }) {
    if (disposed) return;
    if (aesKeyError) return;
    const pages: Record<string, ExcalidrawLikeElement[]> = {};
    for (const [k, els] of Object.entries(args.pages)) {
      pages[k] = (els as ExcalidrawLikeElement[]).map((e) => ({ ...e }));
    }
    pendingPayload = {
      kind: "v3",
      doc: {
        rev: args.rev,
        pages,
        page: {
          activePageId: args.page.activePageId,
          pageList: args.page.pageList.map((x) => ({ ...x })),
        },
        follow: args.follow,
      },
    };
    if (broadcastTimer === null) {
      broadcastTimer = setTimeout(flushBroadcast, broadcastIntervalMs);
    }
  }

  /**
   * Phase 4a/4b — encrypt and emit a non-scene envelope immediately
   * (signal OR presence). Bypasses the trailing-edge scene throttle
   * (these messages must reach the recipient ASAP) but stays on the
   * same outbound chain as scene frames so wire order is
   * deterministic. Never touches `lastBroadcastPayload`: signals and
   * presence are not scene state and must NOT be re-emitted on
   * reconnect or on new-user — sync-client re-fires them via the
   * connect/new-user handlers explicitly when appropriate.
   */
  function encryptAndEmitImmediate(
    msg:
      | WhiteboardWireSignal
      | WhiteboardWirePresence
      | WhiteboardWirePageViewStateMsg
  ): Promise<void> {
    const job = (async () => {
      if (!aesKey || !socket) return;
      try {
        const { data, iv } = await encryptMessage(aesKey, msg);
        socket.emit("server-broadcast", roomId, data, iv);
      } catch (err) {
        log.warn(
          `encrypt/emit ${String((msg as { kind?: unknown }).kind ?? "scene")} failed:`,
          (err as Error)?.message ?? String(err)
        );
      }
    })();
    outboundChain = outboundChain.then(() => job).catch(() => undefined);
    return job;
  }

  function broadcastSignal(
    targetPeerId: string,
    payload: WhiteboardWireSignalPayload
  ): void {
    if (disposed) return;
    if (aesKeyError) return;
    if (typeof targetPeerId !== "string" || targetPeerId.length === 0) {
      log.warn(`broadcastSignal: bad targetPeerId '${String(targetPeerId)}'`);
      return;
    }
    const msg: WhiteboardWireSignal = {
      v: 1,
      kind: "webrtc-signal",
      peerId,
      targetPeerId,
      payload,
    };
    log.log(
      `kind=webrtc-signal send target=${targetPeerId} type=${payload.type}`
    );
    void encryptAndEmitImmediate(msg);
  }

  function broadcastPageViewState(patch: {
    pageId: string;
    panX: number;
    panY: number;
    zoom: number;
  }): void {
    if (disposed) return;
    if (aesKeyError) return;
    const msg: WhiteboardWirePageViewStateMsg = {
      v: 1,
      kind: "pageViewState",
      peerId,
      role,
      pageId: patch.pageId,
      panX: patch.panX,
      panY: patch.panY,
      zoom: patch.zoom,
    };
    log.log(
      `kind=pageViewState send pageId=${patch.pageId} panX=${patch.panX} panY=${patch.panY} zoom=${patch.zoom}`
    );
    void encryptAndEmitImmediate(msg);
  }

  // ---------------------------------------------------------------
  // Public surface
  // ---------------------------------------------------------------

  return {
    isConnected: () => connected,
    onRemoteScene: (cb) => {
      remoteSceneSubs.add(cb);
      const snap = lastRemoteScene;
      if (snap) {
        queueMicrotask(() => {
          if (!remoteSceneSubs.has(cb)) return;
          try {
            (cb as RemoteSceneCb)(snap.peerId, snap.elements, snap.details);
          } catch (err) {
            log.warn(
              "subscriber threw (replay):",
              (err as Error)?.message ?? String(err)
            );
          }
        });
      }
      return () => {
        remoteSceneSubs.delete(cb);
      };
    },
    onConnect: (cb) => {
      connectSubs.add(cb);
      return () => {
        connectSubs.delete(cb);
      };
    },
    onDisconnect: (cb) => {
      disconnectSubs.add(cb);
      return () => {
        disconnectSubs.delete(cb);
      };
    },
    onPeerCountChange: (cb) => {
      peerCountSubs.add(cb);
      return () => {
        peerCountSubs.delete(cb);
      };
    },
    broadcastScene,
    broadcastDocument,
    flushPendingBroadcast: tryFlushPendingBroadcastNow,
    broadcastSignal,
    broadcastPageViewState,
    onRemoteSignal: (cb) => {
      remoteSignalSubs.add(cb);
      // **May 15 hotfix #3 — replay buffered signals to late subscribers.**
      // Pilot symptom: peer A subscribes, sends an offer, peer B's
      // sync-client receives it before B's `useLiveAV` has subscribed
      // to onRemoteSignal — the signal is fanned to zero subscribers
      // and lost. When B finally subscribes, A's offer is gone and B
      // sits on "Connecting…" until a refresh. Replay any in-TTL
      // buffered signals via microtask (subscriber unsubscribed
      // between attach and microtask = no-op), mirroring the
      // onRemoteScene / onRoomPeersChange replay pattern.
      const replay = getReplayableSignals();
      if (replay.length > 0) {
        queueMicrotask(() => {
          if (!remoteSignalSubs.has(cb)) return;
          for (const s of replay) {
            try {
              cb(s.fromPeerId, s.targetPeerId, s.payload);
            } catch (err) {
              log.warn(
                "onRemoteSignal replay subscriber threw:",
                (err as Error)?.message ?? String(err)
              );
            }
          }
        });
      }
      return () => {
        remoteSignalSubs.delete(cb);
      };
    },
    onRemotePageViewState: (cb) => {
      remotePageViewStateSubs.add(cb);
      return () => {
        remotePageViewStateSubs.delete(cb);
      };
    },
    onRoomPeersChange: (cb) => {
      roomPeersSubs.add(cb);
      // Fire the current snapshot in a microtask so subscribers
      // registered after the first presence frame already landed
      // still see the room state. Mirrors the onRemoteScene replay
      // pattern above.
      const snap = lastRoomPeersSnapshot;
      if (snap.length > 0) {
        queueMicrotask(() => {
          if (!roomPeersSubs.has(cb)) return;
          try {
            cb(snap);
          } catch (err) {
            log.warn(
              "onRoomPeersChange subscriber threw (replay):",
              (err as Error)?.message ?? String(err)
            );
          }
        });
      }
      return () => {
        roomPeersSubs.delete(cb);
      };
    },
    disconnect: () => {
      if (disposed) return;
      disposed = true;
      if (broadcastTimer !== null) {
        clearTimeout(broadcastTimer);
        broadcastTimer = null;
      }
      clearPruneTimer();
      presenceMap.clear();
      pendingPrune.clear();
      lastRoomPeersSnapshot = [];
      lastRoomMemberCount = 0;
      pendingClientBroadcasts.length = 0;
      lastRemoteScene = null;
      remoteSceneSubs.clear();
      remoteSignalSubs.clear();
      remotePageViewStateSubs.clear();
      connectSubs.clear();
      disconnectSubs.clear();
      peerCountSubs.clear();
      roomPeersSubs.clear();
      try {
        socket?.removeAllListeners();
        socket?.disconnect();
      } catch (err) {
        log.warn("disconnect cleanup error:", (err as Error)?.message ?? String(err));
      }
      socket = null;
      connected = false;
    },
  };
}

// -----------------------------------------------------------------
// Test helpers (exported for unit tests; not part of the prod surface)
// -----------------------------------------------------------------

export const _testing = {
  decodeBase64Url,
  importAesKey,
  encryptMessage,
  decryptMessage,
};
