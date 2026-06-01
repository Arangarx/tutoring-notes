import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/** Inline field/form error — §5.9 aria-invalid + describedby pattern. */
export function AuthFieldError({
  id,
  message,
  className,
}: {
  id: string;
  message: string;
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
      <span>{message}</span>
    </p>
  );
}
