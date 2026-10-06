"use client";

import { useCallback, useEffect, useState } from "react";
import type { WhiteboardSyncClient, WhiteboardWireChatMsg } from "@/lib/whiteboard/sync-client";

export type SessionChatMessage = {
  id: string;
  peerId: string;
  role: "tutor" | "student";
  text: string;
  sentAt: number;
};

/** Keep the on-screen transcript from growing without a bound. */
const CHAT_HISTORY_CAP = 200;

export function sessionChatMessageFromWire(msg: WhiteboardWireChatMsg): SessionChatMessage {
  return {
    id: `${msg.peerId}:${msg.sentAt}`,
    peerId: msg.peerId,
    role: msg.role,
    text: msg.text,
    sentAt: msg.sentAt,
  };
}

function sameChatPayload(a: SessionChatMessage, b: SessionChatMessage): boolean {
  return (
    a.peerId === b.peerId &&
    a.role === b.role &&
    a.text === b.text &&
    a.sentAt === b.sentAt
  );
}

/**
 * Append a chat line. An echo of a line already shown (same id and payload)
 * is ignored. A different payload that collides on id is kept under a new id.
 * The list never grows past the history cap; older lines drop first.
 */
export function appendSessionChatMessage(
  prev: readonly SessionChatMessage[],
  incoming: SessionChatMessage
): SessionChatMessage[] {
  const existing = prev.find((m) => m.id === incoming.id);
  let next: SessionChatMessage[];
  if (existing) {
    if (sameChatPayload(existing, incoming)) return prev as SessionChatMessage[];
    next = [
      ...prev,
      { ...incoming, id: `${incoming.id}#${prev.length}` },
    ];
  } else {
    next = [...prev, incoming];
  }
  if (next.length <= CHAT_HISTORY_CAP) return next;
  return next.slice(next.length - CHAT_HISTORY_CAP);
}

export function useSessionChat(
  sync: WhiteboardSyncClient | null,
  syncConnected: boolean
): {
  messages: SessionChatMessage[];
  send: (text: string) => boolean;
  chatAvailable: boolean;
} {
  const [messages, setMessages] = useState<SessionChatMessage[]>([]);

  useEffect(() => {
    if (!sync || typeof sync.onRemoteChat !== "function") return;
    const off = sync.onRemoteChat((_from, msg: WhiteboardWireChatMsg) => {
      setMessages((prev) => appendSessionChatMessage(prev, sessionChatMessageFromWire(msg)));
    });
    return () => {
      off();
      setMessages([]);
    };
  }, [sync]);

  const send = useCallback(
    (text: string) => {
      if (!syncConnected || !sync || typeof sync.broadcastChat !== "function") {
        return false;
      }
      const sent = sync.broadcastChat({ text });
      if (!sent) return false;
      setMessages((prev) => appendSessionChatMessage(prev, sessionChatMessageFromWire(sent)));
      return true;
    },
    [sync, syncConnected]
  );

  return {
    messages,
    send,
    chatAvailable: syncConnected && Boolean(sync),
  };
}
