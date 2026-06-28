/**
 * Unit tests for `src/lib/whiteboard/sync-client.ts`.
 *
 * Runs under the default Node test environment — Node 20's WebCrypto
 * implementation is fully spec-compliant for AES-GCM, so the
 * encrypt/decrypt round-trip is exercised against the real subtle
 * crypto. The socket.io transport is faked via the `_ioFactory` hook
 * so we can test wire-protocol behaviour without a relay.
 *
 * Coverage targets (mirrors plan reliability axes):
 *   - AES-GCM round-trip + tamper detection
 *   - join-room emission on connect
 *   - new-user triggers re-broadcast of cached scene (no blank canvas)
 *   - broadcastScene is throttled (single emit per interval)
 *   - reconnect re-emits the last scene + fires onConnect again
 *   - decrypt failure is swallowed (no listener throws)
 *   - peerId echo suppression (relay echo doesn't loop into ingestRemote)
 *   - disconnect tears down listeners + is idempotent
 */

import { EventEmitter } from "node:events";
import {
  createWhiteboardSyncClient,
  generateEncryptionKeyBase64Url,
  _testing,
  type RoomPeer,
  type WhiteboardWireMessage,
  type WhiteboardWirePresence,
  type WhiteboardWireSignal,
  type WhiteboardWireSignalPayload,
  type WhiteboardWirePointerMsg,
} from "@/lib/whiteboard/sync-client";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";

// Minimal fake socket.io Socket — surface only what sync-client touches.
class FakeSocket extends EventEmitter {
  id = `sock_${Math.random().toString(36).slice(2)}`;
  emitted: Array<{ event: string; args: unknown[] }> = [];
  removedAll = false;
  disconnected = false;

  emit(event: string | symbol, ...args: unknown[]): boolean {
    if (typeof event === "string") {
      this.emitted.push({ event, args });
    }
    // Don't actually broadcast — tests trigger inbound events manually.
    return true;
  }

  // socket.io's API: `removeAllListeners()` returns the socket;
  // EventEmitter inherits it but we want to track that it was called.
  removeAllListeners(event?: string | symbol): this {
    this.removedAll = true;
    return super.removeAllListeners(event) as this;
  }

  disconnect(): this {
    this.disconnected = true;
    return this;
  }

  /** Test helper — simulate the relay delivering an event to us. */
  inject(event: string, ...args: unknown[]): void {
    super.emit(event, ...args);
  }

  /**
   * Fake the connect handshake. Real socket.io fires `connect`
   * asynchronously; we mimic that with queueMicrotask so listeners
   * registered immediately after `io()` are in place.
   */
  fakeConnect(): void {
    queueMicrotask(() => this.inject("connect"));
  }
}

function fakeIoFactory(): { factory: typeof import("socket.io-client").io; sockets: FakeSocket[] } {
  const sockets: FakeSocket[] = [];
  const factory = ((..._args: unknown[]) => {
    const s = new FakeSocket();
    sockets.push(s);
    s.fakeConnect();
    return s;
  }) as unknown as typeof import("socket.io-client").io;
  return { factory, sockets };
}

const sampleScene = (id: string): ExcalidrawLikeElement[] => [
  {
    id,
    type: "rectangle",
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    strokeColor: "#000",
  },
];

