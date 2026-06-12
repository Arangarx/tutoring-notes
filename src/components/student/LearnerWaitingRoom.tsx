"use client";

import Link from "next/link";

import { StudentAvatar } from "@/components/admin/StudentAvatar";
import { StudentDevicePreview } from "@/components/student/StudentDevicePreview";
import { StudentPageShell } from "@/components/student/StudentPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export type LearnerWaitingRoomState = "waiting" | "admitted";

type LearnerWaitingRoomProps = {
  displayName: string;
  /** Visual-only state toggle — no live presence/admit wiring yet. */
  state?: LearnerWaitingRoomState;
};

function PreferencesLink() {
  return (
    <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
      <Link href="/join/preferences">Preferences</Link>
    </Button>
  );
}

/**
 * Gate A2 learner waiting room — visual-first surface at /join.
 * Functional admit/presence polling is a live-AV thread follow-up.
 */
export function LearnerWaitingRoom({
  displayName,
  state = "waiting",
}: LearnerWaitingRoomProps) {
  const isWaiting = state === "waiting";

  return (
    <StudentPageShell actions={<PreferencesLink />}>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
          <StudentAvatar name={displayName} size="lg" className="sm:mr-1" />
          <div className="min-w-0 space-y-1">
            <h1 className="heading text-2xl font-normal text-foreground">
              Hi, <span className="font-semibold">{displayName}</span>
            </h1>
            <p className="text-base text-muted-foreground">
              {isWaiting
                ? "Your tutor will let you in when the session is ready."
                : "You're in — loading your session…"}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <StudentDevicePreview displayName={displayName} />
          </div>

          <Card className="w-full shrink-0 rounded-[10px] border-border lg:max-w-[320px]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="heading text-lg font-normal">Session status</CardTitle>
                <Badge
                  variant="secondary"
                  className={
                    isWaiting
                      ? "bg-accent-soft text-accent-text border-transparent"
                      : "bg-primary/10 text-primary border-transparent"
                  }
                >
                  {isWaiting ? "Waiting" : "Admitted"}
                </Badge>
              </div>
              <CardDescription>
                {isWaiting
                  ? "Stay on this page — you'll join automatically when your tutor starts."
                  : "Your tutor admitted you. Session entry wiring comes in a later phase."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="flex items-start gap-3 rounded-[10px] border border-border bg-muted/30 px-3 py-3"
                role="status"
                aria-live="polite"
              >
                <span
                  className={
                    isWaiting
                      ? "mt-1 size-2 shrink-0 animate-pulse rounded-full bg-accent"
                      : "mt-1 size-2 shrink-0 rounded-full bg-primary"
                  }
                  aria-hidden="true"
                />
                <p className="text-sm text-foreground">
                  {isWaiting
                    ? "Waiting for your tutor to start…"
                    : "Session starting — hang tight!"}
                </p>
              </div>

              <Separator />

              <ul className="space-y-2 text-sm text-muted-foreground" aria-label="Readiness checklist">
                <li className="flex items-center gap-2">
                  <span className="text-primary" aria-hidden="true">
                    ✓
                  </span>
                  Signed in as {displayName}
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-muted-foreground/60" aria-hidden="true">
                    ○
                  </span>
                  Tutor has not started yet
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-muted-foreground/60" aria-hidden="true">
                    ○
                  </span>
                  Session board (opens after admit)
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </StudentPageShell>
  );
}
