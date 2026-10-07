"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { MynkWordmark } from "@/components/auth/MynkWordmark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { MARKETING_HOME_HREF } from "@/lib/marketing-routes";
import {
  SITE_ROLE_CHILD_LEARNER,
  SITE_ROLE_SELF_LEARNER_PARENT,
  SITE_ROLE_TUTOR,
} from "@/lib/site-role-labels";

const SIGN_IN_LINKS = [
  { href: "/login", label: `${SITE_ROLE_TUTOR} sign in` },
  { href: "/account/login", label: `${SITE_ROLE_SELF_LEARNER_PARENT} sign in` },
  { href: "/students/login", label: `${SITE_ROLE_CHILD_LEARNER} sign in` },
] as const;

function SignInMenu() {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        close();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return (
    <div ref={rootRef} style={{ flexShrink: 0 }}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((prev) => !prev)}
      >
        Sign in
      </Button>

      {open ? (
        <ul
          id={menuId}
          role="menu"
          aria-label="Sign in options"
          style={{
            position: "absolute",
            right: "max(16px, env(safe-area-inset-right))",
            top: "calc(100% + 6px)",
            width: "max-content",
            maxWidth:
              "calc(100% - max(16px, env(safe-area-inset-left)) - max(16px, env(safe-area-inset-right)))",
            boxSizing: "border-box",
            margin: 0,
            padding: 6,
            listStyle: "none",
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            borderRadius: 10,
            boxShadow: "0 8px 24px var(--shadow-md)",
            zIndex: 60,
          }}
        >
          {SIGN_IN_LINKS.map(({ href, label }) => (
            <li key={href} role="none">
              <Link
                href={href}
                role="menuitem"
                className="sign-in-menuitem"
                style={{ whiteSpace: "normal", overflowWrap: "break-word" }}
                onClick={close}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Marketing-page sticky nav — single Sign in menu + create account CTA. */
export function MarketingHeader() {
  const { status } = useSession();
  const signedIn = status === "authenticated";

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--surface-nav)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div
        style={{
          position: "relative",
          boxSizing: "border-box",
          width: "100%",
          maxWidth: "min(1100px, 100%)",
          margin: "0 auto",
          minHeight: 56,
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: "max(16px, env(safe-area-inset-left))",
          paddingRight: "max(16px, env(safe-area-inset-right))",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          columnGap: 12,
          rowGap: 8,
        }}
      >
        <Link
          href={signedIn ? MARKETING_HOME_HREF : "/"}
          aria-label="Mynk home"
          style={{ flexShrink: 0 }}
        >
          <MynkWordmark size="sm" />
        </Link>

        <nav
          role="navigation"
          aria-label="Site navigation"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            flex: "1 1 auto",
            minWidth: "min(100%, max-content)",
            maxWidth: "100%",
          }}
        >
          <Link
            href="/features"
            className="label-mono"
            style={{
              flexShrink: 0,
              padding: "6px 10px",
              borderRadius: 8,
              color: "var(--text-muted)",
              transition: "color 0.15s",
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            Features
          </Link>

          <ThemeToggle className="shrink-0" />
          {signedIn ? (
            <Button asChild variant="accent" size="sm">
              <Link href="/admin">Dashboard</Link>
            </Button>
          ) : (
            <>
              <SignInMenu />
              <Button asChild variant="accent" size="sm">
                <Link href="/signup">Create account</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
