/**
 * Family ID helpers (IAC-7).
 *
 * A `familyId` is a short globally-unique identifier used in child login handles:
 * `username@familyid` (e.g. "dragon@mortensen1847").
 *
 * Lazy creation: generated when the first child_pin_required credential is set up.
 * Parent can update it later via family settings (must remain globally unique).
 *
 * Format: 2–3 word slug from account holder display name/email + 4-digit random suffix.
 * e.g. "smith4219", "alex_j1847". Kept short and human-memorable.
 */

import { db } from "@/lib/db";

/**
 * Generate a candidate family id from account holder display name or email prefix.
 * Normalizes to lowercase alphanumeric + underscores only.
 */
function generateCandidateFamilyId(seed: string): string {
  // Take first word of the name/email prefix, normalize, append 4 random digits
  const cleaned = seed
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 12);
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return cleaned ? `${cleaned}${suffix}` : `family${suffix}`;
}

/**
 * Ensure an AccountHolder has a familyId. If already set, returns it.
 * If not set, generates one and persists it (with retry on collision).
 *
 * Logs: [ahx] ahx=<id> action=family_id_assigned familyId=<id>
 */
export async function ensureFamilyId(accountHolderId: string): Promise<string> {
  const ah = await db.accountHolder.findUnique({
    where: { id: accountHolderId },
    select: { familyId: true, email: true, displayName: true },
  });

  if (!ah) throw new Error(`AccountHolder ${accountHolderId} not found`);
  if (ah.familyId) return ah.familyId;

  // Generate from display name or email prefix
  const seed = ah.displayName ?? ah.email.split("@")[0] ?? "family";

  // Retry loop to handle collisions (rare; stop after 5 attempts)
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCandidateFamilyId(seed);
    try {
      // updateMany with familyId IS NULL so concurrent calls don't double-assign
      const result = await db.accountHolder.updateMany({
        where: { id: accountHolderId, familyId: null },
        data: { familyId: candidate },
      });
      if (result.count > 0) {
        console.log(`[ahx] ahx=${accountHolderId} action=family_id_assigned familyId=${candidate}`);
        return candidate;
      }
      // count === 0: another request already set familyId; break and re-fetch
      break;
    } catch (e: unknown) {
      // P2002 = unique constraint violation (collision); retry
      const err = e as { code?: string };
      if (err?.code !== "P2002") throw e;
    }
  }

  // If we still don't have it (race: another request set it first), re-fetch
  const refetched = await db.accountHolder.findUnique({
    where: { id: accountHolderId },
    select: { familyId: true },
  });
  if (refetched?.familyId) return refetched.familyId;

  throw new Error(`Failed to assign familyId to AccountHolder ${accountHolderId}`);
}

/**
 * Update a family's familyId. Validates global uniqueness (DB constraint).
 * Throws Prisma P2002 on collision.
 */
export async function updateFamilyId(accountHolderId: string, newFamilyId: string): Promise<void> {
  const normalized = newFamilyId.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
    throw new Error("invalid_family_id");
  }
  await db.accountHolder.update({
    where: { id: accountHolderId },
    data: { familyId: normalized },
  });
  console.log(`[ahx] ahx=${accountHolderId} action=family_id_updated familyId=${normalized}`);
}
