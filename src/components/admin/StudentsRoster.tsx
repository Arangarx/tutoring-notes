"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StudentAvatar } from "@/components/admin/StudentAvatar";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function StudentsRoster({ students }: StudentsRosterProps) {
  const [query, setQuery] = useState("");
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
    <div className="flex flex-col gap-6">
      <AdminSectionCard title="Add a student" description="Create a roster entry to start sessions and notes.">
        <form action={createStudent} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="studentName">Student name</Label>
            <Input
              id="studentName"
              name="name"
              placeholder="e.g. Jordan S."
              required
              className="min-h-11"
              autoComplete="off"
            />
          </div>
          <SubmitButton label="Add student" className="primary" />
        </form>
      </AdminSectionCard>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            className="min-h-11 sm:max-w-xs"
            aria-describedby="student-search-hint"
          />
          <p id="student-search-hint" className="text-xs text-muted-foreground sm:text-right">
            Press <kbd className="rounded border border-border px-1 font-mono text-[11px]">/</kbd>{" "}
            to focus search
          </p>
        </div>

        {students.length === 0 ? (
          <div
            className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center"
            role="status"
          >
            <p className="text-lg font-medium text-foreground">No students yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Add your first student to start recording sessions.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground" role="status">
            No students match &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {filtered.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/admin/students/${s.id}`}
                  className="group flex min-h-11 items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:border-ring hover:bg-card/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <StudentAvatar name={s.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-foreground group-hover:text-brand">
                      {s.name}
                    </div>
                    <div className="label-mono mt-0.5 text-xs text-muted-foreground">
                      Added {new Date(s.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground group-hover:text-foreground">
                    Open →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
