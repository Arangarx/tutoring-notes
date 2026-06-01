import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthMortensenNotice } from "@/components/auth/AuthMortensenNotice";
import { AuthShell } from "@/components/auth/AuthShell";
import { hasAdminUsers } from "@/lib/auth-db";
import {
  setupBlockedNoSecretInProduction,
  setupReachableWithoutToken,
  setupTokenValid,
} from "@/lib/setup-guard";
import SetupForm from "./SetupForm";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ token?: string | string[] }>;
};

function tokenFromSearch(sp: { token?: string | string[] }): string | undefined {
  const t = sp.token;
  if (typeof t === "string") return t;
  if (Array.isArray(t)) return t[0];
  return undefined;
}

export default async function SetupPage({ searchParams }: Props) {
  const hasAdmins = await hasAdminUsers();
  if (hasAdmins) redirect("/login");

  const sp = await searchParams;
  const token = tokenFromSearch(sp);

  if (setupBlockedNoSecretInProduction()) {
    return (
      <AuthShell
        title="First-time admin"
        description="Public signup for the first admin is disabled in production until you configure a setup secret."
        footer={
          <Link href="/login" className="text-brand underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Option A — recommended:</strong> In Vercel (or your
            host), set <code className="text-xs">SETUP_SECRET</code> to a long random string, redeploy,
            then open <code className="text-xs">/setup?token=…</code> with that same value and create
            your admin.
          </p>
          <p>
            <strong className="text-foreground">Option B:</strong> Set{" "}
            <code className="text-xs">ADMIN_EMAIL</code> and <code className="text-xs">ADMIN_PASSWORD</code>{" "}
            in environment variables, redeploy, then sign in at /login.
          </p>
          <p className="text-xs">See docs/DEPLOY.md for the full checklist.</p>
        </div>
        <div className="mt-6">
          <AuthMortensenNotice />
        </div>
      </AuthShell>
    );
  }

  if (!setupReachableWithoutToken() && !setupTokenValid(token)) {
    return (
      <AuthShell
        title="Setup link required"
        description={
          <>
            Open <code className="text-xs">/setup?token=…</code> using the same value as the{" "}
            <code className="text-xs">SETUP_SECRET</code> environment variable.
          </>
        }
        footer={
          <Link href="/login" className="text-brand underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        }
      >
        <AuthMortensenNotice />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create admin account"
      description="No admin account exists yet. Create the first one to sign in. Use a strong password."
      footer={
        <Link href="/login" className="text-brand underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <SetupForm setupToken={token ?? ""} />
    </AuthShell>
  );
}
