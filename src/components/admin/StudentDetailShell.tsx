"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  LayoutGrid,
  Link2,
  FileText,
  MoreHorizontal,
} from "lucide-react";

import { StudentAvatar } from "@/components/admin/StudentAvatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type StudentDetailSection = {
  id: string;
  label: string;
  mobileLabel: string;
  icon: ReactNode;
  content: ReactNode;
};

type StudentDetailShellProps = {
  studentId: string;
  studentName: string;
  meta: ReactNode;
  headerActions: ReactNode;
  overflowActions: ReactNode;
  stickyCta: ReactNode;
  sections: StudentDetailSection[];
};

const defaultIcons = {
  session: <LayoutGrid className="size-[18px]" aria-hidden />,
  share: <Link2 className="size-[18px]" aria-hidden />,
  notes: <FileText className="size-[18px]" aria-hidden />,
  more: <MoreHorizontal className="size-[18px]" aria-hidden />,
};

export function StudentDetailShell({
  studentName,
  meta,
  headerActions,
  overflowActions,
  stickyCta,
  sections,
}: StudentDetailShellProps) {
  const [activeTab, setActiveTab] = useState(sections[0]?.id ?? "session");
  const [actionsOpen, setActionsOpen] = useState(false);

  return (
    <div className="flex flex-col pb-20 md:pb-0">
      <header className="mb-4 space-y-3 md:mb-6">
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
          <div className="hidden shrink-0 flex-wrap items-center gap-2 md:flex">{headerActions}</div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10 shrink-0 rounded-[10px] md:hidden"
            aria-label="More actions"
            onClick={() => setActionsOpen(true)}
          >
            <MoreHorizontal className="size-5" />
          </Button>
        </div>
      </header>

      {/* CTA banner */}
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 md:mx-0">
        <p className="flex-1 text-[13px] text-muted-foreground">
          Start a whiteboard session to record and generate notes.
        </p>
        <div className="hidden shrink-0 md:block">{stickyCta}</div>
      </div>

      {/* Desktop section tabs */}
      <div
        className="mb-4 hidden gap-1 overflow-x-auto border-b border-border pb-3 md:flex"
        role="tablist"
        aria-label="Student sections"
      >
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={activeTab === s.id}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              activeTab === s.id
                ? "bg-accent-soft text-accent-text"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
            onClick={() => setActiveTab(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Sections — desktop: all visible; mobile: one at a time */}
      <div className="flex flex-col gap-3.5 md:gap-4">
        {sections.map((s) => (
          <section
            key={s.id}
            id={`student-section-${s.id}`}
            data-section={s.id}
            className={cn(
              "rounded-2xl border border-border bg-card p-[18px] shadow-sm md:p-5",
              activeTab !== s.id && "hidden md:block"
            )}
            aria-label={s.label}
          >
            {s.content}
          </section>
        ))}
      </div>

      {/* Mobile sticky CTA */}
      <div className="pointer-events-none fixed inset-x-0 bottom-14 z-10 bg-gradient-to-t from-background from-30% to-transparent px-4 pb-3 pt-6 md:hidden">
        <div className="pointer-events-auto">{stickyCta}</div>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex h-14 items-stretch border-t border-border bg-card md:hidden"
        aria-label="Student sections"
      >
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
              activeTab === s.id ? "text-accent-text" : "text-muted-foreground"
            )}
            onClick={() => setActiveTab(s.id)}
            aria-current={activeTab === s.id ? "page" : undefined}
          >
            <span className="flex h-[18px] items-center">{s.icon}</span>
            {s.mobileLabel}
          </button>
        ))}
      </nav>

      {/* Mobile overflow actions sheet */}
      <Sheet open={actionsOpen} onOpenChange={setActionsOpen}>
        <SheetContent side="bottom" className="rounded-t-[20px] px-0 pb-8 pt-3">
          <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-border" aria-hidden />
          <SheetHeader className="sr-only">
            <SheetTitle>Student actions</SheetTitle>
          </SheetHeader>
          <div className="divide-y divide-border px-5">{overflowActions}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export { defaultIcons };
