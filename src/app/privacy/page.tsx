import type { Metadata } from "next";
import Link from "next/link";

/**
 * Privacy policy — Tutoring Notes (product subordinate facade).
 *
 * SYNCED FROM https://www.mortensenapps.com/privacy as of 2026-05-17.
 *
 * The Mortensen Apps umbrella policy at www.mortensenapps.com/privacy is
 * the CANONICAL legal source and the URL registered in the shared
 * "Mortensen Apps" OAuth consent screen Tutoring Notes uses (confirmed
 * from Google Cloud Console 2026-05-17). Verification history lives in
 * the mortensenapps.com site repo. This file is a local subordinate
 * facade that embeds the umbrella's sections (no-sale of Google user
 * data, sharing/disclosure categories, Children, Changes, Limited Use
 * language) verbatim and layers product-specific sections on top —
 * Tutoring Notes data inventory, OpenAI / Whisper, Vercel Blob audio,
 * share-link consent for minors. The in-UI preamble paragraph on this
 * page explicitly tells readers the umbrella governs. This URL is NOT
 * registered with Google as a policy URL for the OAuth client.
 *
 * MAINTENANCE: when www.mortensenapps.com/privacy changes, update the
 * embedded sections here verbatim from the upstream + bump the "Last
 * updated" date + bump the SYNCED FROM date above. See
 * docs/LEGAL-SYNC.md for the sync protocol and the per-section
 * umbrella-vs-product classification table.
 */

