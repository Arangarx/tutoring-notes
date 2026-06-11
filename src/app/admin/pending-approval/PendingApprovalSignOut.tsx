"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function PendingApprovalSignOut() {
  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      Sign out
    </Button>
  );
}
