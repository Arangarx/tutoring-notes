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
      setMessages((prev) => [
        ...prev,
        {
          id: `${msg.peerId}:${msg.sentAt}`,
          peerId: msg.peerId,
          role: msg.role,
          text: msg.text,
          sentAt: msg.sentAt,
        },
      ]);
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
      sync.broadcastChat({ text });
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
