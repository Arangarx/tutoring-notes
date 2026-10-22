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
};

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
}: Props) {
  return (
    <div className="wb-graph-expr-entry">
      <div className="wb-graph-expr-entry-line">
        <span
          aria-hidden="true"
          className="wb-graph-expr-entry-prefix"
          data-testid={prefixTestId}
        >
          y=
        </span>
        <input
          ref={inputRef}
          id={inputId}
          className="wb-graph-expr-input"
          type="text"
          value={value}
          placeholder={PLACEHOLDER}
          autoFocus={autoFocus}
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