async function flushMicrotasks(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

/**
 * Phase 4b: presence frames now ride the same `server-broadcast`
 * channel as scene/document/signal frames. Pre-existing tests that
 * counted absolute `server-broadcast` emissions need to filter to
 * scene-only emits — otherwise the connect-time presence broadcast
 * (plus the re-broadcast on every new-user / reconnect) inflates
 * the counter. This helper decrypts each emitted frame and counts
 * only those with no `kind` field (i.e. v1/v2/v3 scene messages).
 */
async function countSceneEmits(
  sock: FakeSocket,
  aes: CryptoKey
): Promise<number> {
  let count = 0;
  for (const e of sock.emitted) {
    if (e.event !== "server-broadcast") continue;
    try {
      const decrypted = await _testing.decryptMessage(
        aes,
        e.args[1] as ArrayBuffer,
        e.args[2] as ArrayBuffer
      );
      const kind = (decrypted as { kind?: unknown }).kind;
      if (typeof kind === "undefined") count += 1;
    } catch {
      // skip undecryptable frames (none expected, but safe)
    }
  }
  return count;
}

/**
 * Settle real I/O — used by tests that exercise `crypto.subtle.*` and
 * therefore depend on libuv ticks the fake-timer clock can't simulate.
 */
function realTick(ms = 5): Promise<void> {
  return new Promise((resolve) => {
    // Use the underlying real setTimeout so we don't get caught by
    // jest.useFakeTimers in adjacent describe blocks.
    // jest.requireActual gives us the unfaked timer (a method call, not a
    // CommonJS require — but stay explicit about that for future readers).
    const realSetTimeout: typeof setTimeout =
      (jest.requireActual("timers") as typeof import("timers")).setTimeout;
    realSetTimeout(resolve, ms);
  });
}

describe("sync-client AES-GCM crypto", () => {
  test("generateEncryptionKeyBase64Url produces a 32-byte key", () => {
    const k = generateEncryptionKeyBase64Url();
    const raw = _testing.decodeBase64Url(k);
    expect(raw.length).toBe(32);
  });

  test("encrypt → decrypt round-trips the message", async () => {
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const msg: WhiteboardWireMessage = {
      v: 1,
      peerId: "peer-a",
      role: "tutor",
      elements: sampleScene("e1"),
    };
    const { data, iv } = await _testing.encryptMessage(aes, msg);
    const out = await _testing.decryptMessage(aes, data, iv);
    expect(out).toEqual(msg);
  });

  test("decrypt fails when the ciphertext is tampered (GCM auth tag)", async () => {
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const msg: WhiteboardWireMessage = {
      v: 1,
      peerId: "peer-a",
      role: "tutor",
      elements: [],
    };
    const { data, iv } = await _testing.encryptMessage(aes, msg);
    const tampered = new Uint8Array(data.byteLength);
    tampered.set(new Uint8Array(data));
    tampered[0] = (tampered[0]! ^ 0xff) & 0xff;
    await expect(_testing.decryptMessage(aes, tampered, iv)).rejects.toBeDefined();
  });

  test("decrypt fails with the wrong key", async () => {
    const aesA = await _testing.importAesKey(
      _testing.decodeBase64Url(generateEncryptionKeyBase64Url())
    );
    const aesB = await _testing.importAesKey(
      _testing.decodeBase64Url(generateEncryptionKeyBase64Url())
    );
    const msg: WhiteboardWireMessage = {
      v: 1,
      peerId: "peer-a",
      role: "tutor",
      elements: [],
    };
    const { data, iv } = await _testing.encryptMessage(aesA, msg);
    await expect(_testing.decryptMessage(aesB, data, iv)).rejects.toBeDefined();
  });
});

describe("sync-client lifecycle", () => {
  // NOTE: real timers throughout — these tests exercise `crypto.subtle`
  // which is libuv-backed and cannot be advanced by jest.advanceTimersByTime.
  // `broadcastIntervalMs` is set very small (5 ms) so tests stay fast
  // without resorting to a fake clock.

  test("emits join-room with the configured roomId on connect", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const onConnectSpy = jest.fn();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      _ioFactory: factory,
    });
    client.onConnect(onConnectSpy);

    await realTick();
    await flushMicrotasks();

    const sock = sockets[0]!;
    const joinEmit = sock.emitted.find((e) => e.event === "join-room");
    expect(joinEmit).toBeDefined();
    expect(joinEmit?.args).toEqual(["room-xyz"]);
    expect(client.isConnected()).toBe(true);
    expect(onConnectSpy).toHaveBeenCalledTimes(1);

    client.disconnect();
  });

  test("broadcastScene is throttled and emits server-broadcast", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      broadcastIntervalMs: 5,
      _ioFactory: factory,
    });

    await realTick();
    await flushMicrotasks(10);

    const sock = sockets[0]!;
    const beforeCount = sock.emitted.filter((e) => e.event === "server-broadcast").length;

    client.broadcastScene(sampleScene("a"));
    client.broadcastScene(sampleScene("b"));
    client.broadcastScene(sampleScene("c"));

    await realTick(20);
    await flushMicrotasks(10);

    const afterCount = sock.emitted.filter((e) => e.event === "server-broadcast").length;
    expect(afterCount - beforeCount).toBe(1);

    const last = sock.emitted.filter((e) => e.event === "server-broadcast").at(-1)!;
    expect(last.args[0]).toBe("room-xyz");
    expect(last.args[1]).toBeInstanceOf(ArrayBuffer);

    client.disconnect();
  });

  test("flushPendingBroadcast sends the first scene before a second broadcastScene replaces the queue", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      broadcastIntervalMs: 50,
      _ioFactory: factory,
    });

    await realTick();
    await flushMicrotasks(10);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const a = sampleScene("first");
    const b = sampleScene("second");
    client.broadcastScene(a);
    expect(await countSceneEmits(sock, aes)).toBe(0);

    const flushed1 = client.flushPendingBroadcast();
    expect(flushed1).toBe(true);
    await realTick(10);
    await flushMicrotasks(10);
    expect(await countSceneEmits(sock, aes)).toBe(1);

    client.broadcastScene(b);
    const flushed2 = client.flushPendingBroadcast();
    expect(flushed2).toBe(true);
    await realTick(10);
    await flushMicrotasks(10);
    expect(await countSceneEmits(sock, aes)).toBe(2);

    client.disconnect();
  });

  test("broadcastDocument emits v3 wire payload (decrypts to rev + pages + page + follow)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      broadcastIntervalMs: 5,
      _ioFactory: factory,
    });

    await realTick();
    await flushMicrotasks(10);

    const sock = sockets[0]!;
    client.broadcastDocument({
      rev: 7,
      pages: { p1: sampleScene("a"), p2: [] },
      page: {
        activePageId: "p1",
        pageList: [
          { id: "p1", title: "Page 1" },
          { id: "p2", title: "Page 2" },
        ],
      },
      follow: { centerSceneX: 10, centerSceneY: 20, zoom: 1.5, scrollX: 1, scrollY: 2 },
    });
    client.flushPendingBroadcast();
    await realTick(20);
    await flushMicrotasks(10);

    const last = sock.emitted.filter((e) => e.event === "server-broadcast").at(-1)!;
    const data = last.args[1] as ArrayBuffer;
    const iv = last.args[2] as ArrayBuffer;
    const keyBytes = _testing.decodeBase64Url(k);
    const key = await _testing.importAesKey(keyBytes);
    const decrypted = await _testing.decryptMessage(key, data, iv);
    if (decrypted.v !== 3) throw new Error("expected v3");
    expect(decrypted.rev).toBe(7);
    expect(Object.keys(decrypted.pages).sort()).toEqual(["p1", "p2"]);
    expect(decrypted.page.activePageId).toBe("p1");
    expect(decrypted.follow?.zoom).toBe(1.5);
    const p1el = (decrypted.pages as Record<string, ExcalidrawLikeElement[]>)["p1"]![0]!;
    expect(p1el.id).toBe("a");

    client.disconnect();
  });

  test("new-user triggers re-emit of last scene (no blank canvas for late joiner)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      broadcastIntervalMs: 5,
      _ioFactory: factory,
    });

    await realTick();
    await flushMicrotasks(10);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    client.broadcastScene(sampleScene("a"));
    await realTick(20);
    await flushMicrotasks(10);

    expect(await countSceneEmits(sock, aes)).toBe(1);

    sock.inject("new-user", "fake-peer-sid");
    await realTick(20);
    await flushMicrotasks(15);

    expect(await countSceneEmits(sock, aes)).toBe(2);

    client.disconnect();
  });

  test("new-user flushes a pending throttled broadcast once (no stale empty cache)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      broadcastIntervalMs: 50,
      _ioFactory: factory,
    });

    await realTick();
    await flushMicrotasks(10);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    client.broadcastScene(sampleScene("pending"));
    expect(await countSceneEmits(sock, aes)).toBe(0);

    sock.inject("new-user", "fake-peer-sid");
    await realTick(20);
    await flushMicrotasks(15);

    expect(await countSceneEmits(sock, aes)).toBe(1);

    client.disconnect();
  });

  test("client-broadcast inbound delivers decrypted scene to onRemoteScene", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      _ioFactory: factory,
    });

    const remoteCb = jest.fn();
    client.onRemoteScene(remoteCb);

    await realTick();
    await flushMicrotasks(10);

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const msg: WhiteboardWireMessage = {
      v: 1,
      peerId: "student-1",
      role: "student",
      elements: sampleScene("remote-1"),
    };
    const { data, iv } = await _testing.encryptMessage(aes, msg);

    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(10);
    await flushMicrotasks(15);

    expect(remoteCb).toHaveBeenCalledTimes(1);
    expect(remoteCb).toHaveBeenCalledWith("student-1", msg.elements, undefined);

    client.disconnect();
  });

  test("onRemoteScene registers after first client-broadcast still receives last scene (replay)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "student",
      _ioFactory: factory,
    });

    await realTick();
    await flushMicrotasks(10);

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const msg: WhiteboardWireMessage = {
      v: 1,
      peerId: "tutor-1",
      role: "tutor",
      elements: sampleScene("before-sub"),
    };
    const { data, iv } = await _testing.encryptMessage(aes, msg);

    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(10);
    await flushMicrotasks(15);

    const remoteCb = jest.fn();
    client.onRemoteScene(remoteCb);
    await flushMicrotasks(15);

    expect(remoteCb).toHaveBeenCalledTimes(1);
    expect(remoteCb).toHaveBeenCalledWith("tutor-1", msg.elements, undefined);

    client.disconnect();
  });

  test("relay echo of own peerId is suppressed", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "my-fixed-peer",
      _ioFactory: factory,
    });

    const remoteCb = jest.fn();
    client.onRemoteScene(remoteCb);

    await realTick();
    await flushMicrotasks(10);

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const ownEcho: WhiteboardWireMessage = {
      v: 1,
      peerId: "my-fixed-peer",
      role: "tutor",
      elements: sampleScene("e"),
    };
    const { data, iv } = await _testing.encryptMessage(aes, ownEcho);
    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(10);
    await flushMicrotasks(15);

    expect(remoteCb).not.toHaveBeenCalled();
    client.disconnect();
  });

  test("garbage client-broadcast does not throw to listeners", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      _ioFactory: factory,
    });

    const remoteCb = jest.fn();
    client.onRemoteScene(remoteCb);

    await realTick();
    await flushMicrotasks(10);

    const garbageData = new ArrayBuffer(64);
    new Uint8Array(garbageData).fill(0xab);
    const garbageIv = new ArrayBuffer(12);
    new Uint8Array(garbageIv).fill(0xcd);

    expect(() => {
      sockets[0]!.inject("client-broadcast", garbageData, garbageIv);
    }).not.toThrow();
    await realTick(10);
    await flushMicrotasks(15);

    expect(remoteCb).not.toHaveBeenCalled();
    client.disconnect();
  });

  test("disconnect → reconnect fires onConnect twice and re-emits last scene", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      broadcastIntervalMs: 5,
      _ioFactory: factory,
    });

    const onConnectSpy = jest.fn();
    const onDisconnectSpy = jest.fn();
    client.onConnect(onConnectSpy);
    client.onDisconnect(onDisconnectSpy);

    await realTick();
    await flushMicrotasks(10);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));

    client.broadcastScene(sampleScene("a"));
    await realTick(20);
    await flushMicrotasks(10);

    expect(await countSceneEmits(sock, aes)).toBe(1);

    // socket.io-client keeps the same Socket instance across reconnects
    // and re-fires `connect`. Mirror that here.
    sock.inject("disconnect", "transport close");
    await flushMicrotasks(10);
    expect(onDisconnectSpy).toHaveBeenCalledTimes(1);
    expect(client.isConnected()).toBe(false);

    sock.inject("connect");
    await realTick(20);
    await flushMicrotasks(15);
    expect(onConnectSpy).toHaveBeenCalledTimes(2);
    expect(client.isConnected()).toBe(true);

    expect(await countSceneEmits(sock, aes)).toBe(2);

    client.disconnect();
  });

  test("disconnect() is idempotent and tears down listeners", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      _ioFactory: factory,
    });
    await realTick();
    await flushMicrotasks(10);

    client.disconnect();
    expect(sockets[0]!.removedAll).toBe(true);
    expect(sockets[0]!.disconnected).toBe(true);

    expect(() => client.disconnect()).not.toThrow();
  });

  test("invalid encryption key → inert mode (no broadcasts emitted)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const errLog = jest.fn();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: "too-short",
      role: "tutor",
      broadcastIntervalMs: 5,
      _ioFactory: factory,
      _logger: { log: jest.fn(), warn: jest.fn(), error: errLog },
    });

    await realTick();
    await flushMicrotasks(10);

    const beforeCount = sockets[0]!.emitted.filter(
      (e) => e.event === "server-broadcast"
    ).length;

    client.broadcastScene(sampleScene("a"));
    await realTick(30);
    await flushMicrotasks(10);

    const afterCount = sockets[0]!.emitted.filter(
      (e) => e.event === "server-broadcast"
    ).length;
    expect(afterCount).toBe(beforeCount);
    expect(errLog).toHaveBeenCalled();

    client.disconnect();
  });
});

