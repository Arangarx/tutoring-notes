"use client";

import { usePathname } from "next/navigation";

import { SiteFooter } from "@/components/SiteFooter";

/**
 * The document footer sits after page content. Admin pages pin the side nav
 * to the window and scroll only the column beside it, so the footer lives
 * inside that column instead of lengthening the document.
 */
export function DocumentSiteFooter({ buildShortSha }: { buildShortSha?: string }) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  return <SiteFooter buildShortSha={buildShortSha} />;
}
