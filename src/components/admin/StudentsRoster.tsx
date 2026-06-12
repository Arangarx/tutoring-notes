"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";

import { StudentAvatar } from "@/components/admin/StudentAvatar";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createStudent } from "@/app/admin/students/actions";
import { SubmitButton } from "@/components/SubmitButton";

export type StudentRosterItem = {
  id: string;
  name: string;
  createdAt: string;
};

type StudentsRosterProps = {
  students: StudentRosterItem[];
};

function AddStudentForm({ idPrefix = "" }: { idPrefix?: string }) {
  return (
    <form action={createStudent} className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor={`${idPrefix}studentName`}>Student name</Label>
        <Input
          id={`${idPrefix}studentName`}
          name="name"
          placeholder="e.g. Jordan S."
          required
          className="min-h-11"
          autoComplete="off"
        />
      </div>
      <SubmitButton label="Add student" variant="default" className="min-h-11 sm:min-w-[140px]" />
    </form>
  );
}

export function StudentsRoster({ students }: StudentsRosterProps) {
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q));
  }, [students, query]);

  const onSlashFocus = useCallback((e: KeyboardEvent) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }
    e.preventDefault();
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", onSlashFocus);
    return () => window.removeEventListener("keydown", onSlashFocus);
  }, [onSlashFocus]);

  return (
    <div className="relative flex flex-col gap-6">
      {/* Desktop add card */}
      <div className="hidden md:block">
        <AdminSectionCard
          title="Add a student"
          description="Create a roster entry to start sessions and notes."
        >
          <AddStudentForm idPrefix="desktop-" />
        </AdminSectionCard>
      </div>

      {/* Sticky search toolbar */}
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-3 backdrop-blur-sm md:static md:mx-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex min-h-11 flex-1 items-center gap-2 rounded-[10px] border border-ring/40 bg-muted/40 px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Label htmlFor="student-search" className="sr-only">
              Search students
            </Label>
            <Input
              ref={searchRef}
              id="student-search"
              type="search"
              placeholder="Search students…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-10 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              aria-describedby="student-search-hint"
            />
          </div>
          <Button asChild variant="outline" className="hidden min-h-11 shrink-0 sm:inline-flex">
            <Link href="/admin/outbox">View outbox</Link>
          </Button>
          <p
            id="student-search-hint"
            className="text-xs text-muted-foreground sm:sr-only"
          >
            Press <kbd className="rounded border border-border px-1 font-mono text-[11px]">/</kbd>{" "}
            to focus search
          </p>
        </div>
      </div>

      {students.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center"
          role="status"
        >
          <p className="text-lg font-medium text-foreground">No students yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Add your first student to start recording sessions.
          </p>
          <Button
            type="button"
            className="mt-6 min-h-11 md:hidden"
            onClick={() => setSheetOpen(true)}
          >
            Add student
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          No students match &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0 md:gap-3">
          {filtered.map((s) => (
            <li key={s.id}>
              <Link
                href={`/admin/students/${s.id}`}
                className="group flex min-h-[60px] items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-sm transition-colors hover:border-ring hover:bg-card/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <StudentAvatar name={s.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-foreground group-hover:text-brand">
                    {s.name}
                  </div>
                  <div className="label-mono mt-0.5 text-[11px] text-muted-foreground">
                    Added {new Date(s.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <ChevronRight
                  className="size-[18px] shrink-0 text-muted-foreground group-hover:text-foreground"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Mobile FAB */}
      <Button
        type="button"
        size="icon"
        className="fixed bottom-6 right-4 z-20 size-14 rounded-full shadow-md md:hidden"
        aria-label="Add student"
        onClick={() => setSheetOpen(true)}
      >
        <Plus className="size-7" strokeWidth={1.5} />
      </Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-[20px] px-5 pb-8 pt-3">
          <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-border" aria-hidden />
          <SheetHeader className="text-left">
            <SheetTitle className="heading text-lg font-bold">Add a student</SheetTitle>
            <SheetDescription>
              Create a roster entry to start sessions and notes.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <AddStudentForm idPrefix="sheet-" />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
