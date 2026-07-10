"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveProfileDisplayName } from "./actions";

export default function ProfileForm({ defaultDisplayName }: { defaultDisplayName: string }) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        setPending(true);
        const formData = new FormData(e.currentTarget as HTMLFormElement);
        try {
          await saveProfileDisplayName(formData);
          setSaved(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to save");
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="max-w-sm space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="displayName">Your name</Label>
          <Input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="name"
            placeholder="e.g. Alex Chen"
            defaultValue={defaultDisplayName}
          />
          <p className="text-sm text-muted-foreground">
            This appears as the sender name when you email session updates. Use your real name or how
            you introduce yourself to families.
          </p>
        </div>

        {saved ? (
          <p className="text-sm text-success" role="status">
            Saved.
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
