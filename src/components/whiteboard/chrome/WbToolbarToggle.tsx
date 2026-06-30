"use client";

import "./WbToolbarToggle.css";

export type WbToolbarToggleProps = {
  testId: string;
  toolbarHidden: boolean;
  onToggle: (e: React.MouseEvent<HTMLButtonElement>) => void;
};

/** Live top-bar toolbar hide/show disclosure — tutor and student chrome. */
export function WbToolbarToggle({
  testId,
  toolbarHidden,
  onToggle,
}: WbToolbarToggleProps) {
  return (
    <button
      type="button"
      className="mynk-wb-toolbar-toggle"
      data-testid={testId}
      aria-pressed={toolbarHidden}
      title={toolbarHidden ? "Show tools" : "Hide tools"}
      onClick={onToggle}
    >
      <span className="mynk-wb-toolbar-toggle__label">
        {toolbarHidden ? "Show tools" : "Hide tools"}
      </span>
      <span className="mynk-wb-toolbar-toggle__chev" aria-hidden>
        {toolbarHidden ? "▴" : "▾"}
      </span>
    </button>
  );
}
