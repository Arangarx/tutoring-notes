"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AUDIO_RECORDING_CONSENT_COPY,
  CONSENT_DECLINE_WARNING,
  LIVE_SESSION_CONSENT_COPY,
} from "@/lib/consent-toggle-copy";

interface ConsentToggle {
  key: "allowLiveSession" | "allowAudioRecording";
  label: string;
  description: string;
}

const TOGGLES: ConsentToggle[] = [
  { key: "allowLiveSession", ...LIVE_SESSION_CONSENT_COPY },
  { key: "allowAudioRecording", ...AUDIO_RECORDING_CONSENT_COPY },
];

export function ConsentSetupForm({
  rawToken,
  studentName,
  enforcementEnabled,
  hasPendingSessionInvite,
}: {
  rawToken: string;
  studentName: string;
  enforcementEnabled: boolean;
  hasPendingSessionInvite: boolean;
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
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);

  function toggle(key: ConsentToggle["key"]) {
    setValues((v) => ({ ...v, [key]: !v[key] }));
  }

  async function postSetupAction(action: "consent" | "consent_decline") {
    const res = await fetch(`/api/claim/${rawToken}/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        action === "consent" ? { action, ...values } : { action }
      ),
    });
    if (res.status === 409) {
      const data = (await res.json()) as { error?: string };
      if (data.error === "consent_already_saved") {
        setSaved(true);
        return;
      }
    }
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "save_failed");
      return;
    }
    setSaved(true);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await postSetupAction("consent");
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeclineConfirm() {
    setBusy(true);
    setError(null);
    try {
      await postSetupAction("consent_decline");
      setDeclineDialogOpen(false);
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div
        data-testid="consent-saved-indicator"
        className="rounded-md border border-border bg-muted/40 p-4 space-y-2"
      >
        <p className="text-sm font-medium text-foreground">
          ✓ Preferences saved
        </p>
        <p className="text-xs text-muted-foreground">
          You can update these preferences any time from your account dashboard.
        </p>
      </div>
    );
  }

  const declineWarningBody = hasPendingSessionInvite
    ? CONSENT_DECLINE_WARNING.pendingInvite
    : CONSENT_DECLINE_WARNING.plain;

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
              data-testid={`consent-toggle-${t.key}`}
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
            : error === "consent_already_saved"
              ? "Preferences were already saved. Refresh the page to continue."
              : "Could not save preferences. Please try again."}
        </p>
      ) : null}

      <Button
        type="button"
        data-testid="consent-save-btn"
        onClick={handleSave}
        disabled={busy}
        aria-busy={busy}
        className="w-full min-h-11"
      >
        {busy ? "Saving…" : "Save preferences"}
      </Button>

      <Button
        type="button"
        data-testid="consent-decline-btn"
        variant="outline"
        onClick={() => setDeclineDialogOpen(true)}
        disabled={busy}
        className="w-full min-h-11"
      >
        No consent now, I&apos;ll review later
      </Button>

      <AlertDialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{CONSENT_DECLINE_WARNING.title}</AlertDialogTitle>
            <AlertDialogDescription>{declineWarningBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="consent-decline-confirm-btn"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void handleDeclineConfirm();
              }}
            >
              {busy ? "Saving…" : "Continue without enabling"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!enforcementEnabled ? (
        <p className="text-xs text-center text-muted-foreground">
          You can also save these preferences later from your account dashboard.
        </p>
      ) : null}
    </div>
  );
}
