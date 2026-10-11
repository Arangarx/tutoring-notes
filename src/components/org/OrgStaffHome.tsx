import {
  inviteStaffAction,
  removeStaffMemberAction,
  revokeStaffInviteAction,
  setStaffRolesAction,
} from "@/app/admin/organization/actions";
import { OrgActivationPanel } from "@/components/org/OrgActivationPanel";
import { OrgRolePicker } from "@/components/org/OrgRolePicker";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatOrgRoleList } from "@/lib/org-role-label";
import { orgStatusSentence } from "@/lib/org-staff-messages";
import type { OrgStaffHomeData } from "@/lib/org-scope";

export function OrgStaffHome({
  data,
  canActivate,
  error,
}: {
  data: OrgStaffHomeData;
  canActivate: boolean;
  error: string | null;
}) {
  const canManage = data.actor.roles.includes("owner") || data.actor.roles.includes("admin");
  const waitlisted = data.members
    .filter((member) => member.adminUser.approvalStatus === "WAITLISTED")
    .map((member) => member.adminUser);

  return (
    <div className="flex flex-col gap-6" data-testid="org-staff-home">
      {error ? (
        <p className="text-sm text-destructive" role="alert" data-testid="org-staff-error">
          {error}
        </p>
      ) : null}

      {canActivate ? (
        <OrgActivationPanel
          organizationId={data.org.id}
          status={data.org.status}
          dailyInviteCap={data.org.dailyInviteCap}
          maxMembers={data.org.maxMembers}
          waitlisted={waitlisted}
          returnTo={`/admin/organization/${data.org.id}`}
        />
      ) : (
        <SectionCard realm="admin" title="Status" data-testid="org-status-card">
          <p className="text-sm text-foreground" data-testid="org-status">
            {orgStatusSentence(data.org.status)}
          </p>
        </SectionCard>
      )}

      <SectionCard
        realm="admin"
        title="Members"
        contentClassName="p-0"
        data-testid="org-members"
      >
        <ul className="divide-y divide-border" role="list">
          {data.members.map((member) => (
            <li key={member.id} className="flex flex-col gap-3 px-4 py-3" data-testid={`org-member-${member.adminUser.id}`}>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{member.adminUser.email}</p>
                <p className="text-sm text-muted-foreground">{formatOrgRoleList(member.roles)}</p>
              </div>
              {canManage &&
              (data.actor.roles.includes("owner") ||
                member.roles.every((role) => data.grantable.includes(role))) ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <form action={setStaffRolesAction} className="flex flex-col gap-3">
                    <input type="hidden" name="organizationId" value={data.org.id} />
                    <input type="hidden" name="adminUserId" value={member.adminUser.id} />
                    <OrgRolePicker
                      allowed={data.grantable}
                      selected={member.roles}
                      idPrefix={`roles-${member.id}`}
                    />
                    <Button type="submit" variant="outline" size="sm">
                      Save roles
                    </Button>
                  </form>
                  <form action={removeStaffMemberAction}>
                    <input type="hidden" name="organizationId" value={data.org.id} />
                    <input type="hidden" name="adminUserId" value={member.adminUser.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Remove from organization
                    </Button>
                  </form>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        realm="admin"
        title="Invitations"
        description="Owner and admin can invite. Scheduler and instructor cannot."
        data-testid="org-invites"
      >
        <div className="flex flex-col gap-4">
          {data.invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invitations are waiting.</p>
          ) : (
            <ul className="divide-y divide-border" role="list">
              {data.invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex items-start justify-between gap-3 py-3"
                  data-testid={`org-invite-row-${invite.id}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{invite.email}</p>
                    <p className="text-sm text-muted-foreground">{formatOrgRoleList(invite.roles)}</p>
                  </div>
                  {canManage ? (
                    <form action={revokeStaffInviteAction}>
                      <input type="hidden" name="organizationId" value={data.org.id} />
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <Button type="submit" variant="outline" size="sm" data-testid="org-revoke-invite">
                        Revoke invitation
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canManage ? (
            <form action={inviteStaffAction} className="flex flex-col gap-3" data-testid="org-invite-form">
              <input type="hidden" name="organizationId" value={data.org.id} />
              <div className="space-y-2">
                <Label htmlFor="org-invite-email">Email</Label>
                <Input id="org-invite-email" name="email" type="email" required autoComplete="off" />
              </div>
              <OrgRolePicker
                allowed={data.grantable}
                selected={["instructor"]}
                idPrefix="invite-roles"
              />
              <Button type="submit">Send invitation</Button>
            </form>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
