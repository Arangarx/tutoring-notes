# Auth & Identity UX Redesign

> **Status:** Ratified design capture — **build post-Sarah** (Andrew, 2026-06-30).  
> **Purpose:** Record the agreed auth/identity *mental model* and login/signup UX direction before implementation.  
> **Does not replace:** [`docs/handoff/session-identity-access-design-2026-05-31.md`](handoff/session-identity-access-design-2026-05-31.md) (architecture/data model) or [`docs/handoff/identity-phase2-auth-session-design-2026-06-01.md`](handoff/identity-phase2-auth-session-design-2026-06-01.md) (session/cookie mechanics). This doc is the **user-facing reframe + unified entry UX** layer on top of those foundations.

---

## 1. Problem

Today the product exposes **three separate login surfaces** and **two disjoint signup flows**, with copy that centers "parent" even though the data model already distinguishes **account holders** (people who own consent for themselves and/or dependents) from **learner profiles** (the people who take lessons).

| Surface | Route | Backend | Credential |
|---|---|---|---|
| Tutor | [`/login`](../src/app/login/page.tsx) | NextAuth → `AdminUser` ([`src/auth-options.ts`](../src/auth-options.ts)) | Email + password (+ optional Google OAuth) |
| Account holder ("parent") | [`/account/login`](../src/app/account/login/page.tsx) | Custom → `AccountHolder` ([`/api/auth/account-holder/login`](../src/app/api/auth/account-holder/login/route.ts)) | Email + password |
| Child learner | [`/students/login`](../src/app/students/login/page.tsx) | Custom → `LearnerProfile` ([`/api/auth/learner/login`](../src/app/api/auth/learner/login/route.ts)) | Handle (`username@familyid`) + PIN |

Sign-up is similarly split: tutors at [`/signup`](../src/app/signup/page.tsx) (server action → `AdminUser`), account holders at [`/account/signup`](../src/app/account/signup/page.tsx) (API → `AccountHolder`, with an `isSelfLearner` checkbox).

**Pain points this redesign addresses:**

1. **"Parent" framing breaks for self-learners** — the schema already has `AccountHolder.isSelfLearner` and `LearnerProfile.isSelfLearner`, but UX/copy treats "parent" as a third account type alongside tutor and student.
2. **Children are not account types** — a child is a `LearnerProfile` under an account holder; independent login is PIN-on-handle, not email signup.
3. **Scattered entry points** — marketing header ([`MarketingHeader.tsx`](../src/components/marketing/MarketingHeader.tsx)), hero ([`LandingPageContent.tsx`](../src/app/LandingPageContent.tsx)), and deep links each send users to different URLs with inconsistent labels ("Parent sign in" vs "Sign in to your parent account").
4. **Minor-data boundary is buried** — self-learner signup is a checkbox on the account-holder form, not a first-class signup path with an explicit self-attestation fork (can I manage my own account vs I manage accounts for learners who cannot self-consent).

---

## 2. Ratified model — account holder, two backends

### 2.1 Two auth backends (unchanged technically; reframed for users)

| Backend | Who | Session | Notes |
|---|---|---|---|
| **Tutor** | `AdminUser` (`AdminRole` `ADMIN` \| `TUTOR`) | NextAuth JWT | Email+password; Google OAuth for existing rows only; 2FA gate on `/admin/*` |
| **Account holder** | `AccountHolder` + owned `LearnerProfile`(s) | `mynk_ah_session` cookie | Email+password; email verification required before login |
| **Child learner (not a backend)** | `LearnerProfile` with `child_pin_required` access mode | `mynk_learner_session` cookie | PIN login only; no self-signup |

Tutor and account-holder both use **adult email + password**, but they are **different tables, different cookies, different route trees** (`/admin/*` vs `/account/*`). That split stays.

### 2.2 "Parent" → account holder (mental model, not necessarily immediate rename)

