"use client";

import Link from "next/link";

import { CheckboxField } from "@/components/ui/checkbox";

export const SMS_A2P_CONSENT_TEST_ID = "sms-a2p-consent";

type SmsTwoFactorConsentFieldProps = {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
};

/**
 * A2P opt-in for SMS 2FA enrollment and change-method phone collection.
 * Copy must stay aligned with Twilio campaign disclosure and legal facades.
 */
export function SmsTwoFactorConsentField({
  id,
  checked,
  onCheckedChange,
  disabled,
}: SmsTwoFactorConsentFieldProps) {
  return (
    <CheckboxField
      id={id}
      data-testid={SMS_A2P_CONSENT_TEST_ID}
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      disabled={disabled}
      className="items-start"
      labelClassName="!h-auto !items-start leading-snug"
      label={
        <>
          I agree to receive one-time sign-in and setup codes from{" "}
          <strong>Mynk</strong> (Andrew Mortensen, operating as Mynk) at the mobile number I
          provide. Messages are sent only when I set up SMS two-factor authentication, sign in
          with SMS, or change my SMS two-factor method—not for marketing. Msg &amp; data rates
          may apply. Reply HELP for help. Reply STOP to opt out. See our{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="underline">
            Terms of Use
          </Link>
          .
        </>
      }
    />
  );
}
