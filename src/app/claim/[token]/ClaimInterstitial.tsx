"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AuthFieldError } from "@/components/auth/AuthFieldError";

interface OwnedProfile {
  id: string;
  displayName: string;
  isSelfLearner: boolean;
}

/**
 * IAC-3 + Identity-confirmation interstitial (HARD requirement).
 *
 * Shown when the user follows a claim link while already signed in as an AccountHolder.
 * Lists the AccountHolder's owned LearnerProfiles not already connected to this tutor,
 * plus "Add a new child" and "Connect yourself as a learner" options.
 *
 * "Not you? Switch account" escape prevents CSRF-ish mis-bind.
 */
export function ClaimInterstitial({
  rawToken,
  studentName,
  tutorName,
  signedInEmail,
  ownedProfiles,
}: {
  rawToken: string;
  studentName: string;
  tutorName: string | null;
  signedInEmail: string;
  ownedProfiles: OwnedProfile[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<
    | { type: "attach_existing"; profileId: string }
    | { type: "create_child" }
    | { type: "connect_self" }
    | null
  >(null);

  async function handleConfirm() {
    if (!selectedAction) return;
    setBusy(true);
    setError(null);

    let body: Record<string, string>;
    if (selectedAction.type === "attach_existing") {
      body = { action: "attach_existing", learnerProfileId: selectedAction.profileId };
    } else if (selectedAction.type === "connect_self") {
      body = { action: "connect_self" };
    } else {
      body = { action: "create_child" };
    }

    try {
      const res = await fetch(`/api/claim/${rawToken}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        error?: string;
        setupPath?: string;
      };

      if (!res.ok) {
        if (data.error === "student_already_claimed" || data.error === "claim_already_completed") {
          setError("already_claimed");
        } else if (data.error === "already_linked_to_tutor") {
          setError("already_linked");
        } else if (data.error === "email_not_verified") {
          setError("email_not_verified");
        } else {
          setError("server");
        }
        return;
      }

      window.location.href = data.setupPath ?? `/claim/${rawToken}/setup`;
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  async function handleSwitchAccount() {
    await fetch("/api/auth/account-holder/logout", { method: "POST" });
    window.location.href = `/account/login?returnTo=${encodeURIComponent(`/claim/${rawToken}`)}`;
  }

  const tutorDisplay = tutorName ? tutorName : "your tutor";

  return (
    <div className="space-y-4" data-testid="claim-interstitial">
      {/* Identity confirmation */}
      <div className="rounded-md border border-border bg-muted/40 p-4">
        <p className="text-sm font-medium text-foreground">
          {"You're signed in as "}
          <strong>{signedInEmail}</strong>.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {"Choose who to connect as a student under "}
          <strong>{tutorDisplay}</strong>
          {"'s account:"}
        </p>
      </div>

      {/* Profile pick-list */}
      <fieldset className="space-y-2">
        <legend className="sr-only">Select learner to connect</legend>

        {ownedProfiles.map((profile) => (
          <label
            key={profile.id}
            className={`flex cursor-pointer items-start gap-4 rounded-md border p-3 transition-colors ${
              selectedAction?.type === "attach_existing" && selectedAction.profileId === profile.id
                ? "border-brand bg-brand/5"
                : "border-border hover:bg-muted/40"
            }`}
          >
            <input
              type="radio"
              name="claim-target"
              value={profile.id}
              checked={
                selectedAction?.type === "attach_existing" && selectedAction.profileId === profile.id
              }
              onChange={() =>
                setSelectedAction({ type: "attach_existing", profileId: profile.id })
              }
              className="mt-0.5 shrink-0 accent-brand"
            />
            <span className="flex-1 text-sm font-medium text-foreground">
              {profile.displayName}
              {profile.isSelfLearner && (
                <span className="ml-2 text-xs text-muted-foreground font-normal">(you)</span>
              )}
            </span>
          </label>
        ))}

        {/* Add a new child */}
        <label
          className={`flex cursor-pointer items-start gap-4 rounded-md border p-3 transition-colors ${
            selectedAction?.type === "create_child"
              ? "border-brand bg-brand/5"
              : "border-border hover:bg-muted/40"
          }`}
        >
          <input
            type="radio"
            name="claim-target"
            value="create_child"
            checked={selectedAction?.type === "create_child"}
            onChange={() => setSelectedAction({ type: "create_child" })}
            className="mt-0.5 shrink-0 accent-brand"
          />
          <span className="flex-1 pt-px text-sm text-foreground">Add a new child</span>
        </label>

        {/* Connect yourself */}
        <label
          className={`flex cursor-pointer items-start gap-4 rounded-md border p-3 transition-colors ${
            selectedAction?.type === "connect_self"
              ? "border-brand bg-brand/5"
              : "border-border hover:bg-muted/40"
          }`}
        >
          <input
            type="radio"
            name="claim-target"
            value="connect_self"
            checked={selectedAction?.type === "connect_self"}
            onChange={() => setSelectedAction({ type: "connect_self" })}
            className="mt-0.5 shrink-0 accent-brand"
          />
          <span className="flex-1 pt-px text-sm text-foreground">
            {"I'll be taking the lessons myself"}
          </span>
        </label>
      </fieldset>

      {error === "already_claimed" ? (
        <AuthFieldError
          id="claim-interstitial-error"
          message="This student has already been claimed. Sign in to your account to view them."
        />
      ) : null}
      {error === "already_linked" ? (
        <AuthFieldError
          id="claim-interstitial-error"
          message="This learner is already connected to this tutor."
        />
      ) : null}
      {error === "email_not_verified" ? (
        <AuthFieldError
          id="claim-interstitial-error"
          message="Please verify your email before claiming. Check your inbox for a confirmation link."
        />
      ) : null}
      {error === "server" || error === "network" ? (
        <AuthFieldError
          id="claim-interstitial-error"
          message="Something went wrong. Please try again."
        />
      ) : null}

      <div className="flex flex-col gap-2">
        <Button
          onClick={handleConfirm}
          disabled={busy || !selectedAction}
          aria-busy={busy}
          className="min-h-11 w-full text-base"
        >
          {busy ? "Connecting..." : "Connect learner"}
        </Button>
        <Button
          variant="ghost"
          onClick={handleSwitchAccount}
          disabled={busy}
          className="w-full text-sm"
        >
          {"Not you? Switch account"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {"Clicking \"Connect learner\" links the selected person's tutoring data to "}
        <strong>{signedInEmail}</strong>.
      </p>
    </div>
  );
}
