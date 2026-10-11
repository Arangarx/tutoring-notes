import type { OrgRole } from "@prisma/client";

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  scheduler: "Scheduler",
  instructor: "Instructor",
};

export function orgRoleLabel(role: OrgRole): string {
  return ROLE_LABEL[role];
}

/** Plain list, in the order the roles were stored. */
export function formatOrgRoleList(roles: OrgRole[]): string {
  return roles.map((role) => ROLE_LABEL[role]).join(", ");
}
