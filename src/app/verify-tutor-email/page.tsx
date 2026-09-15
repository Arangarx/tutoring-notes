import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { productionCanonicalMetadata } from "@/lib/seo/canonical-host";

import VerifyTutorEmailForm from "./VerifyTutorEmailForm";

export const metadata: Metadata = {
  title: "Confirm your email — Tutoring Notes",
  description: "Confirm the email address for your tutor account.",
  ...productionCanonicalMetadata("/verify-tutor-email"),
};

export default function VerifyTutorEmailPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Confirm your email" description="Loading…">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </AuthShell>
      }
    >
      <VerifyTutorEmailForm />
    </Suspense>
  );
}
