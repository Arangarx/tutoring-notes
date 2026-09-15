"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TutorEmailAllowlistEntry } from "@/lib/tutor-approval-scope";
import { addTutorEmailAllowlist, removeTutorEmailAllowlist } from "./actions";

type TutorAllowlistSectionProps = {
  initialEntries: TutorEmailAllowlistEntry[];
};

export function TutorAllowlistSection({
  initialEntries,
}: TutorAllowlistSectionProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const nextEmail = String(formData.get("email") ?? "").trim();
    if (!nextEmail) return;

    startTransition(async () => {
      const result = await addTutorEmailAllowlist(nextEmail);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      setEntries((current) => [...current, result.entry]);
    });
  }

  function handleRemove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeTutorEmailAllowlist(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEntries((current) => current.filter((entry) => entry.id !== id));
    });
  }

  return (
    <div className="space-y-4">
      <form
        ref={formRef}
        onSubmit={handleAdd}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="tutor-allowlist-email">Email address</Label>
          <Input
            id="tutor-allowlist-email"
            name="email"
            type="email"
            autoComplete="off"
            placeholder="pilot@example.com"
            disabled={isPending}
            required
            data-testid="tutor-allowlist-email"
          />
        </div>
        <Button
          type="submit"
          disabled={isPending}
          data-testid="tutor-allowlist-add"
        >
          {isPending ? "Adding…" : "Add"}
        </Button>
      </form>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pre-approved emails yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border" role="list">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
              data-testid={`tutor-allowlist-row-${entry.id}`}
            >
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold text-foreground">{entry.email}</p>
                <time
                  dateTime={entry.createdAt.toISOString()}
                  className="text-xs font-mono text-muted-foreground"
                >
                  Added {entry.createdAt.toLocaleDateString()}
                </time>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => handleRemove(entry.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
