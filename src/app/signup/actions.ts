"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdmin } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { findEmailRealmPresence } from "@/lib/cross-realm-email";
import { notifyOperatorsOfNewSignup } from "@/lib/notify-operator-new-signup";
import { validatePasswordStrength, MIN_PASSWORD_LENGTH } from "@/lib/password-strength";
import { normalizeEmail } from "@/lib/normalize-email";
import { sendTutorSignupVerifyEmail } from "@/lib/admin-email-verify";
import { getRequestBaseUrlSafeFromHeaders } from "@/lib/public-url";
import { safeRelativeReturnPath } from "@/lib/safe-return-path";

const SignupSchema = z
  .object({
    email: z.string().email("Enter a valid email."),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`),
    passwordConfirm: z.string(),
    displayName: z.string().optional(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: "Passwords do not match.",
    path: ["passwordConfirm"],
  });

export async function signup(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string } | null> {
  const raw = {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    passwordConfirm: String(formData.get("passwordConfirm") ?? ""),
    displayName: String(formData.get("displayName") ?? "").trim(),
  };

  const parsed = SignupSchema.safeParse({
    email: raw.email,
    password: raw.password,
    passwordConfirm: raw.passwordConfirm,
    displayName: raw.displayName || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your inputs and try again." };
  }

  const { email, password, displayName } = parsed.data;
  const normalized = normalizeEmail(email);

  const strengthCheck = validatePasswordStrength(password);
  if (!strengthCheck.ok) {
    return { error: strengthCheck.feedback || "Password is too weak. Try a longer phrase." };
  }

  const presence = await findEmailRealmPresence(email);
  if (presence.inAdmin || presence.inAccountHolder) {
    // Anti-enumeration: a malicious actor can otherwise probe which emails
    // have accounts. Redirect to the same /login?registered=1 destination
    // a successful signup would historically hit, so the externally-observable
    // outcome stays identical for existing emails. New accounts go to
    // /verify-tutor-email after a confirm mail is sent.
    redirect("/login?registered=1");
  }

  const created = await createAdmin(normalized, password, displayName ?? null);
  const baseUrl = await getRequestBaseUrlSafeFromHeaders();
  const returnTo = safeRelativeReturnPath(String(formData.get("returnTo") ?? ""));
  const mailed = await sendTutorSignupVerifyEmail({
    adminUserId: created.id,
    email: normalized,
    baseUrl,
    returnTo,
  });

  if (!mailed.sent) {
    await db.adminUser.delete({ where: { id: created.id } });
    return {
      error:
        "We couldn't send a confirmation email. Try again later, or contact support if this keeps happening.",
    };
  }

  const { logProductEvent } = await import("@/lib/observability/product-events");
  await logProductEvent({
    kind: "TUTOR_SIGNUP",
    adminUserId: created.id,
    metadata: { method: "credentials" },
  });
  await notifyOperatorsOfNewSignup({
    email: normalized,
    displayName: displayName ?? null,
    method: "credentials",
  });
  if (returnTo) {
    redirect(`/verify-tutor-email?${new URLSearchParams({ returnTo }).toString()}`);
  }
  redirect("/verify-tutor-email");
}
