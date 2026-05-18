# Legal sync — `/privacy` and `/terms` ↔ mortensenapps.com

Tutoring Notes ships **its own copies** of the privacy policy and terms of
service at `/privacy` and `/terms`. Those copies must stay in sync with the
upstream Mortensen Apps umbrella policy at:

- https://mortensenapps.com/privacy
- https://mortensenapps.com/terms

This doc is the protocol for keeping them in sync.

## Why we keep our own copies (vs. redirecting)

1. **Google OAuth verification points at the tutoring-notes domain's
   `/privacy` URL.** Redirecting that URL away from the verified domain is a
   non-trivial risk (potential re-verification, broken Google consent screen
   trust signals). Local copy preserves the verified surface.
2. **The umbrella deliberately omits product-specific details.** Tutoring
   Notes processes data the umbrella doesn't enumerate: session audio
   recordings (Vercel Blob + OpenAI Whisper), whiteboard stroke logs and
   snapshots, share-link surfaces for parents/students. These need a product
   page to document them.
3. **Minor-data context is product-specific.** The umbrella has a generic
   "Children" section; Tutoring Notes deals with minors as a normal-path
   user category (students), so the product copy elaborates on tutor
   responsibility and consent.

## What's umbrella-derived vs. product-specific

### `/privacy` (`src/app/privacy/page.tsx`)

| Section | Source |
|---------|--------|
| Preamble + umbrella reference link | Product (acknowledges sync) |
| What Tutoring Notes is | Product |
| What data we collect | **Hybrid** — umbrella framing, product-specific inventory |
| How we use your data | **Umbrella** — includes the "do not sell Google user data" and "do not sell personal information to data brokers" language verbatim |
| Sharing, disclosure, and recipients | **Umbrella** — full bulleted enumeration (Google / Infrastructure / People you direct / Legal / Business transfers). Product-specific subprocessors (Vercel, Neon, Vercel Blob, OpenAI) listed under Infrastructure. |
| Google account and Gmail | **Hybrid** — umbrella's Limited Use / scope / token-storage / disconnect language + product-specific scope details (`gmail.send`, `userinfo.email`) and Settings → Email instruction |
| AI note generation (OpenAI) | Product |
| Session audio recordings (Vercel Blob) | Product |
| Where data is stored | Product |
| Data retention and deletion | **Hybrid** — umbrella framing, product-specific delete-from-app instruction |
| Security | **Umbrella** — full enumerated list (encryption in transit / hosting / authentication / secrets / Limited Use). Product-specific bcrypt password storage added. |
| Children | **Hybrid** — umbrella's framing, product-specific tutor-consent and share-link minor handling |
| Changes | **Umbrella** |
| Contact | Product — uses `arangarx+tutoringnotes@gmail.com` for product-specific addressing, links to mortensenapps.com for general inquiries |

### `/terms` (`src/app/terms/page.tsx`)

| Section | Source |
|---------|--------|
| Preamble + umbrella reference link | Product |
| The service | Product |
| Eligibility and accounts | **Umbrella** |
| Acceptable use | **Hybrid** — umbrella's bulleted list verbatim + 2 tutoring-specific bullets (consent for student data; consent for recording/replay sharing) |
| Your content | Product |
| Gmail integration | Product |
| Third-party services | **Hybrid** — umbrella's framing, product-specific subprocessor list with link to privacy policy |
| Availability and changes | Product (combines umbrella's posture with product-specific notification language) |
| Disclaimers | **Umbrella** — adds product-specific "Educational outcomes are not guaranteed" sentence |
| Limitation of liability | **Umbrella** — **VERBATIM**, including the $50 / 12-month-of-fees cap. Do not alter without legal review. |
| Indemnity | **Umbrella** |
| Changes | **Umbrella** |
| Governing law | **Umbrella** |
| Contact | Product — `arangarx+tutoringnotes@gmail.com` for product-specific, links to mortensenapps.com for general |

## Sync protocol (when umbrella changes)

When `mortensenapps.com/privacy` or `mortensenapps.com/terms` is updated:

1. **Fetch both umbrella URLs** and diff against the previous sync date.
   The sync date is in the top-of-file React doc-comment in each TSX file.
2. **For each changed umbrella section:** locate the matching section in
   the product file (use the tables above), update the umbrella-derived
   text **verbatim**, preserving any hybrid product-specific additions.
3. **Update the top-of-file sync date** in both TSX files to the new
   sync date.
4. **Update the "Last updated" date** displayed in the UI on both pages.
5. **Update this doc's tables** if any section's umbrella/product/hybrid
   classification changed.
6. **Verify visually** on Vercel Preview that both pages render correctly
   (no broken JSX, no orphaned `&ldquo;`/`&rdquo;` escapes, no broken links).
7. **Verify Google OAuth consent screen** still passes — if the umbrella
   changed the Gmail Limited Use language, re-check the consent screen
   wording matches our policy.
8. **Commit** with a message like `legal: sync /privacy and /terms with
   mortensenapps.com (2026-MM-DD)`.

## Cadence

- **Andrew updates mortensenapps.com** → sync to tutoring-notes within the
  same evening, or open an issue / mark a TODO in the master plan.
- **Google announces a Limited Use policy change** → priority: update
  umbrella first, then this product, before next deploy.
- **Quarterly review** (every ~3 months) — diff product vs. umbrella even
  if no notification triggered, catch drift from edits made without going
  through this protocol.

## Anti-drift safeguards

- The top-of-file doc-comment in each TSX file references this doc by
  name so the next maintainer (Andrew, or a future executor) sees the
  sync requirement before touching the file.
- The footer of each page links to the umbrella version so a careful
  reader can spot drift even without dev access.
- This doc is referenced from `AGENTS.md` (added in the same commit as
  the initial sync, 2026-05-17) so orchestrators reviewing executor
  bootstrappers will not miss the requirement when scoping legal-copy
  changes.

## History

- **2026-05-17** — initial sync. Brought tutoring-notes copies in line
  with the umbrella's full Sharing/Disclosure list, Limited Use
  language, Children section, $50 liability cap, Indemnity, and
  Governing Law sections. Previous product copies (April 2026) were
  missing several Google-OAuth-defense-relevant clauses.
