"use client";

import { useState } from "react";

import { StudentAvatar } from "@/components/admin/StudentAvatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StudentDevicePreviewProps = {
  displayName: string;
  className?: string;
};

/**
 * Visual-only camera/mic preview placeholder for the learner waiting room.
 * Toggle state is local UI only — no getUserMedia / live-AV wiring (Gate A2 follow-up).
 */
export function StudentDevicePreview({
  displayName,
  className,
}: StudentDevicePreviewProps) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  return (
    <div className={cn("space-y-3", className)}>
      <div
        className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[10px] border border-border bg-muted/50"
        aria-label="Camera preview placeholder"
      >
        {camOn ? (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <StudentAvatar name={displayName} size="lg" />
            <span className="text-sm">Camera preview</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <span className="text-3xl" aria-hidden="true">
              📷
            </span>
            <span className="text-sm">Camera off</span>
          </div>
        )}
        <div className="absolute bottom-3 left-3 flex gap-2">
          <Button
            type="button"
            variant={micOn ? "default" : "outline"}
            size="sm"
            className="h-9 min-w-9 px-3"
            onClick={() => setMicOn((v) => !v)}
            aria-pressed={micOn}
            aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
          >
            {micOn ? "Mic on" : "Mic off"}
          </Button>
          <Button
            type="button"
            variant={camOn ? "default" : "outline"}
            size="sm"
            className="h-9 min-w-9 px-3"
            onClick={() => setCamOn((v) => !v)}
            aria-pressed={camOn}
            aria-label={camOn ? "Turn camera off" : "Turn camera on"}
          >
            {camOn ? "Cam on" : "Cam off"}
          </Button>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Check your camera and microphone before your tutor starts the session.
      </p>
    </div>
  );
}
