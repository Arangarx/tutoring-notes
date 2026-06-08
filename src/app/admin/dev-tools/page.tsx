/**
 * /admin/dev-tools — fixture dashboard for local / preview environments.
 *
 * Guardrail 1 (environment): returns 404 when VERCEL_ENV === 'production'.
 * Guardrail 2 (auth): operator (ADMIN role) session required.
 *
 * Documented in docs/PLATFORM-ASSUMPTIONS.md §10.9.
 */

import { notFound } from "next/navigation";
import { assertAdminOrNotFound } from "@/lib/impersonation";
import {
  isDevToolsEnabled,
  listFixtureTutors,
  listFixtureFamilies,
} from "@/lib/dev-fixtures";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { DevToolsClient } from "./DevToolsClient";

export const dynamic = "force-dynamic";

export default async function DevToolsPage() {
  // Guardrail 1: environment gate — inert in production.
  if (!isDevToolsEnabled()) {
    notFound();
  }

  // Guardrail 2: auth gate — operator session only.
  await assertAdminOrNotFound();

  const [tutors, families] = await Promise.all([listFixtureTutors(), listFixtureFamilies()]);

  return (
    <AdminPageShell
      title="Dev tools"
      description={
        <>
          <span className="font-semibold text-yellow-600 dark:text-yellow-400">
            ⚠ Dev / preview only — not available in production.
          </span>{" "}
          Create and reset throwaway fixture users for testing. All rows marked{" "}
          <code className="text-xs">isTestFixture=true</code>; the delete path cannot touch real
          users.
        </>
      }
    >
      <DevToolsClient initialTutors={tutors} initialFamilies={families} />
    </AdminPageShell>
  );
}
