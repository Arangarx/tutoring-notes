"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getAccountHolderSession } from "@/lib/account-holder-session";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";
import { clearCredentialHardLock } from "@/lib/learner-pin-rate-limit";

/**
 * IAC-10: Parent/guardian action to clear the hard lock on a child's PIN login.
 * Asserts ownership of the LearnerProfile before clearing.
 */
export async function unlockChildPinAction(
  learnerProfileId: string
): Promise<{ ok: boolean; error?: string }> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const ahSession = await getAccountHolderSession(
    new Request("http://localhost/", { headers: { cookie: cookieHeader } })
  );

  if (!ahSession) return { ok: false, error: "unauthorized" };

  await assertOwnsLearnerProfile(ahSession.accountHolderId, learnerProfileId);

  const profile = await db.learnerProfile.findUnique({
    where: { id: learnerProfileId },
    select: {
      credential: { select: { username: true } },
      accountHolder: { select: { familyId: true } },
    },
  });

  if (!profile?.credential) {
    return { ok: false, error: "no_credential" };
  }

  const familyId = profile.accountHolder?.familyId;
  if (!familyId) {
    return { ok: false, error: "no_family_id" };
  }

  const credKey = `${familyId}:${profile.credential.username}`;
  await clearCredentialHardLock(credKey);

  console.log(
    `[lpr] lpr=${learnerProfileId} action=hard_lock_cleared_by_parent credKey=${credKey}`
  );

  // NOTE: no revalidatePath here by design. The page is force-dynamic so the next
  // navigation will pick up the fresh unlocked state. Calling revalidatePath would
  // trigger an immediate server re-render which unmounts <UnlockPinButton> (because
  // isPinHardLocked becomes false), destroying the client-side success message before
  // the parent can read it. The success state persists until navigation.
  return { ok: true };
}
