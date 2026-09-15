"use client";

/**
 * Shared three-card 2FA method chooser (email / authenticator / SMS).
 * Used by both initial enrollment (TwoFactorSetupForm) and the manage-page
 * "change method" flow (TwoFactorManageView) — one canonical chooser,
 * parameterized by callbacks + labels rather than forked per surface.
 */

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function TwoFactorMethodChooserCards({
  onChooseEmail,
  onChooseTotp,
  onChooseSms,
  smsEnrollmentAvailable,
  loading,
  loadingMethod,
  emailLabel = "Set up with email",
  totpLabel = "Set up with authenticator",
  emailCardHighlighted = true,
}: {
  onChooseEmail: () => void;
  onChooseTotp: () => void;
  onChooseSms: () => void;
  smsEnrollmentAvailable: boolean;
  loading: boolean;
  loadingMethod?: "email" | "totp" | "sms" | null;
  emailLabel?: string;
  totpLabel?: string;
  emailCardHighlighted?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-1">
      <Card
        className={emailCardHighlighted ? "border-primary ring-1 ring-primary/30" : undefined}
        data-testid="tfa-choose-email"
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Email code</CardTitle>
          <CardDescription>
            {emailCardHighlighted
              ? "Default — we send a 6-digit code to your account email at sign-in."
              : "We send a 6-digit code to your account email at sign-in."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onChooseEmail} disabled={loading} className="w-full sm:w-auto">
            {loading && loadingMethod === "email" ? "Sending code…" : emailLabel}
          </Button>
        </CardContent>
      </Card>

      <Card data-testid="tfa-choose-totp">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Authenticator app</CardTitle>
          <CardDescription>
            Use Google Authenticator, 1Password, or another TOTP app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            onClick={onChooseTotp}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            {loading && loadingMethod === "totp" ? "Preparing…" : totpLabel}
          </Button>
        </CardContent>
      </Card>

      <Card
        data-testid="tfa-choose-sms"
        className={smsEnrollmentAvailable ? undefined : "opacity-80"}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Text message (SMS)</CardTitle>
          <CardDescription>
            {smsEnrollmentAvailable
              ? "Receive codes by text message."
              : "Not available yet — SMS sender is not configured."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            onClick={onChooseSms}
            disabled={loading || !smsEnrollmentAvailable}
            className="w-full sm:w-auto"
          >
            {smsEnrollmentAvailable ? "Set up with text message" : "SMS not available"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
