"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { StudentAvatar } from "@/components/admin/StudentAvatar";
import { StudentPageShell } from "@/components/student/StudentPageShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

type StudentPreferencesClientProps = {
  initialDisplayName: string;
};

/**
 * Visual-first learner preferences — local UI state only until persistence ships.
 */
export function StudentPreferencesClient({
  initialDisplayName,
}: StudentPreferencesClientProps) {
  const fid = useId();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [cameraDefaultOn, setCameraDefaultOn] = useState(false);
  const [micDefaultOn, setMicDefaultOn] = useState(true);
  const [showSelfView, setShowSelfView] = useState(false);
  const [largerText, setLargerText] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [saved, setSaved] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <StudentPageShell
      actions={
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
          <Link href="/join">← Waiting room</Link>
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 space-y-1">
          <h1 className="heading text-2xl font-normal text-foreground">Your preferences</h1>
          <p className="text-base text-muted-foreground">
            How you appear and how devices behave when you join a session.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <Card className="rounded-[10px] border-border">
            <CardHeader className="pb-3">
              <CardTitle className="heading text-lg font-normal">Profile</CardTitle>
              <CardDescription>
                This is how your tutor sees you in the waiting room.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <StudentAvatar name={displayName || initialDisplayName} size="lg" />
                <div className="min-w-0 flex-1 space-y-1">
                  <Label htmlFor={`${fid}-display-name`}>Display name</Label>
                  <Input
                    id={`${fid}-display-name`}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-11"
                    autoComplete="nickname"
                  />
                  <p className="text-xs text-muted-foreground">
                    Saving is visual-only for now — ask a parent to update your account name.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[10px] border-border">
            <CardHeader className="pb-3">
              <CardTitle className="heading text-lg font-normal">Camera & microphone</CardTitle>
              <CardDescription>Defaults when you enter the waiting room.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PreferenceRow
                id={`${fid}-cam-default`}
                label="Camera on by default"
                description="Start with your camera ready when you join."
                checked={cameraDefaultOn}
                onCheckedChange={setCameraDefaultOn}
              />
              <Separator />
              <PreferenceRow
                id={`${fid}-mic-default`}
                label="Microphone on by default"
                description="Start unmuted so your tutor can hear you."
                checked={micDefaultOn}
                onCheckedChange={setMicDefaultOn}
              />
              <Separator />
              <PreferenceRow
                id={`${fid}-self-view`}
                label="Show my camera to myself"
                description="Hide your own video tile to reduce distraction."
                checked={showSelfView}
                onCheckedChange={setShowSelfView}
              />
            </CardContent>
          </Card>

          <Card className="rounded-[10px] border-border">
            <CardHeader className="pb-3">
              <CardTitle className="heading text-lg font-normal">Accessibility</CardTitle>
              <CardDescription>Make the app easier to read and use.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PreferenceRow
                id={`${fid}-large-text`}
                label="Larger text"
                description="Increase text size on student pages."
                checked={largerText}
                onCheckedChange={setLargerText}
              />
              <Separator />
              <PreferenceRow
                id={`${fid}-reduce-motion`}
                label="Reduce motion"
                description="Minimize animations and pulsing indicators."
                checked={reduceMotion}
                onCheckedChange={setReduceMotion}
              />
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
            <Button type="submit" className="h-11 sm:flex-1">
              Save preferences
            </Button>
            {saved ? (
              <p className="text-sm text-primary" role="status" aria-live="polite">
                Saved (preview only)
              </p>
            ) : null}
          </div>
        </form>
      </div>
    </StudentPageShell>
  );
}

function PreferenceRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
