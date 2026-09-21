"use client";

import { useState } from "react";

import {
  AuthMortensenNotice,
  type AuthMortensenNoticeVariant,
} from "@/components/auth/AuthMortensenNotice";
import { Button } from "@/components/ui/button";
import {
  followBrowserRedirect,
  startGoogleOAuth,
} from "@/lib/auth/google-oauth-start";

export function GoogleSignInSection({
  callbackUrl,
  noticeVariant = "sign-in",
  buttonLabel,
}: {
  callbackUrl: string;
  noticeVariant?: AuthMortensenNoticeVariant;
  buttonLabel?: string;
}) {
  const [pending, setPending] = useState(false);
  const label =
    buttonLabel ??
    (noticeVariant === "sign-up" ? "Sign up with Google" : "Sign in with Google");

  async function onClick() {
    setPending(true);
    try {
      followBrowserRedirect(await startGoogleOAuth(callbackUrl));
    } catch {
      followBrowserRedirect("/login?error=OAuthSignin");
    }
  }

  return (
    <div className="space-y-3">
      <AuthMortensenNotice variant={noticeVariant} />
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full text-base"
        disabled={pending}
        onClick={() => {
          void onClick();
        }}
      >
        {pending ? "Continuing to Google…" : label}
      </Button>
    </div>
  );
}
