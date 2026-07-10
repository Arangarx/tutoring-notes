# Smoke checklist — parent-create-learner (2026-06-11)

Branch: `feat/parent-create-learner`  
Based on: `v1-redesign` tip @ `15ee25a`  
Auth boundary: HIGH (children's login credentials + ownership)

---

## What landed

| Item | File(s) |
|---|---|
| **Create-learner server action** | `src/app/account/dashboard/actions.ts` |
| **"Add learner" client form** | `src/app/account/dashboard/AddLearnerForm.tsx` |
| **Dashboard: Add learner UI + updated empty state** | `src/app/account/dashboard/page.tsx` |
| **Credential creation (POST handler)** | `src/app/api/learner-profiles/[id]/credentials/route.ts` |
| **"Set up login" client form** | `src/app/account/children/[id]/SetupLoginForm.tsx` |
| **Child detail: Set up login affordance** | `src/app/account/children/[id]/page.tsx` |
| **Notes page: no-tutor empty state copy** | `src/app/account/children/[id]/notes/page.tsx` |
| **Tests (14 passing)** | `src/__tests__/identity/parent-create-learner.test.ts` |

---

## Smoke path

### 1. Parent logs in and sees dashboard

- [ ] Log in as a parent account at `/account/login`
- [ ] Navigate to `/account/dashboard`
- [ ] Verify the **Learners** section shows:
  - Updated empty-state copy: *"You haven't added any learners yet. Click **Add learner** to create one…"*
  - An **Add learner** button in the card body

### 2. Parent creates a learner (name only)

- [ ] Click **Add learner** — form expands inline showing "Learner name" input
- [ ] Enter a name (e.g. **Alex**) and click **Create learner**
- [ ] Page navigates to `/account/children/<new-id>`
- [ ] Return to `/account/dashboard` — new learner **Alex** appears in the list
  - Shows "No login set up yet" (no credential)
  - Access mode shows "Account holder selects"

### 3. Parent opens learner detail page

- [ ] Click **Manage** next to Alex
- [ ] Page at `/account/children/<id>` shows:
  - Learner name: **Alex**
  - "Tutor's name for this student" row: **absent** (no Student link)
  - Login mode: "Parent/Guardian selects learner (no independent login)"
  - **Child login** section: shows "No login set up yet" copy + a **Set up login** button (not the old claim-flow link)

### 4. Parent sets up child login (PIN)

- [ ] Click **Set up login**
- [ ] Form expands with Username + PIN + Confirm PIN fields
- [ ] Enter:
  - Username: `alex1` (3–20 chars, letters/numbers/underscore)
  - PIN: `847261` (6 digits, not a weak pattern)
  - Confirm PIN: `847261`
- [ ] Click **Set up login** — page refreshes
- [ ] **Child login** section now shows:
  - Login handle: `alex1@<familyid>` (copyable)
  - "Your child signs in at the student login page…" message
  - **Change PIN** button appears

### 5. Child can log in at /students/login

- [ ] Open `/students/login` in a different browser / incognito
- [ ] Enter the full login handle shown on the parent dashboard (e.g. `alex1@smithfamily`) + PIN `847261`
- [ ] Login succeeds — child session established

### 6. Notes page shows "no tutor yet" copy

- [ ] From the child detail page, navigate to notes (there should be a link or go directly to `/account/children/<id>/notes`)
- [ ] Verify the empty state reads:
  - "This learner isn't connected to a tutor yet. Notes will appear here once a tutor is connected and sessions begin…"
  - NOT the generic "No session notes yet" copy

### 7. Ownership isolation (manual negative test)

- [ ] Log in as a **different** parent account (parent B) in a separate browser
- [ ] Attempt to visit `/account/children/<learner-id-from-parent-A>`
- [ ] Receives 404 (notFound guard) — cannot access another family's learner

### 8. Weak PIN rejection

- [ ] From the **Set up login** form, enter PIN `123456` (blocklisted)
- [ ] Error message: "That PIN is too easy to guess. Avoid sequences or repeated digits."
- [ ] Form not submitted

### 9. Invalid username rejection

- [ ] Enter username `no spaces` (contains a space)
- [ ] Error: "Username must be 3–20 characters: letters, numbers, or underscore only."

---

## Deferred TODOs (out of scope for MVP)

| # | Item | Notes |
|---|---|---|
| TODO-1 | **Tutor-discovery / connection flow** for parent-created learners | How a parent-created (tutor-less) learner later connects to a tutor. Currently a parent must wait for a tutor's claim link. |
| TODO-2 | **B2 per-tutor privacy re-consent** at tutor-connection time | When a parent-created learner is later connected to a tutor, consent UI (B2) needs to trigger. Currently B2 is parked globally. |
| TODO-3 | **Share-link behavior** for tutor-less learners | No share link exists; `/s/[token]` is tutor-scoped. Parent-created learner notes view (`/account/children/[id]/notes`) is the parent-access path instead. |
| TODO-4 | **Tutor-side claim issuance unchanged** | Tutor-issued claim links work as before. Parent-create is an additive path; nothing on the tutor/admin surface was touched. |

---

## Pre-existing test failures (not introduced by this branch)

4 pre-existing jest failures in the suite:
- `src/__tests__/auth.test.ts` — DB-connectivity
- `src/__tests__/password-reset.test.ts` — DB-connectivity  
- `src/__tests__/identity-2fa-management.test.ts` — stale page snapshot (admin nav)
- One transcript-store test (function mock mismatch)

New tests: **14 passing** in `src/__tests__/identity/parent-create-learner.test.ts`.

---

## Verification results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| ESLint (changed files) | ✅ 0 errors |
| `npx jest` (new tests) | ✅ 14/14 passing |
| `npx next build` | ✅ exit 0 |
| Schema migration needed? | ❌ None — `LearnerProfile` already supports tutor-less rows |
