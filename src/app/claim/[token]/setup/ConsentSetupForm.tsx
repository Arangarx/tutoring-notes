"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConsentSwitches, type ConsentSwitchKey } from "@/components/consent/ConsentSwitches";
import { SelfLearnerAgreement } from "@/components/consent/SelfLearnerAgreement";
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
import { CONSENT_DECLINE_WARNING, CONSENT_SWITCHES } from "@/lib/consent-toggle-copy";

export function ConsentSetupForm({
  rawToken,
  studentName,
  enforcementEnabled,
  hasPendingSessionInvite,
  showAgreement = false,
}: {
  rawToken: string;
  studentName: string;
  enforcementEnabled: boolean;
  hasPendingSessionInvite: boolean;
  showAgreement?: boolean;
}) {
  const router = useRouter();

  const [values, setValues] = useState({
    allowLiveSession: false,
    allowAudioRecording: false,
    allowWhiteboardRecording: false,
    allowNoteSending: false,
  });
  const [agreed, setAgreed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);

  function toggle(key: ConsentSwitchKey, checked: boolean) {
    setValues((v) => ({ ...v, [key]: checked }));
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
        router.refresh();
        return;
      }
    }
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "save_failed");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function handleSave() {
    if (showAgreement && !agreed) {
      setError("agreement_required");
      return;
    }
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
        <Link
          href="/account/dashboard"
          data-testid="consent-saved-dashboard-link"
          className="inline-block text-sm text-brand underline-offset-2 hover:underline"
        >
          {"Finish \u2014 go to dashboard \u2192"}
        </Link>
      </div>
    );
  }

  const declineWarningBody = showAgreement
    ? hasPendingSessionInvite
      ? CONSENT_DECLINE_WARNING.selfLearnerPending
      : CONSENT_DECLINE_WARNING.selfLearner
    : hasPendingSessionInvite
      ? CONSENT_DECLINE_WARNING.pendingInvite
      : CONSENT_DECLINE_WARNING.plain;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {`Set privacy preferences for ${studentName}'s tutoring sessions. All options are off by default — enable only what you're comfortable with.`}
      </p>

      <div className="space-y-3">
        {showAgreement ? (
          <SelfLearnerAgreement checked={agreed} onCheckedChange={setAgreed} />
        ) : null}
        <ConsentSwitches
          idPrefix=""
          testIdPrefix="consent-toggle"
          switches={CONSENT_SWITCHES}
          values={values}
          onToggle={toggle}
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error === "network"
            ? "Network error — please try again."
            : error === "consent_already_saved"
              ? "Preferences were already saved. Refresh the page to continue."
              : error === "agreement_required"
                ? "Check the agreement before saving."
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
