"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

interface PageSizeSelectProps {
  defaultSize?: number;
}

/**
 * Dropdown for choosing how many notes to show per page.
 * Updates the `size` search param and resets `page` to 1 on change.
 */
export function PageSizeSelect({ defaultSize = 20 }: PageSizeSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = String(Number(searchParams.get("size") ?? defaultSize));

  const handleChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("size", value);
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Label htmlFor="page-size-select" className="text-[13px] whitespace-nowrap">
        Per page:
      </Label>
      <Select value={current} onValueChange={handleChange}>
        <SelectTrigger id="page-size-select" className="w-[72px]" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAGE_SIZE_OPTIONS.map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
