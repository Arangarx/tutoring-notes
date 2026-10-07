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

/**
 * Append a chat line. A different payload that collides on id (same peer,
 * same millisecond) is kept under a new id. The list never grows past the
 * history cap; older lines drop first.
 *
 * The relay does not echo a message to its sender, and the sync client drops
 * a self-delivery if one ever arrived, so a same-payload dedupe here never
 * runs in production.
 */
export function appendSessionChatMessage(
  prev: readonly SessionChatMessage[],
  incoming: SessionChatMessage
): SessionChatMessage[] {
  const existing = prev.find((m) => m.id === incoming.id);
  const next = existing
    ? [...prev, { ...incoming, id: `${incoming.id}#${prev.length}` }]
    : [...prev, incoming];
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
      // The sender's own line is this return value. The relay does not deliver
      // the message back to the sender, so the hook must append it locally.
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
