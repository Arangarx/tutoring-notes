"use server";

import { db } from "@/lib/db";
import { hashLearnerPin, verifyLearnerPin } from "@/lib/account-holder-auth";
import { validateLearnerPin } from "@/lib/learner-credential-validation";
import { sendAccountHolderEmail } from "@/lib/account-holder-email";
import { getPublicBaseUrl } from "@/lib/public-url";
import { getLearnerSessionFromHeaders } from "@/lib/server-session";
import {
  applyChildConsentTightening,
  type ConsentSwitchKey,
} from "@/lib/child-consent";
import type { ConsentToggleCeiling } from "@/lib/consent-scope";

export async function saveChildConsentAction(
  desired: ConsentToggleCeiling
): Promise<{ ok: true } | { ok: false; error: "unauthorized" | "above_ceiling" | "stricter_only" }> {
  const session = await getLearnerSessionFromHeaders();
  if (!session) return { ok: false, error: "unauthorized" };

  const profile = await db.learnerProfile.findUnique({
    where: { id: session.learnerProfileId },
    select: { id: true, tombstonedAt: true, isSelfLearner: true },
  });
  if (!profile || profile.tombstonedAt || profile.isSelfLearner) {
    return { ok: false, error: "unauthorized" };
  }

  return applyChildConsentTightening(session.learnerProfileId, desired);
}

export async function changeOwnLearnerPinAction(input: {
  currentPin: string;
  newPin: string;
}): Promise<
  { ok: true } | { ok: false; error: "unauthorized" | "wrong_pin" | "pin_too_short" | "pin_too_weak" | "no_credential" }
> {
  const session = await getLearnerSessionFromHeaders();
  if (!session) return { ok: false, error: "unauthorized" };

  const profile = await db.learnerProfile.findUnique({
    where: { id: session.learnerProfileId },
    select: {
      id: true,
      displayName: true,
      tombstonedAt: true,
      isSelfLearner: true,
      accountHolder: { select: { id: true, email: true } },
    },
  });
  if (!profile || profile.tombstonedAt || profile.isSelfLearner) {
    return { ok: false, error: "unauthorized" };
  }

  const credential = await db.learnerCredential.findUnique({
    where: { learnerProfileId: profile.id },
    select: { secretHash: true },
  });
  if (!credential) return { ok: false, error: "no_credential" };

  const currentOk = await verifyLearnerPin(input.currentPin, credential.secretHash);
  if (!currentOk) return { ok: false, error: "wrong_pin" };

  const pinCheck = validateLearnerPin(input.newPin);
  if (!pinCheck.ok) {
    const error = pinCheck.error?.includes("6 digits") ? "pin_too_short" : "pin_too_weak";
    return { ok: false, error };
  }

  const newSecretHash = await hashLearnerPin(input.newPin);
  const now = new Date();
  await db.$transaction([
    db.learnerCredential.update({
      where: { learnerProfileId: profile.id },
      data: { secretHash: newSecretHash },
    }),
    db.learnerDeviceSession.updateMany({
      where: { learnerProfileId: profile.id, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  console.log(
    `[lpr] lpr=${profile.id} action=pin_changed_by_learner revokedAllSessions=true`
  );

  const actionUrl = `${getPublicBaseUrl()}/account/children/${profile.id}`;
  const childName = profile.displayName.trim() || "Your child";
  try {
    await sendAccountHolderEmail(
      {
        to: profile.accountHolder.email,
        subject: `${childName} changed their sign-in PIN`,
        actionUrl,
        text: [
          `${childName} changed their sign-in PIN.`,
          "",
          "You can still set a new PIN from their page:",
          actionUrl,
          "",
          "If you expected this change, no action is needed.",
        ].join("\n"),
      },
      { accountHolderId: profile.accountHolder.id }
    );
  } catch (err) {
    console.log(
      `[lpr] lpr=${profile.id} action=pin_change_parent_mail_fail`
    );
    void err;
  }

  return { ok: true };
}

export type { ConsentSwitchKey };