- **Account holder** = the person who owns the legal/billing relationship and can consent for themselves and/or on behalf of dependent learners (`AccountHolder` in [`prisma/schema.prisma`](../prisma/schema.prisma)). Capacity is **self-attested at signup**, not inferred from a birthdate threshold.
- **Self-learner** = an account holder whose learner profile is **themselves** (`isSelfLearner` on both `AccountHolder` and `LearnerProfile`). They self-attest that they can create and manage this account and consent for themselves.
- **Guardian / family manager** = an account holder whose learner profiles are **dependents** (typically children) for whom they consent on behalf. They self-attest that role at signup.
- **Child** = a `LearnerProfile` under an account holder — **not** an account type. Logs in with family handle + PIN when `accessMode` is `child_pin_required`.

This removes the awkward "parent OR self-learner" special case from user-facing flows: both are **account holders**; the difference is *who the learner profiles represent*.

### 2.3 Consent alignment

The account holder is always the party who can consent for the learners on the account:

- Self-learner → consents for themselves (B2 consent lattice applies per tutor link).
- Guardian / family manager → consents for each dependent `LearnerProfile` they manage.

**Dependent learners cannot self-create accounts** — a capable account holder adds them (dashboard, claim flow, credential setup). Who counts as "capable" for self-consent vs who requires a guardian is a **self-attestation + jurisdiction-aware** question, not a hardcoded age gate (see §7.9).

### 2.4 Ownership guard (existing — preserve)

Server mutations on learner data call [`assertOwnsLearnerProfile`](../src/lib/learner-profile-scope.ts): the authenticated account holder's id must match `LearnerProfile.accountHolderId`. Deny-by-default `notFound()` on cross-tenant or tombstoned profiles. Log prefix: `[lpr]`.

---

## 3. Current implementation reference (as of 2026-06-30)

Builders should treat this section as ground truth for what exists today.

### 3.1 Child learner handle grammar (IAC-7)

**Format:** `username@familyid` — single `@` separator; **no dot in the `familyid` portion**.

Examples from the codebase:

- Dev fixture: `child{suffix}@devfamily{suffix}` ([`src/lib/dev-fixtures.ts`](../src/lib/dev-fixtures.ts))
- Route comment: `dragon@mortensen1847` ([`src/app/api/auth/learner/login/route.ts`](../src/app/api/auth/learner/login/route.ts))

**Parsing** (`parseLoginHandle` in the learner login route):

1. Strip a leading `@` defensively.
2. Split on **`lastIndexOf('@')`** → `username` (left, lowercased) + `familyId` (right, lowercased).
3. Reject if no `@`, empty username, or empty familyId.

**Resolution:** `AccountHolder.familyId` (unique) → `LearnerCredential` composite `(accountHolderId, username)` → PIN verify.

**Family ID minting** ([`src/lib/family-id.ts`](../src/lib/family-id.ts)):

- Slugified surname seed → lowercase alphanumeric, max 20 chars base; collision suffix `2`, `3`, …
- Manual update regex: `^[a-z0-9_]{3,24}$` — **no `.` allowed**
- Therefore child handles like `childmq2prq9d@devfamilymq2prq9d` cannot contain a dot after `@`, which is what the adaptive login discriminator relies on (see §5).

**Access mode gate:** learners with `account_holder_session` (or legacy `parent_session_select`) are **rejected** at PIN login with `403 access_mode_mismatch` — they authenticate via the account-holder session, not independent PIN.

### 3.2 Login link inventory (today)

| Location | Order | Labels |
|---|---|---|
| [`MarketingHeader.tsx`](../src/components/marketing/MarketingHeader.tsx) `SIGN_IN_LINKS` | Tutor → Parent → Student | "Tutor sign in", **"Parent sign in"**, "Student sign in" |
| [`LandingPageContent.tsx`](../src/app/LandingPageContent.tsx) hero | Tutor primary; parent secondary line | "Sign in — tutors"; "Sign in to your **parent** account" |
| Student deep links | — | `/students/login` from join gate, share wall, account dashboard child hand-off |

There is **no** unified adaptive login page today.

