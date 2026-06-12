"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface NotesSearchBarProps {
  placeholder?: string;
  /** aria-label for the input */
  label?: string;
  className?: string;
}

/**
 * URL-driven search bar for the notes history page.
 * Updates the `q` search param and resets `page` to 1 on each change.
 */
export function NotesSearchBar({
  placeholder = "Search notes…",
  label = "Search notes",
  className,
}: NotesSearchBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const params = new URLSearchParams(searchParams.toString());
      const val = e.target.value.trim();
      if (val) {
        params.set("q", val);
      } else {
        params.delete("q");
      }
      params.delete("page"); // reset to page 1 on new search
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, searchParams]
  );

  return (
    <div className={cn("relative min-w-[180px] flex-1", className)}>
      <label htmlFor="notes-search" className="sr-only">
        {label}
      </label>
      <Input
        id="notes-search"
        type="search"
        aria-label={label}
        defaultValue={searchParams.get("q") ?? ""}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn(isPending && "pr-8")}
      />
      {isPending ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground opacity-50"
        >
          …
        </span>
      ) : null}
    </div>
  );
}
