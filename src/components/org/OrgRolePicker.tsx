"use client";

import { useState } from "react";
import type { OrgRole } from "@prisma/client";

import { CheckboxField } from "@/components/ui/checkbox";
import { orgRoleLabel } from "@/lib/org-role-label";

export function OrgRolePicker({
  allowed,
  selected,
  idPrefix,
}: {
  allowed: OrgRole[];
  selected: OrgRole[];
  idPrefix: string;
}) {
  const [roles, setRoles] = useState<OrgRole[]>(
    selected.filter((role) => allowed.includes(role))
  );

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">Roles</legend>
      <div className="flex flex-col gap-2">
        {allowed.map((role) => (
          <CheckboxField
            key={role}
            id={`${idPrefix}-${role}`}
            label={orgRoleLabel(role)}
            checked={roles.includes(role)}
            onCheckedChange={(checked) => {
              setRoles((current) =>
                checked === true
                  ? current.includes(role)
                    ? current
                    : [...current, role]
                  : current.filter((item) => item !== role)
              );
            }}
          />
        ))}
      </div>
      {roles.map((role) => (
        <input key={role} type="hidden" name="roles" value={role} />
      ))}
    </fieldset>
  );
}
