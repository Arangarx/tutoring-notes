"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SmsTwoFactorConsentField } from "@/components/identity/SmsTwoFactorConsentField";

type SmsPhoneConsentFormProps = {
  consentId: string;
  phoneId: string;
  phoneValue: string;
  onPhoneChange: (value: string) => void;
  consentChecked: boolean;
  onConsentChange: (checked: boolean) => void;
  onSubmit: () => void;
  pending: boolean;
  placeholder: string;
  phoneLabel?: string;
  /** Screen-reader label only — the visible heading already names the field. */
  hidePhoneLabel?: boolean;
};

/**
 * Phone number plus A2P consent for SMS 2FA.
 * First-time setup and change-method both use this form.
 * The consent checkbox is above the phone field.
 */
export function SmsPhoneConsentForm({
  consentId,
  phoneId,
  phoneValue,
  onPhoneChange,
  consentChecked,
  onConsentChange,
  onSubmit,
  pending,
  placeholder,
  phoneLabel = "Mobile number",
  hidePhoneLabel = false,
}: SmsPhoneConsentFormProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
      data-testid="sms-phone-consent-form"
    >
      <SmsTwoFactorConsentField
        id={consentId}
        checked={consentChecked}
        onCheckedChange={onConsentChange}
        disabled={pending}
      />
      <div className="flex flex-wrap gap-2 items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={phoneId} className={hidePhoneLabel ? "sr-only" : undefined}>
            {phoneLabel}
          </Label>
          <Input
            id={phoneId}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={placeholder}
            value={phoneValue}
            onChange={(e) => onPhoneChange(e.target.value)}
            className="w-48"
            autoFocus
          />
        </div>
        <Button
          type="submit"
          disabled={pending || !phoneValue.trim() || !consentChecked}
        >
          {pending ? "Sending…" : "Send code"}
        </Button>
      </div>
    </form>
  );
}