### 3.3 Middleware route protection ([`src/middleware.ts`](../src/middleware.ts))

- `/admin/*` → NextAuth JWT required → redirect `/login`
- `/account/*` (non-public) → `mynk_ah_session` cookie presence → redirect `/account/login`
- `/join/*` (non-public) → `mynk_learner_session` → redirect `/students/login`
- `/s/*` when `NOTES_AUTH_WALL=true` → account-holder or learner cookie → redirect `/account/login`

---

## 4. Signup design (ratified)

### 4.1 Unified signup page with role self-select

One marketing-facing **"Create account"** entry with three explicit choices:

| Choice | Routes to | Backend |
|---|---|---|
| **I'm a tutor** | Existing tutor signup (`/signup` flow → `AdminUser`) | Tutor |
| **I'm a student** | Self-learner path (see §4.2) | Account holder + self `LearnerProfile` |
| **I'm the parent of a student** | Account-holder signup (no self-learner flag) | Account holder |

**UX goal:** feel seamless — shared shell, shared progress language — even though two systems sit underneath.

### 4.2 Self-attestation boundary on "I'm a student"

The student choice must fork on **self-attested capacity/role**, not a birthdate threshold:

- **Self-learner (may self-sign-up):** copy like *"I'm a student — I can create and manage my own account"* → account-holder signup with `isSelfLearner: true` (today's [`/account/signup`](../src/app/account/signup/page.tsx) checkbox, elevated to a primary path).
- **Dependent learner (cannot self-create):** prominent secondary path — *"A parent or guardian manages my account — ask them to set you up"* (or equivalent) — links to guardian-oriented signup or help, **not** an account-creation form. **Do not** gate this fork with "18+", "under 18", or any absolute age claim in logic or copy (see §7.9).

### 4.3 CTA pre-selection + escape hatch

Singular CTAs aimed at one audience (e.g. tutor landing *"Sign up now!"*) **pre-select** that signup type via query param or wizard step, with a visible **"Not a tutor? Choose a different account type"** (or equivalent) escape hatch to re-select.

**Today:** hero "Create your account" → `/signup` (tutor only) with no role picker.

---

## 5. Login design (ratified)

### 5.1 Link ordering

**Reorder login links: Tutor → Student → Parent** (account holder).

Rationale: tutors are the primary commercial audience; students (child PIN) are a distinct credential shape; account-holder email login is the third path.

*Note:* [`MarketingHeader.tsx`](../src/components/marketing/MarketingHeader.tsx) already uses Tutor → Parent → Student; implementation should move **Student above Parent** and rename Parent → account-holder label (§7).

### 5.2 Keep tutor login on its own link

Tutor login stays at **`/login`** (NextAuth), separate from the non-tutor adaptive page.

**Rationale:** adult email cannot distinguish tutor from account holder (both email+password). A single auto-routing field would either leak "is this a tutor" (enumeration) or require a server round-trip. Start simple: dedicated tutor link; the **adaptive page is for non-tutors only** (student child handle + account-holder email).

### 5.3 Smart adaptive non-tutor login (progressive disclosure)

**Single identifier field** on one page (new route or evolution of `/account/login` + `/students/login` merge). Progressive credential enablement as the user types.

**Discriminator — dot in the domain part after `@`:**

| Identifier pattern | Interpretation | Credential |
|---|---|---|
| Empty / incomplete `@` | Unknown | Both credential fields **disabled** |
| `@` present, part after `@` has **no `.`** | Child learner handle (`username@familyid`) | **PIN** enabled, password disabled |
| `@` present, part after `@` contains **`.`** (real TLD) | Email → account holder | **Password** enabled, PIN disabled |

**Helper text examples (ratified):**

- `a@b` → *"Child student login"*
- `a@b.c` → *"Student login"* (self-learner / account-holder email)

### 5.4 Hard invariant — `familyId` MUST NOT contain `.`

The dot discriminator (§5.3) **only works** if `familyId` cannot masquerade as an email domain. This is a **hard dependency / invariant**: **`familyId` MUST NOT contain a `.` (dot)** — the unified-login routing depends on it (`no dot after @` → child PIN; `dot in domain part` → email/password).

**Enforce at all paths:**

1. **Auto-generation / slugify minting** — never emit a dot.
2. **Parent set/change validation** — reject any value containing `.` (today's `^[a-z0-9_]{3,24}$` satisfies this but is not documented as guarding the login discriminator).
3. **All test fixtures / seed data** — never hand-write a dotted `familyId`.

**Current code** already satisfies this via slugify + the update regex, but nothing guards it as an explicit invariant — a future grammar change or a hand-written fixture could silently break login routing.

**Tracked:** BACKLOG **`AUTH-FAMILYID-NO-DOT-INVARIANT`** — guard tests + audit all mint/override/import paths.

### 5.5 Same-page layout — password-manager friendly

**Not** a "Next" button multi-step username-first flow.

| Requirement | Detail |
|---|---|
| Credential fields stay in DOM | Progressive **enable/disable**, not mount/unmount |
| `autocomplete` | Identifier: `username`; password: `current-password` |
| Two separate inputs | PIN field and password field both present; show/hide — **do not** flip one input's `type` between `password` and `text` mid-entry for the active credential |
| Empty state | Both PIN and password disabled until identifier discriminates |

**Divergence from today:** child login at `/students/login` intentionally uses `autoComplete="off"` + `data-lpignore` to stop parent email/password autofill clobbering child fields ([`p2b-smoke-fixes.md`](handoff/p2b-smoke-fixes.md)). The unified page must preserve that anti-clobber behavior for PIN mode while allowing proper `autocomplete` for email+password mode.

### 5.6 API routing (implementation sketch — not ratified detail)

On submit:

- Email shape → existing `POST /api/auth/account-holder/login`
- Handle shape → existing `POST /api/auth/learner/login` (body field today is `username` for the full handle)

No new auth backend required; this is primarily **UI composition + discriminator logic**.

---

## 6. Divergences — current code vs this redesign

| Area | Today | Redesign |
|---|---|---|
| Login pages | Three separate pages | Tutor separate; non-tutor unified adaptive |
| Signup | `/signup` (tutor) + `/account/signup` (AH) | Unified role picker → route into existing backends |
| Copy | "Parent" throughout UI | "Account holder" (or user-facing synonym — §7) |
| Header sign-in menu | Tutor → **Parent** → Student | Tutor → **Student** → Account holder |
| Hero parent line | "Sign in to your parent account" | Folded into unified non-tutor login or updated label |
| Child login autofill | `autoComplete="off"` on child page | Selective: off for PIN path, standard for email path |
| `WB-LABEL-PARENT-SIGNIN` | Backlog item to pick new parent label | **Subsumed** by this redesign (§7) |

**Preserve unchanged:**

- Two-backend split (NextAuth vs custom AH/learner cookies)
- Handle grammar and `parseLoginHandle` semantics
- `assertOwnsLearnerProfile` and access-mode gates
- Email verification gate on account-holder login

---

## 7. Open decisions / follow-ups

Do **not** decide here — track for implementation planning:

1. **Rename scope** — "parent → account holder" across code (`parentEmail`, `parent_session_select` enum), UI, and marketing: full rename vs user-facing copy only vs phased.
2. **Unified single-field login including tutors** — server-side identifier lookup (`AdminUser` vs `AccountHolder` vs learner handle) vs ratified separate-tutor-link approach. Latter is default; former is optional future optimization.
3. **Handle-grammar hardening** — subsumed by §5.4 hard invariant + BACKLOG **`AUTH-FAMILYID-NO-DOT-INVARIANT`** (guard tests + audit all mint/override/import paths; defense-in-depth reject at login parse time).
4. **Edge-case emails** — identifiers like `user@localhost` or `user@co.uk` (multiple dots): confirm discriminator rules and helper copy.
5. **`account_holder_session` learners on unified page** — PIN login returns `access_mode_mismatch`; copy should steer to account-holder sign-in (already partially exists).
6. **Route URLs** — keep `/students/login` as redirect to unified non-tutor page vs canonical new path (e.g. `/sign-in`); affects bookmarks and middleware redirects.
7. **Google OAuth** — tutor-only today; no change ratified for account holders.
8. **Component reuse** — unified flows should compose [`AuthShell`](../src/components/auth/AuthShell.tsx) / shared auth primitives per [component-reuse rule](../.cursor/rules/component-reuse.mdc); no fourth bespoke auth page.

### 7.9 Age & consent — do NOT hardcode a cutoff (design constraint)

**Rule (Andrew, 2026-06-30):** No hard age cutoff in logic; no absolute age claims in user-facing copy ("18+", "adults only", "under 18", etc.). The signup fork and account-holder framing turn on **self-attested capacity/role** — *"I can create and manage this account (and consent) for myself"* vs *"I manage accounts for learners who cannot self-consent"* — not a birthdate threshold.

**Rationale — real-world edge cases:**

- A person under 18 who already lives independently / on their own.
- Jurisdictions outside the US where the age of majority is lower, or where someone is considered a self-consenting adult earlier.
- An advanced minor, e.g. a 17-year-old already in college.

**Legal framing is open — needs counsel, not product assertion:** Who can self-consent, COPPA/under-13 handling for genuine minors whose data we process, FERPA implications, and international age-of-majority variance all require **legal review before finalizing copy**. Do **not** assert legal conclusions in implementation or docs; mark as open / needs-counsel.

**Separate axis:** COPPA/parental-consent obligations for **actual children's data** are distinct from the self-attestation account-creation gate and **still apply** when we process minor learners' data — guardian consent flows, claim/setup, and per-tutor consent lattice are unchanged by this constraint.

**Tracked:** BACKLOG **`AUTH-AGE-NO-HARD-CUTOFF`**.

**Backlog subsumption:** **WB-LABEL-PARENT-SIGNIN** (pick a new term for "Parent sign in") is resolved by this redesign's account-holder framing — close or redirect that item when implementation starts; do not one-off rename in isolation.

---

## 8. Sequencing

| Decision | Ratified |
|---|---|
| Account-holder reframe | **Yes** (Andrew, 2026-06-30) |
| Capture design now, build later | **Yes** |
| Sarah-gating | **No** — Sarah is a tutor; her students can use current login during pilot |
| Target build window | **Post-Sarah** |

**Suggested implementation order (when scheduled):**

1. Unified non-tutor login page (adaptive discriminator + dual credential fields) — highest user-visible win; middleware/deep links can redirect old URLs.
2. Unified signup role picker with self-attestation fork (§4.2, §7.9).
3. Marketing/header copy + link order (Tutor → Student → Account holder).
4. Optional rename pass (§7.1) — may be large; decouple from (1)–(3) if needed.

**Verification:** smoke both themes on new auth surfaces; regression on learner PIN throttle (`[lpr]` logs), account-holder rate limit, and access-mode rejection; password-manager manual pass on Chrome/Safari.

---

## 9. Related docs

- [`docs/handoff/session-identity-access-design-2026-05-31.md`](handoff/session-identity-access-design-2026-05-31.md) — three-principal architecture
- [`docs/handoff/identity-phase2-auth-session-design-2026-06-01.md`](handoff/identity-phase2-auth-session-design-2026-06-01.md) — session cookies, middleware
- [`docs/handoff/authed-session-access-design-2026-06-10.md`](handoff/authed-session-access-design-2026-06-10.md) — notes auth wall, login entry points
- [`docs/LEGAL-SYNC.md`](LEGAL-SYNC.md) — consent copy constraints
- [`AGENTS.md`](../AGENTS.md) — `[lpr]`, `[ahx]`, `[rol]` log prefixes

---

*Ratified by Andrew, 2026-06-30. Design capture only — no production changes in this commit.*
