"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createChildLearnerAction } from "./actions";

/**
 * Inline "Add learner" form for the account dashboard.
 *
 * Collects display name only — credential/login setup is optional and done
 * from the learner detail page. After a successful create, redirects to the
 * new learner's detail page.
 */
export function AddLearnerForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formErrorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleOpen() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("invalid_name");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const result = await createChildLearnerAction(name);
      if (!result.ok) {
        if (result.error === "unauthorized") {
          setError("unauthorized");
        } else if (result.error === "invalid_name" || result.error === "name_too_long") {
          setError("invalid_name");
        } else {
          setError("server");
        }
        return;
      }
      // Navigate to the new learner's detail page.
      router.push(`/account/children/${result.learnerProfileId}`);
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={handleOpen}>
        Add learner
      </Button>
    );
  }

  return (
    <form className="flex flex-col gap-3 pt-2" onSubmit={handleSubmit}>
      <p className="text-sm text-muted-foreground">
        {"Enter a display name for the learner. You can set up a login PIN from their profile page."}
      </p>
      <div className="space-y-1">
        <Label htmlFor="learner-name">Learner name</Label>
        <Input
          id="learner-name"
          ref={inputRef}
          name="displayName"
          type="text"
          autoComplete="off"
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Alex"
          className="min-h-11"
          aria-invalid={error === "invalid_name" ? true : undefined}
          aria-describedby={error ? formErrorId : undefined}
        />
      </div>

      {error === "invalid_name" ? (
        <AuthFieldError id={formErrorId} message="Please enter a valid name (max 100 characters)." />
      ) : null}
      {error === "unauthorized" ? (
        <AuthFieldError id={formErrorId} message="Session expired. Refresh the page and try again." />
      ) : null}
      {error === "server" || error === "network" ? (
        <AuthFieldError id={formErrorId} message="Something went wrong. Please try again." />
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy} aria-busy={busy}>
          {busy ? "Creating…" : "Create learner"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setError(null);
            setName("");
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