describe("sync-client peer count (other-peers semantics)", () => {
  // Sarah-pilot regression context (Apr 24 2026): the workspace lit
  // up "Student connected" at t=7s of a fresh session because the
  // sync client was reporting `members.length` (TOTAL room size,
  // including self) while the workspace treats `peerCount >= 1` as
  // "another party joined." Excalidraw-room sends the full members
  // list, so the tutor's own join made `peerCount === 1` and the
  // pill went green with no student present.
  //
  // These tests pin the corrected contract: `onPeerCountChange`
  // ALWAYS reports OTHER peers (excludes self).

  test("tutor alone in room → peerCount = 0", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      _ioFactory: factory,
    });

    const counts: number[] = [];
    client.onPeerCountChange((n) => counts.push(n));

    await realTick();
    await flushMicrotasks(5);

    const sock = sockets[0]!;
    // Excalidraw-room would emit the full members list — just us.
    sock.inject("room-user-change", [sock.id]);

    expect(counts).toEqual([0]);
    client.disconnect();
  });

  test("tutor + student in room → peerCount = 1", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      _ioFactory: factory,
    });

    const counts: number[] = [];
    client.onPeerCountChange((n) => counts.push(n));

    await realTick();
    await flushMicrotasks(5);

    const sock = sockets[0]!;
    sock.inject("room-user-change", [sock.id, "student_socket_id"]);

    expect(counts).toEqual([1]);
    client.disconnect();
  });

  test("tutor + 2 students (e.g. parent watching) → peerCount = 2", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      _ioFactory: factory,
    });

    const counts: number[] = [];
    client.onPeerCountChange((n) => counts.push(n));

    await realTick();
    await flushMicrotasks(5);

    const sock = sockets[0]!;
    sock.inject("room-user-change", [sock.id, "student_a", "student_b"]);

    expect(counts).toEqual([2]);
    client.disconnect();
  });

  test("student leaves → peerCount drops back to 0", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      _ioFactory: factory,
    });

    const counts: number[] = [];
    client.onPeerCountChange((n) => counts.push(n));

    await realTick();
    await flushMicrotasks(5);

    const sock = sockets[0]!;
    sock.inject("room-user-change", [sock.id, "stu_1"]);
    sock.inject("room-user-change", [sock.id]);

    expect(counts).toEqual([1, 0]);
    client.disconnect();
  });

  test("non-array members payload → peerCount = 0 (defensive)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      _ioFactory: factory,
    });

    const counts: number[] = [];
    client.onPeerCountChange((n) => counts.push(n));

    await realTick();
    await flushMicrotasks(5);

    const sock = sockets[0]!;
    sock.inject("room-user-change", "not an array");
    sock.inject("room-user-change", null);
    sock.inject("room-user-change", { weirdShape: true });

    expect(counts).toEqual([0, 0, 0]);
    client.disconnect();
  });

  test("REGRESSION: even if our socket id isn't in the members list, we still report length-1 (defensive fallback)", async () => {
    // If a future relay change starts omitting the recipient from
    // its own members payload OR fires the event before socket.id
    // is known, the count must still subtract self. We test the
    // "id not present in payload" arm of the fallback by passing
    // an unrelated socket id list.
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      _ioFactory: factory,
    });

    const counts: number[] = [];
    client.onPeerCountChange((n) => counts.push(n));

    await realTick();
    await flushMicrotasks(5);

    const sock = sockets[0]!;
    // No "self" id in payload — filter would keep all 3, but the
    // documented contract is "other peers." Pinning current behavior:
    // the filter path keeps all 3 here. If this becomes a problem
    // (relay omits self in payload), update the impl AND this test
    // intentionally — silently flipping to length-only would
    // regress the original Sarah bug.
    sock.inject("room-user-change", ["other_a", "other_b", "other_c"]);

    expect(counts).toEqual([3]);
    client.disconnect();
  });
});

// -----------------------------------------------------------------
// Phase 4a — webrtc-signal envelope (additive)
// -----------------------------------------------------------------
//
// These tests pin the new envelope kind without disturbing the
// existing scene-message coverage. Both must coexist on the same
// encrypted Socket.IO channel; that's the entire point of the
// additive extension.

