"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { AccountHolderLoginForm } from "@/components/auth/AccountHolderLoginForm";

function AccountLoginForm() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/account/dashboard";
  const notice = searchParams.get("notice");
  const source = searchParams.get("source");

  const noticeMessage =
    notice === "verify_email_expired"
      ? "That verification link has expired. Sign in to your existing account, or request a new verification link."
      : notice === "reset_ok"
        ? "Your password was updated. Sign in with your new password."
        : notice === "link_already_used"
          ? "That verification link has already been used — your account is active. Sign in below."
          : null;

  // Messages for wall-redirect sources (notes auth wall + session state).
  const sourceMessage =
    source === "notes_email"
      ? "To view these notes, sign in with the account that received the link."
      : source === "claim_required"
        ? "Please sign in to claim this student\u2019s notes and view them here."
        : source === "session_expired"
          ? "Your session expired \u2014 please sign in again."
          : null;

  return (
    <AuthShell
      title="Sign in to your account"
      description="Use your account credentials."
      footer={
        <p>
          New to Mynk?{" "}
          <Link href="/account/signup" className="text-brand underline-offset-2 hover:underline">
            Create an account
          </Link>
        </p>
      }
    >
      {noticeMessage ? (
        <p className="mb-4 text-sm text-muted-foreground" role="status">
          {noticeMessage}
        </p>
      ) : null}
      {sourceMessage ? (
        <p className="mb-4 text-sm text-muted-foreground" role="status">
          {sourceMessage}
        </p>
      ) : null}

      <AccountHolderLoginForm returnTo={returnTo} />
    </AuthShell>
  );
}

export default function AccountLoginPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Sign in to your account">
          <p className="text-sm text-muted-foreground">Loading\u2026</p>
        </AuthShell>
      }
    >
      <AccountLoginForm />
    </Suspense>
  );
}
