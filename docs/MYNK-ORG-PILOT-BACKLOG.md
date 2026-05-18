# Mynk — Organization / University Pilot Backlog

**Status**: Captured 2026-05-18, NOT YET STARTED.
**Gating**: This work starts when both of these are true:
1. Current solo-tutor offering is stable in Sarah pilot use (no
   active reliability fires, recorder lifecycle solid).
2. UX refresh (docs/UX-REFRESH-PLAN.md) is complete.

**Master plan tracking**: Phase 12 (tentative numbering — see
`~/.cursor/plans/tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md`).

**Forward-compatibility hooks already flagged**:
- UX refresh (in flight) is constrained to not preclude future
  `/org/[id]/...` URL scoping. See `docs/UX-REFRESH-PLAN.md` for
  the locked-in constraint.

---

## Goal

MYNK - ORGANIZATION / UNIVERSITY PILOT BACKLOG

Goal:
Enable tutoring departments, tutoring centers, and future organizations to onboard multiple tutors under a single account/payment without building enterprise software prematurely.

Primary objective:
Reduce friction enough that a university department can realistically pilot Mynk with minimal setup.

DO NOT BUILD YET:
- SSO
- Teams integration
- LMS integration
- procurement workflows
- role hierarchies
- departmental analytics dashboards
- enterprise permissions
- custom contracts
- complex seat trees
- institution-specific features

Build only enough to support:
"One department, multiple tutors, one bill."

---------------------------------------------------
P0 - Organization Model
---------------------------------------------------

[ ] Create Organization entity

Fields:
- id
- name
- ownerUserId
- createdAt
- subscriptionTier
- usagePoolType
- usageLimit
- usageConsumed
- status

Possible usagePoolType:
- sessionCredits
- sessionHours
- AI/minute credits
- future expansion

Keep internal implementation abstract.

---------------------------------------------------
P0 - Organization Membership
---------------------------------------------------

[ ] Organization members table

Fields:
- organizationId
- userId
- role

Initial roles only:

ADMIN
- invite/remove users
- manage organization
- view usage

TUTOR
- create/use sessions

Do NOT build more roles yet.

---------------------------------------------------
P0 - Tutor Invites
---------------------------------------------------

[ ] Invite tutor via:
- email invite
OR
- invite link

Invite flow:

Admin
→ invite tutor
→ tutor signs up/logs in
→ tutor joins organization

Keep flow extremely simple.

---------------------------------------------------
P0 - Shared Usage Pool
---------------------------------------------------

[ ] Organization-wide pooled usage

Usage deducted from organization instead of individuals.

Examples:

Small department:
- 500 session credits

Medium department:
- 1500 session credits

OR

Small department:
- 10 active tutors

Do not expose implementation details.

Internally usage can later map to:
- Whisper cost
- AI cost
- storage cost
- Fly cost
- future cost metrics

Externally show only:

- total usage
- remaining usage

---------------------------------------------------
P0 - Admin View
---------------------------------------------------

Simple organization dashboard:

Show:

- organization name
- active tutors count
- total sessions created
- usage consumed
- usage remaining

Optional:
- recent tutor activity list

Do NOT build analytics.

---------------------------------------------------
P1 - Session Ownership Rules
---------------------------------------------------

Sessions created by tutors belong to:

Tutor
AND
Organization

Organization admin should retain access to:
- session metadata
- usage metrics

Do not solve complex privacy rules yet.

---------------------------------------------------
P1 - Billing Structure
---------------------------------------------------

Goal:

Single organization payment.

Initial assumptions:

Department pays
→ tutors use

No student accounts required.

No per-student billing.

No invoicing system yet.

No procurement system yet.

Can initially use:
- manual Stripe subscription
- manual organization creation

---------------------------------------------------
P2 - Pilot Validation Goals
---------------------------------------------------

Measure:

- onboarding time
- tutor adoption rate
- sessions per tutor
- repeated usage
- confusion points
- requested features

Main question:

"Does Mynk reduce tutor/admin pain enough that departments want to continue?"

NOT:

"Can Mynk support enterprise universities?"

---------------------------------------------------
Guiding principle:

Optimize for:
"Can I onboard a tutoring department in 15 minutes?"

NOT:

"Can I sell to universities at scale?"

---

## Orchestrator notes (Opus chat, 2026-05-18)

Open questions to resolve before fire (do NOT answer here — these
are for Andrew when the work fires):

1. **Phase ordering**: Andrew tentatively positioned this as
   Phase 12, gated on UX refresh + current-offering stability.
   Whether it precedes or follows Phase 10 (launch gates: pen-test,
   pricing decision) depends on whether the first paying customer
   is a department or a solo tutor. Decide at fire time.
2. **Organization data model interaction with existing
   `Student.adminUserId` ownership assertions**: per AGENTS.md,
   server actions assert `assertOwnsStudent(adminUserId, studentId)`.
   Phase 12 needs an equivalent for org-scoped resources
   (`assertOrgMember(userId, orgId, role)`) without weakening the
   per-tutor assertion. This is the auth-boundary work that, per
   the model usage protocol, triggers Sonnet-or-Opus tier for
   design.
3. **Per-session ID prefix**: new `org` prefix for organization
   lifecycle logging? Register in AGENTS.md when the work fires.
4. **Stripe subscription model**: "manual Stripe subscription" in
   the P1 billing section means a Stripe Customer per Organization,
   billed for an Organization-level plan. Decide subscription
   schema at fire time; tied to whatever pricing Phase 10a lands
   on.
5. **UX refresh forward-compat hook**: already flagged in
   `docs/UX-REFRESH-PLAN.md` as a constraint on nav/URL structure.
   When this phase fires, verify the UX refresh actually honored
   the constraint before building the org-admin views.

## History

- **2026-05-18 captured** — orchestrator dispatched this doc and
  the master-plan Phase 12 entry from the Opus chat via the new
  inline subagent dispatch pattern (see AGENTS.md "Model usage
  protocol" → "Default execution path"). Andrew dictated the full
  P0/P1/P2 spec; orchestrator added the gating, open-questions,
  and UX-refresh forward-compat hooks.
