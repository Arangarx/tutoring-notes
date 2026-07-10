import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SectionCardRealm = "admin" | "account";

const REALM_CARD_CLASS: Record<SectionCardRealm, string> = {
  admin: "border-border bg-card shadow-sm",
  account: "border-border bg-card shadow-sm",
};

type SectionCardProps = {
  realm: SectionCardRealm;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** For tests / anchors */
  id?: string;
  "data-testid"?: string;
};

export function SectionCard({
  realm,
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  id,
  "data-testid": dataTestId,
}: SectionCardProps) {
  return (
    <Card
      id={id}
      data-testid={dataTestId}
      data-realm={realm}
      className={cn(REALM_CARD_CLASS[realm], className)}
    >
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0 pb-0">
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle className="text-lg font-semibold text-foreground">{title}</CardTitle>
          {description ? (
            <CardDescription className="text-sm leading-relaxed">
              {description}
            </CardDescription>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className={cn("pt-4", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
