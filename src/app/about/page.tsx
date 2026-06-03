import type { Metadata } from "next";
import Link from "next/link";

import { MynkWordmark } from "@/components/auth/MynkWordmark";
import { Button } from "@/components/ui/button";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";

export const metadata: Metadata = {
  title: "About — Mynk",
  description:
    "Mynk is tutoring infrastructure for independent tutors — session recording, AI-drafted notes, and polished parent updates, built without a platform fee.",
};

export default function AboutPage() {
  return (
    <>
      <MarketingHeader />

      <main id="main-content">
        {/* ── Page intro ─────────────────────────────────────────────── */}
        <section
          aria-labelledby="about-heading"
          style={{
            padding: "72px 24px 64px",
            maxWidth: 720,
            margin: "0 auto",
          }}
        >
          <p
            className="label-mono"
            style={{
              color: "var(--accent-text, var(--accent))",
              display: "block",
              marginBottom: 16,
            }}
          >
            About Mynk
          </p>
          <h1
            id="about-heading"
            className="heading text-balance"
            style={{
              fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
              marginTop: 0,
              marginBottom: 24,
            }}
          >
            Tutoring infrastructure for independent professionals.
          </h1>
          <p
            style={{
              fontSize: "1.05rem",
              color: "var(--text-muted)",
              lineHeight: 1.7,
              maxWidth: 640,
              margin: "0 0 16px",
            }}
          >
            Private tutors do extraordinary work — and then spend hours writing
            session notes, formatting updates for parents, and chasing down
            records they may need later. Mynk handles the paperwork so tutors
            can focus on students.
          </p>
          <p
            style={{
              fontSize: "1.05rem",
              color: "var(--text-muted)",
              lineHeight: 1.7,
              maxWidth: 640,
              margin: 0,
            }}
          >
            We built Mynk because every platform for tutors wants a cut of your
            revenue. We don&apos;t. Mynk is a tool — not a marketplace. You
            bring the students; we handle the session layer.
          </p>
        </section>

        {/* ── What Mynk does ──────────────────────────────────────────── */}
        <section
          aria-labelledby="product-heading"
          style={{
            padding: "60px 24px",
            background: "var(--surface-1)",
            borderTop: "1px solid var(--border-subtle)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <p
              className="label-mono"
              style={{
                color: "var(--accent-text, var(--accent))",
                display: "block",
                marginBottom: 12,
                textAlign: "center",
              }}
            >
              The product
            </p>
            <h2
              id="product-heading"
              className="heading text-balance"
              style={{
                fontSize: "clamp(1.4rem, 3vw, 2rem)",
                textAlign: "center",
                marginTop: 0,
                marginBottom: 48,
              }}
            >
              Everything that happens after you say hello.
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 24,
              }}
            >
              {[
                {
                  label: "Session recording",
                  detail:
                    "Audio + whiteboard captured together, so you never lose the thread of a session. Works over video or in person.",
                },
                {
                  label: "AI-drafted notes",
                  detail:
                    "Mynk reads the transcript and drafts homework, assessment, and plan sections. You review, edit, and send — not write from scratch.",
                },
                {
                  label: "Live whiteboard",
                  detail:
                    "A shared digital canvas that syncs between tutor and student in real time. Replay it later to see exactly how a concept was taught.",
                },
                {
                  label: "Parent share links",
                  detail:
                    "Tokenized, revocable read-only links for families. No app to download. Works on any phone. Whiteboard replay and audio included.",
                },
                {
                  label: "Session log",
                  detail:
                    "A complete time-stamped record of every session — hours, duration, and notes. Built for tutors who bill by the hour.",
                },
                {
                  label: "Privacy-first",
                  detail:
                    "Student data stays under your account. No public URLs for sensitive content. Recordings are processed by Whisper and stored securely.",
                },
              ].map(({ label, detail }) => (
                <div
                  key={label}
                  style={{
                    padding: "20px 20px 22px",
                    background: "var(--surface-base)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 12,
                  }}
                >
                  <h3
                    className="heading"
                    style={{ fontSize: "0.95rem", margin: "0 0 8px" }}
                  >
                    {label}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      color: "var(--text-muted)",
                      fontSize: 14,
                      lineHeight: 1.65,
                    }}
                  >
                    {detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Who it's for ─────────────────────────────────────────── */}
        <section
          aria-labelledby="audience-heading"
          style={{ padding: "72px 24px", maxWidth: 720, margin: "0 auto" }}
        >
          <p
            className="label-mono"
            style={{
              color: "var(--accent-text, var(--accent))",
              display: "block",
              marginBottom: 12,
            }}
          >
            Who it&apos;s for
          </p>
          <h2
            id="audience-heading"
            className="heading text-balance"
            style={{
              fontSize: "clamp(1.4rem, 3vw, 2rem)",
              marginTop: 0,
              marginBottom: 24,
            }}
          >
            Independent tutors who value their time.
          </h2>
          <p
            style={{
              fontSize: "1.05rem",
              color: "var(--text-muted)",
              lineHeight: 1.7,
              marginBottom: 16,
            }}
          >
            Mynk is designed for tutors who run their own practice — not for
            agencies, marketplaces, or institutions. It scales with you from one
            student to twenty, without ever taking a share of what you earn.
          </p>
          <p
            style={{
              fontSize: "1.05rem",
              color: "var(--text-muted)",
              lineHeight: 1.7,
              marginBottom: 40,
            }}
          >
            Families get a clean, professional update after each session. No
            app to install, no login required for parents. Just a link that
            shows what their student actually did, written clearly.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
            }}
          >
            <Button asChild size="lg">
              <Link href="/signup">Create your account — free</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </section>

        {/* ── Pilot context ─────────────────────────────────────────── */}
        <section
          style={{
            borderTop: "1px solid var(--border-subtle)",
            padding: "48px 24px",
            background: "var(--surface-1)",
          }}
        >
          <div
            style={{
              maxWidth: 640,
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <MynkWordmark size="sm" />
              <span
                className="label-mono"
                style={{ color: "var(--text-muted)" }}
              >
                Currently in pilot
              </span>
            </div>
            <p
              style={{
                fontSize: 14,
                color: "var(--text-muted)",
                lineHeight: 1.65,
                maxWidth: 520,
                margin: 0,
              }}
            >
              Mynk is in early pilot with working tutors. Features are shipping
              actively. Free during the pilot — no credit card, no commitment.
              Session data is processed using Whisper (OpenAI) for transcription
              and stored securely on your behalf.
            </p>
            <p
              style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, opacity: 0.8 }}
            >
              Questions?{" "}
              <Link
                href="/feedback"
                style={{
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  color: "var(--accent)",
                }}
              >
                Send feedback
              </Link>
              {" · "}
              <Link
                href="/privacy"
                style={{ textDecoration: "underline", textUnderlineOffset: 3 }}
              >
                Privacy
              </Link>
              {" · "}
              <Link
                href="/terms"
                style={{ textDecoration: "underline", textUnderlineOffset: 3 }}
              >
                Terms
              </Link>
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
