"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { PageViewState } from "@/lib/whiteboard/board-document-snapshot";

export type PageStripRow = {
  id: string;
  title: string;
  section?: string;
  /** Tutor-authoritative; ignored by strip UI. */
  viewState?: PageViewState;
};

export type PageStripProps = {
  variant: "tutor" | "student";
  /** Whiteboard session id — collapse prefs + structured logs */
  sessionId: string;
  pageList: PageStripRow[];
  sections?: Record<string, { label: string }>;
  activePageId: string;
  disabled?: boolean;
  maxPages?: number;
  onSelectPage?: (id: string) => void | Promise<void>;
  onAddPage?: () => void;
  onRemovePage?: (id: string) => void;
};

function collapsedStorageKey(sessionId: string, sectionId: string): string {
  return `wb-section-collapsed:${sessionId}:${sectionId}`;
}

type Group =
  | { kind: "standalone"; row: PageStripRow }
  | { kind: "section"; sectionId: string; pages: PageStripRow[] };

function buildGroups(pageList: PageStripRow[]): Group[] {
  const groups: Group[] = [];
  let i = 0;
  while (i < pageList.length) {
    const p = pageList[i]!;
    if (!p.section) {
      groups.push({ kind: "standalone", row: p });
      i++;
      continue;
    }
    const sid = p.section;
    const pages: PageStripRow[] = [];
    while (i < pageList.length && pageList[i]!.section === sid) {
      pages.push(pageList[i]!);
      i++;
    }
    groups.push({ kind: "section", sectionId: sid, pages });
  }
  return groups;
}

export function PageStrip(props: PageStripProps) {
  const {
    variant,
    sessionId,
    pageList,
    sections,
    activePageId,
    disabled,
    maxPages = 20,
    onSelectPage,
    onAddPage,
    onRemovePage,
  } = props;

  const groups = useMemo(() => buildGroups(pageList), [pageList]);

  const sectionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of groups) {
      if (g.kind === "section") ids.add(g.sectionId);
    }
    return [...ids];
  }, [groups]);

  const [collapsePrefCollapsed, setCollapsePrefCollapsed] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    setCollapsePrefCollapsed((prev) => {
      const next = { ...prev };
      for (const sid of sectionIds) {
        if (!(sid in next)) {
          next[sid] =
            typeof window !== "undefined" &&
            window.localStorage.getItem(collapsedStorageKey(sessionId, sid)) ===
              "true";
        }
      }
      return next;
    });
  }, [sectionIds, sessionId]);

  const toggleSection = useCallback(
    (sectionId: string, pages: PageStripRow[]) => {
      setCollapsePrefCollapsed((prev) => {
        const pref = prev[sectionId] ?? false;
        const nextPref = !pref;
        try {
          window.localStorage.setItem(
            collapsedStorageKey(sessionId, sectionId),
            nextPref ? "true" : "false"
          );
        } catch {
          //
        }
        const activeInside = pages.some((p) => p.id === activePageId);
        const effectiveAfter = nextPref && !activeInside;
        console.info(
          `[whiteboard] wbsid=${sessionId} pdf-section-toggle sectionId=${sectionId} collapsed=${effectiveAfter}`
        );
        return { ...prev, [sectionId]: nextPref };
      });
    },
    [activePageId, sessionId]
  );

  const tutorExtras = variant === "tutor";

  return (
    <div
      className="row"
      style={{
        gap: 6,
        flexWrap: "wrap",
        alignItems: "stretch",
      }}
    >
      {groups.map((g, gi) => {
        if (g.kind === "standalone") {
          const p = g.row;
          return (
            <PageChip
              key={`p-${p.id}-${gi}`}
              title={p.title}
              active={p.id === activePageId}
              disabled={disabled || p.id === activePageId}
              indented={false}
              allowRemove={
                tutorExtras && !!onRemovePage && pageList.length > 1
              }
              onRemove={
                onRemovePage ? () => onRemovePage(p.id) : undefined
              }
              onClick={
                onSelectPage ? () => void onSelectPage(p.id) : undefined
              }
            />
          );
        }

        const sectionLabel =
          sections?.[g.sectionId]?.label ?? "PDF";
        const pref = collapsePrefCollapsed[g.sectionId] ?? false;
        const activeInside = g.pages.some((p) => p.id === activePageId);
        const effectiveCollapsed = pref && !activeInside;

        return (
          <div
            key={`sec-${g.sectionId}-${gi}`}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              width: "100%",
            }}
          >
            <button
              type="button"
              className="btn"
              disabled={disabled}
              onClick={() => toggleSection(g.sectionId, g.pages)}
              style={{
                justifyContent: "flex-start",
                textAlign: "left",
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                fontWeight: 600,
                fontSize: 13,
              }}
              data-testid={`wb-section-header-${g.sectionId}`}
            >
              <span aria-hidden style={{ marginRight: 6 }}>
                {effectiveCollapsed ? "\u25b8" : "\u25be"}
              </span>
              {sectionLabel}
              <span className="muted" style={{ marginLeft: 8, fontWeight: 400 }}>
                · {g.pages.length} pages
              </span>
            </button>
            {!effectiveCollapsed &&
              g.pages.map((p) => (
                <PageChip
                  key={p.id}
                  title={p.title}
                  active={p.id === activePageId}
                  disabled={disabled || p.id === activePageId}
                  indented
                  allowRemove={
                    tutorExtras && !!onRemovePage && pageList.length > 1
                  }
                  onRemove={
                    onRemovePage ? () => onRemovePage(p.id) : undefined
                  }
                  onClick={
                    onSelectPage ? () => void onSelectPage(p.id) : undefined
                  }
                />
              ))}
          </div>
        );
      })}
      {tutorExtras && onAddPage && (
        <button
          type="button"
          className="btn primary"
          onClick={onAddPage}
          disabled={disabled || pageList.length >= maxPages}
        >
          + Add page
        </button>
      )}
    </div>
  );
}

function PageChip(props: {
  title: string;
  active: boolean;
  disabled: boolean;
  indented: boolean;
  allowRemove?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
}) {
  const {
    title,
    active,
    disabled,
    indented,
    allowRemove,
    onRemove,
    onClick,
  } = props;

  if (!onClick) {
    return (
      <span
        className="btn"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          pointerEvents: "none",
          opacity: active ? 1 : 0.75,
          fontWeight: active ? 700 : 400,
          borderWidth: active ? 2 : 1,
          borderColor: "var(--border-strong)",
          cursor: "default",
          paddingLeft: indented ? 18 : undefined,
        }}
        aria-current={active ? "true" : undefined}
      >
        {title}
      </span>
    );
  }

  return (
    <div
      className="row"
      style={{
        gap: 4,
        alignItems: "center",
        paddingLeft: indented ? 12 : 0,
      }}
    >
      <button
        type="button"
        className="btn"
        onClick={onClick}
        disabled={disabled}
        style={
          active
            ? {
                fontWeight: 700,
                borderWidth: 2,
                borderColor: "var(--border-strong)",
              }
            : undefined
        }
      >
        {title}
      </button>
      {allowRemove && onRemove && (
        <button
          type="button"
          className="btn"
          aria-label={`Remove ${title}`}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{ fontSize: 12, padding: "2px 8px" }}
        >
          ×
        </button>
      )}
    </div>
  );
}
