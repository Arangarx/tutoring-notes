"use client";

/**
 * SEC-1 Dispatch B — impersonation banner.
 *
 * Rendered in the admin layout when session.user.isImpersonating === true.
 * Persists until "Exit impersonation" is clicked; not dismissible.
 *
 * Style: amber/yellow band — visually distinct from normal UI so the
 * admin always knows they are acting as a test account.
 */

import { exitImpersonation } from "@/app/admin/actions/impersonate";

interface ImpersonationBannerProps {
  email: string;
}

export function ImpersonationBanner({ email }: ImpersonationBannerProps) {
  return (
    <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 text-sm text-amber-900 flex items-center justify-between">
      <span>
        You are signed in as <strong>{email}</strong> (test account).
      </span>
      <form action={exitImpersonation}>
        <button
          type="submit"
          className="ml-4 underline hover:no-underline font-medium"
        >
          Exit impersonation
        </button>
      </form>
    </div>
  );
}
