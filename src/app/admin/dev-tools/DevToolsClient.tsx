"use client";

/**
 * Client component for the dev-tools fixture dashboard.
 * Handles interactive create/delete actions and shows credential tables.
 */

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  actionCreateTutorFixture,
  actionCreateFamilyFixture,
  actionDeleteFixtureTutor,
  actionDeleteFixtureFamily,
  actionDeleteAllFixtures,
  actionRegenerateClaimInvite,
} from "./actions";
import { startImpersonation } from "@/app/admin/actions/impersonate";
import {
  FIXTURE_TUTOR_PASSWORD,
  FIXTURE_PARENT_PASSWORD,
  FIXTURE_CHILD_PIN,
} from "@/lib/dev-fixture-constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TutorRow = { id: string; email: string; createdAt: Date };
type FamilyRow = {
  id: string;
  email: string;
  familyId: string | null;
  createdAt: Date;
  learnerProfiles: {
    id: string;
    displayName: string;
    credential: { username: string } | null;
    students: {
      id: string;
      name: string;
      adminUserId: string | null;
      claimInvites: { id: string; expiresAt: Date }[];
    }[];
  }[];
};

type CreatedTutor = {
  adminUserId: string;
  email: string;
  password: string;
};

type CreatedFamily = {
  accountHolderId: string;
  parentEmail: string;
  parentPassword: string;
  familyId: string;
  learnerDisplayName: string;
  childPin: string;
  claimLink: string;
  studentName: string;
};

