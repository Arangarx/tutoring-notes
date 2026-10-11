"use client";

import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";

export function OrgInviteSignOutButton({ callbackUrl }: { callbackUrl: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11"
      onClick={() => signOut({ callbackUrl })}
    >
      Sign out
    </Button>
  );
}
