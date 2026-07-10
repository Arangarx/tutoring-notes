"use client";

import { AuthMortensenNotice } from "@/components/auth/AuthMortensenNotice";
import { Button } from "@/components/ui/button";
import { disconnectGmail } from "./actions";

export default function OAuthEmailSection({
  gmailConnected,
  googleOAuthAvailable,
  canUseGmailConnect,
  connectError,
  connectSuccess,
}: {
  gmailConnected: { email: string } | null;
  googleOAuthAvailable: boolean;
  /** When false (e.g. allowlist), hide Connect Gmail — use SMTP instead. */
  canUseGmailConnect: boolean;
  connectError: string | undefined;
  connectSuccess: string | undefined;
}) {
  return (
    <div className="space-y-3">
      {gmailConnected ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-success">Connected as {gmailConnected.email}</span>
          <form action={disconnectGmail}>
            <Button type="submit" variant="outline" size="sm">
              Disconnect Gmail
            </Button>
          </form>
        </div>
      ) : googleOAuthAvailable && canUseGmailConnect ? (
        <div className="space-y-3">
          {/* AuthMortensenNotice MUST appear here — legally binding placement per v1-redesign-STATUS.md */}
          <AuthMortensenNotice
            variant="connect"
            className="text-sm text-muted-foreground leading-relaxed"
          />
          {/* Full-page navigation so the server redirect to Google is followed;
              Link would client-navigate and can flash an error on 302 */}
          <Button variant="accent" asChild>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/auth/gmail/connect">Connect Gmail</a>
          </Button>
        </div>
      ) : googleOAuthAvailable && !canUseGmailConnect ? (
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Connect Gmail</strong> is limited to invited accounts
          on this deployment. Use <strong className="text-foreground">SMTP</strong> below to send
          mail (e.g. Resend or your provider).
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          &ldquo;Connect Gmail&rdquo; is available once the app deployer adds Google OAuth credentials (
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">GOOGLE_CLIENT_ID</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">GOOGLE_CLIENT_SECRET</code>
          ) to the server environment. Use SMTP below in the meantime.
        </p>
      )}

      {connectSuccess === "gmail" && (
        <p className="text-sm text-success" role="status">
          Gmail connected. You can send from that address now.
        </p>
      )}
      {connectError === "google_oauth_not_configured" && (
        <p className="text-sm text-warning" role="alert">
          Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the
          server environment, or use SMTP below.
        </p>
      )}
      {connectError === "gmail_denied" && (
        <p className="text-sm text-destructive" role="alert">
          You declined access. You can try again or use SMTP.
        </p>
      )}
      {connectError === "no_refresh_token" && (
        <p className="text-sm text-destructive" role="alert">
          Google didn&apos;t return a refresh token. Try disconnecting and connecting again, or use
          SMTP.
        </p>
      )}
      {connectError === "db_not_ready" && (
        <p className="text-sm text-warning" role="alert">
          Run{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">npx prisma generate</code>{" "}
          and{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">npx prisma db push</code>
          , then try again.
        </p>
      )}
      {connectError === "gmail_connect_not_allowlisted" && (
        <p className="text-sm text-warning" role="alert">
          This account isn&apos;t allowed to use Connect Gmail here. Use SMTP below, or ask the person
          who runs this app to add your email to{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            GMAIL_CONNECT_ALLOWLIST
          </code>
          .
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        Outlook / Microsoft 365: coming soon. Use Gmail or SMTP for now.
      </p>
    </div>
  );
}
