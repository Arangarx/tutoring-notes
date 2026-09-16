"use client";

import Link from "next/link";
import { AuthMortensenNotice } from "@/components/auth/AuthMortensenNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/SectionCard";
import { disconnectGoogleCalendar } from "@/app/admin/settings/integrations/actions";
import { ShareLinkRow } from "@/app/admin/students/[id]/ShareLinkRow";
import type { CalendarConnectionView } from "@/lib/schedule/types";
import { CalendarIcon, CheckIcon, PlusIcon } from "lucide-react";
import { RegenerateCalendarFeedForm } from "@/components/admin/schedule/CalendarFeedControls";

type CalendarIntegrationsPanelProps = {
  connections: CalendarConnectionView[];
  googleOAuthAvailable: boolean;
  connectError?: string;
  connectSuccess?: string;
  googleReconnectRequired?: boolean;
  icsFeedHttpsUrl?: string | null;
  icsFeedWebcalUrl?: string | null;
  regenerateCalendarFeedAction?: () => void;
  /** When true, show compact summary suitable for schedule page sidebar. */
  compact?: boolean;
  showSettingsLink?: boolean;
  /** Override Manage link target (e.g. include `?from=schedule` for back-nav). */
  settingsHref?: string;
};

function ProviderIcon({ provider }: { provider: CalendarConnectionView["provider"] }) {
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
  googleOAuthAvailable,
  connectError,
  connectSuccess,
  googleReconnectRequired = false,
  icsFeedHttpsUrl,
  icsFeedWebcalUrl,
  regenerateCalendarFeedAction,
  compact = false,
  showSettingsLink = true,
  settingsHref = "/admin/settings/integrations",
}: CalendarIntegrationsPanelProps) {
  const connectedCount = connections.filter((c) => c.connected).length;
  const googleConnected = connections.some((c) => c.provider === "google" && c.connected);

  return (
    <SectionCard realm="admin"
      title={compact ? "Connected calendars" : "Calendar integrations"}
      description={
        compact
          ? "Google Calendar sync and ICS subscription for Apple and other calendar apps."
          : "Connect Google Calendar to sync scheduled sessions, or subscribe to the ICS feed for Apple Calendar and other apps."
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
        {!compact && googleConnected && googleReconnectRequired ? (
          <p
            className="rounded-[10px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            Google Calendar needs to be reconnected — sync stopped after access was revoked. Disconnect
            and connect again below.
          </p>
        ) : null}

        {!compact && googleConnected && !googleReconnectRequired ? (
          <p className="rounded-[10px] border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="status">
            New and updated sessions sync to your Google Calendar. Disconnecting stops future sync only
            — events already in Google are not removed.
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
                      className={
                        googleReconnectRequired && connection.provider === "google"
                          ? "gap-1 border-destructive/30 bg-destructive/10 font-normal text-destructive"
                          : "gap-1 border-success/30 bg-success/10 font-normal text-success"
                      }
                    >
                      <CheckIcon className="size-3" aria-hidden />
                      {googleReconnectRequired && connection.provider === "google"
                        ? "Reconnect needed"
                        : "Connected"}
                    </Badge>
                    {!compact && connection.provider === "google" ? (
                      <form action={disconnectGoogleCalendar}>
                        <Button type="submit" variant="ghost" size="sm" className="min-h-9">
                          Disconnect
                        </Button>
                      </form>
                    ) : null}
                  </>
                ) : connection.provider === "other" ? (
                  <Button type="button" variant="outline" size="sm" className="min-h-9" disabled>
                    Coming soon
                  </Button>
                ) : connection.provider === "google" ? (
                  googleOAuthAvailable ? (
                    <div className="flex flex-col items-end gap-2">
                      {!compact ? (
                        <AuthMortensenNotice
                          variant="connect"
                          className="max-w-xs text-xs text-muted-foreground leading-relaxed"
                        />
                      ) : null}
                      <Button variant="default" size="sm" className="min-h-9" asChild>
                        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                        <a href="/api/auth/calendar/connect">
                          <CalendarIcon aria-hidden />
                          Connect
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" size="sm" className="min-h-9" disabled>
                      OAuth not configured
                    </Button>
                  )
                ) : (
                  <Button type="button" variant="outline" size="sm" className="min-h-9" disabled>
                    Use ICS feed below
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {!compact && icsFeedHttpsUrl && icsFeedWebcalUrl ? (
          <div className="space-y-3 rounded-[10px] border border-border bg-muted/30 px-3 py-3" data-testid="calendar-ics-feed-section">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">ICS subscription feed</p>
              <p className="text-xs text-muted-foreground">
                Subscribe in Apple Calendar or another app. Treat these URLs like passwords — anyone with
                the link can see your schedule. Calendar apps poll the feed; updates are not instant on
                every client.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">HTTPS (Google Calendar, Outlook, …)</p>
              <ShareLinkRow url={icsFeedHttpsUrl} ariaLabel="ICS feed HTTPS URL" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">webcal (Apple Calendar)</p>
              <ShareLinkRow
                url={icsFeedWebcalUrl}
                showOpen={false}
                ariaLabel="ICS feed webcal URL"
              />
            </div>
            {regenerateCalendarFeedAction ? (
              <div className="flex flex-wrap gap-2">
                <RegenerateCalendarFeedForm action={regenerateCalendarFeedAction} />
              </div>
            ) : null}
          </div>
        ) : null}

        {!compact ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {connectedCount === 0
                ? "No Google connection yet — scheduling in Mynk works without an external calendar."
                : `${connectedCount} calendar${connectedCount === 1 ? "" : "s"} connected.`}
            </p>
            {connectSuccess === "google_calendar" ? (
              <p className="text-sm text-success" role="status">
                Google Calendar connected. New sessions will sync to your primary Google Calendar.
              </p>
            ) : null}
            {connectError === "google_oauth_not_configured" ? (
              <p className="text-sm text-warning" role="alert">
                Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the
                server environment.
              </p>
            ) : null}
            {connectError === "calendar_denied" ? (
              <p className="text-sm text-destructive" role="alert">
                You declined access. You can try connecting again when ready.
              </p>
            ) : null}
            {connectError === "no_refresh_token" ? (
              <p className="text-sm text-destructive" role="alert">
                Google didn&apos;t return a refresh token. Try disconnecting and connecting again.
              </p>
            ) : null}
            {connectError === "db_not_ready" ? (
              <p className="text-sm text-warning" role="alert">
                Run{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">npx prisma generate</code>{" "}
                and{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">npx prisma db push</code>
                , then try again.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
