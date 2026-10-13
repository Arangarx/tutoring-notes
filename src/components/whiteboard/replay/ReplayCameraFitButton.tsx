"use client";

/** Shared replay top-bar control. Session-local; both players mount this one button. */
export function ReplayCameraFitButton({
  pressed,
  onToggle,
}: {
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="mynk-wb-tb-btn"
      data-testid="wb-replay-camera-fit"
      aria-pressed={pressed}
      title={
        pressed
          ? "Use the tutor's zoom"
          : "Show the whole area the tutor was looking at"
      }
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      Fit view
    </button>
  );
}
