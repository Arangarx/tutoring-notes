import {
  createOrgLearnerAction,
  reinviteOrgLearnerAction,
} from "@/app/admin/organization/actions";
import { OrgInviteForPicker } from "@/components/org/OrgInviteForPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/SectionCard";
import type { OrgLearnerRecord, SchedulerLearnerCard } from "@/lib/org-learner";

export function OrgLearnerPanel({
  organizationId,
  canManage,
  records,
  schedulerCards,
}: {
  organizationId: string;
  canManage: boolean;
  records: OrgLearnerRecord[];
  schedulerCards: SchedulerLearnerCard[];
}) {
  return (
    <SectionCard
      realm="admin"
      title="Learners"
      description={
        canManage
          ? "Add a learner and send the claim email."
          : "Name, brief, and whether a session can be booked."
      }
      data-testid="org-learner-panel"
    >
      {canManage ? (
        <form action={createOrgLearnerAction} className="flex flex-col gap-3">
          <input type="hidden" name="organizationId" value={organizationId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="org-learner-given">Given name</Label>
              <Input id="org-learner-given" name="givenName" required data-testid="org-learner-given" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="org-learner-family">Family name</Label>
              <Input id="org-learner-family" name="familyName" required data-testid="org-learner-family" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="org-learner-brief">Brief</Label>
            <Input id="org-learner-brief" name="brief" data-testid="org-learner-brief" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="org-learner-email">Email</Label>
            <Input
              id="org-learner-email"
              name="email"
              type="email"
              required
              data-testid="org-learner-email"
            />
          </div>
          <OrgInviteForPicker />
          <Button type="submit" data-testid="org-learner-create">
            Add learner
          </Button>
        </form>
      ) : null}

      {canManage ? (
        <ul className="mt-4 flex flex-col gap-3" data-testid="org-learner-records">
          {records.map((record) => (
            <li key={record.studentId} className="rounded-[10px] border border-border bg-background p-3">
              <p className="text-sm font-semibold text-foreground">{record.fullName}</p>
              <p className="text-sm text-muted-foreground">{record.brief}</p>
              <p className="text-sm text-foreground" data-testid={`org-learner-email-${record.studentId}`}>
                {record.parentEmail}
              </p>
              {record.claimed ? null : (
                <form action={reinviteOrgLearnerAction} className="mt-2">
                  <input type="hidden" name="organizationId" value={organizationId} />
                  <input type="hidden" name="studentId" value={record.studentId} />
                  <Button type="submit" variant="outline">
                    Send the claim email again
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="org-scheduler-cards">
          {schedulerCards.map((card) => (
            <li key={card.studentId} className="rounded-[10px] border border-border bg-background p-3">
              <p className="text-sm font-semibold text-foreground">{card.fullName}</p>
              <p className="text-sm text-muted-foreground">{card.brief}</p>
              {card.blockedReason ? (
                <p className="text-sm text-foreground" data-testid={`org-learner-blocked-${card.studentId}`}>
                  {card.blockedReason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
