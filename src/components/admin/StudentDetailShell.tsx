"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

import { StudentAvatar } from "@/components/admin/StudentAvatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type StudentDetailShellProps = {
  studentName: string;
  meta: ReactNode;
  overflow: ReactNode;
  children: ReactNode;
};

export function StudentDetailShell({
  studentName,
  meta,
  overflow,
  children,
}: StudentDetailShellProps) {
  const [actionsOpen, setActionsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-3">
        <Link
          href="/admin/students"
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
        >
          ← Students
        </Link>
        <div className="flex items-start gap-4">
          <StudentAvatar name={studentName} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="heading text-2xl font-normal tracking-tight text-foreground md:text-3xl">
              {studentName}
            </h1>
            <div className="label-mono mt-1 text-xs text-muted-foreground md:text-sm">{meta}</div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10 shrink-0 rounded-[10px]"
            aria-label="More actions"
            onClick={() => setActionsOpen(true)}
          >
            <MoreHorizontal className="size-5" />
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-6" data-testid="student-detail-column">
        {children}
      </div>

      <Sheet open={actionsOpen} onOpenChange={setActionsOpen}>
        <SheetContent side="bottom" className="rounded-t-[20px] px-0 pb-8 pt-3">
          <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-border" aria-hidden />
          <SheetHeader className="sr-only">
            <SheetTitle>Student actions</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-5">{overflow}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
