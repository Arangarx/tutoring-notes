"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { MynkWordmark } from "@/components/auth/MynkWordmark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

const SIGN_IN_LINKS = [
  { href: "/login", label: "Tutor sign in" },
  { href: "/account/login", label: "Parent sign in" },
  { href: "/students/login", label: "Student sign in" },
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
    <div ref={rootRef} style={{ position: "relative" }}>
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
            right: 0,
            top: "calc(100% + 6px)",
            minWidth: 180,
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
          maxWidth: 1100,
          margin: "0 auto",
          padding: "0 24px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Link href="/" aria-label="Mynk home">
          <MynkWordmark size="sm" />
        </Link>

        <nav
          role="navigation"
          aria-label="Site navigation"
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <Link
            href="/features"
            className="label-mono"
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              color: "var(--text-muted)",
              transition: "color 0.15s",
              fontSize: 12,
            }}
          >
            Features
          </Link>

          <ThemeToggle />
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
