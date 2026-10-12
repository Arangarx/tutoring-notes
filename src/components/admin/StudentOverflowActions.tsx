"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StudentActions } from "@/app/admin/students/[id]/StudentActions";

type StudentOverflowActionsProps = {
  studentId: string;
  studentName: string;
};

/** Rename, Delete, and Outbox. Same menu on phone and desktop. */
export function StudentOverflowActions({
  studentId,
  studentName,
}: StudentOverflowActionsProps) {
  return (
    <>
      <Button asChild variant="outline" className="min-h-11 w-full justify-start">
        <Link href="/admin/outbox">Outbox</Link>
      </Button>
      <StudentActions studentId={studentId} currentName={studentName} />
    </>
  );
}
