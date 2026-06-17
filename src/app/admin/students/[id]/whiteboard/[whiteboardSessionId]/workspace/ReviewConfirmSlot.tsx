"use client";

/**
 * Reserved placeholder for Phase 2 "Would you agree?" confirm section.
 */
export function ReviewConfirmSlot() {
  return (
    <div
      data-testid="wb-review-confirm-slot"
      aria-hidden="true"
      style={{
        minHeight: 80,
        border: "1px dashed var(--border)",
        borderRadius: 8,
        padding: "12px 14px",
        background: "var(--surface-muted, var(--card))",
        color: "var(--muted)",
        fontSize: 12,
      }}
    >
      Session insights — coming soon
    </div>
  );
}
