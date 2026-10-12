/**
 * Authenticated parent notes view for a specific learner.
 *
 * Route: GET /account/children/[id]/notes
 *
 * Auth: AccountHolder session → assertOwnsLearnerProfile
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/PageShell";
import { SectionCard } from "@/components/SectionCard";
import { ParentShareNoteCard } from "@/components/notes/ParentShareNoteCard";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";
import { loadLearnerHomeNotes } from "@/lib/learner-home-notes";
import { requireAccountHolderSession } from "@/lib/server-session";

import { SubNav } from "@/components/SubNav";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  void id;
  return {
    title: "Session notes",
    robots: { index: false, follow: false },
  };
}

export default async function LearnerNotesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: learnerId } = await params;

  const session = await requireAccountHolderSession(`/account/children/${learnerId}/notes`);

  const accountHolder = await db.accountHolder.findUnique({
    where: { id: session.accountHolderId },
    select: { email: true },
  });

  await assertOwnsLearnerProfile(session.accountHolderId, learnerId);

  const learnerProfile = await db.learnerProfile.findUnique({
    where: { id: learnerId },
    select: { displayName: true },
  });
  if (!learnerProfile) notFound();

  const { tutorCount, notes } = await loadLearnerHomeNotes(learnerId);

  const learnerName = learnerProfile.displayName;

  return (
    <PageShell realm="account"
      title={`${learnerName} — Session notes`}
      description="Notes from tutoring sessions, updated automatically."
      userEmail={accountHolder?.email}
      eyebrow={
        <Link
          href="/account/dashboard"
          className="inline-flex min-h-11 items-center text-brand underline-offset-2 hover:underline"
        >
          {"\u2190"} Dashboard
        </Link>
      }
    >
      <SubNav realm="account-child" learnerId={learnerId} />

      <SectionCard realm="account"
        title="Session notes"
        className="rounded-[10px] border-border shadow-sm"
        actions={
          notes.length > 0 ? (
            <Badge className="bg-accent-soft text-accent-text font-mono text-[10px] uppercase">
              {notes.length} total
            </Badge>
          ) : null
        }
        description={
          notes.length === 0
            ? tutorCount === 0
              ? "No tutor connected yet."
              : "No notes yet. Notes will appear here after each session."
            : `${notes.length} note${notes.length !== 1 ? "s" : ""} from your tutor`
        }
      >
        {notes.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            {tutorCount === 0 ? (
              <p>
                {
                  "This learner isn't connected to a tutor yet. Notes will appear here once a tutor is connected and sessions begin. Your tutor can send you a claim link to connect."
                }
              </p>
            ) : (
              <p>
                No session notes yet. They will appear here automatically after each
                tutoring session.
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {notes.map((note) => (
              <ParentShareNoteCard
                key={note.id}
                token={note.token}
                replaySessionIds={note.replaySessionIds}
                dateLabel={note.dateLabel}
                note={note.note}
                isNew={false}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
