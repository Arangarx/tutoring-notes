"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthFieldError } from "@/components/auth/AuthFieldError";

export function DisplayNameSetupForm({
  rawToken,
  prompt,
  initialDisplayName,
  saveDisplayName,
}: {
  rawToken?: string;
  prompt: string;
  initialDisplayName: string;
  saveDisplayName?: (
    displayName: string
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const trimmed = displayName.trim();
    try {
      if (saveDisplayName) {
        const result = await saveDisplayName(trimmed);
        if (!result.ok) {
          setError(result.error ?? "server");
          return;
        }
      } else if (rawToken) {
        const res = await fetch(`/api/claim/${rawToken}/setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "display_name", displayName: trimmed }),
        });
        const data = (await res.json()) as { error?: string; ok?: boolean };

        if (!res.ok) {
          setError(data.error ?? "server");
          return;
        }
      } else {
        setError("server");
        return;
      }

      setSaved(true);
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4" data-testid="display-name-setup-form">
      <p className="text-sm text-muted-foreground">{prompt}</p>
      <div className="space-y-2">
        <Label htmlFor="claim-display-name">Display name</Label>
        <Input
          id="claim-display-name"
          name="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={80}
          required
          className="min-h-11"
          autoComplete="name"
        />
      </div>
      {saved ? (
        <p className="text-sm text-muted-foreground" data-testid="display-name-saved">
          ✓ Saved how you&apos;ll appear to this tutor.
        </p>
      ) : null}
      {error ? (
        <AuthFieldError
          id="claim-display-name-error"
          message="Could not save display name. Try again."
        />
      ) : null}
      <Button type="submit" disabled={busy || !displayName.trim()} aria-busy={busy}>
        {busy ? "Saving…" : "Save display name"}
      </Button>
    </form>
  );
}
