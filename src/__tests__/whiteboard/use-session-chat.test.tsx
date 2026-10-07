/**
 * @jest-environment jsdom
 *
 * Session chat: a colliding id with a different payload is kept, and the
 * list cannot grow without a bound. The sender's line comes from
 * broadcastChat's return value (the relay does not echo it).
 */
import { act, renderHook } from "@testing-library/react";
import { useSessionChat } from "@/hooks/useSessionChat";
import type { WhiteboardWireChatMsg } from "@/lib/whiteboard/sync-client";

type Listener = (from: string, msg: WhiteboardWireChatMsg) => void;

function createSync(opts?: { echo?: boolean; sentAt?: () => number }) {
  let listener: Listener | null = null;
  let n = 0;
  const sync = {
    broadcastChat(args: { text: string }): WhiteboardWireChatMsg | null {
      const text = args.text.trim();
      if (!text) return null;
      const msg: WhiteboardWireChatMsg = {
        v: 1,
        kind: "chat",
        peerId: "peer-tutor",
        role: "tutor",
        text,
        sentAt: opts?.sentAt ? opts.sentAt() : ++n,
      };
      if (opts?.echo !== false) listener?.(msg.peerId, msg);
      return msg;
    },
    onRemoteChat(cb: Listener) {
      listener = cb;
      return () => {
        listener = null;
      };
    },
  };
  return sync;
}

describe("useSessionChat", () => {
  it("shows the sender's own line from the wire message broadcastChat returns", () => {
    const sync = createSync({ echo: false });
    const { result } = renderHook(() => useSessionChat(sync as never, true));
    act(() => {
      expect(result.current.send("can you hear me")).toBe(true);
    });
    expect(result.current.messages.map((m) => m.text)).toEqual(["can you hear me"]);
  });

  it("keeps two different messages that share a timestamp", () => {
    const sync = createSync({ echo: false, sentAt: () => 1000 });
    const { result } = renderHook(() => useSessionChat(sync as never, true));
    act(() => {
      result.current.send("first");
      result.current.send("second");
    });
    expect(result.current.messages.map((m) => m.text)).toEqual(["first", "second"]);
    expect(new Set(result.current.messages.map((m) => m.id)).size).toBe(2);
  });

  it("drops the oldest lines once the transcript is no longer bounded by the send count", () => {
    const sync = createSync({ echo: false });
    const { result } = renderHook(() => useSessionChat(sync as never, true));
    act(() => {
      for (let i = 0; i < 250; i++) result.current.send(`line-${i}`);
    });
    expect(result.current.messages.length).toBeLessThan(250);
    expect(result.current.messages.some((m) => m.text === "line-0")).toBe(false);
    expect(result.current.messages.some((m) => m.text === "line-249")).toBe(true);
  });
});
