"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { getAdminByEmail } from "@/lib/auth-db";
import { db, withDbRetry } from "@/lib/db";
import { requireAdminSession } from "@/lib/require-admin";
import type { RoundingMode } from "@/lib/billing/rounding";
import { VALID_BILLING_TIMEZONES } from "./billing-options";
import { seedTutorTimezoneIfUnset } from "@/lib/billing/seed-tutor-timezone";

const VALID_INCREMENTS = new Set([1, 5, 15, 30]);
const VALID_MODES: ReadonlySet<string> = new Set(["nearest", "up", "down"]);
const DEVICE_TIMEZONE_VALUE = "";

export async function saveBillingDefaults(
  _prev: { error?: string; ok?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  await requireAdminSession();
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return { error: "Not signed in." };

  const admin = await getAdminByEmail(email);
  if (!admin) {
    return {
      error:
        "This account uses server environment login. Billing defaults require a database account.",
    };
  }

  const incrementRaw = parseInt(
    String(formData.get("roundingIncrementMin") ?? ""),
    10
  );
  const mode = String(formData.get("roundingMode") ?? "").trim();
  const timeZone = String(formData.get("tutorTimezone") ?? "").trim();

  if (!VALID_INCREMENTS.has(incrementRaw)) {
    return { error: "Choose a valid rounding increment." };
  }
  if (!VALID_MODES.has(mode)) {
    return { error: "Choose a valid rounding direction." };
  }
  const persistTimezone =
    timeZone === DEVICE_TIMEZONE_VALUE ? null : timeZone;
  if (persistTimezone !== null && !VALID_BILLING_TIMEZONES.has(persistTimezone)) {
    return { error: "Choose a valid timezone." };
  }

  await withDbRetry(
    () =>
      db.adminUser.update({
        where: { id: admin.id },
        data: {
          defaultRoundingIncrementMin: incrementRaw,
          defaultRoundingMode: mode,
          tutorTimezone: persistTimezone,
        },
      }),
    { label: "saveBillingDefaults" }
  );

  revalidatePath("/admin/settings/billing");
  revalidatePath("/admin/settings");
  return { ok: true };
}

export type BillingDefaultsFormValues = {
  roundingIncrementMin: number;
  roundingMode: RoundingMode;
  tutorTimezone: string;
};

export async function loadBillingDefaultsForForm(): Promise<BillingDefaultsFormValues | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;

  const admin = await getAdminByEmail(email);
  if (!admin) return null;

  const row = await withDbRetry(
    () =>
      db.adminUser.findUnique({
        where: { id: admin.id },
        select: {
          defaultRoundingIncrementMin: true,
          defaultRoundingMode: true,
          tutorTimezone: true,
        },
      }),
    { label: "loadBillingDefaultsForForm" }
  );

  const {
    DEFAULT_ROUNDING_INCREMENT_MIN,
    DEFAULT_ROUNDING_MODE,
  } = await import("@/lib/billing/defaults");

  return {
    roundingIncrementMin:
      row?.defaultRoundingIncrementMin ?? DEFAULT_ROUNDING_INCREMENT_MIN,
    roundingMode:
      (row?.defaultRoundingMode as RoundingMode | null) ?? DEFAULT_ROUNDING_MODE,
    tutorTimezone: row?.tutorTimezone ?? "",
  };
}

/** Seeds AdminUser.tutorTimezone from the browser zone when the override is unset. */
export async function ensureTutorTimezoneFromSystem(iana: string): Promise<void> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return;
  const admin = await getAdminByEmail(email);
  if (!admin) return;
  await seedTutorTimezoneIfUnset(admin.id, iana);
}
