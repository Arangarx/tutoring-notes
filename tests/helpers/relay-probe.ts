/**
 * Consent wave C0 — relay probe (W24, F8).
 *
 * A tiny `socket.io` client that joins a room id on the local sync relay and
 * records every event it receives. It is independent of the relay source (the
 * oracle is the wire, not our reading of `excalidraw-room`): W24 joins a room
 * every peer has left and asserts the relay hands back the join handshake and
 * NO scene payload, i.e. the relay keeps no board state to purge.
 *
 * Handshake events the relay legitimately sends a joiner (pinned SHA in
 * docs/PLATFORM-ASSUMPTIONS.md § 5.1): `init-room`, `first-in-room`,
 * `room-user-change` (an array of socket ids), `new-user` (a socket id).
 * Anything else — `client-broadcast`, or any argument that is not a string id
 * or a short list of ids — is treated as a possible scene payload.
 */

import { io, type Socket } from "socket.io-client";

export type RelayEvent = { name: string; args: unknown[] };

export const RELAY_HANDSHAKE_EVENTS = [
  "init-room",
  "first-in-room",
  "room-user-change",
  "new-user",
] as const;

/** Local relay the wb-regression webServer points at (`WHITEBOARD_SYNC_URL=ws://localhost:3002`). */
export const LOCAL_RELAY_URL = "http://localhost:3002";

function isSocketIdList(v: unknown): boolean {
  return Array.isArray(v) && v.length <= 8 && v.every((x) => typeof x === "string" && x.length <= 40);
}

/**
 * Pure: the events that could carry scene state. Empty for a clean handshake.
 * Jest-tested against a synthetic replaying relay (the red case) and a clean one.
 */
export function findScenePayloadEvents(events: RelayEvent[]): RelayEvent[] {
  const handshake = new Set<string>(RELAY_HANDSHAKE_EVENTS);
  return events.filter((e) => {
    if (!handshake.has(e.name)) return true;
    return !e.args.every(
      (a) => (typeof a === "string" && a.length <= 40) || isSocketIdList(a)
    );
  });
}

export type RelayProbeResult = {
  events: RelayEvent[];
  names: string[];
  /** Join to last event, ms. */
  elapsedMs: number;
};

export type RelayClient = {
  events: RelayEvent[];
  /** Emit a raw relay event (e.g. `server-broadcast`). */
  emit: (name: string, ...args: unknown[]) => void;
  /** Resolves once no new event has arrived for `settleMs` (or `timeoutMs` passes). */
  settle: (settleMs?: number, timeoutMs?: number) => Promise<void>;
  close: () => void;
};

/** Connect to the relay and record every event received. The caller must `close()`. */
export async function openRelayClient(opts?: {
  url?: string;
  timeoutMs?: number;
}): Promise<RelayClient> {
  const url = opts?.url ?? LOCAL_RELAY_URL;
  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const events: RelayEvent[] = [];
  let lastAt = Date.now();

  const socket: Socket = io(url, { transports: ["websocket"], reconnection: false });
  socket.onAny((name: string, ...args: unknown[]) => {
    events.push({ name, args });
    lastAt = Date.now();
  });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`relay probe: no connection to ${url} in ${timeoutMs}ms`)),
      timeoutMs
    );
    socket.once("connect", () => {
      clearTimeout(t);
      resolve();
    });
    socket.once("connect_error", (err) => {
      clearTimeout(t);
      reject(new Error(`relay probe: connect_error ${err.message} (${url})`));
    });
  });

  return {
    events,
    emit: (name, ...args) => {
      socket.emit(name, ...args);
      lastAt = Date.now();
    },
    settle: async (settleMs = 1_500, settleTimeoutMs = timeoutMs) => {
      const startedAt = Date.now();
      lastAt = Date.now();
      while (Date.now() - lastAt < settleMs && Date.now() - startedAt < settleTimeoutMs) {
        await new Promise((r) => setTimeout(r, 100));
      }
    },
    close: () => {
      socket.disconnect();
    },
  };
}

/**
 * Join `roomId` as a fresh client and record events until `settleMs` passes with
 * nothing new (default 1.5 s after the last event), or `timeoutMs` elapses.
 * Leaves the room (disconnects) before resolving.
 */
export async function probeRelayRoom(
  roomId: string,
  opts?: { url?: string; settleMs?: number; timeoutMs?: number }
): Promise<RelayProbeResult> {
  const startedAt = Date.now();
  const client = await openRelayClient(opts);
  try {
    client.emit("join-room", roomId);
    await client.settle(opts?.settleMs ?? 1_500, opts?.timeoutMs ?? 15_000);
  } finally {
    client.close();
  }
  return {
    events: client.events,
    names: client.events.map((e) => e.name),
    elapsedMs: Date.now() - startedAt,
  };
}
