"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SITE_ROLE_SELF_LEARNER_PARENT } from "@/lib/site-role-labels";

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
    <Card className="min-w-0 max-w-full shrink-0 grow basis-[min(100%,280px)] rounded-2xl">
      <CardContent className="pt-6">
        <p className="label-mono mb-2.5 text-accent-text">{eyebrow}</p>
        <h3 className="heading mb-2.5 mt-0 text-lg">{headline}</h3>
        <p className="m-0 text-[15px] leading-relaxed text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

export function LandingPageContent() {
  const { status } = useSession();
  const signedIn = status === "authenticated";

  return (
    <>
      <MarketingHeader />

      <main id="main-content">
        <section
          aria-labelledby="hero-heading"
          className="mx-auto max-w-3xl px-6 pb-20 pt-[72px] text-center"
        >
          <p className="label-mono mb-2 block text-accent-text">Now in pilot</p>
          <p className="label-mono mb-5 block text-xs text-muted-foreground">
            Mynk doesn&apos;t take a cut of what you charge
          </p>

          <p className="mb-4 mt-0 text-[15px] font-medium text-foreground">
            For independent tutors running their own practice
          </p>

          <h1
            id="hero-heading"
            className="heading text-balance mb-5 mt-0 text-[clamp(2rem,5vw,3.5rem)]"
          >
            Session notes that write themselves.
          </h1>

          <p className="mx-auto mb-9 max-w-xl text-[clamp(1rem,2vw,1.15rem)] leading-relaxed text-muted-foreground">
            Mynk is the operating layer for your tutoring practice — a durable
            session record, clear parent communication, and AI-drafted notes you
            review when you&apos;re ready. You bring your students. Parents and
            students sign in to their own accounts. Spend less time on after-session
            paperwork and more time teaching.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {signedIn ? (
              <>
                <Button asChild variant="accent" size="lg">
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
                <Button asChild variant="accent" size="lg">
                  <Link href="/signup">Create your account</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/login">Sign in — tutors</Link>
                </Button>
              </>
            )}
          </div>

          {!signedIn ? (
            <p className="mt-5 text-sm text-muted-foreground">
              <Link
                href="/account/login"
                className="font-medium text-primary underline underline-offset-[3px]"
              >
                {SITE_ROLE_SELF_LEARNER_PARENT} sign in
              </Link>
            </p>
          ) : null}
        </section>

        <section
          aria-labelledby="value-props-heading"
          className="bg-accent-soft/45 px-6 py-16"
        >
          <div className="mx-auto max-w-[1100px]">
            <p className="label-mono mb-6 block text-center text-accent-text">
              Why tutors choose Mynk
            </p>
          <h2 id="value-props-heading" className="sr-only">
            How Mynk works
          </h2>
          <div className="flex min-w-0 flex-wrap gap-4">
            <ValuePropCard
              eyebrow="Sessions captured"
              headline="Write less between sessions"
              body="Recording starts when you start the session, following the consent recorded for that student. Transcription and recap are ready almost immediately after the session finishes. Edit what you want, save the notes, and you're done! Students can see the notes automatically, and so can a parent when the student is a minor. You can send a reminder email if you like."
            />
            <ValuePropCard
              eyebrow="Notes in their account"
              headline="Parents and students see the update"
              body="When you finalize a note, the parent and student can see the notes and the lesson replay in their account."
            />
            <ValuePropCard
              eyebrow="Your practice, your data"
              headline="Your rate stays yours"
              body="Mynk doesn't take a cut of what you charge. Your session data stays under your account — parent and student access is through secure sign-in, no ads, no tracking."
            />
          </div>
          </div>
        </section>

        <section
          aria-labelledby="how-it-works-heading"
          className="border-y border-border bg-muted/40 px-6 py-[60px]"
        >
          <div className="mx-auto max-w-3xl">
            <p className="label-mono mb-3 block text-center text-accent-text">
              How it works
            </p>
            <h2
              id="how-it-works-heading"
              className="heading text-balance mb-12 mt-0 text-center text-[clamp(1.5rem,3vw,2rem)]"
            >
              Three steps, no friction.
            </h2>

            <div className="grid gap-8 sm:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Start your session",
                  desc: "Pick your student and start the session. Recording starts when you do, following the consent recorded for that student.",
                },
                {
                  step: "02",
                  title: "Teach your lesson",
                  desc: "Teach the way you already do — Mynk runs in the background. When you're done, end the session; audio and whiteboard are saved.",
                },
                {
                  step: "03",
                  title: "Save the notes",
                  desc: "Mynk drafts the recap. Edit what you want, save the notes, and you're done. Students can see them automatically, and so can a parent when the student is a minor.",
                },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex flex-col gap-2.5">
                  <p className="label-mono m-0 text-[13px] text-primary">{step}</p>
                  <h3 className="heading m-0 text-base">{title}</h3>
                  <p className="m-0 text-[15px] leading-relaxed text-muted-foreground">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="trust-heading"
          className="px-6 py-[72px] text-center"
        >
          <div className="mx-auto max-w-xl">
            <p className="label-mono mb-3 block text-accent-text">Pilot access</p>
            <h2
              id="trust-heading"
              className="heading text-balance mb-4 mt-0 text-[clamp(1.4rem,3vw,2rem)]"
            >
              Built for independent tutors.
            </h2>
            <p className="mb-8 text-[15px] leading-relaxed text-muted-foreground">
              Mynk is free during the pilot. No credit card. Mynk doesn&apos;t take
              a cut of what you charge. Your teaching account requires two-factor
              sign-in. Parents and students sign in to their own accounts. During
              the pilot, new teaching accounts are approved by Mynk.
            </p>

            <div className="mx-auto mb-8 max-w-md rounded-2xl bg-brand px-6 py-5 text-left">
              <p className="label-mono m-0 text-[11px] text-[color:var(--brand-eyebrow)]">
                Built for independents
              </p>
              <p className="heading mt-2 mb-0 text-lg text-[color:var(--brand-on)]">
                Your rate stays yours — Mynk is infrastructure, not a marketplace.
              </p>
            </div>

            {!signedIn ? (
              <div className="flex flex-wrap justify-center gap-3">
                <Button asChild variant="accent" size="lg">
                  <Link href="/signup">Get started — it&apos;s free</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/features">Learn more</Link>
                </Button>
              </div>
            ) : null}

            <p className="mt-6 text-[13px] text-muted-foreground/75">
              By creating an account you agree to our{" "}
              <Link href="/terms" className="underline underline-offset-[3px]">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline underline-offset-[3px]">
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
