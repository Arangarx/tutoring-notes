/**
 * @jest-environment jsdom
 *
 * Session chat: a sender's line appears once even when the relay echoes it,
 * a colliding id with a different payload is kept, and the list cannot grow
 * without a bound.
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
  it("shows an echoed own message once", () => {
    const sync = createSync({ echo: true });
    const { result } = renderHook(() => useSessionChat(sync as never, true));
    act(() => {
      expect(result.current.send("can you hear me")).toBe(true);
    });
    const hits = result.current.messages.filter((m) => m.text === "can you hear me");
    expect(hits).toHaveLength(1);
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
    const sync = createSync({ echo: true });
    const { result } = renderHook(() => useSessionChat(sync as never, true));
    act(() => {
      for (let i = 0; i < 250; i++) result.current.send(`line-${i}`);
    });
    expect(result.current.messages.length).toBeLessThan(250);
    expect(result.current.messages.some((m) => m.text === "line-0")).toBe(false);
    expect(result.current.messages.some((m) => m.text === "line-249")).toBe(true);
  });
});
