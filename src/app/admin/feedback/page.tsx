import Link from "next/link";
import { db } from "@/lib/db";
import { requireOperator } from "@/lib/operator";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { LocalDateTimeText } from "@/components/LocalDateTimeText";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  await requireOperator();
  const items = await db.feedbackItem.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <AdminPageShell
      title="Feedback inbox"
      description={
        <>
          <strong>This page only lists submissions.</strong> To send feedback yourself (even while
          signed in), use{" "}
          <Link
            href="/feedback"
            className="font-semibold text-foreground underline-offset-4 hover:underline"
          >
            Send feedback
          </Link>{" "}
          in the top nav — that opens the public <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/feedback</code> form.
        </>
      }
    >
      <AdminSectionCard
        title="Submissions"
        contentClassName="p-0"
      >
        {items.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            No submissions yet.{" "}
            <Link
              href="/feedback"
              className="font-semibold text-foreground underline-offset-4 hover:underline"
            >
              Open the public form (/feedback)
            </Link>{" "}
            to send a test — not this URL.
          </div>
        ) : (
          <ul className="divide-y divide-border" role="list">
            {items.map((f) => (
              <li key={f.id} className="px-4 py-4 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">{f.kind}</p>
                  <p className="text-xs font-mono text-muted-foreground">
                    <LocalDateTimeText dateTime={f.createdAt.toISOString()} />
                    {f.contactEmail ? ` · ${f.contactEmail}` : ""}
                    {f.page ? ` · ${f.page}` : ""}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{f.message}</p>
              </li>
            ))}
          </ul>
        )}
      </AdminSectionCard>
    </AdminPageShell>
  );
}
