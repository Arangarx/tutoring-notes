"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

import { MynkWordmark } from "@/components/auth/MynkWordmark";
import { Button } from "@/components/ui/button";

/** Marketing-page sticky nav — tutor + parent sign-in entries, create account CTA. */
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
            href="/about"
            className="label-mono"
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              color: "var(--text-muted)",
              transition: "color 0.15s",
              fontSize: 12,
            }}
          >
            About
          </Link>

          {signedIn ? (
            <Button asChild size="sm">
              <Link href="/admin">Dashboard</Link>
            </Button>
          ) : (
            <>
              {/* Parent sign-in — visually distinct from tutor sign-in */}
              <Link
                href="/account/login"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "var(--text-muted)",
                  border: "1px solid var(--border-default)",
                  background: "var(--surface-input)",
                  transition: "background 0.15s, color 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                Sign in
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-mono, monospace)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--accent-text, var(--accent))",
                    background: "var(--accent-soft)",
                    padding: "2px 5px",
                    borderRadius: 4,
                  }}
                >
                  parents
                </span>
              </Link>

              <Link
                href="/login"
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "var(--text-muted)",
                  transition: "color 0.15s, background 0.15s",
                }}
              >
                Tutors
              </Link>

              <Button asChild size="sm">
                <Link href="/signup">Create account</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