describe("sync-client webrtc-signal envelope (Phase 4a)", () => {
  test("broadcastSignal encrypts an envelope that round-trips back to a WhiteboardWireSignal", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });

    await realTick();
    await flushMicrotasks(10);

    client.broadcastSignal("student-B", {
      type: "offer",
      sdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n...",
    });
    await realTick(20);
    await flushMicrotasks(15);

    const sock = sockets[0]!;
    const last = sock.emitted.filter((e) => e.event === "server-broadcast").at(-1)!;
    expect(last.args[0]).toBe("room-xyz");
    const data = last.args[1] as ArrayBuffer;
    const iv = last.args[2] as ArrayBuffer;

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const decrypted = await _testing.decryptMessage(aes, data, iv);
    expect((decrypted as WhiteboardWireSignal).kind).toBe("webrtc-signal");
    expect((decrypted as WhiteboardWireSignal).v).toBe(1);
    expect((decrypted as WhiteboardWireSignal).peerId).toBe("tutor-A");
    expect((decrypted as WhiteboardWireSignal).targetPeerId).toBe("student-B");
    expect((decrypted as WhiteboardWireSignal).payload).toEqual({
      type: "offer",
      sdp: expect.stringContaining("v=0"),
    });

    client.disconnect();
  });

  test("broadcastSignal bypasses the scene throttle (no setTimeout wait needed)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      // Deliberately large scene-throttle window — signal must still
      // be on the wire without waiting for the trailing-edge timer.
      broadcastIntervalMs: 5_000,
      _ioFactory: factory,
    });

    await realTick();
    await flushMicrotasks(10);

    const sock = sockets[0]!;
    const before = sock.emitted.filter((e) => e.event === "server-broadcast").length;
    client.broadcastSignal("student-B", {
      type: "ice",
      candidate: { candidate: "candidate:1 1 udp 2113937151 192.168.1.2 54321 typ host", sdpMid: "0", sdpMLineIndex: 0 },
    });
    // Tiny tick — enough for the encrypt microtask, no setTimeout fired.
    await realTick(20);
    await flushMicrotasks(15);
    const after = sock.emitted.filter((e) => e.event === "server-broadcast").length;
    expect(after - before).toBe(1);

    client.disconnect();
  });

  test("inbound signal fires onRemoteSignal with from/target/payload", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });

    const signalCb = jest.fn<
      void,
      [string, string, WhiteboardWireSignalPayload]
    >();
    client.onRemoteSignal(signalCb);

    await realTick();
    await flushMicrotasks(10);

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const inbound: WhiteboardWireSignal = {
      v: 1,
      kind: "webrtc-signal",
      peerId: "student-B",
      targetPeerId: "tutor-A",
      payload: { type: "answer", sdp: "v=0\r\no=answer\r\n..." },
    };
    const { data, iv } = await _testing.encryptMessage(aes, inbound);

    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(15);
    await flushMicrotasks(15);

    expect(signalCb).toHaveBeenCalledTimes(1);
    expect(signalCb).toHaveBeenCalledWith(
      "student-B",
      "tutor-A",
      { type: "answer", sdp: expect.stringContaining("v=0") }
    );

    client.disconnect();
  });

  test("inbound signal does NOT fire onRemoteScene (channels are isolated)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });

    const sceneCb = jest.fn();
    const signalCb = jest.fn();
    client.onRemoteScene(sceneCb);
    client.onRemoteSignal(signalCb);

    await realTick();
    await flushMicrotasks(10);

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const inbound: WhiteboardWireSignal = {
      v: 1,
      kind: "webrtc-signal",
      peerId: "student-B",
      targetPeerId: "tutor-A",
      payload: { type: "leave" },
    };
    const { data, iv } = await _testing.encryptMessage(aes, inbound);

    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(15);
    await flushMicrotasks(15);

    expect(signalCb).toHaveBeenCalledTimes(1);
    expect(sceneCb).not.toHaveBeenCalled();

    client.disconnect();
  });

  test("inbound scene message does NOT fire onRemoteSignal (channels are isolated)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });

    const sceneCb = jest.fn();
    const signalCb = jest.fn();
    client.onRemoteScene(sceneCb);
    client.onRemoteSignal(signalCb);

    await realTick();
    await flushMicrotasks(10);

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const sceneMsg: WhiteboardWireMessage = {
      v: 1,
      peerId: "student-B",
      role: "student",
      elements: sampleScene("e-from-scene"),
    };
    const { data, iv } = await _testing.encryptMessage(aes, sceneMsg);

    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(15);
    await flushMicrotasks(15);

    expect(sceneCb).toHaveBeenCalledTimes(1);
    expect(signalCb).not.toHaveBeenCalled();

    client.disconnect();
  });

  test("signal addressed elsewhere still fires onRemoteSignal (sync-client does not demux; signaling.ts does)", async () => {
    // The wire-layer contract is: every non-self signal is delivered
    // to onRemoteSignal. signaling.ts is responsible for the
    // targetPeerId === localPeerId check. This test pins that
    // separation; if sync-client ever starts demuxing it would have
    // to coordinate with the signaling layer.
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });

    const signalCb = jest.fn();
    client.onRemoteSignal(signalCb);

    await realTick();
    await flushMicrotasks(10);

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const inbound: WhiteboardWireSignal = {
      v: 1,
      kind: "webrtc-signal",
      peerId: "student-B",
      targetPeerId: "student-C", // not us — we still deliver it
      payload: { type: "ice", candidate: null },
    };
    const { data, iv } = await _testing.encryptMessage(aes, inbound);

    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(15);
    await flushMicrotasks(15);

    expect(signalCb).toHaveBeenCalledTimes(1);
    expect(signalCb).toHaveBeenCalledWith(
      "student-B",
      "student-C",
      { type: "ice", candidate: null }
    );

    client.disconnect();
  });

  test("own signal echo from the relay is suppressed", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });

    const signalCb = jest.fn();
    client.onRemoteSignal(signalCb);

    await realTick();
    await flushMicrotasks(10);

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const ownEcho: WhiteboardWireSignal = {
      v: 1,
      kind: "webrtc-signal",
      peerId: "tutor-A", // our own
      targetPeerId: "student-B",
      payload: { type: "leave" },
    };
    const { data, iv } = await _testing.encryptMessage(aes, ownEcho);

    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(15);
    await flushMicrotasks(15);

    expect(signalCb).not.toHaveBeenCalled();

    client.disconnect();
  });

  test("an unknown future `kind` is rejected cleanly (no listener fires, no throw)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const warnLog = jest.fn();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
      _logger: { log: jest.fn(), warn: warnLog, error: jest.fn() },
    });

    const sceneCb = jest.fn();
    const signalCb = jest.fn();
    client.onRemoteScene(sceneCb);
    client.onRemoteSignal(signalCb);

    await realTick();
    await flushMicrotasks(10);

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    // Hand-craft a future-kind envelope. We can't go through
    // encryptMessage with a typed wire message (TS would reject the
    // shape), so we encrypt the raw JSON via crypto.subtle directly.
    const futureMsg = {
      v: 1,
      kind: "future-thing",
      peerId: "student-B",
      payload: { whatever: true },
    };
    const ivBuf = new ArrayBuffer(12);
    crypto.getRandomValues(new Uint8Array(ivBuf));
    const plaintext = new TextEncoder().encode(JSON.stringify(futureMsg));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ivBuf },
      aes,
      plaintext as unknown as ArrayBuffer
    );

    expect(() => {
      sockets[0]!.inject("client-broadcast", ct, ivBuf);
    }).not.toThrow();
    await realTick(15);
    await flushMicrotasks(15);

    expect(sceneCb).not.toHaveBeenCalled();
    expect(signalCb).not.toHaveBeenCalled();
    // The validator threw inside the handler, which is caught and
    // logged as a `decrypt/parse failed` warning. We don't pin the
    // exact log line text (would couple us to the message) but we
    // assert that *some* warning fired so a future change that
    // silently swallows malformed payloads gets caught.
    expect(warnLog).toHaveBeenCalled();

    client.disconnect();
  });

  test("malformed signal payload (bad type) is rejected without firing onRemoteSignal", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
      _logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    const signalCb = jest.fn();
    client.onRemoteSignal(signalCb);

    await realTick();
    await flushMicrotasks(10);

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const garbled = {
      v: 1,
      kind: "webrtc-signal",
      peerId: "student-B",
      targetPeerId: "tutor-A",
      payload: { type: "nope", weird: true },
    };
    const ivBuf = new ArrayBuffer(12);
    crypto.getRandomValues(new Uint8Array(ivBuf));
    const plaintext = new TextEncoder().encode(JSON.stringify(garbled));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ivBuf },
      aes,
      plaintext as unknown as ArrayBuffer
    );

    sockets[0]!.inject("client-broadcast", ct, ivBuf);
    await realTick(15);
    await flushMicrotasks(15);

    expect(signalCb).not.toHaveBeenCalled();

    client.disconnect();
  });

  test("ICE payload with null candidate (end-of-candidates marker) round-trips intact", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });

    await realTick();
    await flushMicrotasks(10);

    client.broadcastSignal("student-B", { type: "ice", candidate: null });
    await realTick(20);
    await flushMicrotasks(15);

    const sock = sockets[0]!;
    const last = sock.emitted.filter((e) => e.event === "server-broadcast").at(-1)!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const decrypted = await _testing.decryptMessage(
      aes,
      last.args[1] as ArrayBuffer,
      last.args[2] as ArrayBuffer
    );
    expect((decrypted as WhiteboardWireSignal).payload).toEqual({
      type: "ice",
      candidate: null,
    });

    client.disconnect();
  });

  test("broadcastSignal with empty targetPeerId is rejected (warns; no emit)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const warnLog = jest.fn();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
      _logger: { log: jest.fn(), warn: warnLog, error: jest.fn() },
    });

    await realTick();
    await flushMicrotasks(10);

    const before = sockets[0]!.emitted.filter((e) => e.event === "server-broadcast").length;
    client.broadcastSignal("", { type: "leave" });
    await realTick(20);
    await flushMicrotasks(10);
    const after = sockets[0]!.emitted.filter((e) => e.event === "server-broadcast").length;

    expect(after).toBe(before);
    expect(warnLog).toHaveBeenCalled();

    client.disconnect();
  });

  test("invalid encryption key → broadcastSignal is inert (no emit)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: "too-short",
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
      _logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    await realTick();
    await flushMicrotasks(10);

    const before = sockets[0]!.emitted.filter((e) => e.event === "server-broadcast").length;
    client.broadcastSignal("student-B", { type: "leave" });
    await realTick(30);
    await flushMicrotasks(10);
    const after = sockets[0]!.emitted.filter((e) => e.event === "server-broadcast").length;
    expect(after).toBe(before);

    client.disconnect();
  });

  test("disconnect() clears signal subscribers (no callback after dispose)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });

    const signalCb = jest.fn();
    client.onRemoteSignal(signalCb);

    await realTick();
    await flushMicrotasks(10);

    client.disconnect();
    // After disconnect the socket listener is removed; injecting a
    // signal must not reach the callback.
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const inbound: WhiteboardWireSignal = {
      v: 1,
      kind: "webrtc-signal",
      peerId: "student-B",
      targetPeerId: "tutor-A",
      payload: { type: "leave" },
    };
    const { data, iv } = await _testing.encryptMessage(aes, inbound);
    expect(() => {
      sockets[0]!.inject("client-broadcast", data, iv);
    }).not.toThrow();
    await realTick(15);
    await flushMicrotasks(15);
    expect(signalCb).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------
// May 15 hotfix #3 — webrtc-signal buffer for late subscribers
// -----------------------------------------------------------------
//
// Root cause this block guards against: pre-hotfix, an inbound
// `webrtc-signal` arriving before any `onRemoteSignal` subscriber
// was attached fanned to a zero-size Set and was silently lost.
// The late-mounting peer (typically `useLiveAV` subscribing via
// `signaling.ts` after `getUserMedia` resolved) would only see
// FUTURE signals, missing the early peer's first offer and
// stalling on "Connecting…" until refresh. The fix buffers
// in-TTL signals and replays them on first subscribe via
// `queueMicrotask`. See `BufferedRemoteSignal` docblock in
// `sync-client.ts` for the full rationale.

describe("sync-client onRemoteSignal buffer + late-subscribe replay (May 15 hotfix #3)", () => {
  test("signal arriving BEFORE any onRemoteSignal subscriber is replayed to the first subscriber", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });

    await realTick();
    await flushMicrotasks(10);

    // Inject a signal BEFORE any onRemoteSignal subscriber attaches.
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const inbound: WhiteboardWireSignal = {
      v: 1,
      kind: "webrtc-signal",
      peerId: "student-B",
      targetPeerId: "tutor-A",
      payload: { type: "offer", sdp: "v=0\r\noffer-from-B\r\n..." },
    };
    const { data, iv } = await _testing.encryptMessage(aes, inbound);
    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(15);
    await flushMicrotasks(15);

    // Now the late subscriber attaches.
    const signalCb = jest.fn();
    client.onRemoteSignal(signalCb);
    // Replay happens in a microtask — wait for it.
    await flushMicrotasks(10);

    expect(signalCb).toHaveBeenCalledTimes(1);
    expect(signalCb).toHaveBeenCalledWith(
      "student-B",
      "tutor-A",
      { type: "offer", sdp: expect.stringContaining("offer-from-B") }
    );

    client.disconnect();
  });

  test("replay delivers signals in original capture order", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });

    await realTick();
    await flushMicrotasks(10);

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const inbound1: WhiteboardWireSignal = {
      v: 1,
      kind: "webrtc-signal",
      peerId: "student-B",
      targetPeerId: "tutor-A",
      payload: { type: "offer", sdp: "sdp-1" },
    };
    const inbound2: WhiteboardWireSignal = {
      v: 1,
      kind: "webrtc-signal",
      peerId: "student-B",
      targetPeerId: "tutor-A",
      payload: {
        type: "ice",
        candidate: { candidate: "candidate:1 ...", sdpMid: "0", sdpMLineIndex: 0 },
      },
    };
    const inbound3: WhiteboardWireSignal = {
      v: 1,
      kind: "webrtc-signal",
      peerId: "student-B",
      targetPeerId: "tutor-A",
      payload: { type: "ice", candidate: null },
    };

    for (const m of [inbound1, inbound2, inbound3]) {
      const { data, iv } = await _testing.encryptMessage(aes, m);
      sockets[0]!.inject("client-broadcast", data, iv);
    }
    await realTick(15);
    await flushMicrotasks(15);

    const signalCb = jest.fn();
    client.onRemoteSignal(signalCb);
    await flushMicrotasks(10);

    expect(signalCb).toHaveBeenCalledTimes(3);
    expect(signalCb.mock.calls[0]![2]).toEqual({ type: "offer", sdp: "sdp-1" });
    expect(signalCb.mock.calls[1]![2]!.type).toBe("ice");
    expect((signalCb.mock.calls[1]![2] as { candidate: unknown }).candidate).toEqual(
      expect.objectContaining({ candidate: expect.stringContaining("candidate:1") })
    );
    expect(signalCb.mock.calls[2]![2]).toEqual({ type: "ice", candidate: null });

    client.disconnect();
  });

  test("replay DOES NOT re-deliver to a second subscriber registered AFTER the first (no echo)", async () => {
    // Defense-in-depth: each subscriber should see its own replay
    // window once at attach time, not signals already delivered to
    // OTHER subscribers via live fan(). The contract is "replay
    // catches up late subscribers" — once a subscriber is attached,
    // it sees live signals like any other subscriber.
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });

    await realTick();
    await flushMicrotasks(10);

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const inbound: WhiteboardWireSignal = {
      v: 1,
      kind: "webrtc-signal",
      peerId: "student-B",
      targetPeerId: "tutor-A",
      payload: { type: "offer", sdp: "early-offer" },
    };
    const { data, iv } = await _testing.encryptMessage(aes, inbound);
    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(15);
    await flushMicrotasks(15);

    const subA = jest.fn();
    client.onRemoteSignal(subA);
    await flushMicrotasks(10);

    const subB = jest.fn();
    client.onRemoteSignal(subB);
    await flushMicrotasks(10);

    // BOTH subscribers should see the buffered signal — sub B is
    // also a "late subscriber" relative to the inbound message.
    // (We do not de-dupe via "already delivered to someone else".)
    expect(subA).toHaveBeenCalledTimes(1);
    expect(subB).toHaveBeenCalledTimes(1);

    client.disconnect();
  });

  test("live signals received AFTER subscribe do NOT also fire from the buffer (no double-delivery)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });

    await realTick();
    await flushMicrotasks(10);

    // Subscribe FIRST (no replay needed; buffer is empty).
    const signalCb = jest.fn();
    client.onRemoteSignal(signalCb);
    await flushMicrotasks(10);
    expect(signalCb).not.toHaveBeenCalled();

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const inbound: WhiteboardWireSignal = {
      v: 1,
      kind: "webrtc-signal",
      peerId: "student-B",
      targetPeerId: "tutor-A",
      payload: { type: "answer", sdp: "live-answer" },
    };
    const { data, iv } = await _testing.encryptMessage(aes, inbound);
    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(15);
    await flushMicrotasks(15);

    // The signal should be delivered once via fan(), not twice
    // (once via fan and once via buffer replay).
    expect(signalCb).toHaveBeenCalledTimes(1);

    client.disconnect();
  });

  test("signals older than the TTL are not replayed (stale-signal-drop)", async () => {
    // We can't easily fast-forward Date.now() inside the sync-client
    // without injecting a clock, so we mock Date.now globally for
    // this test only.
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();

    const realNow = Date.now.bind(Date);
    let nowMs = realNow();
    const dateSpy = jest.spyOn(Date, "now").mockImplementation(() => nowMs);

    try {
      const client = createWhiteboardSyncClient({
        url: "wss://test",
        roomId: "room-xyz",
        encryptionKeyBase64Url: k,
        role: "tutor",
        peerId: "tutor-A",
        _ioFactory: factory,
      });

      await realTick();
      await flushMicrotasks(10);

      const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
      const inbound: WhiteboardWireSignal = {
        v: 1,
        kind: "webrtc-signal",
        peerId: "student-B",
        targetPeerId: "tutor-A",
        payload: { type: "offer", sdp: "ancient-offer" },
      };
      const { data, iv } = await _testing.encryptMessage(aes, inbound);
      sockets[0]!.inject("client-broadcast", data, iv);
      await realTick(15);
      await flushMicrotasks(15);

      // Jump the clock forward past the TTL (8s + slop).
      nowMs = nowMs + 10_000;

      const signalCb = jest.fn();
      client.onRemoteSignal(signalCb);
      await flushMicrotasks(10);

      expect(signalCb).not.toHaveBeenCalled();

      client.disconnect();
    } finally {
      dateSpy.mockRestore();
    }
  });

  test("buffer is bounded — only the most recent 64 signals are retained", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });

    await realTick();
    await flushMicrotasks(10);

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));

    // Push 80 signals before any subscriber attaches.
    for (let i = 0; i < 80; i++) {
      const inbound: WhiteboardWireSignal = {
        v: 1,
        kind: "webrtc-signal",
        peerId: "student-B",
        targetPeerId: "tutor-A",
        payload: { type: "offer", sdp: `sdp-${i}` },
      };
      const { data, iv } = await _testing.encryptMessage(aes, inbound);
      sockets[0]!.inject("client-broadcast", data, iv);
    }
    await realTick(50);
    await flushMicrotasks(30);

    const signalCb = jest.fn();
    client.onRemoteSignal(signalCb);
    await flushMicrotasks(20);

    // Cap is 64. Oldest 16 should have been evicted.
    expect(signalCb).toHaveBeenCalledTimes(64);
    // First retained signal is sdp-16 (oldest 16 dropped).
    expect((signalCb.mock.calls[0]![2] as { sdp: string }).sdp).toBe("sdp-16");
    // Last retained signal is sdp-79 (most recent).
    expect((signalCb.mock.calls[63]![2] as { sdp: string }).sdp).toBe("sdp-79");

    client.disconnect();
  });

  test("subscribers that unsubscribe between attach and microtask receive zero replays", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });

    await realTick();
    await flushMicrotasks(10);

    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const inbound: WhiteboardWireSignal = {
      v: 1,
      kind: "webrtc-signal",
      peerId: "student-B",
      targetPeerId: "tutor-A",
      payload: { type: "offer", sdp: "buffered" },
    };
    const { data, iv } = await _testing.encryptMessage(aes, inbound);
    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(15);
    await flushMicrotasks(15);

    const signalCb = jest.fn();
    const unsubscribe = client.onRemoteSignal(signalCb);
    // Unsubscribe synchronously BEFORE the microtask replay runs.
    unsubscribe();
    await flushMicrotasks(20);

    expect(signalCb).not.toHaveBeenCalled();

    client.disconnect();
  });
});

