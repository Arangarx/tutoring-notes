# Umbrella legal drafts pending — 2026-05-18

> **Status: drafted, NOT yet shipped to mortensenapps.com.**
>
> These two additions need to land on
> `C:\Users\arang\Documents\Andrew\dev\agenticPipeline\pipeline-projects\mortensen-apps-site`
> (current path; site repo will move to `agentic-projects/` parent later) and then deploy to
> `https://www.mortensenapps.com/privacy` BEFORE the tutoring-notes Phase 11a (PostHog) and
> Phase 11b (AI edit signal) bootstrappers run. Both bootstrappers hard-fail their pre-check
> if these sections are missing from the live umbrella.
>
> **Andrew may also edit directly when ready** — orchestrator authorized 2026-05-18 to do
> the umbrella edit in a future session, with the hard constraint **"DO NOT LOSE WHAT IS THERE"**
> (Andrew, same message). The "Preservation rules" section at the end of this doc encodes
> exactly what must be preserved + how.

---

## Source of truth + Google-verification history (anchor before editing)

- **Repo**: `C:\Users\arang\Documents\Andrew\dev\agenticPipeline\pipeline-projects\mortensen-apps-site`
- **Live URL**: `https://www.mortensenapps.com/privacy` (Google-verified per the OAuth consent screen — confirmed 2026-05-18 from Andrew's Cloud Console screenshot, both apex and `www.` registered as Authorized Domains).
- **Files**: static HTML — `privacy/index.html`, `terms/index.html`. NOT Next.js, no build step beyond Vercel static serving.

**Git log for `privacy/index.html`** (every commit reflects a Google-verification round; all are load-bearing):

| Commit | Date | Title | What Google asked for |
|--------|------|-------|------------------------|
| `89f3cc9` | 2026-04-22 | Initial site: home, privacy, terms for OAuth verification | Baseline (sections: What we build, Google account and Gmail, Data you provide, Analytics and logging, Retention, Children, Changes, Contact) |
| `b3483b6` | 2026-05-12 | **Privacy: sharing/recipients and security (Google verification)** | **+82 lines.** Added the full `Sharing, disclosure, and recipients` section (with the 5-item enumerated list — Google, Infrastructure providers, People-you-direct, Legal, Business transfers) + the full `Security` section (with the 5-item enumerated list — Encryption in transit, Hosting, Authentication, Secrets/tokens, Limiting data use). **This is the most load-bearing commit — Google specifically requested both sections.** |

Other commits in repo:
- `b0aa270` (2026-05-12) — Homepage purpose statement for OAuth.
- `9422b0a` (2026-04-22) — Contact: primary `arangarx@gmail.com`; per-app support list on home.

Before any edit, **fetch the live page** (`https://www.mortensenapps.com/privacy`) to confirm it matches the local file. If they diverge, the local-vs-live mismatch is the FIRST thing to resolve.

---

## Current umbrella structure (do not reorder)

The umbrella privacy currently has these sections in this order:

1. (lead paragraph)
2. What we build
3. Google account and Gmail
4. Data you provide
5. **Sharing, disclosure, and recipients** ← b3483b6 Google ask; PRESERVE EXACTLY
6. **Security** ← b3483b6 Google ask; PRESERVE EXACTLY
7. **Analytics and logging** ← I propose EXPANDING this section (lead sentence preserved)
8. Retention and deletion
9. (insert NEW section here: Improving our AI features from your edits)
10. Children
11. Changes
12. Contact

---

## Insertion 1 — EXPAND "Analytics and logging" (currently section 7)

### Current umbrella text (PRESERVE the first paragraph verbatim — already in place since `89f3cc9`)

```html
<h2>Analytics and logging</h2>
<p>
  Hosting platforms may collect standard technical data (for example IP address,
  user agent, timestamps) for security and reliability. We do not sell your
  personal information.
</p>
```

### Proposed expanded section (add new paragraphs AFTER the existing one; do not delete or modify the existing paragraph)

```html
<h2>Analytics and logging</h2>
<p>
  Hosting platforms may collect standard technical data (for example IP address,
  user agent, timestamps) for security and reliability.
</p>
<p>
  Some of our products use a product-analytics service to understand how
  features are used and where users encounter friction, so we can prioritize
  improvements. The service receives interaction events (which pages and
  buttons were used, broad timing data, anonymized device class) and, on
  authenticated in-product surfaces only, may receive a session-replay
  recording of those interactions. Session replays exclude the content of
  form fields and inputs that may contain user data (for example notes,
  recipient addresses, uploaded file contents); those fields are masked at
  capture time so the service never receives the underlying values. Public
  share surfaces (parent- or recipient-facing read-only links) do not send
  events or replays.
</p>
<p>
  The analytics service we currently use is <strong>PostHog</strong>. We use
  their cloud offering on the US region. PostHog acts as a processor on our
  behalf; they do not sell collected data and do not use it to train
  third-party models. If you prefer not to be measured this way, contact us
  at the address below and we will exclude your account from analytics
  capture on the products you use.
</p>
<p>
  We do <strong>not</strong> sell your personal information.
</p>
```

### What changed and why each change is safe

- **Original first paragraph split**: the existing single paragraph "Hosting platforms... We do not sell your personal information." is split so the no-sale sentence becomes its own closing paragraph. This is a presentation-only change; the no-sale commitment is repeated, not weakened.
- **Two new middle paragraphs** describe the product-analytics service (PostHog) at the level of detail Google's verification team has historically accepted for OAuth verification (named processor, US region, processor relationship, no-train commitment, opt-out path).
- **No language was removed from `b3483b6`'s `Sharing, disclosure, and recipients` or `Security` sections** — they sit above and below this section unmodified.

### Opt-out implementation note

The paragraph commits to "contact us... and we will exclude your account from analytics capture." Operationally this means: on receiving an opt-out email, Andrew runs PostHog API call `posthog.identify(adminUserId, { $personImmutable_disable_capture: true })` OR uses PostHog's UI to set the cohort property. Document this in a future ops runbook.

---

## Insertion 2 — NEW section "Improving our AI features from your edits"

### Position

Between **section 8 (Retention and deletion)** and **section 10 (Children)** in the current numbering. After this insertion the new ordering is:

8. Retention and deletion
9. **Improving our AI features from your edits** ← new
10. Children

### Proposed new section

```html
<h2>Improving our AI features from your edits</h2>
<p>
  Some of our products use AI to draft content (for example session notes or
  summaries) that you then review, edit, and save. When you accept an
  AI-generated draft, we may store both the original AI output and your
  edited final version, alongside the source material the AI was working
  from (for example a transcript). We compare these to understand how the
  AI&rsquo;s output diverges from what you actually want, and use the
  aggregated pattern to improve the prompts and structure of future AI
  drafts.
</p>
<p>What this means in practice:</p>
<ul>
  <li>
    Edits are analyzed in aggregate to improve the prompts our apps use.
    We do not share user-specific data with model training providers, and
    individual edits are not used to train any third-party model.
  </li>
  <li>
    The original AI output, your edits, and the relevant source material
    are stored on the same infrastructure as your other product data,
    subject to the same access controls.
  </li>
  <li>
    You can opt out of having your edits analyzed by contacting us at the
    address below. AI generation continues to work; we simply do not retain
    the comparison data for your account.
  </li>
  <li>
    If you delete your account or specific content, the associated
    edit-signal data is deleted with it.
  </li>
</ul>
```

### Opt-out implementation note

The bullet commits to "contact us... and we will exclude... AI generation continues to work; we simply do not retain the comparison data." Operationally:

```sql
DELETE FROM "AiNoteEditSignal"
WHERE "sessionNoteId" IN (
  SELECT id FROM "SessionNote" sn
  JOIN "Student" s ON sn."studentId" = s.id
  WHERE s."adminUserId" = '<tutor-id>'
);

UPDATE "SessionNote"
SET "aiTopics" = NULL,
    "aiHomework" = NULL,
    "aiAssessment" = NULL,
    "aiPlan" = NULL,
    "aiLinksJson" = NULL
WHERE "studentId" IN (
  SELECT id FROM "Student" WHERE "adminUserId" = '<tutor-id>'
);
```

Plus: add a `User.aiEditSignalOptOut: Boolean @default(false)` flag in a future migration so the save-time signal write skips OPTED-OUT tutors going forward. For Phase 1 (single-tutor pilot) operational deletion-on-request is sufficient.

---

## Preservation rules (must not be violated when editing)

Order from highest-risk to lowest-risk if accidentally lost. **Every numbered item below is content Google has reviewed and verified at least once**:

### MUST-PRESERVE-VERBATIM (Google verification anchors)

1. The lead paragraph: *"This policy applies to web applications published by Andrew Mortensen..."* — establishes the umbrella scope. Google verification team has cited this style of framing as acceptable.
2. Section **"Google account and Gmail"** — the full block, including the explicit no-read commitment *"we do not use Gmail access to read, search, index, or delete your mailbox history"*. This is the Limited Use compliance language Google's verification team checks.
3. Section **"Sharing, disclosure, and recipients"** — the full 5-item enumerated list (Google, Infrastructure providers, People-you-direct, Legal, Business transfers) added in `b3483b6` per Google's explicit ask. The no-sale-of-Google-user-data sentence at the top of this section is load-bearing for the Google Limited Use API Services policy.
4. Section **"Security"** — the full 5-item enumerated list (Encryption in transit, Hosting, Authentication, Secrets/tokens, **Limiting data use**) added in `b3483b6`. The "Limiting data use" bullet specifically restates Google's Limited Use commitment in the security framing — Google verification has a specific paragraph it looks for here.

### MUST-PRESERVE-FUNCTIONALLY (legal substance, exact wording flexible)

5. Section **"Data you provide"** — the no-advertising-profile commitment ("not for unrelated advertising profiles").
6. Section **"Retention and deletion"** — the deletion-on-request commitment.
7. Section **"Children"** — the contact-us-if-collected-inappropriately commitment.
8. Section **"Changes"** — the "Last updated date will change" commitment.
9. Section **"Contact"** — `arangarx@gmail.com` as the primary contact.
10. The footer `meta` block with the "Last updated:" date.

### SAFE-TO-EDIT

- Section **"What we build"** — descriptive, not legally load-bearing.
- Section **"Analytics and logging"** — this is the section being expanded (Insertion 1).
- Anywhere between `Retention and deletion` and `Children` is open for the new section (Insertion 2).
- The footer "Last updated:" date — update to the day the umbrella deploy ships.

### EDIT PROCEDURE

When ready to ship the umbrella update:

1. `git -C "C:\Users\arang\Documents\Andrew\dev\agenticPipeline\pipeline-projects\mortensen-apps-site" pull` — make sure local is up to date.
2. Fetch `https://www.mortensenapps.com/privacy` and diff against local `privacy/index.html`. They should match. If they don't, resolve before editing.
3. Make the two insertions per this doc. Do NOT touch any of the MUST-PRESERVE-VERBATIM blocks.
4. Update the `<p class="meta">Last updated:` date.
5. Visually diff: `git diff privacy/index.html` — confirm ONLY the Analytics expansion + the new AI-improvement section + the Last-updated date are changed. Nothing in `Sharing, disclosure, and recipients` or `Security` should appear in the diff.
6. Commit: `Privacy: add PostHog analytics + AI-improvement sections` (Co-authored-by trailer if Cursor helped).
7. Push to origin → Vercel auto-deploys.
8. Verify `https://www.mortensenapps.com/privacy` shows both insertions live.
9. THEN run the tutoring-notes Phase 11a + 11b bootstrappers — their pre-checks will pass.

---

## Reminder — terms file is NOT touched in this round

`terms/index.html` does not need changes for PostHog or AI-improvement work. The umbrella's `Acceptable use` covers analytics usage adequately (no add); the `Third-party services` clause covers PostHog implicitly (no add). Future audit-required updates to terms get their own draft doc here.
