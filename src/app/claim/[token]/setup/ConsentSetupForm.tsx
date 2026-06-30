"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface ConsentToggle {
  key: "allowLiveSession" | "allowAudioRecording" | "allowWhiteboardRecording";
  label: string;
  description: string;
}

const TOGGLES: ConsentToggle[] = [
  {
    key: "allowLiveSession",
    label: "Allow live sessions",
    description: "Your child can join real-time whiteboard tutoring sessions.",
  },
  {
    key: "allowAudioRecording",
    label: "Allow audio recording",
    description: "Session audio is recorded for note generation and tutor review.",
  },
  {
    key: "allowWhiteboardRecording",
    label: "Allow whiteboard recording",
    description: "Whiteboard strokes are saved so sessions can be replayed.",
  },
];

export function ConsentSetupForm({
  rawToken,
  studentName,
  enforcementEnabled,
}: {
  rawToken: string;
  studentName: string;
  enforcementEnabled: boolean;
}) {
  // D-4: always start all-OFF on every render (no carryover)
  const [values, setValues] = useState({
    allowLiveSession: false,
    allowAudioRecording: false,
    allowWhiteboardRecording: false,
    // Dormant schema field — not surfaced in UI (WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME).
    allowNoteSending: false,
  });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: ConsentToggle["key"]) {
    setValues((v) => ({ ...v, [key]: !v[key] }));
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/claim/${rawToken}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "consent", ...values }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "save_failed");
        return;
      }
      setSaved(true);
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-4 space-y-2">
        <p className="text-sm font-medium text-foreground">
          ✓ Preferences saved
        </p>
        <p className="text-xs text-muted-foreground">
          You can update these preferences any time from your account dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {`Set privacy preferences for ${studentName}'s tutoring sessions. All options are off by default — enable only what you're comfortable with.`}
      </p>

      <div className="space-y-3">
        {TOGGLES.map((t) => (
          <div
            key={t.key}
            className="flex items-start justify-between gap-4 rounded-md border border-border bg-card p-3"
          >
            <div className="space-y-0.5 flex-1">
              <Label
                htmlFor={`consent-${t.key}`}
                className="text-sm font-medium cursor-pointer"
              >
                {t.label}
              </Label>
              <p className="text-xs text-muted-foreground">{t.description}</p>
            </div>
            <Switch
              id={`consent-${t.key}`}
              checked={values[t.key]}
              onCheckedChange={() => toggle(t.key)}
              aria-label={t.label}
            />
          </div>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error === "network"
            ? "Network error — please try again."
            : "Could not save preferences. Please try again."}
        </p>
      ) : null}

      <Button
        type="button"
        onClick={handleSave}
        disabled={busy}
        aria-busy={busy}
        className="w-full min-h-11"
      >
        {busy ? "Saving…" : "Save preferences"}
      </Button>

      {!enforcementEnabled ? (
        <p className="text-xs text-center text-muted-foreground">
          You can also save these preferences later from your account dashboard.
        </p>
      ) : null}
    </div>
  );
}
