import type { StudentScope } from "@/lib/student-scope";

export const REGISTERED_ADMIN_REQUIRED_MESSAGE =
  "Whiteboard sessions require a registered admin account. Please complete account setup first.";

/**
 * Whiteboard create paths need a DB-backed AdminUser. The legacy env-only
 * login has no row to attach the session to.
 */
export function registeredAdminId(
  scope: Exclude<StudentScope, { kind: "none" }>,
  context: string
): string {
  if (scope.kind !== "admin") {
    console.warn(`${context} REJECTED: env-only admin (no AdminUser row)`);
    throw new Error(REGISTERED_ADMIN_REQUIRED_MESSAGE);
  }
  return scope.adminId;
}
