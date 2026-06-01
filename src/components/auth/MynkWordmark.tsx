import { cn } from "@/lib/utils";

/** Fraunces V4 wordmark — "Mynk·" per brand spec §3. */
export function MynkWordmark({
  className,
  size = "auth",
}: {
  className?: string;
  size?: "auth" | "sm";
}) {
  return (
    <p
      className={cn(
        "wordmark text-balance",
        size === "auth" ? "text-[1.75rem]" : "text-xl",
        className
      )}
      aria-hidden
    >
      Mynk<span className="wordmark-dot">·</span>
    </p>
  );
}