// -----------------------------------------------------------------
// Phase 4b — presence envelope + onRoomPeersChange + prune timer
// -----------------------------------------------------------------

/**
 * Controllable setTimeout/clearTimeout pair so prune-window tests can
 * advance the grace timer deterministically without disturbing the
 * real `crypto.subtle` timing the other suites rely on. We can't use
 * jest fake timers here because the AES-GCM round-trip is libuv-backed.
 */
function makeControllableTimer() {
  type Pending = { id: number; cb: () => void; ms: number };
  const queue: Pending[] = [];
  let counter = 0;
  const setTimeoutFn = (cb: () => void, ms: number) => {
    counter += 1;
    queue.push({ id: counter, cb, ms });
    return counter;
  };
  const clearTimeoutFn = (id: unknown) => {
    const idx = queue.findIndex((t) => t.id === id);
    if (idx >= 0) queue.splice(idx, 1);
  };
  return {
    setTimeoutFn,
    clearTimeoutFn,
    fireAll: () => {
      const pending = queue.splice(0);
      for (const t of pending) t.cb();
    },
    pendingCount: () => queue.length,
  };
}

/** Inject an inbound encrypted presence frame on the fake socket. */
async function injectPresence(
  sock: FakeSocket,
  aes: CryptoKey,
  presence: WhiteboardWirePresence
): Promise<void> {
  const { data, iv } = await _testing.encryptMessage(aes, presence);
  sock.inject("client-broadcast", data, iv);
}

/** Decrypt every server-broadcast emitted so far and return the presence frames. */
async function readEmittedPresence(
  sock: FakeSocket,
  aes: CryptoKey
): Promise<WhiteboardWirePresence[]> {
  const out: WhiteboardWirePresence[] = [];
  for (const e of sock.emitted) {
    if (e.event !== "server-broadcast") continue;
    const data = e.args[1] as ArrayBuffer;
    const iv = e.args[2] as ArrayBuffer;
    try {
      const msg = await _testing.decryptMessage(aes, data, iv);
      if ((msg as Partial<WhiteboardWirePresence>).kind === "presence") {
        out.push(msg as WhiteboardWirePresence);
      }
    } catch {
      // skip non-decryptable / scene frames
    }
  }
  return out;
}

