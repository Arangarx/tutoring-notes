"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export default function HomePage() {
  const { status } = useSession();
  const signedIn = status === "authenticated";

  return (
    <div className="container">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h1 style={{ margin: 0, lineHeight: 1.15 }}>
              Record your tutoring session. Send a polished parent update in 90 seconds.
            </h1>
            <p className="muted" style={{ marginTop: 12, maxWidth: 640, lineHeight: 1.5 }}>
              Tutoring Notes captures the session audio, drafts the homework, assessment, and
              plan fields for you, and gives families a read-only link that works on any phone.
              Built for working tutors.
            </p>
          </div>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <Link className="btn" href="/feedback">
              Feedback
            </Link>
            {signedIn ? (
              <>
                <Link className="btn primary" href="/admin">
                  Dashboard
                </Link>
                <button
                  type="button"
                  className="btn"
                  onClick={() => signOut({ callbackUrl: "/" })}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link className="btn" href="/login">
                  Sign in
                </Link>
                <Link className="btn primary" href="/signup">
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="divider" />

        <div className="row" style={{ alignItems: "stretch", flexWrap: "wrap" }}>
          <div className="card" style={{ flex: 1, minWidth: 240 }}>
            <h3 style={{ marginTop: 0 }}>Record once, write less</h3>
            <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
              Hit record. We transcribe the session and draft the homework, assessment,
              and plan fields. Edit what you want, save, send. Most sessions take under
              two minutes from stop-recording to email-sent.
            </p>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 240 }}>
            <h3 style={{ marginTop: 0 }}>Parents get a clean link</h3>
            <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
              No app for families. A read-only share link works on phones, no login.
              Updates deliver by email when you finalize a note. Whiteboard replays
              with audio so parents can see the actual lesson.
            </p>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 240 }}>
            <h3 style={{ marginTop: 0 }}>It&apos;s yours</h3>
            <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
              You keep 100% of your tutoring rate &mdash; we don&apos;t take a cut. Free
              during pilot, transparent pricing later. Your data stays under your account;
              parent-facing pages are share-link only.
            </p>
          </div>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 12 }}>
        Your account is protected by login. Parent and student views use revocable
        share links. No ads, no tracking.
      </p>
    </div>
  );
}
