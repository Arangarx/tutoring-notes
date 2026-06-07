import { requireOperator } from "@/lib/operator";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Defensive: table may not exist if migration hasn't run yet.
async function getWaitlistEntries() {
  try {
    const { db } = await import("@/lib/db");
    return await db.waitlistEntry.findMany({ orderBy: { createdAt: "desc" } });
  } catch {
    return [];
  }
}

export default async function AdminWaitlistPage() {
  await requireOperator();
  const entries = await getWaitlistEntries();

  return (
    <AdminPageShell
      title="Waitlist"
      description="People who signed up for early access from the landing page."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">Dashboard</Link>
        </Button>
      }
    >
      <AdminSectionCard title="Sign-ups" contentClassName="p-0">
        {entries.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No signups yet.</p>
        ) : (
          <ul className="divide-y divide-border" role="list">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">{e.email}</p>
                  {e.name ? (
                    <p className="text-sm text-muted-foreground">{e.name}</p>
                  ) : null}
                  {e.note ? (
                    <p className="text-sm text-muted-foreground">{e.note}</p>
                  ) : null}
                </div>
                <time
                  dateTime={e.createdAt.toISOString()}
                  className="shrink-0 text-xs font-mono text-muted-foreground"
                >
                  {e.createdAt.toLocaleDateString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </AdminSectionCard>
    </AdminPageShell>
  );
}