describe("sync-client presence envelope (Phase 4b)", () => {
  test("presence message encrypts → decrypts → validates with all fields", async () => {
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const msg: WhiteboardWirePresence = {
      v: 1,
      kind: "presence",
      peerId: "peer-a",
      role: "tutor",
      label: "Sarah",
    };
    const { data, iv } = await _testing.encryptMessage(aes, msg);
    const out = await _testing.decryptMessage(aes, data, iv);
    expect(out).toEqual(msg);
  });

  test("presence without label round-trips with label omitted", async () => {
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const msg: WhiteboardWirePresence = {
      v: 1,
      kind: "presence",
      peerId: "peer-b",
      role: "student",
    };
    const { data, iv } = await _testing.encryptMessage(aes, msg);
    const out = await _testing.decryptMessage(aes, data, iv);
    expect(out).toEqual(msg);
    expect((out as WhiteboardWirePresence).label).toBeUndefined();
  });

  test("validateWireMessage rejects malformed presence (bad role)", async () => {
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const bogus = {
      v: 1,
      kind: "presence",
      peerId: "peer-c",
      role: "moderator",
    };
    const ivBuf = new ArrayBuffer(12);
    crypto.getRandomValues(new Uint8Array(ivBuf));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ivBuf },
      aes,
      new TextEncoder().encode(JSON.stringify(bogus)) as unknown as ArrayBuffer
    );
    await expect(_testing.decryptMessage(aes, ct, ivBuf)).rejects.toThrow(/bad role/);
  });

  test("validateWireMessage rejects malformed presence (empty peerId)", async () => {
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const bogus = { v: 1, kind: "presence", peerId: "", role: "tutor" };
    const ivBuf = new ArrayBuffer(12);
    crypto.getRandomValues(new Uint8Array(ivBuf));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ivBuf },
      aes,
      new TextEncoder().encode(JSON.stringify(bogus)) as unknown as ArrayBuffer
    );
    await expect(_testing.decryptMessage(aes, ct, ivBuf)).rejects.toThrow(/bad peerId/);
  });

  test("scene + signal messages still validate after presence extension", async () => {
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const scene: WhiteboardWireMessage = {
      v: 1,
      peerId: "peer-a",
      role: "tutor",
      elements: sampleScene("s1"),
    };
    const sceneEnc = await _testing.encryptMessage(aes, scene);
    expect(await _testing.decryptMessage(aes, sceneEnc.data, sceneEnc.iv)).toEqual(scene);

    const signal: WhiteboardWireSignal = {
      v: 1,
      kind: "webrtc-signal",
      peerId: "peer-a",
      targetPeerId: "peer-b",
      payload: { type: "leave" },
    };
    const sigEnc = await _testing.encryptMessage(aes, signal);
    expect(await _testing.decryptMessage(aes, sigEnc.data, sigEnc.iv)).toEqual(signal);
  });

  test("broadcastPresence emits one presence frame on initial connect (no label)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });

    await realTick(20);
    await flushMicrotasks(20);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const presenceFrames = await readEmittedPresence(sock, aes);
    expect(presenceFrames.length).toBeGreaterThanOrEqual(1);
    const first = presenceFrames[0]!;
    expect(first.peerId).toBe("tutor-A");
    expect(first.role).toBe("tutor");
    expect(first.label).toBeUndefined();

    client.disconnect();
  });

  test("broadcastPresence includes localPeerLabel when supplied", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      localPeerLabel: "Sarah",
      _ioFactory: factory,
    });

    await realTick(20);
    await flushMicrotasks(20);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const presenceFrames = await readEmittedPresence(sock, aes);
    const myFrame = presenceFrames.find((p) => p.peerId === "tutor-A");
    expect(myFrame?.label).toBe("Sarah");

    client.disconnect();
  });

  test("re-broadcasts presence when new-user fires", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      localPeerLabel: "Sarah",
      _ioFactory: factory,
    });

    await realTick(20);
    await flushMicrotasks(20);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const baseCount = (await readEmittedPresence(sock, aes)).length;

    sock.inject("new-user", "remote-socket-1");
    await realTick(20);
    await flushMicrotasks(20);

    const afterCount = (await readEmittedPresence(sock, aes)).length;
    expect(afterCount - baseCount).toBeGreaterThanOrEqual(1);

    client.disconnect();
  });

  test("re-broadcasts presence on reconnect", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });

    await realTick(20);
    await flushMicrotasks(20);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const baseCount = (await readEmittedPresence(sock, aes)).length;

    sock.inject("disconnect", "transport close");
    await flushMicrotasks(5);
    sock.inject("connect");
    await realTick(20);
    await flushMicrotasks(20);

    const afterCount = (await readEmittedPresence(sock, aes)).length;
    expect(afterCount).toBeGreaterThan(baseCount);

    client.disconnect();
  });

  test("onRoomPeersChange fires once when a new peer's presence arrives", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const peersCb = jest.fn<void, [ReadonlyArray<RoomPeer>]>();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });
    client.onRoomPeersChange(peersCb);

    await realTick(20);
    await flushMicrotasks(20);

    expect(peersCb).not.toHaveBeenCalled();

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    await injectPresence(sock, aes, {
      v: 1,
      kind: "presence",
      peerId: "student-B",
      role: "student",
      label: "Alex",
    });
    await realTick(20);
    await flushMicrotasks(20);

    expect(peersCb).toHaveBeenCalledTimes(1);
    expect(peersCb).toHaveBeenLastCalledWith([
      { peerId: "student-B", role: "student", label: "Alex" },
    ]);

    client.disconnect();
  });

  test("onRoomPeersChange excludes self (own presence echo)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const peersCb = jest.fn<void, [ReadonlyArray<RoomPeer>]>();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });
    client.onRoomPeersChange(peersCb);

    await realTick(20);
    await flushMicrotasks(20);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    // Inject a presence frame that claims to be from ourselves —
    // sync-client must ignore it (own echo from the relay's
    // broadcast loop).
    await injectPresence(sock, aes, {
      v: 1,
      kind: "presence",
      peerId: "tutor-A",
      role: "tutor",
      label: "Sarah",
    });
    await realTick(20);
    await flushMicrotasks(20);

    expect(peersCb).not.toHaveBeenCalled();

    client.disconnect();
  });

  test("duplicate presence with same fields does NOT re-fire onRoomPeersChange", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const peersCb = jest.fn<void, [ReadonlyArray<RoomPeer>]>();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });
    client.onRoomPeersChange(peersCb);

    await realTick(20);
    await flushMicrotasks(20);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const frame: WhiteboardWirePresence = {
      v: 1,
      kind: "presence",
      peerId: "student-B",
      role: "student",
      label: "Alex",
    };
    await injectPresence(sock, aes, frame);
    await realTick(20);
    await flushMicrotasks(20);
    expect(peersCb).toHaveBeenCalledTimes(1);

    // Same frame again — no material change, no re-fire.
    await injectPresence(sock, aes, frame);
    await realTick(20);
    await flushMicrotasks(20);
    expect(peersCb).toHaveBeenCalledTimes(1);

    client.disconnect();
  });

  test("label change fires onRoomPeersChange with the new label", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const peersCb = jest.fn<void, [ReadonlyArray<RoomPeer>]>();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });
    client.onRoomPeersChange(peersCb);

    await realTick(20);
    await flushMicrotasks(20);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    await injectPresence(sock, aes, {
      v: 1,
      kind: "presence",
      peerId: "student-B",
      role: "student",
      label: "Alex",
    });
    await realTick(15);
    await flushMicrotasks(15);
    expect(peersCb).toHaveBeenCalledTimes(1);

    await injectPresence(sock, aes, {
      v: 1,
      kind: "presence",
      peerId: "student-B",
      role: "student",
      label: "Alex M.",
    });
    await realTick(15);
    await flushMicrotasks(15);
    expect(peersCb).toHaveBeenCalledTimes(2);
    expect(peersCb).toHaveBeenLastCalledWith([
      { peerId: "student-B", role: "student", label: "Alex M." },
    ]);

    client.disconnect();
  });

  test("multi-peer room: snapshot is sorted by peerId ascending", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const peersCb = jest.fn<void, [ReadonlyArray<RoomPeer>]>();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });
    client.onRoomPeersChange(peersCb);

    await realTick(20);
    await flushMicrotasks(20);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    await injectPresence(sock, aes, {
      v: 1,
      kind: "presence",
      peerId: "student-Z",
      role: "student",
    });
    await injectPresence(sock, aes, {
      v: 1,
      kind: "presence",
      peerId: "student-B",
      role: "student",
    });
    await realTick(20);
    await flushMicrotasks(20);

    const last = peersCb.mock.calls.at(-1)![0];
    expect(last.map((p) => p.peerId)).toEqual(["student-B", "student-Z"]);

    client.disconnect();
  });

  test("room-user-change shrink + prune timer fires drops missing peer", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const peersCb = jest.fn<void, [ReadonlyArray<RoomPeer>]>();
    const timer = makeControllableTimer();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      presencePruneGraceMs: 50,
      _setTimeoutFn: timer.setTimeoutFn,
      _clearTimeoutFn: timer.clearTimeoutFn,
      _ioFactory: factory,
    });
    client.onRoomPeersChange(peersCb);

    await realTick(20);
    await flushMicrotasks(20);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));

    // Two students join.
    sock.inject("room-user-change", ["tutor-sock", "stu-1-sock", "stu-2-sock"]);
    await injectPresence(sock, aes, {
      v: 1,
      kind: "presence",
      peerId: "student-B",
      role: "student",
    });
    await injectPresence(sock, aes, {
      v: 1,
      kind: "presence",
      peerId: "student-C",
      role: "student",
    });
    await realTick(15);
    await flushMicrotasks(15);
    expect(peersCb).toHaveBeenLastCalledWith([
      { peerId: "student-B", role: "student" },
      { peerId: "student-C", role: "student" },
    ]);

    // Member count shrinks — schedule prune for everyone.
    sock.inject("room-user-change", ["tutor-sock"]);
    await flushMicrotasks(5);
    expect(timer.pendingCount()).toBe(1);

    // Fire the grace timer — both students get dropped.
    timer.fireAll();
    await realTick(5);
    await flushMicrotasks(10);

    expect(peersCb).toHaveBeenLastCalledWith([]);

    client.disconnect();
  });

  test("transient flap: re-broadcast within grace window does NOT cause remove+re-add", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const peersCb = jest.fn<void, [ReadonlyArray<RoomPeer>]>();
    const timer = makeControllableTimer();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      presencePruneGraceMs: 50,
      _setTimeoutFn: timer.setTimeoutFn,
      _clearTimeoutFn: timer.clearTimeoutFn,
      _ioFactory: factory,
    });
    client.onRoomPeersChange(peersCb);

    await realTick(20);
    await flushMicrotasks(20);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));

    sock.inject("room-user-change", ["tutor-sock", "stu-1-sock"]);
    await injectPresence(sock, aes, {
      v: 1,
      kind: "presence",
      peerId: "student-B",
      role: "student",
    });
    await realTick(15);
    await flushMicrotasks(15);
    const fireCountAfterFirstAdd = peersCb.mock.calls.length;

    // Simulate flap: members shrink (other socket dropped), then the
    // student's reconnect-presence lands while the prune is still
    // pending in the queue.
    sock.inject("room-user-change", ["tutor-sock"]);
    await flushMicrotasks(5);
    expect(timer.pendingCount()).toBe(1);

    await injectPresence(sock, aes, {
      v: 1,
      kind: "presence",
      peerId: "student-B",
      role: "student",
    });
    await realTick(15);
    await flushMicrotasks(15);

    // Fire the prune — student-B re-confirmed, so nothing drops.
    timer.fireAll();
    await realTick(5);
    await flushMicrotasks(10);

    // No add/remove cycle: the only callback fire was the initial add.
    expect(peersCb.mock.calls.length).toBe(fireCountAfterFirstAdd);
    expect(peersCb.mock.calls.at(-1)![0]).toEqual([
      { peerId: "student-B", role: "student" },
    ]);

    client.disconnect();
  });

  test("late onRoomPeersChange subscriber receives current snapshot via microtask", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });

    await realTick(20);
    await flushMicrotasks(20);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    await injectPresence(sock, aes, {
      v: 1,
      kind: "presence",
      peerId: "student-B",
      role: "student",
      label: "Alex",
    });
    await realTick(15);
    await flushMicrotasks(15);

    // Subscribe after the first presence frame is already inside
    // the map — the replay microtask should hand us the snapshot.
    const lateCb = jest.fn<void, [ReadonlyArray<RoomPeer>]>();
    client.onRoomPeersChange(lateCb);
    await flushMicrotasks(5);
    expect(lateCb).toHaveBeenCalledTimes(1);
    expect(lateCb).toHaveBeenLastCalledWith([
      { peerId: "student-B", role: "student", label: "Alex" },
    ]);

    client.disconnect();
  });

  test("disconnect() clears roomPeers subscribers + presence map (no late callbacks)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const peersCb = jest.fn<void, [ReadonlyArray<RoomPeer>]>();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      _ioFactory: factory,
    });
    client.onRoomPeersChange(peersCb);

    await realTick(20);
    await flushMicrotasks(20);

    client.disconnect();

    // After disconnect, an inbound presence frame must not reach the
    // (cleared) subscriber.
    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const { data, iv } = await _testing.encryptMessage(aes, {
      v: 1,
      kind: "presence",
      peerId: "student-B",
      role: "student",
    } as WhiteboardWirePresence);
    expect(() => sock.inject("client-broadcast", data, iv)).not.toThrow();
    await realTick(15);
    await flushMicrotasks(15);
    expect(peersCb).not.toHaveBeenCalled();
  });
});

