"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SubmitButtonProps {
  label: string;
  pendingLabel?: string;
  className?: string;
  variant?: "default" | "outline" | "destructive";
  /**
   * Caller-imposed disabled state, ORed with the in-flight `pending`
   * state. Used by forms that require an interactive precondition
   * (e.g. a consent checkbox) before submission is allowed.
   */
  disabled?: boolean;
  /** Passed to the native `<button>` (a11y). */
  "aria-label"?: string;
}

function variantFromLegacyClass(className?: string): "default" | "outline" | "destructive" {
  if (className?.includes("destructive")) return "destructive";
  if (className?.includes("primary") || className === "btn primary") return "default";
  if (className?.includes("btn") && !className.includes("primary")) return "outline";
  return "default";
}

export function SubmitButton({
  label,
  pendingLabel,
  className,
  variant: variantProp,
  disabled,
  "aria-label": ariaLabel,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const variant = variantProp ?? variantFromLegacyClass(className);

  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending || !!disabled}
      aria-label={ariaLabel}
      aria-busy={pending}
      className={cn("min-h-11", className?.includes("btn") ? undefined : className)}
    >
      {pending ? (pendingLabel ?? `${label}…`) : label}
    </Button>
  );
}
