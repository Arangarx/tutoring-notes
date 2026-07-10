import type React from "react";
import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/** Inline field/form error — §5.9 aria-invalid + describedby pattern.
 *
 * Either `message` (plain string) or `children` (rich content with links)
 * can be provided; `children` takes precedence when both are present.
 */
export function AuthFieldError({
  id,
  message,
  children,
  className,
}: {
  id: string;
  message?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      id={id}
      role="alert"
      className={cn(
        "flex items-start gap-2 text-sm text-destructive",
        className
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children ?? message}</span>
    </p>
  );
}