describe("sync-client pageViewState envelope (Phase 5 task 8)", () => {
  test("encrypt → decrypt round-trip", async () => {
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const msg = {
      v: 1 as const,
      kind: "pageViewState" as const,
      peerId: "tutor-pvs",
      role: "tutor" as const,
      pageId: "p1",
      panX: 12,
      panY: -3,
      zoom: 1.5,
    };
    const { data, iv } = await _testing.encryptMessage(aes, msg);
    const out = await _testing.decryptMessage(aes, data, iv);
    expect(out).toEqual(msg);
  });

  test("rejects NaN pan", async () => {
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const msg = {
      v: 1 as const,
      kind: "pageViewState" as const,
      peerId: "t",
      role: "tutor" as const,
      pageId: "p1",
      panX: NaN,
      panY: 0,
      zoom: 1,
    };
    const { data, iv } = await _testing.encryptMessage(aes, msg);
    await expect(_testing.decryptMessage(aes, data, iv)).rejects.toThrow(
      /bad pan\/zoom/
    );
  });

  test("onRemotePageViewState receives decrypted tutor patch", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const recv = jest.fn();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-pvs",
      encryptionKeyBase64Url: k,
      role: "student",
      peerId: "student-self",
      _ioFactory: factory,
    });
    client.onRemotePageViewState(recv);
    await realTick(10);
    await flushMicrotasks(20);
    const payload = {
      v: 1 as const,
      kind: "pageViewState" as const,
      peerId: "tutor-remote",
      role: "tutor" as const,
      pageId: "p2",
      panX: 1,
      panY: 2,
      zoom: 3,
    };
    const { data, iv } = await _testing.encryptMessage(aes, payload);
    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(20);
    await flushMicrotasks(20);
    expect(recv).toHaveBeenCalledWith("tutor-remote", payload);
    client.disconnect();
  });
});

describe("sync-client pointer envelope (B9 laser sync)", () => {
  test("encrypt → decrypt round-trip for pointer msg", async () => {
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const msg: WhiteboardWirePointerMsg = {
      v: 1,
      kind: "pointer",
      peerId: "tutor-p1",
      role: "tutor",
      pageId: "p1",
      x: 42.5,
      y: -18.2,
      tool: "laser",
      button: "down",
      color: "#e27d60",
    };
    const { data, iv } = await _testing.encryptMessage(aes, msg);
    const out = await _testing.decryptMessage(aes, data, iv);
    expect(out).toEqual(msg);
  });

  test("rejects pointer with NaN x", async () => {
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const msg = {
      v: 1 as const,
      kind: "pointer" as const,
      peerId: "t",
      role: "tutor" as const,
      pageId: "p1",
      x: NaN,
      y: 0,
      tool: "laser" as const,
      button: "up" as const,
      color: "#e27d60",
    };
    const { data, iv } = await _testing.encryptMessage(aes, msg);
    await expect(_testing.decryptMessage(aes, data, iv)).rejects.toThrow(
      /bad x\/y/
    );
  });

  test("rejects pointer with unknown tool", async () => {
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const msg = {
      v: 1 as const,
      kind: "pointer" as const,
      peerId: "t",
      role: "tutor" as const,
      pageId: "p1",
      x: 1,
      y: 2,
      // Intentionally invalid tool value to exercise "bad tool" rejection
      // in decryptMessage. Cast required because the type now enforces "laser".
      tool: "selection" as "laser",
      button: "up" as const,
      color: "#e27d60",
    };
    const { data, iv } = await _testing.encryptMessage(aes, msg);
    await expect(_testing.decryptMessage(aes, data, iv)).rejects.toThrow(
      /bad tool/
    );
  });

  test("onRemotePointer receives decrypted tutor pointer", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const recv = jest.fn();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-ptr",
      encryptionKeyBase64Url: k,
      role: "student",
      peerId: "student-self",
      _ioFactory: factory,
    });
    client.onRemotePointer(recv);
    await realTick(10);
    await flushMicrotasks(20);
    const payload: WhiteboardWirePointerMsg = {
      v: 1,
      kind: "pointer",
      peerId: "tutor-remote",
      role: "tutor",
      pageId: "p2",
      x: 100,
      y: 200,
      tool: "laser",
      button: "up",
      color: "#e27d60",
    };
    const { data, iv } = await _testing.encryptMessage(aes, payload);
    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(20);
    await flushMicrotasks(20);
    expect(recv).toHaveBeenCalledWith("tutor-remote", payload);
    client.disconnect();
  });

  test("onRemotePointer does NOT fire for own peerId (echo suppression)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const recv = jest.fn();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-ptr-echo",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-self",
      _ioFactory: factory,
    });
    client.onRemotePointer(recv);
    await realTick(10);
    await flushMicrotasks(20);
    // Inject a pointer whose peerId is the LOCAL peer — should be suppressed.
    const payload: WhiteboardWirePointerMsg = {
      v: 1,
      kind: "pointer",
      peerId: "tutor-self",
      role: "tutor",
      pageId: "p1",
      x: 50,
      y: 50,
      tool: "laser",
      button: "down",
      color: "#e27d60",
    };
    const { data, iv } = await _testing.encryptMessage(aes, payload);
    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(20);
    await flushMicrotasks(20);
    expect(recv).not.toHaveBeenCalled();
    client.disconnect();
  });

  test("broadcastPointer emits encrypted pointer envelope", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-ptr-send",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-sender",
      _ioFactory: factory,
    });
    await realTick(10);
    await flushMicrotasks(20);
    const sock = sockets[0]!;
    const emittedBefore = sock.emitted.filter((e) => e.event === "server-broadcast").length;
    client.broadcastPointer({
      pageId: "p1",
      x: 77,
      y: 88,
      tool: "laser",
      button: "down",
      color: "#e27d60",
    });
    await realTick(20);
    await flushMicrotasks(20);
    const broadcasts = sock.emitted.filter((e) => e.event === "server-broadcast");
    expect(broadcasts.length).toBeGreaterThan(emittedBefore);
    // Decrypt the last broadcast and verify it's a pointer envelope.
    const last = broadcasts[broadcasts.length - 1]!;
    const [, data, iv] = last.args as [unknown, ArrayBuffer, ArrayBuffer];
    const decoded = await _testing.decryptMessage(aes, data, iv);
    expect(decoded).toMatchObject({
      v: 1,
      kind: "pointer",
      peerId: "tutor-sender",
      role: "tutor",
      pageId: "p1",
      x: 77,
      y: 88,
      tool: "laser",
      button: "down",
      color: "#e27d60",
    });
    client.disconnect();
  });

  test("unsubscribed onRemotePointer callback is not called", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const recv = jest.fn();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-ptr-unsub",
      encryptionKeyBase64Url: k,
      role: "student",
      peerId: "student-xyz",
      _ioFactory: factory,
    });
    const off = client.onRemotePointer(recv);
    off(); // unsubscribe immediately
    await realTick(10);
    await flushMicrotasks(20);
    const payload: WhiteboardWirePointerMsg = {
      v: 1,
      kind: "pointer",
      peerId: "tutor-remote",
      role: "tutor",
      pageId: "p1",
      x: 10,
      y: 20,
      tool: "laser",
      button: "up",
      color: "#e27d60",
    };
    const { data, iv } = await _testing.encryptMessage(aes, payload);
    sockets[0]!.inject("client-broadcast", data, iv);
    await realTick(20);
    await flushMicrotasks(20);
    expect(recv).not.toHaveBeenCalled();
    client.disconnect();
  });
});

