import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStudentScope } from "@/lib/student-scope";
import { PageShell } from "@/components/PageShell";
import { SectionCard } from "@/components/SectionCard";
import { LocalDateTimeText } from "@/components/LocalDateTimeText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <PageShell realm="admin"
      title="Outbox"
      description="Sent and queued email messages. Use this to review what was sent and to copy share links if needed."
    >
      <SectionCard realm="admin" title="Messages" contentClassName="p-0">
        {messages.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <ul className="divide-y divide-border" role="list">
            {messages.map((m) => (
              <li key={m.id} className="space-y-3 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{m.subject}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      To {m.toEmail} &bull;{" "}
                      <LocalDateTimeText dateTime={m.createdAt.toISOString()} />
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={m.linkUrl}
                    className="h-9 min-w-0 flex-1 font-mono text-xs"
                    aria-label="Share link URL"
                  />
                  <Button asChild variant="outline" size="sm" className="shrink-0">
                    <a href={m.linkUrl} target="_blank" rel="noreferrer">
                      Open link
                    </a>
                  </Button>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{m.bodyText}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}
