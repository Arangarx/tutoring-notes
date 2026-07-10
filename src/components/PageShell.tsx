import type { ReactNode } from "react";

import { AppHeader } from "@/components/AppHeader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

export type PageShellRealm = "admin" | "account" | "student" | "share";

type PageTitleBlockProps =
  | {
      variant: "page";
      title: string;
      description?: ReactNode;
      eyebrow?: ReactNode;
      actions?: ReactNode;
    }
  | {
      variant: "share";
      title: string;
      subtitle: ReactNode;
      headerAction?: ReactNode;
    };

function PageTitleBlock(props: PageTitleBlockProps) {
  if (props.variant === "share") {
    const { title, subtitle, headerAction } = props;
    return (
      <header
        data-page-title-variant="share"
        className="border-b border-border bg-card px-4 py-4 md:px-5 md:py-6"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="heading m-0 text-[22px] font-bold tracking-tight md:text-[26px]">
              {title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
            <ThemeToggle />
            {headerAction ? <div>{headerAction}</div> : null}
          </div>
        </div>
      </header>
    );
  }

  const { title, description, eyebrow, actions } = props;
  return (
    <header
      data-page-title-variant="page"
      className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="min-w-0 flex-1 space-y-1">
        {eyebrow ? <div className="text-sm text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="heading text-3xl font-normal tracking-tight text-foreground">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-base text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

type PageShellProps =
  | {
      realm: "admin";
      title: string;
      description?: ReactNode;
      eyebrow?: ReactNode;
      actions?: ReactNode;
      children: ReactNode;
      className?: string;
      sidebar?: ReactNode;
      sidebarWidth?: "default" | "narrow";
    }
  | {
      realm: "account";
      title: string;
      description?: ReactNode;
      eyebrow?: ReactNode;
      actions?: ReactNode;
      children: ReactNode;
      className?: string;
      userEmail?: string;
    }
  | {
      realm: "student";
      children: ReactNode;
      actions?: ReactNode;
      className?: string;
    }
  | {
      realm: "share";
      studentName: string;
      subtitle: ReactNode;
      headerAction?: ReactNode;
      children: ReactNode;
      className?: string;
    };

const SIDEBAR_WIDTH_CLASS = {
  default: "w-full md:w-[220px]",
  narrow: "w-full md:w-[180px]",
} as const;

/** Realm-parameterized page chrome — admin, account, student, and share surfaces. */
export function PageShell(props: PageShellProps) {
  if (props.realm === "student") {
    const { children, actions, className } = props;
    return (
      <div
        data-page-shell-realm="student"
        className={cn("flex min-h-[100dvh] flex-col bg-background", className)}
      >
        <AppHeader realm="student" actions={actions} />
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    );
  }

  if (props.realm === "share") {
    const { studentName, subtitle, headerAction, children, className } = props;
    return (
      <main
        data-page-shell-realm="share"
        className={cn("min-h-dvh bg-background", className)}
      >
        <div className="mx-auto w-full max-w-[860px]">
          <PageTitleBlock
            variant="share"
            title={studentName}
            subtitle={subtitle}
            headerAction={headerAction}
          />
          <div className="flex flex-col gap-3 px-4 py-4 pb-8 md:px-5">{children}</div>
        </div>
      </main>
    );
  }

  if (props.realm === "account") {
    const { title, description, eyebrow, actions, children, className, userEmail } = props;
    return (
      <div data-page-shell-realm="account" className="min-h-screen bg-background">
        <AppHeader realm="account" userEmail={userEmail} />
        <main className={cn("mx-auto max-w-4xl px-4 py-8 sm:px-6", className)}>
          <div className="flex flex-col gap-8">
            <PageTitleBlock
              variant="page"
              title={title}
              description={description}
              eyebrow={eyebrow}
              actions={actions}
            />
            {children}
          </div>
        </main>
      </div>
    );
  }

  const {
    title,
    description,
    eyebrow,
    actions,
    children,
    className,
    sidebar,
    sidebarWidth = "default",
  } = props;

  return (
    <div data-page-shell-realm="admin" className={cn("flex flex-col gap-8", className)}>
      <PageTitleBlock
        variant="page"
        title={title}
        description={description}
        eyebrow={eyebrow}
        actions={actions}
      />
      {sidebar ? (
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-6">
          <aside className={cn("shrink-0", SIDEBAR_WIDTH_CLASS[sidebarWidth])}>{sidebar}</aside>
          <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
