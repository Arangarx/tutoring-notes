import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStudentScope } from "@/lib/student-scope";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { LocalDateTimeText } from "@/components/LocalDateTimeText";

export const dynamic = "force-dynamic";

export default async function OutboxPage() {
  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  const where = scope.kind === "admin"
    ? { adminUserId: scope.adminId }
    : { adminUserId: null };

  const messages = await db.emailMessage.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <AdminPageShell
      title="Outbox"
      description="Sent and queued email messages. Use this to review what was sent and to copy share links if needed."
    >
      <AdminSectionCard title="Messages" contentClassName="p-0">
        {messages.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <ul className="divide-y divide-border" role="list">
            {messages.map((m) => (
              <li key={m.id} className="px-4 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{m.subject}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-1">
                      To {m.toEmail} &bull;{" "}
                      <LocalDateTimeText dateTime={m.createdAt.toISOString()} />
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={m.linkUrl}
                    className="h-8 min-w-0 flex-1 rounded-md border border-input bg-muted/40 px-3 text-xs font-mono text-muted-foreground"
                    aria-label="Share link URL"
                  />
                  <a
                    className="inline-flex h-8 shrink-0 items-center rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    href={m.linkUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open link
                  </a>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{m.bodyText}</p>
              </li>
            ))}
          </ul>
        )}
      </AdminSectionCard>
    </AdminPageShell>
  );
}
