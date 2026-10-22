"use client";

import type { KeyboardEvent, ReactNode, Ref } from "react";
import "./graph-embeddable.css";

const PLACEHOLDER = "2x+1";
const HELP = "Uses standard function notation (x as the variable).";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  inputTestId: string;
  prefixTestId: string;
  inputId?: string;
  inputRef?: Ref<HTMLInputElement>;
  trailing?: ReactNode;
  autoFocus?: boolean;
  showHelp?: boolean;
  /** Dialog keeps the larger entry. The on-graph panel stays compact. */
  size?: "compact" | "dialog";
};

export function GraphExpressionPrefix({ testId }: { testId?: string }) {
  return (
    <span
      aria-hidden="true"
      className="wb-graph-expr-entry-prefix"
      data-testid={testId}
    >
      y=
    </span>
  );
}

export function GraphExpressionEntry({
  value,
  onChange,
  onKeyDown,
  onBlur,
  inputTestId,
  prefixTestId,
  inputId,
  inputRef,
  trailing,
  autoFocus,
  showHelp = true,
  size = "compact",
}: Props) {
  return (
    <div
      className={
        size === "dialog"
          ? "wb-graph-expr-entry wb-graph-expr-entry--dialog"
          : "wb-graph-expr-entry"
      }
    >
      <div className="wb-graph-expr-entry-line">
        <GraphExpressionPrefix testId={prefixTestId} />
        <input
          ref={inputRef}
          id={inputId}
          className="wb-graph-expr-input"
          type="text"
          value={value}
          placeholder={PLACEHOLDER}
          autoFocus={autoFocus}
          aria-label="Expression, y equals"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          data-testid={inputTestId}
        />
        {trailing}
      </div>
      {showHelp ? <p className="wb-graph-expr-entry-help">{HELP}</p> : null}
    </div>
  );
}
