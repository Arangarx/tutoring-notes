# Smoke checklist — feat/signup-waitlist (B1 tutor approval gating)

**Branch:** `feat/signup-waitlist`
**Date:** 2026-06-11
**Scope:** New tutor signups land WAITLISTED; cannot incur external cost until an operator approves.
Existing tutors (Sarah, Andrew) are grandfathered APPROVED by migration backfill.

---

## Pre-smoke: migration

The migration file `prisma/migrations/20260611000000_b1_tutor_approval/migration.sql` must be
applied to the Neon DB **before testing on Vercel preview**. Steps:

1. Apply via Neon SQL console or `prisma migrate deploy` (against a dev Neon branch, not main).
2. Confirm: `SELECT "approvalStatus", COUNT(*) FROM "AdminUser" GROUP BY "approvalStatus";`
   → all existing rows should show `APPROVED`.
3. Confirm `TutorApprovalStatus` enum exists: `SELECT typname FROM pg_type WHERE typname = 'TutorApprovalStatus';`

---

## Smoke A — new tutor signup → WAITLISTED redirect

### Setup
1. Sign up a NEW tutor account (not Sarah, not Andrew) via `/signup`.

### Steps
- [ ] A-1: After signup, log in with new tutor credentials.
- [ ] A-2: Should be redirected to `/admin/pending-approval` (middleware gates all `/admin/*`).
- [ ] A-3: Page shows "Account pending approval" copy with the signup email visible.
- [ ] A-4: "Sign out" button works → redirects to `/login`.
- [ ] A-5: Re-login → still redirects to `/admin/pending-approval` (status persists in JWT).

### Cost path negative tests (manual — best confirmed via console logs)
- [ ] A-6: Try to navigate to `/admin/students` directly → redirected to `/admin/pending-approval`.
- [ ] A-7: Try to call `createWhiteboardSession` via browser console / Playwright — should throw
         `TutorNotApprovedError` (blocked before Blob `put()`).
- [ ] A-8: Try to call `/api/upload/audio` token endpoint — should 4xx (no token minted).
- [ ] A-9: Try to call `/api/upload/blob` token endpoint — should 4xx.
- [ ] A-10: Confirm in Vercel logs: no `[wbCheckpoint.route]`, `[txc]`, `[tnt]` log lines from
          this WAITLISTED tutor's account.

---

## Smoke B — operator approves tutor

### Steps
- [ ] B-1: Log in as an operator (email in `OPERATOR_EMAILS` or `ADMIN_EMAIL`).
- [ ] B-2: Navigate to `/admin/tutor-approvals` → should see the new WAITLISTED tutor listed.
- [ ] B-3: Nav shows "Tutor approvals" link in operator section.
- [ ] B-4: Click "Approve" for the new tutor.
- [ ] B-5: Row disappears from the list (revalidation succeeds).
- [ ] B-6: In Vercel logs: `[tap] tap=<adminId> action=approved byOperator=<operatorId>`.

---

## Smoke C — tutor can use the platform after approval

### Steps
- [ ] C-1: New tutor logs in → **not** redirected to pending-approval, lands on normal page.
- [ ] C-2: New tutor can navigate to `/admin/students`.
- [ ] C-3: New tutor can start a whiteboard session (Blob seed put succeeds).
- [ ] C-4: New tutor can get upload token from `/api/upload/audio`.
- [ ] C-5: New tutor can enqueue transcription (cost spending confirmed by logs).

---

## Smoke D — grandfathered existing tutor (Sarah / Andrew) is unaffected

### Steps
- [ ] D-1: Sarah logs in → goes directly to her normal workspace (no pending-approval redirect).
- [ ] D-2: Sarah can start a whiteboard session, upload audio, enqueue transcription.
- [ ] D-3: In DB: `SELECT "approvalStatus" FROM "AdminUser" WHERE email = 'sarah@...'` → `APPROVED`.
- [ ] D-4: Andrew logs in (admin role) → goes to `/admin` dashboard normally.

---

## Smoke E — JWT refresh propagates approval change

- [ ] E-1: With a WAITLISTED tutor's active session, approve via operator UI.
- [ ] E-2: Within ~5 minutes (ROLE_REFRESH_INTERVAL_MS), refresh the tutor's session.
- [ ] E-3: Tutor should now be able to access the platform (approval propagated via JWT refresh).
- [ ] E-4: Confirm in logs: `[rol] sub=<id> approvalStatus=WAITLISTED->APPROVED`.

---

## Layer B background worker verification

- [ ] F-1: Enqueue a transcription job (via `enqueueChunkTranscriptionAction`) for a session
         owned by the WAITLISTED tutor (if you can do so before the middleware blocks it).
         → Worker should log: `[tap] wbsid=<id> action=worker_skip_unapproved` and return "skipped".
- [ ] F-2: Notes worker: `processNotesReduceJob` for WAITLISTED tutor session
         → logs `[tap] wbsid=<id> action=reduce_skip_unapproved` and returns
         `{ outcome: 'skipped', reason: 'tutor_not_approved' }`.

---

## Deferred TODOs (out of scope for B1)

- **REJECTED status**: no way to reject a tutor yet; binary WAITLISTED/APPROVED only.
- **Revocation UI**: no way to un-approve a tutor once approved (DB update possible directly).
- **Email notification**: WAITLISTED tutors are not emailed when approved.
- **Approval status in settings page**: approved tutors have no visibility of their status.
- **Google OAuth auto-provision**: none today; Google login is restricted to existing DB rows.
- **Marketing waitlist separation**: `WaitlistEntry` table (landing page signups) is separate
  from `AdminUser.approvalStatus` (account-level gating); the `/admin/tutor-approvals` page
  shows only WAITLISTED `AdminUser` rows.
- **Pagination**: `/admin/tutor-approvals` renders all WAITLISTED tutors inline; paginate if list grows.
