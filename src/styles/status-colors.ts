/** Shared semantic badge / banner colors — use CSS tokens only. */
export const statusBadge = {
  green: {
    bg: "var(--success-soft)",
    fg: "var(--success)",
    dot: "var(--success)",
  },
  amber: {
    bg: "var(--warning-soft)",
    fg: "var(--warning)",
    dot: "var(--warning)",
  },
  red: {
    bg: "var(--error-soft)",
    fg: "var(--error)",
    dot: "var(--error)",
  },
  grey: {
    bg: "var(--badge-neutral-bg)",
    fg: "var(--badge-neutral-fg)",
    dot: "var(--badge-neutral-dot)",
  },
  blue: {
    bg: "var(--info-soft)",
    fg: "var(--info)",
    dot: "var(--info)",
  },
} as const;

export const alertSurface = {
  error: { bg: "var(--error-soft)", border: "var(--error-border)" },
  warning: { bg: "var(--warning-soft)", border: "var(--warning-border)" },
  info: { bg: "var(--info-soft)", border: "var(--info-border)" },
} as const;