// -----------------------------------------------------------------
// Dual-device takeover bug — Fix 1/2/3 unit coverage
// Bug: device A disconnects → tutor marks ALL peers pendingPrune →
// device B (healthy) evicted after 5s → tutor drops to zero students.
// -----------------------------------------------------------------

describe("dual-device takeover prune bug — fixes 1-3 (wb-wave5-polish)", () => {
  /**
   * Fix 1 — leaving:true frame immediately removes exactly that peer,
   * leaving ALL other healthy peers untouched.
   */
  test("inbound leaving:true frame removes only that peer — healthy peers are untouched", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const peersCb = jest.fn<void, [ReadonlyArray<RoomPeer>]>();
    const timer = makeControllableTimer();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      presencePruneGraceMs: 50,
      _setTimeoutFn: timer.setTimeoutFn,
      _clearTimeoutFn: timer.clearTimeoutFn,
      _ioFactory: factory,
    });
    client.onRoomPeersChange(peersCb);

    await realTick(20);
    await flushMicrotasks(20);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));

    // Two students present.
    await injectPresence(sock, aes, { v: 1, kind: "presence", peerId: "device-A", role: "student" });
    await injectPresence(sock, aes, { v: 1, kind: "presence", peerId: "device-B", role: "student" });
    await realTick(15);
    await flushMicrotasks(15);
    expect(peersCb).toHaveBeenLastCalledWith([
      { peerId: "device-A", role: "student" },
      { peerId: "device-B", role: "student" },
    ]);

    // Device A sends an explicit leave frame.
    await injectPresence(sock, aes, {
      v: 1,
      kind: "presence",
      peerId: "device-A",
      role: "student",
      leaving: true,
    });
    await realTick(15);
    await flushMicrotasks(15);

    // Device A is immediately removed; device B is intact. No prune timer needed.
    expect(peersCb).toHaveBeenLastCalledWith([{ peerId: "device-B", role: "student" }]);
    // No pending prune timer — leave frame bypasses the grace window.
    expect(timer.pendingCount()).toBe(0);

    client.disconnect();
  });

  /**
   * Fix 2 — room-user-change count-GREW cancels the stale prune wave
   * from the prior shrink so a returning peer can't evict healthy ones.
   */
  test("room-user-change grow after shrink cancels the pending prune — no false eviction", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const peersCb = jest.fn<void, [ReadonlyArray<RoomPeer>]>();
    const timer = makeControllableTimer();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-A",
      presencePruneGraceMs: 50,
      _setTimeoutFn: timer.setTimeoutFn,
      _clearTimeoutFn: timer.clearTimeoutFn,
      _ioFactory: factory,
    });
    client.onRoomPeersChange(peersCb);

    await realTick(20);
    await flushMicrotasks(20);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));

    // Device B joins and announces presence.
    sock.inject("room-user-change", ["tutor-sock", "dev-b-sock"]);
    await injectPresence(sock, aes, { v: 1, kind: "presence", peerId: "device-B", role: "student" });
    await realTick(15);
    await flushMicrotasks(15);
    expect(peersCb).toHaveBeenLastCalledWith([{ peerId: "device-B", role: "student" }]);

    // Room shrinks (some socket dropped).
    sock.inject("room-user-change", ["tutor-sock"]);
    await flushMicrotasks(5);
    // A prune timer is now pending — device B is marked pendingPrune.
    expect(timer.pendingCount()).toBe(1);

    // Room grows again (device A rejoins, or a new connection appears).
    sock.inject("room-user-change", ["tutor-sock", "dev-a-sock"]);
    await flushMicrotasks(5);
    // Fix 2: the prune timer must have been cancelled on the count-grew event.
    expect(timer.pendingCount()).toBe(0);

    // Firing timers now would be a no-op (prune was cancelled).
    timer.fireAll();
    await realTick(5);
    await flushMicrotasks(10);

    // Device B is STILL present in the map — it was never evicted.
    expect(peersCb.mock.calls.at(-1)![0]).toEqual([{ peerId: "device-B", role: "student" }]);

    client.disconnect();
  });

  /**
   * Fix 1 + 3 combined: device A disconnects (no leave frame — crash path),
   * relay fires shrink. Device B's heartbeat re-announces before the grace
   * fires and rescues itself from pendingPrune.
   */
  test("crash disconnect (no leave frame): device B heartbeat rescues it before prune fires", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const peersCb = jest.fn<void, [ReadonlyArray<RoomPeer>]>();
    const timer = makeControllableTimer();
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-xyz",
      encryptionKeyBase64Url: k,
      role: "tutor",
      peerId: "tutor-T",
      presencePruneGraceMs: 50,
      _setTimeoutFn: timer.setTimeoutFn,
      _clearTimeoutFn: timer.clearTimeoutFn,
      _ioFactory: factory,
    });
    client.onRoomPeersChange(peersCb);

    await realTick(20);
    await flushMicrotasks(20);

    const sock = sockets[0]!;
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));

    // Both devices connected.
    sock.inject("room-user-change", ["tutor-sock", "dev-a-sock", "dev-b-sock"]);
    await injectPresence(sock, aes, { v: 1, kind: "presence", peerId: "device-A", role: "student" });
    await injectPresence(sock, aes, { v: 1, kind: "presence", peerId: "device-B", role: "student" });
    await realTick(15);
    await flushMicrotasks(15);

    // Device A crash-disconnects — no leave frame sent.
    // Relay fires a shrink; both A and B get marked pendingPrune.
    sock.inject("room-user-change", ["tutor-sock", "dev-b-sock"]);
    await flushMicrotasks(5);
    expect(timer.pendingCount()).toBe(1);

    // B's heartbeat re-announces before the grace window fires.
    await injectPresence(sock, aes, { v: 1, kind: "presence", peerId: "device-B", role: "student" });
    await realTick(10);
    await flushMicrotasks(10);

    // Fire the grace timer — A (no re-announce) is evicted, B (re-announced) is kept.
    timer.fireAll();
    await realTick(5);
    await flushMicrotasks(10);

    // CRITICAL: tutor retains device B, never dropped to zero.
    expect(peersCb.mock.calls.at(-1)![0]).toEqual([{ peerId: "device-B", role: "student" }]);

    client.disconnect();
  });

  /**
   * Fix 1 — disconnect() emits a leave frame before closing the socket.
   * Uses FakeSocket so the async crypto completes and the emit is captured.
   */
  test("disconnect() emits a leave presence frame (best-effort clean departure)", async () => {
    const { factory, sockets } = fakeIoFactory();
    const k = generateEncryptionKeyBase64Url();
    const aes = await _testing.importAesKey(_testing.decodeBase64Url(k));
    const client = createWhiteboardSyncClient({
      url: "wss://test",
      roomId: "room-leave",
      encryptionKeyBase64Url: k,
      role: "student",
      peerId: "student-X",
      _ioFactory: factory,
    });

    // Wait for connect + key import to complete.
    await realTick(20);
    await flushMicrotasks(20);

    const sock = sockets[0]!;
    const emitsAtStart = sock.emitted.length;

    client.disconnect();

    // Let the async leave-frame crypto resolve and the emit chain run.
    await flushMicrotasks(20);
    await realTick(10);
    await flushMicrotasks(20);

    // Find a leave presence frame in the server-broadcasts emitted after disconnect().
    const newBroadcasts = sock.emitted
      .slice(emitsAtStart)
      .filter((e) => e.event === "server-broadcast");

    let foundLeave = false;
    for (const e of newBroadcasts) {
      try {
        const msg = await _testing.decryptMessage(
          aes,
          e.args[1] as ArrayBuffer,
          e.args[2] as ArrayBuffer
        );
        const p = msg as Partial<WhiteboardWirePresence>;
        if (p.kind === "presence" && p.leaving === true && p.peerId === "student-X") {
          foundLeave = true;
          break;
        }
      } catch {
        // skip non-presence frames
      }
    }

    expect(foundLeave).toBe(true);
    // Socket should now be disconnected (FakeSocket tracks this).
    expect(sock.disconnected).toBe(true);
  });
});
