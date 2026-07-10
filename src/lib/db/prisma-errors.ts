/**
 * Canonical Prisma error predicates — one place for DB error classification.
 */

/** True when `err` is a Prisma unique-constraint violation (P2002). */
export function isPrismaUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "P2002";
}
