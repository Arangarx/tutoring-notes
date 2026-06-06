import type { ReactNode } from "react";
import Link from "next/link";

import { MynkWordmark } from "@/components/auth/MynkWordmark";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AuthShellProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/** Centered auth card layout — §5.9 (max-width 400px). */
export function AuthShell({
  title,
  description,
  children,
  footer,
  className,
}: AuthShellProps) {
  return (
    <main
      className={cn(
        "flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center px-4 py-10",
        className
      )}
    >
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex justify-center">
          <Link
            href="/"
            className="rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="Mynk home"
          >
            <MynkWordmark />
          </Link>
        </div>
        <Card className="border-border shadow-sm">
          <CardHeader className="gap-2 pb-0">
            <CardTitle className="heading text-2xl font-normal">{title}</CardTitle>
            {description ? (
              <CardDescription className="text-base text-muted-foreground">
                {description}
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="pt-6">{children}</CardContent>
        </Card>
        {footer ? (
          <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
        ) : null}
      </div>
    </main>
  );
}
