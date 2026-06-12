import type { Metadata } from "next";
import Link from "next/link";

import { MynkWordmark } from "@/components/auth/MynkWordmark";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Features — Mynk",
  description:
    "Mynk is tutoring infrastructure for independent tutors — session recording, AI-drafted notes, and secure parent updates. Mynk doesn't take a cut of what you charge.",
};

const PRODUCT_FEATURES = [
  {
    label: "Session recording",
    detail:
      "Online whiteboard sessions: go live and audio and whiteboard capture run automatically while you and your student are connected — pause anytime; recording ends with the session. In-person audio notes: one tap to start when you're ready.",
  },
  {
    label: "AI-drafted notes",
    detail:
      "Mynk reads the transcript and drafts your session recap fields — topics, assessment, and plan. You review, edit, and send when you're ready.",
  },
  {
    label: "Live whiteboard",
    detail:
      "A shared digital canvas that syncs between tutor and student in real time. Replay it later to see exactly how a concept was taught.",
  },
  {
    label: "Parent accounts",
    detail:
      "Families sign in to a secure parent account to read session summaries on any phone. Whiteboard replay and audio included when you share an update.",
  },
  {
    label: "Session log",
    detail:
      "An organized per-session record — dates, duration, and notes, plus the transcript and whiteboard replay, all in one place. Built for tutors who bill by the hour.",
  },
  {
    label: "Privacy-first",
    detail:
      "Student data stays under your account. No public URLs for sensitive content. Recordings are processed by Whisper and stored securely.",
  },
] as const;

export default function FeaturesPage() {
  return (
    <>
      <MarketingHeader />

      <main id="main-content">
        <section
          aria-labelledby="features-heading"
          className="mx-auto max-w-3xl px-6 pb-16 pt-[72px]"
        >
          <p className="label-mono mb-4 block text-accent-text">Features</p>
          <h1
            id="features-heading"
            className="heading text-balance mb-6 mt-0 text-[clamp(1.8rem,4vw,2.8rem)]"
          >
            Tutoring infrastructure for independent professionals.
          </h1>
          <p className="mb-4 max-w-2xl text-[1.05rem] leading-relaxed text-muted-foreground">
            Private tutors do extraordinary work — and then spend hours writing
            session notes, formatting updates for parents, and chasing down
            records they may need later. Mynk handles the paperwork so tutors
            can focus on students.
          </p>
          <p className="m-0 max-w-2xl text-[1.05rem] leading-relaxed text-muted-foreground">
            Most tutoring marketplaces take a cut of every session — Wyzant
            keeps 25%, Preply up to 33%. Mynk is a tool — not a marketplace. You
            bring the students; we handle the session layer.
          </p>
        </section>

        <section
          aria-labelledby="product-heading"
          className="border-y border-border bg-muted/40 px-6 py-[60px]"
        >
          <div className="mx-auto max-w-4xl">
            <p className="label-mono mb-3 block text-center text-accent-text">
              The product
            </p>
            <h2
              id="product-heading"
              className="heading text-balance mb-12 mt-0 text-center text-[clamp(1.4rem,3vw,2rem)]"
            >
              Everything that happens after you say hello.
            </h2>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {PRODUCT_FEATURES.map(({ label, detail }) => (
                <Card key={label} className="rounded-[10px] bg-background">
                  <CardContent className="pt-5">
                    <h3 className="heading mb-2 mt-0 text-[0.95rem]">{label}</h3>
                    <p className="m-0 text-sm leading-relaxed text-muted-foreground">
                      {detail}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="audience-heading"
          className="mx-auto max-w-3xl px-6 py-[72px]"
        >
          <p className="label-mono mb-3 block text-accent-text">Who it&apos;s for</p>
          <h2
            id="audience-heading"
            className="heading text-balance mb-6 mt-0 text-[clamp(1.4rem,3vw,2rem)]"
          >
            Independent tutors who value their time.
          </h2>
          <p className="mb-4 text-[1.05rem] leading-relaxed text-muted-foreground">
            Mynk is built first for independent tutors running their own
            practice. It scales with you from one student to twenty. Mynk
            doesn&apos;t take a cut of what you charge.
          </p>
          <p className="mb-10 text-[1.05rem] leading-relaxed text-muted-foreground">
            Families get a clean, mobile-friendly session summary inside their
            parent account — what their student worked on, written clearly, with
            whiteboard replay when you include it.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href="/signup">Create your account — free</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </section>

        <section className="border-t border-border bg-muted/40 px-6 py-12">
          <div className="mx-auto flex max-w-xl flex-col items-start gap-4">
            <div className="flex items-center gap-3">
              <MynkWordmark size="sm" />
              <span className="label-mono text-muted-foreground">Currently in pilot</span>
            </div>
            <p className="m-0 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Mynk is in early pilot with professional tutors. Features are
              shipping actively. Free during the pilot — no credit card, no
              commitment. Session data is processed using Whisper (OpenAI) for
              transcription and stored securely on your behalf.
            </p>
            <p className="m-0 text-[13px] text-muted-foreground/80">
              Questions?{" "}
              <Link
                href="/feedback"
                className="text-primary underline underline-offset-[3px]"
              >
                Send feedback
              </Link>
              {" · "}
              <Link href="/privacy" className="underline underline-offset-[3px]">
                Privacy
              </Link>
              {" · "}
              <Link href="/terms" className="underline underline-offset-[3px]">
                Terms
              </Link>
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
