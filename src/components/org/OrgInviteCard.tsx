import Link from "next/link";

import { acceptOrgInviteAction } from "@/app/org-invite/[token]/actions";
import { AuthShell } from "@/components/auth/AuthShell";
import { OrgInviteSignOutButton } from "@/components/org/OrgInviteSignOutButton";
import { Button } from "@/components/ui/button";
import { orgInviteReasonSentence } from "@/lib/org-staff-messages";
import { formatOrgRoleList } from "@/lib/org-role-label";
import { teachingSignInHref, teachingSignUpHref } from "@/lib/teaching-account-href";
import type { OrgInviteHolderView } from "@/lib/org-scope";

export function OrgInviteCard({
  token,
  view,
  sessionEmail,
}: {
  token: string;
  view: Exclude<OrgInviteHolderView, { kind: "unavailable" }>;
  sessionEmail: string | null;
}) {
  const returnPath = `/org-invite/${token}`;
  const roleText = formatOrgRoleList(view.roles);
  const signedInAsInvitee = sessionEmail != null && sessionEmail === view.email;
  const wrongAccount = sessionEmail != null && sessionEmail !== view.email;
  const reason = view.kind === "open" ? null : orgInviteReasonSentence(view.kind);

  return (
    <AuthShell
      title="Organization invitation"
      description={
        reason ?? `You are invited to join ${view.organizationName}.`
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Organization</dt>
            <dd className="font-medium text-foreground" data-testid="org-invite-org-name">
              {view.organizationName}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Role</dt>
            <dd className="font-medium text-foreground" data-testid="org-invite-role">
              {roleText}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Invited email</dt>
            <dd className="font-medium text-foreground" data-testid="org-invite-email">
              {view.email}
            </dd>
          </div>
        </dl>

        {reason ? (
          <p className="text-sm text-foreground" role="status" data-testid="org-invite-reason">
            {reason}
          </p>
        ) : null}

        {view.kind === "open" && !sessionEmail ? (
          <div className="flex flex-col gap-3">
            <Button asChild className="min-h-11">
              <Link href={teachingSignInHref(returnPath, view.email)} data-testid="org-invite-sign-in">
                Sign in
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <Link
                href={teachingSignUpHref(returnPath, view.email)}
                data-testid="org-invite-create-account"
              >
                Create account
              </Link>
            </Button>
          </div>
        ) : null}

        {view.kind === "open" && wrongAccount ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground" role="alert" data-testid="org-invite-wrong-account">
              You are signed in as {sessionEmail}. This invitation is for {view.email}. Sign out,
              then sign in with the invited email.
            </p>
            <OrgInviteSignOutButton callbackUrl={returnPath} />
          </div>
        ) : null}

        {view.kind === "open" && signedInAsInvitee ? (
          <form action={acceptOrgInviteAction}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" className="min-h-11" data-testid="org-invite-accept">
              Accept invitation
            </Button>
          </form>
        ) : null}
      </div>
    </AuthShell>
  );
}
