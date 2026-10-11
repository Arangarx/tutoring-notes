import {
  activateOrganizationAction,
  saveOrganizationCapsAction,
} from "@/app/admin/orgs/actions";
import { TutorWaitlistActions } from "@/app/admin/tutor-approvals/TutorWaitlistActions";
import { OrgDailyCapFields } from "@/components/org/OrgDailyCapFields";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { orgInviteLimitSentence, orgStatusSentence } from "@/lib/org-staff-messages";

type WaitlistedTutor = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
};

export function OrgActivationPanel({
  organizationId,
  status,
  dailyInviteCap,
  maxMembers,
  waitlisted,
  returnTo,
}: {
  organizationId: string;
  status: "pending" | "active" | "suspended";
  dailyInviteCap: number | null;
  maxMembers: number | null;
  waitlisted: WaitlistedTutor[];
  returnTo: string;
}) {
  return (
    <>
      <SectionCard
        realm="admin"
        title="Status"
        description="Activation and the daily invite limit."
        data-testid="org-activation"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground" data-testid="org-status">
            {orgStatusSentence(status)}
          </p>
          <p className="text-sm text-muted-foreground" data-testid="org-invite-limit">
            {orgInviteLimitSentence(dailyInviteCap)}
          </p>
          {status !== "active" ? (
            <form action={activateOrganizationAction}>
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <Button type="submit" data-testid="org-activate">
                Activate organization
              </Button>
            </form>
          ) : null}
          <form action={saveOrganizationCapsAction} className="flex flex-col gap-3">
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="maxMembers" value={maxMembers ?? ""} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <OrgDailyCapFields current={dailyInviteCap} />
            <Button type="submit" variant="outline">
              Save invite limit
            </Button>
          </form>
        </div>
      </SectionCard>

      {status === "active" ? (
        <SectionCard
          realm="admin"
          title="Waiting for approval"
          description="These people joined while the organization was pending. Activating the organization does not approve them."
          contentClassName="p-0"
          data-testid="org-waitlist"
        >
          {waitlisted.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No one is waiting for approval.</p>
          ) : (
            <ul className="divide-y divide-border" role="list">
              {waitlisted.map((tutor) => (
                <li
                  key={tutor.id}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                  data-testid={`org-waitlist-row-${tutor.id}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{tutor.email}</p>
                    {tutor.displayName ? (
                      <p className="text-sm text-muted-foreground">{tutor.displayName}</p>
                    ) : null}
                  </div>
                  <TutorWaitlistActions adminUserId={tutor.id} tutorEmail={tutor.email} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ) : null}
    </>
  );
}