type DevToolsClientProps = {
  initialTutors: TutorRow[];
  initialFamilies: FamilyRow[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COPIED_LABEL = "✓ copied";

function CopyCell({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-grid max-w-full">
      {/* Phantom cells reserve max(value, copied) width so the swap never reflows siblings. */}
      <span
        className="invisible col-start-1 row-start-1 whitespace-nowrap px-1 font-mono text-xs"
        aria-hidden="true"
      >
        {value}
      </span>
      <span
        className="invisible col-start-1 row-start-1 whitespace-nowrap px-1 font-mono text-xs"
        aria-hidden="true"
      >
        {COPIED_LABEL}
      </span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className={`col-start-1 row-start-1 min-w-0 truncate whitespace-nowrap rounded px-1 text-left font-mono text-xs hover:bg-muted ${
          copied ? "text-muted-foreground" : ""
        }`}
        title="Click to copy"
        aria-live="polite"
      >
        {copied ? COPIED_LABEL : value}
      </button>
    </span>
  );
}

function CredTable({ rows }: { rows: [string, string][] }) {
  return (
    <table className="mt-2 w-full table-auto text-xs">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b border-border/40 last:border-0">
            <td className="py-1 pr-4 font-medium text-muted-foreground">{label}</td>
            <td className="py-1">
              <CopyCell value={value} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DevToolsClient({ initialTutors, initialFamilies }: DevToolsClientProps) {
  const [tutors, setTutors] = useState<TutorRow[]>(initialTutors);
  const [families, setFamilies] = useState<FamilyRow[]>(initialFamilies);
  const [newTutor, setNewTutor] = useState<CreatedTutor | null>(null);
  const [newFamily, setNewFamily] = useState<CreatedFamily | null>(null);
  const [selectedTutorId, setSelectedTutorId] = useState<string>(
    initialTutors[0]?.id ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [deleteAllResult, setDeleteAllResult] = useState<string | null>(null);
  const [freshClaimLinks, setFreshClaimLinks] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function clearMessages() {
    setError(null);
    setDeleteAllResult(null);
  }

  // --- Create tutor ---
  function handleCreateTutor() {
    clearMessages();
    startTransition(async () => {
      const res = await actionCreateTutorFixture();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNewTutor({ adminUserId: res.adminUserId, email: res.email, password: res.password });
      setSelectedTutorId(res.adminUserId);
      const newRow: TutorRow = { id: res.adminUserId, email: res.email, createdAt: new Date() };
      setTutors((prev) => [newRow, ...prev]);
    });
  }

  // --- Create family ---
  function handleCreateFamily() {
    if (!selectedTutorId) {
      setError("Select a tutor first.");
      return;
    }
    clearMessages();
    startTransition(async () => {
      const res = await actionCreateFamilyFixture(selectedTutorId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNewFamily({
        accountHolderId: res.accountHolderId,
        parentEmail: res.parentEmail,
        parentPassword: res.parentPassword,
        familyId: res.familyId,
        learnerDisplayName: res.learnerDisplayName,
        childPin: res.childPin,
        claimLink: res.claimLink,
        studentName: res.studentName,
      });
      // Refresh families from server by adding a placeholder (page revalidates on next load)
      const newRow: FamilyRow = {
        id: res.accountHolderId,
        email: res.parentEmail,
        familyId: res.familyId,
        createdAt: new Date(),
        learnerProfiles: [
          {
            id: res.learnerProfileId ?? "",
            displayName: res.learnerDisplayName,
            credential: null,
            students: [],
          },
        ],
      };
      setFamilies((prev) => [newRow, ...prev]);
    });
  }

  // --- Delete tutor ---
  function handleDeleteTutor(adminUserId: string) {
    if (!confirm("Delete this fixture tutor and all its data? This cannot be undone.")) return;
    clearMessages();
    startTransition(async () => {
      const res = await actionDeleteFixtureTutor(adminUserId);
      if (!res.ok) { setError(res.error ?? "Delete failed."); return; }
      setTutors((prev) => prev.filter((t) => t.id !== adminUserId));
      if (newTutor?.adminUserId === adminUserId) setNewTutor(null);
    });
  }

  // --- Delete family ---
  function handleDeleteFamily(accountHolderId: string) {
    if (!confirm("Delete this fixture family and all its data? This cannot be undone.")) return;
    clearMessages();
    startTransition(async () => {
      const res = await actionDeleteFixtureFamily(accountHolderId);
      if (!res.ok) { setError(res.error ?? "Delete failed."); return; }
      setFamilies((prev) => prev.filter((f) => f.id !== accountHolderId));
      if (newFamily?.accountHolderId === accountHolderId) setNewFamily(null);
    });
  }

  // --- Delete all ---
  function handleDeleteAll() {
    if (
      !confirm(
        "Delete ALL fixture data (all rows where isTestFixture=true)? This cannot be undone."
      )
    )
      return;
    clearMessages();
    startTransition(async () => {
      const res = await actionDeleteAllFixtures();
      if (!res.ok) { setError(res.error ?? "Delete all failed."); return; }
      setTutors([]);
      setFamilies([]);
      setNewTutor(null);
      setNewFamily(null);
      setFreshClaimLinks({});
      const c = res.counts!;
      setDeleteAllResult(
        `Cleared: ${c.adminUsers} tutor(s), ${c.accountHolders} parent(s), ${c.learnerProfiles} learner(s), ${c.students} student(s)`
      );
    });
  }

  // --- Regenerate claim invite ---
  function handleRegenerateClaim(studentId: string) {
    startTransition(async () => {
      const res = await actionRegenerateClaimInvite(studentId);
      if (!res.ok) { setError(res.error); return; }
      setFreshClaimLinks((prev) => ({ ...prev, [studentId]: res.claimLink }));
    });
  }

  const hasTutors = tutors.length > 0;
  const hasFamilies = families.length > 0;
  const hasAny = hasTutors || hasFamilies;

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {deleteAllResult && (
        <div className="rounded-md border border-green-500/40 bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
          {deleteAllResult}
        </div>
      )}

      {/* ---- Create section ---- */}
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-foreground">Create fixtures</h2>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="default"
            onClick={handleCreateTutor}
            disabled={isPending}
            className="min-h-11"
          >
            {isPending ? "Creating…" : "Create tutor fixture"}
          </Button>

          <div className="flex items-center gap-2">
            <select
              value={selectedTutorId}
              onChange={(e) => setSelectedTutorId(e.target.value)}
              className="h-11 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={!hasTutors}
            >
              {hasTutors ? (
                tutors.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.email}
                  </option>
                ))
              ) : (
                <option value="">— create a tutor first —</option>
              )}
            </select>
            <Button
              variant="outline"
              onClick={handleCreateFamily}
              disabled={isPending || !hasTutors}
              className="min-h-11"
            >
              {isPending ? "Creating…" : "Create family for tutor"}
            </Button>
          </div>
        </div>
      </section>

      {/* ---- Just-created credentials ---- */}
      {newTutor && (
        <section className="rounded-lg border border-blue-400/40 bg-blue-50 p-5 shadow-sm dark:bg-blue-950">
          <h2 className="mb-2 text-sm font-semibold text-blue-900 dark:text-blue-200">
            New tutor fixture credentials
          </h2>
          <CredTable
            rows={[
              ["Email", newTutor.email],
              ["Password", newTutor.password],
              ["AdminUser ID", newTutor.adminUserId],
            ]}
          />
        </section>
      )}

      {newFamily && (
        <section className="rounded-lg border border-violet-400/40 bg-violet-50 p-5 shadow-sm dark:bg-violet-950">
          <h2 className="mb-2 text-sm font-semibold text-violet-900 dark:text-violet-200">
            New family fixture credentials
          </h2>
          <CredTable
            rows={[
              ["Parent email", newFamily.parentEmail],
              ["Parent password", newFamily.parentPassword],
              ["Family ID", newFamily.familyId],
              ["Child name", newFamily.studentName],
              ["Child login", `${newFamily.learnerDisplayName.split(" ")[0]?.toLowerCase() ?? "child"}@${newFamily.familyId}`],
              ["Child PIN", newFamily.childPin],
              ["Claim link", newFamily.claimLink],
            ]}
          />
        </section>
      )}

      {/* ---- Existing fixtures table ---- */}
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-foreground">
            Existing fixtures ({tutors.length} tutor(s), {families.length} family(ies))
          </h2>
          {hasAny && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteAll}
              disabled={isPending}
              className="min-h-9"
            >
              Clear all fixtures
            </Button>
          )}
        </div>

        {/* Tutors */}
        {hasTutors && (
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Tutor fixtures</h3>
            <ul className="flex flex-col gap-2">
              {tutors.map((t) => (
                <li
                  key={t.id}
                  className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono font-medium">{t.email}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        id: {t.id.slice(0, 8)}…
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <form action={startImpersonation.bind(null, t.id)}>
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          className="min-h-8 text-xs"
                        >
                          Impersonate
                        </Button>
                      </form>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteTutor(t.id)}
                        disabled={isPending}
                        className="min-h-8 text-xs"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  {/* Persistent credentials */}
                  <div className="mt-2 border-t border-border/40 pt-2">
                    <CredTable
                      rows={[
                        ["Email", t.email],
                        ["Password", FIXTURE_TUTOR_PASSWORD],
                      ]}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Families */}
        {hasFamilies && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Family fixtures</h3>
            <ul className="flex flex-col gap-2">
              {families.map((f) => (
                <li
                  key={f.id}
                  className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono font-medium">{f.email}</span>
                      {f.familyId && (
                        <span className="ml-2 text-xs text-muted-foreground">@{f.familyId}</span>
                      )}
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteFamily(f.id)}
                      disabled={isPending}
                      className="min-h-8 text-xs"
                    >
                      Delete
                    </Button>
                  </div>

                  {/* Persistent credentials */}
                  <div className="mt-2 border-t border-border/40 pt-2">
                    <CredTable
                      rows={[
                        ["Parent email", f.email],
                        ["Parent password", FIXTURE_PARENT_PASSWORD],
                        ["Child PIN", FIXTURE_CHILD_PIN],
                        ...(f.learnerProfiles.flatMap((lp) =>
                          lp.credential && f.familyId
                            ? [["Child login", `${lp.credential.username}@${f.familyId}`] as [string, string]]
                            : []
                        )),
                      ]}
                    />

                    {/* Claim links per student — regeneratable */}
                    {f.learnerProfiles.flatMap((lp) => lp.students).map((student) => (
                      <div key={student.id} className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Claim link
                          {student.claimInvites.length > 0
                            ? ` (active, expires ${new Date(student.claimInvites[0]!.expiresAt).toLocaleDateString()})`
                            : " (no active invite)"}
                          :
                        </span>
                        {freshClaimLinks[student.id] ? (
                          <CopyCell value={freshClaimLinks[student.id]!} />
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRegenerateClaim(student.id)}
                            disabled={isPending}
                            className="min-h-7 text-xs"
                          >
                            Get fresh link
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!hasAny && (
          <p className="text-sm text-muted-foreground">
            No fixtures yet. Use the buttons above to create some.
          </p>
        )}
      </section>
    </div>
  );
}
