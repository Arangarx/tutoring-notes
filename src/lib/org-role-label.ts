import type { OrganizationStatus, OrgRole } from "@prisma/client";

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  scheduler: "Scheduler",
  instructor: "Instructor",
};

const STATUS_LABEL: Record<OrganizationStatus, string> = {
  pending: "Pending",
  active: "Active",
  suspended: "Suspended",
};

export function orgRoleLabel(role: OrgRole): string {
  return ROLE_LABEL[role];
}

/** Plain list, in the order the roles were stored. */
export function formatOrgRoleList(roles: readonly OrgRole[]): string {
  return roles.map((role) => ROLE_LABEL[role]).join(", ");
}

/** Capitalized organization status. Callers never show the raw enum. */
export function formatOrganizationStatus(status: OrganizationStatus): string {
  return STATUS_LABEL[status];
}

/**
 * Staff and operator list meta. Roles, when present, follow the status:
 * "Active · Owner, Admin". No roles (operator list) is the status alone.
 */
export function formatOrganizationListMeta(
  status: OrganizationStatus,
  roles?: readonly OrgRole[]
): string {
  const label = formatOrganizationStatus(status);
  if (!roles || roles.length === 0) return label;
  return `${label} · ${formatOrgRoleList(roles)}`;
}
