import type { ReactNode } from "react";

import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type LegalDocumentShellProps = {
  title: string;
  lastUpdated: string;
  children: ReactNode;
};

/**
 * Shared outer chrome for /privacy and /terms — MarketingHeader, page
 * container, card, document title, and "Last updated" line. Body copy stays
 * in each page (LEGAL-SYNC — do not move or alter legal content here).
 */
export function LegalDocumentShell({
  title,
  lastUpdated,
  children,
}: LegalDocumentShellProps) {
  return (
    <>
      <MarketingHeader />
      <main id="main-content" className="px-4 py-10">
        <div className="mx-auto w-full max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle className="heading text-3xl font-normal">{title}</CardTitle>
              <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {children}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
