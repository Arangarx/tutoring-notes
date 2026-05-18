# Legal sync — `/privacy` and `/terms` ↔ mortensenapps.com

**`mortensenapps.com/privacy` and `mortensenapps.com/terms` are the
authoritative legal source for any product under the Mortensen Apps
umbrella.** Those URLs are the ones Google's OAuth verification team has
been reviewing across multiple rounds (the verification history lives in
the mortensenapps.com site repo — see "Source of truth" below). Anything
they vet is the policy that legally governs the products, including
Tutoring Notes.

Tutoring Notes ships **its own local copies** at `/privacy` and `/terms`,
but those are **subordinate facades** of the umbrella, not a parallel
canonical source. The local copies exist to:

1. **Add product-specific sections the umbrella deliberately omits** —
   session audio recordings (Vercel Blob + OpenAI Whisper), whiteboard
   stroke logs and snapshots, parent/student share-link surfaces. The
   umbrella covers the policy framework; this product page enumerates
   what's specifically processed inside Tutoring Notes.
2. **Adapt the Children section for the tutoring context.** The umbrella
   has a generic "Children" section; Tutoring Notes processes minor-data
   as a normal-path user category (students), so the product copy
   elaborates on tutor consent responsibility and revocable share links.
3. **Provide a product-specific contact path** so privacy / data-deletion
   requests for Tutoring Notes don't dilute the umbrella inbox.

The preamble paragraph on each TSX page explicitly tells readers that the
umbrella *governs* and the local copy *supplements*. That hierarchy is the
load-bearing legal posture; this doc and the file headers must not
contradict it.

## What is NOT yet confirmed (open question, do not lose this)

It is **not yet established** which URLs are registered in the Google
Cloud Console OAuth consent screen for the Tutoring Notes OAuth client:

- **Most likely:** the consent screen points at
  `mortensenapps.com/privacy` + `mortensenapps.com/terms` (matches the
  verification history Andrew references). Under this scenario, this
  product's local `/privacy` + `/terms` URLs are decorative for
  verification purposes — the umbrella URLs are what Google checks. The
  local copies still matter for in-product UX, search-engine surfacing,
  and legal completeness, but changes to them do NOT trigger Google
  re-verification on their own.
- **Possible but less likely:** the consent screen points at the
  tutoring-notes domain's `/privacy` + `/terms`. Under this scenario,
  rewriting the local copies (as we did 2026-05-17) is a content change
  to a Google-verified URL. Google generally tolerates moving toward
  more compliant copy (and our rewrite was an upgrade — added the
  Limited Use language, no-sale clause, Sharing/Disclosure enumeration,
  Children section), but it is a thing to be aware of.

**Action item for Andrew (do this before relying on the framing here):**
1. Open [Google Cloud Console → APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
   for the Tutoring Notes project.
2. Note the values in:
   - "Application privacy policy link"
   - "Application terms of service link"
   - "Authorized domains"
3. Update this doc's "Source of truth" section below with the confirmed
   answer.

## Source of truth

- **Umbrella canonical text + verification history:** the
  `mortensenapps.com` site repository. Andrew has the path; this doc
  should be updated to reference it explicitly once shared. The commit
  history of that repo captures the iteration with the Google
  verification team across rounds — that history is invaluable context
  when the umbrella next changes.
- **Live deployed umbrella copy:** `https://mortensenapps.com/privacy`
  and `https://mortensenapps.com/terms` (what was fetched during the
  initial sync on 2026-05-17).
- **Tutoring Notes local copies:** `src/app/privacy/page.tsx` and
  `src/app/terms/page.tsx` in this repo.
- **Google Cloud Console OAuth consent screen:** the operational source
  of truth for which URLs Google is enforcing against — pending
  confirmation per the action item above.

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

The umbrella is canonical. When `mortensenapps.com/privacy` or
`mortensenapps.com/terms` is updated (or when the mortensenapps.com site
repo lands a verification-team-driven change before the deploy):

1. **Source the new umbrella text from the mortensenapps.com site repo**
   if accessible (preferred — preserves the verification-round context).
   Otherwise fetch both umbrella URLs and diff against the previous sync
   date. The sync date is in the top-of-file React doc-comment in each
   TSX file.
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
7. **Re-check the Google Cloud Console OAuth consent screen** — verify
   the URLs registered there (umbrella vs. tutoring-notes domain) and
   ensure the policy text at those URLs reflects the verified umbrella
   version. If the umbrella changed Gmail Limited Use language or the
   no-sale clauses, those are the changes most likely to interest a
   future verification reviewer.
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
  missing several Google-OAuth-defense-relevant clauses. **Framing
  correction same day:** original commit message and an earlier draft
  of this doc overstated "Google OAuth verification is anchored to
  the tutoring-notes domain's /privacy URL." That was an unvalidated
  assumption. Andrew clarified the verification rounds have been
  against the mortensenapps.com umbrella, and the mortensenapps.com
  site repo holds the verification history. This doc was rewritten
  to reflect that mortensenapps.com is the canonical legal source and
  the tutoring-notes local copies are subordinate facades. The
  shipped TSX content itself was already coherent under the corrected
  framing (the in-UI preamble correctly positions the umbrella as
  governing and the local copy as supplementing) — only the
  developer-facing rationale needed correction. Pending action item
  for Andrew: confirm which URLs the Tutoring Notes OAuth consent
  screen registers (see "What is NOT yet confirmed" section above).
