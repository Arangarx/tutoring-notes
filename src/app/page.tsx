"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { Button } from "@/components/ui/button";

function ValuePropCard({
  eyebrow,
  headline,
  body,
}: {
  eyebrow: string;
  headline: string;
  body: string;
}) {
  return (
    <div
      style={{
        flex: "1 1 280px",
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
        borderRadius: 16,
        padding: "28px 24px",
      }}
    >
      <p
        className="label-mono"
        style={{ marginBottom: 10, color: "var(--accent-text, var(--accent))" }}
      >
        {eyebrow}
      </p>
      <h3
        className="heading"
        style={{ fontSize: "1.1rem", marginBottom: 10, marginTop: 0 }}
      >
        {headline}
      </h3>
      <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.65, fontSize: 15 }}>
        {body}
      </p>
    </div>
  );
}

export default function HomePage() {
  const { status } = useSession();
  const signedIn = status === "authenticated";

  return (
    <>
      <MarketingHeader />

      <main id="main-content">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section
          aria-labelledby="hero-heading"
          style={{
            padding: "72px 24px 80px",
            textAlign: "center",
            maxWidth: 760,
            margin: "0 auto",
          }}
        >
          <p
            className="label-mono"
            style={{
              color: "var(--accent-text, var(--accent))",
              marginBottom: 8,
              display: "block",
            }}
          >
            Now in pilot
          </p>
          <p
            className="label-mono"
            style={{
              color: "var(--text-muted)",
              marginBottom: 20,
              display: "block",
              fontSize: 12,
            }}
          >
            Mynk doesn&apos;t take a cut of what you charge
          </p>

          <p
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: "var(--text)",
              marginBottom: 16,
              marginTop: 0,
            }}
          >
            For independent tutors running their own practice
          </p>

          <h1
            id="hero-heading"
            className="heading text-balance"
            style={{
              fontSize: "clamp(2rem, 5vw, 3.5rem)",
              marginBottom: 20,
              marginTop: 0,
            }}
          >
            Session notes that write themselves.
          </h1>

          <p
            style={{
              fontSize: "clamp(1rem, 2vw, 1.15rem)",
              color: "var(--text-muted)",
              lineHeight: 1.7,
              maxWidth: 620,
              margin: "0 auto 36px",
            }}
          >
            Mynk is the operating layer for your tutoring practice — a durable
            session record, clear parent communication, and AI-drafted notes you
            review when you&apos;re ready. You bring your students; parents and
            learners join through your account. Spend less time on after-session
            paperwork and more time teaching.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {signedIn ? (
              <>
                <Button asChild size="lg">
                  <Link href="/admin">Go to dashboard</Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => signOut({ callbackUrl: "/" })}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button asChild size="lg">
                  <Link href="/signup">Create your account</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/login">Sign in — tutors</Link>
                </Button>
              </>
            )}
          </div>

          {/* Parent sign-in affordance — visually distinct from tutor CTA */}
          {!signedIn && (
            <p style={{ marginTop: 20, fontSize: 14, color: "var(--text-muted)" }}>
              Parent or family member?{" "}
              <Link
                href="/account/login"
                style={{
                  color: "var(--accent)",
                  fontWeight: 500,
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                Sign in to your parent account
              </Link>
            </p>
          )}
        </section>

        {/* ── Value props ─────────────────────────────────────────── */}
        <section
          aria-labelledby="value-props-heading"
          style={{ padding: "0 24px 80px", maxWidth: 1100, margin: "0 auto" }}
        >
          <h2 id="value-props-heading" className="sr-only">
            How Mynk works
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <ValuePropCard
              eyebrow="Sessions captured"
              headline="Write less between sessions"
              body="Online sessions record automatically while you and your student are connected; in person, one tap to start. Transcription and recap fields draft when you&apos;re ready — edit what you want, save, and send."
            />
            <ValuePropCard
              eyebrow="Clean parent updates"
              headline="Parents see updates in their account"
              body="Families sign in to a secure parent account for a clean, mobile-friendly session summary. Updates arrive by email when you finalize a note. Whiteboard replays with audio so parents can see the actual lesson."
            />
            <ValuePropCard
              eyebrow="Your practice, your data"
              headline="Your rate stays yours"
              body="Mynk doesn&apos;t take a cut of what you charge. Your session data stays under your account — parent and student access is through secure sign-in, no ads, no tracking."
            />
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────── */}
        <section
          aria-labelledby="how-it-works-heading"
          style={{
            padding: "60px 24px",
            background: "var(--surface-1)",
            borderTop: "1px solid var(--border-subtle)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ maxWidth: 800, margin: "0 auto" }}>
            <p
              className="label-mono"
              style={{
                color: "var(--accent-text, var(--accent))",
                display: "block",
                marginBottom: 12,
                textAlign: "center",
              }}
            >
              How it works
            </p>
            <h2
              id="how-it-works-heading"
              className="heading text-balance"
              style={{
                fontSize: "clamp(1.5rem, 3vw, 2rem)",
                textAlign: "center",
                marginTop: 0,
                marginBottom: 48,
              }}
            >
              Three steps, no friction.
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 32,
              }}
            >
              {[
                {
                  step: "01",
                  title: "Start your session",
                  desc: "Pick your student and go live. Online, recording starts when your student joins; in person, one tap to start.",
                },
                {
                  step: "02",
                  title: "Teach your lesson",
                  desc: "Teach the way you already do — Mynk runs in the background. When you're done, end the session; audio and whiteboard are saved.",
                },
                {
                  step: "03",
                  title: "Send the recap",
                  desc: "Mynk drafts the recap. Review it, tweak anything, and share the update with the family when you're ready.",
                },
              ].map(({ step, title, desc }) => (
                <div key={step} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <p
                    className="label-mono"
                    style={{
                      color: "var(--accent)",
                      fontSize: 13,
                      margin: 0,
                    }}
                  >
                    {step}
                  </p>
                  <h3
                    className="heading"
                    style={{ fontSize: "1rem", margin: 0 }}
                  >
                    {title}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      color: "var(--text-muted)",
                      fontSize: 15,
                      lineHeight: 1.6,
                    }}
                  >
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Trust / pilot CTA ────────────────────────────────────── */}
        <section
          aria-labelledby="trust-heading"
          style={{ padding: "72px 24px", textAlign: "center" }}
        >
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <p
              className="label-mono"
              style={{
                color: "var(--text-muted)",
                display: "block",
                marginBottom: 12,
              }}
            >
              Pilot access
            </p>
            <h2
              id="trust-heading"
              className="heading text-balance"
              style={{
                fontSize: "clamp(1.4rem, 3vw, 2rem)",
                marginTop: 0,
                marginBottom: 16,
              }}
            >
              Built for independent tutors.
            </h2>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: 15,
                lineHeight: 1.65,
                marginBottom: 32,
              }}
            >
              Mynk is free during the pilot. No credit card. Mynk doesn&apos;t take
              a cut of what you charge. Your account is protected by login — parent and
              student views use secure sign-in through accounts you invite.
            </p>

            {!signedIn && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  justifyContent: "center",
                }}
              >
                <Button asChild size="lg">
                  <Link href="/signup">Get started — it&apos;s free</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/features">Learn more</Link>
                </Button>
              </div>
            )}

            <p
              style={{
                marginTop: 24,
                fontSize: 13,
                color: "var(--text-muted)",
                opacity: 0.75,
              }}
            >
              By creating an account you agree to our{" "}
              <Link
                href="/terms"
                style={{ textDecoration: "underline", textUnderlineOffset: 3 }}
              >
                Terms
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                style={{ textDecoration: "underline", textUnderlineOffset: 3 }}
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
