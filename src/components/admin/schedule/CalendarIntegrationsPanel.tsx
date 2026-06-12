"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import type { MockCalendarConnection } from "@/lib/schedule/mock-data";
import { CalendarIcon, CheckIcon, PlusIcon } from "lucide-react";

type CalendarIntegrationsPanelProps = {
  connections: MockCalendarConnection[];
  /** When true, show compact summary suitable for schedule page sidebar. */
  compact?: boolean;
  showSettingsLink?: boolean;
  /** Override Manage link target (e.g. include `?from=schedule` for back-nav). */
  settingsHref?: string;
};

function ProviderIcon({ provider }: { provider: MockCalendarConnection["provider"] }) {
  if (provider === "google") {
    return (
      <span
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border bg-card text-sm font-semibold text-foreground"
        aria-hidden
      >
        G
      </span>
    );
  }
  if (provider === "apple") {
    return (
      <span
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border bg-card text-lg text-foreground"
        aria-hidden
      >
        
      </span>
    );
  }
  return (
    <span
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-dashed border-border bg-muted/40 text-muted-foreground"
      aria-hidden
    >
      <PlusIcon className="size-4" />
    </span>
  );
}

export function CalendarIntegrationsPanel({
  connections,
  compact = false,
  showSettingsLink = true,
  settingsHref = "/admin/settings/integrations",
}: CalendarIntegrationsPanelProps) {
  const connectedCount = connections.filter((c) => c.connected).length;

  return (
    <AdminSectionCard
      title={compact ? "Connected calendars" : "Calendar integrations"}
      description={
        compact
          ? "Events push to connected calendars when you schedule in Mynk."
          : "Connect Apple Calendar or Google Calendar so sessions you create here also appear on your external calendar. External calendar is optional — scheduling works fully in Mynk."
      }
      actions={
        showSettingsLink && compact ? (
          <Button asChild variant="ghost" size="sm" className="min-h-9">
            <Link href={settingsHref}>Manage</Link>
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {!compact ? (
          <p className="rounded-[10px] border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Design note:</span> two-way sync
            (external edits flowing back into Mynk) is an open question — this surface shows
            outbound sync status only.
          </p>
        ) : null}

        <ul className="space-y-3" role="list">
          {connections.map((connection) => (
            <li
              key={connection.provider}
              className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-card px-3 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <ProviderIcon provider={connection.provider} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{connection.label}</p>
                  {connection.connected && connection.accountLabel ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {connection.accountLabel}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not connected</p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {connection.connected ? (
                  <>
                    <Badge
                      variant="outline"
                      className="gap-1 border-success/30 bg-success/10 font-normal text-success"
                    >
                      <CheckIcon className="size-3" aria-hidden />
                      Connected
                    </Badge>
                    {!compact ? (
                      <Button type="button" variant="ghost" size="sm" className="min-h-9">
                        Disconnect
                      </Button>
                    ) : null}
                  </>
                ) : connection.provider === "other" ? (
                  <Button type="button" variant="outline" size="sm" className="min-h-9" disabled>
                    Coming soon
                  </Button>
                ) : (
                  <Button type="button" variant="default" size="sm" className="min-h-9">
                    <CalendarIcon aria-hidden />
                    Connect
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {!compact ? (
          <p className="text-xs text-muted-foreground">
            {connectedCount === 0
              ? "No calendars connected — sessions stay in Mynk only until you connect one."
              : `${connectedCount} calendar${connectedCount === 1 ? "" : "s"} connected. New sessions push outbound when connected.`}
          </p>
        ) : null}
      </div>
    </AdminSectionCard>
  );
}
