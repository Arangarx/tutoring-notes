"use client";

import Link from "next/link";

import { StudentActions } from "@/app/admin/students/[id]/StudentActions";

type StudentOverflowActionsProps = {
  studentId: string;
  studentName: string;
  onClose?: () => void;
};

/** Mobile overflow sheet rows + inline header actions on desktop. */
export function StudentOverflowActions({
  studentId,
  studentName,
  onClose,
}: StudentOverflowActionsProps) {
  return (
    <>
      <div className="hidden md:contents">
        <StudentActions studentId={studentId} currentName={studentName} />
      </div>
      <div className="contents md:hidden">
        <Link
          href="/admin/outbox"
          className="flex min-h-[52px] w-full items-center justify-between py-3.5 text-[15px] text-foreground"
          onClick={onClose}
        >
          View outbox
        </Link>
        <div className="py-2">
          <StudentActions studentId={studentId} currentName={studentName} />
        </div>
      </div>
    </>
  );
}