export const metadata: Metadata = {
  title: "Privacy Policy — Tutoring Notes",
  description: "How Tutoring Notes collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Privacy Policy</h1>
        <p className="muted" style={{ fontSize: 14 }}>Last updated: May 2026</p>

        <p className="muted" style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6 }}>
          This policy applies to <strong>Tutoring Notes</strong>, a web application operated
          by Andrew Mortensen under the Mortensen Apps umbrella. It supplements the
          umbrella privacy policy at{" "}
          <a href="https://www.mortensenapps.com/privacy" target="_blank" rel="noreferrer">
            www.mortensenapps.com/privacy
          </a>{" "}
          with product-specific details. Where this policy is silent, the umbrella
          policy governs.
        </p>

        <div className="divider" style={{ margin: "20px 0" }} />

        <section style={{ display: "grid", gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>What Tutoring Notes is</h2>
            <p style={{ margin: "8px 0 0" }}>
              Tutoring Notes is a web application that helps private tutors record session
              audio, draft session notes, run a shared whiteboard during lessons, and share
              read-only updates with students and their families.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>What data we collect</h2>
            <ul style={{ margin: "8px 0 0", paddingLeft: 20, lineHeight: 1.7 }}>
              <li><strong>Account information:</strong> email address, hashed password, and optional display name when you create a tutor account.</li>
              <li><strong>Session notes:</strong> student names, session dates, topics, homework, assessment, plan, and links you enter.</li>
              <li><strong>Session audio recordings</strong> when you use the Record or Upload feature (stored in Vercel Blob — see below).</li>
              <li><strong>Whiteboard session data:</strong> timestamped stroke logs, optional PDF / image inserts, and a session snapshot used for the parent replay surface.</li>
              <li><strong>Parent / guardian email addresses</strong> you enter when sending updates.</li>
              <li><strong>Outbound email logs</strong> (subject, recipient, body text, share link) retained for delivery troubleshooting.</li>
              <li><strong>Feedback submissions</strong> (messages and optional contact email).</li>
              <li><strong>Waitlist entries</strong> (email and optional name) submitted through interest forms or contact, retained for outreach.</li>
              <li><strong>Gmail OAuth tokens</strong> if you use &ldquo;Connect Gmail&rdquo; (see Google account and Gmail below).</li>
              <li><strong>Standard technical logs</strong> (IP address, user agent, timestamps) collected by our hosting provider for security and reliability.</li>
            </ul>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>How we use your data</h2>
            <p style={{ margin: "8px 0 0" }}>
              Your data is used solely to operate the product: signing you in, storing and
              displaying notes / audio / whiteboard sessions, generating share links, and
              sending the email updates you choose to send. We do <strong>not</strong> sell
              Google user data, and we do <strong>not</strong> sell personal information to
              data brokers, advertising platforms, or cold callers.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Sharing, disclosure, and recipients</h2>
            <p style={{ margin: "8px 0 0" }}>
              We share or disclose information only as needed to run the product, as
              described below.
            </p>
            <ul style={{ margin: "8px 0 0", paddingLeft: 20, lineHeight: 1.7 }}>
              <li>
                <strong>Google.</strong> When you connect a Google account or use Gmail
                through the app, data needed for that feature is processed by Google
                under Google&apos;s terms and your Google account settings (OAuth tokens,
                API calls to send mail you initiate, and metadata Google logs as part of
                those APIs). We do not control Google&apos;s servers; we follow Google&apos;s
                applicable API and limited-use requirements for data we receive from
                Google APIs.
              </li>
              <li>
                <strong>Infrastructure and service providers.</strong> Tutoring Notes
                runs on hosted infrastructure and uses subprocessors that each handle a
                specific slice of the product:
                <ul style={{ margin: "4px 0 0", paddingLeft: 20, lineHeight: 1.6 }}>
                  <li><strong>Vercel</strong> — application hosting + serverless functions (US region).</li>
                  <li><strong>Neon</strong> — PostgreSQL database (US region).</li>
                  <li><strong>Vercel Blob</strong> — object storage for session audio and whiteboard snapshots (US region).</li>
                  <li><strong>OpenAI</strong> — AI note generation and audio transcription (Whisper). See AI note generation section below.</li>
                </ul>
              </li>
              <li>
                <strong>People you direct us to contact.</strong> When you send an
                email or share content from the app (for example a session update to a
                parent&apos;s address), the recipient receives the information you chose
                to send.
              </li>
              <li>
                <strong>Legal and safety.</strong> We may disclose information if
                required by law, regulation, legal process, or to protect the rights,
                safety, and security of users, the public, or our services.
              </li>
              <li>
                <strong>Business transfers.</strong> If we are involved in a merger,
                acquisition, or asset sale, user information may be transferred as part
                of that transaction; we will require the successor to honor commitments
                consistent with this policy or notify you as applicable law requires.
              </li>
            </ul>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Google account and Gmail (Connect Gmail)</h2>
            <p style={{ margin: "8px 0 0" }}>
              When you click &ldquo;Connect Gmail,&rdquo; the app requests permission to send
              email on your behalf using the <strong>Gmail API</strong>{" "}
              (<code>gmail.send</code> scope) and to read your email address{" "}
              (<code>userinfo.email</code> scope). These permissions are used exclusively
              to send session-update emails from your Gmail account when you click
              &ldquo;Send update&rdquo; in the app. We do <strong>not</strong> read, search,
              index, modify, or delete any of your existing emails. Google user data we
              receive through Gmail APIs is used only to provide the user-facing email-
              sending feature you asked for, consistent with Google&apos;s applicable API
              and Limited Use requirements.
            </p>
            <p style={{ margin: "8px 0 0" }}>
              We store a refresh token so the app can send on your behalf without asking
              you to sign in each time. OAuth tokens and related credentials are kept in
              server-side configuration or secure database storage, never embedded in
              web pages or public repositories. You can disconnect Gmail at any time
              from Settings → Email, which deletes the stored token; you can also revoke
              access directly from your Google Account security settings.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>AI note generation (OpenAI)</h2>
            <p style={{ margin: "8px 0 0" }}>
              When you use the <strong>Auto-fill from session</strong> feature, content
              you provide (typed notes, uploaded audio, or in-browser recording) is sent
              to <strong>OpenAI</strong> via their API to structure it into session
              notes. Your student&apos;s name and up to two recent note summaries are
              included as context.
            </p>
            <p style={{ margin: "8px 0 0" }}>
              OpenAI&apos;s API data usage policy states that data submitted through the
              API is <strong>not used to train their models</strong>. See{" "}
              <a href="https://openai.com/enterprise-privacy" target="_blank" rel="noreferrer">
                OpenAI&apos;s API data usage policy
              </a>{" "}
              for details. If you prefer not to send session content to OpenAI, simply
              do not use the Auto-fill feature — it is entirely optional.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Session audio recordings (Vercel Blob)</h2>
            <p style={{ margin: "8px 0 0" }}>
              When you upload or record a session audio file, the recording is stored in{" "}
              <strong>Vercel Blob</strong> (private, US region). Audio is never publicly
              accessible — all playback links are short-lived signed URLs generated at
              render time.
            </p>
            <p style={{ margin: "8px 0 0" }}>
              Recordings are sent to <strong>OpenAI Whisper</strong> for transcription
              as part of the note generation flow. The same API data policy applies:
              data is not used for training. Audio is not shared with any other third
              party.
            </p>
            <p style={{ margin: "8px 0 0" }}>
              The <strong>Include audio recording in parent share link</strong> option
              is <strong>off by default</strong>. When you enable it, the parent or
              student can listen to the session recording on their notes page. Obtain
              appropriate consent before enabling this option, especially for sessions
              involving minors.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Where data is stored</h2>
            <p style={{ margin: "8px 0 0" }}>
              Data is stored in a PostgreSQL database hosted on <strong>Neon</strong>{" "}
              (US region). The application is hosted on <strong>Vercel</strong>. Both
              providers maintain their own security and compliance practices.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Data retention and deletion</h2>
            <p style={{ margin: "8px 0 0" }}>
              We retain data as long as your account exists and as needed to provide the
              service and meet legal obligations. Tutors can delete individual students
              and notes from within the app. If you want your account or all associated
              data deleted, contact us at the email below and we will process the request
              promptly.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Security</h2>
            <p style={{ margin: "8px 0 0" }}>
              We use commercially reasonable safeguards appropriate to the sensitivity of
              tutoring data and the nature of our hosted software:
            </p>
            <ul style={{ margin: "8px 0 0", paddingLeft: 20, lineHeight: 1.7 }}>
              <li><strong>Encryption in transit.</strong> All connections to the application use HTTPS (TLS).</li>
              <li><strong>Password storage.</strong> Tutor account passwords are hashed with bcrypt before storage; raw passwords are never written to logs or the database.</li>
              <li><strong>Hosting and data stores.</strong> We rely on Vercel and Neon&apos;s protections for servers, databases, and object storage (access controls, network isolation, and encryption at rest where the vendor provides it by default for the tiers we use).</li>
              <li><strong>Authentication and access.</strong> Every tutor request requires sign-in; application logic enforces ownership boundaries so a tutor only sees their own students and sessions.</li>
              <li><strong>Secrets and OAuth tokens.</strong> API keys, client secrets, and OAuth refresh tokens are kept in server-side configuration or secure storage — not embedded in web pages or public repositories.</li>
              <li><strong>Limited use of Google data.</strong> Google user data obtained through Google APIs is used only to provide the user-facing features you asked for (sending mail you trigger), consistent with this policy and Google&apos;s applicable Limited Use requirements.</li>
            </ul>
            <p style={{ margin: "8px 0 0" }}>
              No method of transmission or storage is 100% secure; if you have a specific
              security concern, contact us using the address below.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Children</h2>
            <p style={{ margin: "8px 0 0" }}>
              Tutoring Notes is intended for use by <strong>tutors</strong> (adults).
              Tutors are responsible for obtaining any parent, guardian, or
              organizational consent required before entering student information,
              recording sessions, or sending share links — including for sessions
              involving minors. Minors do not have tutor accounts in the app.
            </p>
            <p style={{ margin: "8px 0 0" }}>
              Parent or student share links are tokenized and revocable; a parent or
              guardian receives the link from the tutor and can view session content
              without creating an account. If you believe a tutor has shared a minor&apos;s
              information without appropriate consent, or that a child&apos;s personal
              information has been collected inappropriately, contact us at the email
              below and we will address it.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Changes</h2>
            <p style={{ margin: "8px 0 0" }}>
              We may update this policy from time to time. The &ldquo;Last updated&rdquo; date
              above will change when we do. Material changes may also be communicated
              in-product or by email where practical. Continued use of the app after
              changes means you accept the updated policy.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Contact</h2>
            <p style={{ margin: "8px 0 0" }}>
              For privacy questions, data deletion requests, or concerns specific to
              Tutoring Notes, email{" "}
              <a href="mailto:arangarx+tutoringnotes@gmail.com">arangarx+tutoringnotes@gmail.com</a>.
              For general Mortensen Apps inquiries, see{" "}
              <a href="https://www.mortensenapps.com/" target="_blank" rel="noreferrer">
                www.mortensenapps.com
              </a>.
            </p>
          </div>
        </section>

        <div className="divider" style={{ margin: "20px 0" }} />

        <p className="muted" style={{ fontSize: 13 }}>
          <Link href="/">Home</Link> · <Link href="/terms">Terms</Link> ·{" "}
          <a href="https://www.mortensenapps.com/privacy" target="_blank" rel="noreferrer">
            Umbrella privacy policy
          </a>
        </p>
      </div>
    </div>
  );
}
