import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import SignupForm from "./SignupForm";

export const metadata: Metadata = {
  title: "Sign up — Tutoring Notes",
  description: "Create a tutor account for Tutoring Notes.",
};

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      description="Sign up with email and password. Each account is separate — your students and notes stay in your workspace."
      footer={
        <Link href="/" className="text-brand underline-offset-2 hover:underline">
          ← Home
        </Link>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
