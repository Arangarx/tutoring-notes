/**
 * Family ID helpers (IAC-7).
 *
 * A `familyId` is a short globally-unique identifier used in child login handles:
 * `username@familyid` (e.g. "dragon@mortensen", "dragon@mortensen2").
 *
 * Lazy creation: generated when the first child_pin_required credential is set up.
 * Parent can update it later via family settings (must remain globally unique).
 *
 * Minting (new families only): slugified surname → bare handle on first use;
 * on global collision append smallest available integer ≥ 2 (`mortensen2`, …).
 * DB `AccountHolder.familyId` @unique; insert-and-retry on P2002.
 */

import { db } from "@/lib/db";
import { isPrismaUniqueViolation } from "@/lib/db/prisma-errors";

const FAMILY_ID_MIN_LEN = 3;
const FAMILY_ID_MAX_BASE_LEN = 20;
const NUMERIC_SUFFIX_ATTEMPTS = 50;

/** Full handle the child types at the student login page. */
export function formatLearnerLoginHandle(username: string, familyId: string): string {
  return `${username}@${familyId}`;
}

/**
 * Last token of a display name (surname heuristic); email/local-part otherwise.
 */
export function extractSurnameSeed(displayName: string | null | undefined, email: string): string {
  const trimmed = displayName?.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    return parts.length > 1 ? (parts[parts.length - 1] ?? trimmed) : trimmed;
  }
  return email.split("@")[0] ?? "family";
}

/**
 * Slugify surname → familyId base: lowercase, strip non-alphanumerics (spaces collapse).
 */
export function slugifyFamilyIdBase(raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, FAMILY_ID_MAX_BASE_LEN);
  if (base.length >= FAMILY_ID_MIN_LEN) return base;
  return "";
}

/**
 * Yield candidate familyIds: bare base, then base2, base3, … then one random fallback.
 */
export function* familyIdCandidates(base: string): Generator<string> {
  const normalized = base.length >= FAMILY_ID_MIN_LEN ? base : "family";
  yield normalized;
  for (let n = 2; n <= NUMERIC_SUFFIX_ATTEMPTS + 1; n++) {
    const candidate = `${normalized}${n}`;
    if (candidate.length <= 24) yield candidate;
  }
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  yield `${normalized}${suffix}`.slice(0, 24);
}

/**
 * Pick the first candidate not taken (unit-test oracle; production uses insert-and-catch).
 */
export function pickFamilyIdWithPredicate(
  surnameSeed: string,
  isTaken: (familyId: string) => boolean
): string {
  const base = slugifyFamilyIdBase(surnameSeed) || "family";
  for (const candidate of familyIdCandidates(base)) {
    if (!isTaken(candidate)) return candidate;
  }
  throw new Error("pickFamilyIdWithPredicate: no candidate available");
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

  const seed = extractSurnameSeed(ah.displayName, ah.email);
  const base = slugifyFamilyIdBase(seed) || "family";

  for (const candidate of familyIdCandidates(base)) {
    try {
      const result = await db.accountHolder.updateMany({
        where: { id: accountHolderId, familyId: null },
        data: { familyId: candidate },
      });
      if (result.count > 0) {
        console.log(`[ahx] ahx=${accountHolderId} action=family_id_assigned familyId=${candidate}`);
        return candidate;
      }
      break;
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (!isPrismaUniqueViolation(err)) throw e;
    }
  }

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
