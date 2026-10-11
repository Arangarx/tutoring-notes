import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/auth-options";
import { getAdminByEmail } from "@/lib/auth-db";
import { env } from "@/lib/env";

/** Signed-in operator. `adminId` is null when the email has no AdminUser row. */
export type OperatorIdentity = {
  adminId: string | null;
  email: string;
};

/** For tests — builds the same set as `getOperatorEmailSet` from raw strings. */
export function buildOperatorEmailSet(
  operatorEmailsCsv: string | undefined,
  adminEmail: string | undefined
): Set<string> {
  const set = new Set<string>();
  const raw = operatorEmailsCsv?.trim();
  if (raw) {
    for (const part of raw.split(",")) {
      const e = part.trim().toLowerCase();
      if (e) set.add(e);
    }
  }
  if (adminEmail) set.add(adminEmail.trim().toLowerCase());
  return set;
}

/**
 * Emails that may access **global** operator data: feedback inbox, waitlist, and related dashboard tiles.
 * Set `OPERATOR_EMAILS` (comma-separated) in env and/or `ADMIN_EMAIL` (included automatically).
 * If neither yields any address, no signed-in user is treated as an operator (secure default).
 */
export function getOperatorEmailSet(): Set<string> {
  return buildOperatorEmailSet(env.OPERATOR_EMAILS, env.ADMIN_EMAIL);
}

export function isOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const set = getOperatorEmailSet();
  if (set.size === 0) return false;
  return set.has(email.trim().toLowerCase());
}

/**
 * Use on server-only routes that must not be visible to every tutor.
 * Gate is the operator email set, not AdminRole.ADMIN.
 * Returns the DB admin id when one exists, otherwise null plus the email.
 */
export async function requireOperator(): Promise<OperatorIdentity> {
  const session = await getServerSession(authOptions);
  const raw = session?.user?.email;
  if (!isOperatorEmail(raw)) notFound();
  const email = raw!.trim().toLowerCase();
  const admin = await getAdminByEmail(email);
  return { adminId: admin?.id ?? null, email };
}
