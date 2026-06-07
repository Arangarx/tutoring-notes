"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveEmailConfig } from "./actions";

export default function EmailConfigForm({
  defaultHost,
  defaultPort,
  defaultSecure,
  defaultUser,
  defaultFromEmail,
}: {
  defaultHost: string;
  defaultPort: number | undefined;
  defaultSecure: boolean;
  defaultUser: string;
  defaultFromEmail: string;
}) {
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
          await saveEmailConfig(formData);
          setSaved(true);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to save");
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="max-w-sm space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="smtp-host">SMTP host</Label>
          <Input
            id="smtp-host"
            name="host"
            type="text"
            placeholder="smtp.resend.com"
            defaultValue={defaultHost}
            required
          />
        </div>

        <div className="flex gap-3 items-end">
          <div className="space-y-1.5 w-28">
            <Label htmlFor="smtp-port">Port</Label>
            <Input
              id="smtp-port"
              name="port"
              type="number"
              placeholder="587"
              defaultValue={defaultPort}
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              name="secure"
              value="true"
              defaultChecked={defaultSecure}
              className="size-4 rounded border-input accent-primary"
            />
            TLS (secure)
          </label>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="smtp-user">Username</Label>
          <Input
            id="smtp-user"
            name="user"
            type="text"
            placeholder="resend"
            defaultValue={defaultUser}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="smtp-password">Password (API key or app password)</Label>
          <Input
            id="smtp-password"
            name="password"
            type="password"
            placeholder={defaultUser ? "Leave blank to keep current" : ""}
            autoComplete="new-password"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="smtp-from">From address (optional)</Label>
          <Input
            id="smtp-from"
            name="fromEmail"
            type="email"
            placeholder="noreply@yourdomain.com"
            defaultValue={defaultFromEmail}
          />
        </div>

        {saved ? (
          <p className="text-sm text-success" role="status">
            Settings saved.
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save email settings"}
        </Button>
      </div>
    </form>
  );
}
