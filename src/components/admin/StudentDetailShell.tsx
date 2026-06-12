"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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

const DESKTOP_SECTION_QUERY = "(min-width: 768px)";

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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const scrollSpyLockRef = useRef(false);
  const scrollSpyUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const setSectionRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      sectionRefs.current.set(id, el);
    } else {
      sectionRefs.current.delete(id);
    }
  }, []);

  const scrollToSection = useCallback((id: string) => {
    const container = scrollContainerRef.current;
    const section = sectionRefs.current.get(id);
    if (!container || !section) return;

    scrollSpyLockRef.current = true;
    if (scrollSpyUnlockTimerRef.current) {
      clearTimeout(scrollSpyUnlockTimerRef.current);
    }

    const containerTop = container.getBoundingClientRect().top;
    const sectionTop = section.getBoundingClientRect().top;
    const targetTop = sectionTop - containerTop + container.scrollTop;

    container.scrollTo({ top: targetTop, behavior: "smooth" });
    setActiveTab(id);

    scrollSpyUnlockTimerRef.current = setTimeout(() => {
      scrollSpyLockRef.current = false;
    }, 600);
  }, []);

  const handleTabClick = useCallback(
    (id: string) => {
      if (typeof window !== "undefined" && window.matchMedia(DESKTOP_SECTION_QUERY).matches) {
        scrollToSection(id);
        return;
      }
      setActiveTab(id);
    },
    [scrollToSection]
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const mq = window.matchMedia(DESKTOP_SECTION_QUERY);

    const pickActiveFromScroll = () => {
      if (!mq.matches || scrollSpyLockRef.current) return;

      const containerRect = container.getBoundingClientRect();
      const anchor = containerRect.top + containerRect.height * 0.25;

      let bestId: string | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const section of sections) {
        const el = sectionRefs.current.get(section.id);
        if (!el) continue;

        const rect = el.getBoundingClientRect();
        if (rect.bottom <= containerRect.top + 8) continue;
        if (rect.top >= containerRect.bottom - 8) continue;

        const distance = Math.abs(rect.top - anchor);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = section.id;
        }
      }

      if (bestId) {
        setActiveTab(bestId);
      }
    };

    const observer = new IntersectionObserver(
      () => {
        pickActiveFromScroll();
      },
      {
        root: container,
        rootMargin: "-12% 0px -55% 0px",
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      }
    );

    const observeSections = () => {
      observer.disconnect();
      if (!mq.matches) return;
      sectionRefs.current.forEach((el) => observer.observe(el));
      pickActiveFromScroll();
    };

    observeSections();
    container.addEventListener("scroll", pickActiveFromScroll, { passive: true });

    const onMqChange = () => {
      observeSections();
      if (!mq.matches) {
        setActiveTab(sections[0]?.id ?? "session");
      }
    };

    mq.addEventListener("change", onMqChange);

    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", pickActiveFromScroll);
      mq.removeEventListener("change", onMqChange);
      if (scrollSpyUnlockTimerRef.current) {
        clearTimeout(scrollSpyUnlockTimerRef.current);
      }
    };
  }, [sections]);

  return (
    <div className="flex flex-col pb-20 md:h-[calc(100dvh-4rem)] md:min-h-0 md:pb-0">
      <div className="shrink-0">
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

        <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-brand px-4 py-4 sm:flex-row sm:items-center md:mx-0">
          <div className="min-w-0 flex-1">
            <p className="label-mono m-0 text-[10px] text-[color:var(--brand-on)]/70">
              Ready to teach
            </p>
            <p className="mt-1 text-[13px] text-[color:var(--brand-on)]/90">
              Start a whiteboard session to record and generate notes.
            </p>
          </div>
          <div className="hidden shrink-0 md:block [&_button]:whitespace-nowrap">{stickyCta}</div>
        </div>

        <div
          className="mb-0 hidden gap-1 overflow-x-auto border-b border-border pb-3 md:flex"
          role="tablist"
          aria-label="Student sections"
        >
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={`student-tab-${s.id}`}
              aria-selected={activeTab === s.id}
              aria-controls={`student-section-${s.id}`}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium whitespace-nowrap transition-colors",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                activeTab === s.id
                  ? "bg-accent-soft text-accent-text"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
              onClick={() => handleTabClick(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="hidden min-h-0 flex-1 flex-col gap-4 overflow-y-auto pt-4 md:flex"
      >
        {sections.map((s) => (
          <section
            key={s.id}
            ref={(el) => setSectionRef(s.id, el)}
            id={`student-section-${s.id}`}
            data-section={s.id}
            role="tabpanel"
            aria-labelledby={`student-tab-${s.id}`}
            className="rounded-2xl border border-border bg-card p-[18px] shadow-sm md:p-5"
          >
            {s.content}
          </section>
        ))}
      </div>

      <div className="flex flex-col gap-3.5 md:hidden">
        {sections.map((s) => (
          <section
            key={s.id}
            id={`student-section-mobile-${s.id}`}
            data-section={s.id}
            className={cn(
              "rounded-2xl border border-border bg-card p-[18px] shadow-sm",
              activeTab !== s.id && "hidden"
            )}
            aria-label={s.label}
          >
            {s.content}
          </section>
        ))}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-14 z-10 bg-gradient-to-t from-background from-30% to-transparent px-4 pb-3 pt-6 md:hidden">
        <div className="pointer-events-auto [&_button]:whitespace-nowrap">{stickyCta}</div>
      </div>

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
            onClick={() => handleTabClick(s.id)}
            aria-current={activeTab === s.id ? "page" : undefined}
          >
            <span className="flex h-[18px] items-center">{s.icon}</span>
            {s.mobileLabel}
          </button>
        ))}
      </nav>

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
