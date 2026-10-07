"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SessionChatMessage } from "@/hooks/useSessionChat";
import "./WbSessionChat.css";

export type WbSessionChatProps = {
  chatAvailable: boolean;
  messages: SessionChatMessage[];
  onSend: (text: string) => boolean;
  viewerRole: "tutor" | "student";
  /** Same strings the video tiles use. Empty or the prose placeholder falls back. */
  tutorName?: string;
  studentName?: string;
};

/** Tile display name, or Tutor/Student when that name is missing. */
export function sessionChatSenderLabel(
  role: "tutor" | "student",
  names: { tutorName?: string; studentName?: string }
): string {
  const raw = (role === "tutor" ? names.tutorName : names.studentName)?.trim() ?? "";
  if (!raw || raw === "your tutor") {
    return role === "tutor" ? "Tutor" : "Student";
  }
  return raw;
}

export function WbSessionChat({
  chatAvailable,
  messages,
  onSend,
  viewerRole,
  tutorName,
  studentName,
}: WbSessionChatProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const seenThroughRef = useRef(0);

  useEffect(() => {
    if (open) seenThroughRef.current = messages.length;
  }, [open, messages.length]);

  const unread = open
    ? 0
    : messages
        .slice(seenThroughRef.current)
        .filter((m) => m.role !== viewerRole).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (onSend(text)) {
      setDraft("");
    }
  };

  return (
    <div className="mynk-wb-session-chat" data-testid="wb-session-chat">
      {open ? (
        <div className="mynk-wb-session-chat__panel" data-testid="wb-session-chat-panel">
          <div className="mynk-wb-session-chat__messages">
            {!chatAvailable ? (
              <p
                className="mynk-wb-session-chat__unavailable"
                data-testid="wb-session-chat-unavailable"
              >
                Chat unavailable — board and session still work.
              </p>
            ) : messages.length === 0 ? (
              <p className="mynk-wb-session-chat__unavailable">
                No messages yet. Use when audio is in trouble.
              </p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="mynk-wb-session-chat__msg">
                  <span className="mynk-wb-session-chat__msg-role">
                    {sessionChatSenderLabel(m.role, { tutorName, studentName })}
                  </span>
                  {m.text}
                </div>
              ))
            )}
          </div>
          <form className="mynk-wb-session-chat__form" onSubmit={handleSubmit}>
            <Input
              className="mynk-wb-session-chat__input"
              data-testid="wb-session-chat-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={chatAvailable ? "Type a message…" : "Chat unavailable"}
              disabled={!chatAvailable}
              maxLength={2000}
            />
            <Button type="submit" size="sm" disabled={!chatAvailable || !draft.trim()}>
              Send
            </Button>
          </form>
        </div>
      ) : null}
      <Button
        type="button"
        variant={open ? "secondary" : "outline"}
        size="sm"
        data-testid="wb-session-chat-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide chat" : "Chat"}
        {unread > 0 ? (
          <span className="mynk-wb-session-chat__unread" data-testid="wb-session-chat-unread">
            {unread}
          </span>
        ) : null}
      </Button>
    </div>
  );
}
