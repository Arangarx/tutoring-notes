# Mynk — Organization / University Pilot Backlog

**Status**: Captured 2026-05-18, NOT YET STARTED.
**Gating**: This work starts when all of these are true:
1. Current solo-tutor offering is stable in Sarah pilot use (no
   active reliability fires, recorder lifecycle solid).
2. UX refresh (docs/UX-REFRESH-PLAN.md) is complete.
3. Brand identity finalized: **name VALIDATED 2026-05-18** (see
   `docs/MYNK-BRAND-NAME-VALIDATION-NOTES.md`); colors/typography/voice/mascot
   decisions still pending (brand walkthrough Phase 2 — TBD, to be captured in
   `docs/MYNK-BRAND-CAPTURE-CHECKLIST.md`).

**Master plan tracking**: Phase 12 (tentative numbering — see
`~/.cursor/plans/tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md`).

**Forward-compatibility hooks already flagged**:
- UX refresh (in flight) is constrained to not preclude future
  `/org/[id]/...` URL scoping. See `docs/UX-REFRESH-PLAN.md` for
  the locked-in constraint.
- **Solo-tutor non-degradation**: Org features are strictly additive.
  Solo tutors continue using the product unchanged. See
  "Hard constraint: Solo-tutor non-degradation" below.

---

## Hard constraint: Solo-tutor non-degradation

**Captured 2026-05-18.** Org features are **strictly additive**. Solo
tutors continue using the product **unchanged** unless they explicitly
create or join an organization.

- **Data model**: `"tutor exists, no org affiliation"` is a
  first-class state — not a legacy edge case or temporary onboarding
  gap.
- **UX**: introduces **zero** friction for solo tutors — no "are you
  part of an org?" prompts, no unused org-nav surfaces in the default
  tutor view.
- Andrew explicit (2026-05-18): *"I'm not pivoting to 'screw the
  tutor.'"*

This constraint is non-negotiable for Phase 12 design and
implementation. Department pilots must not regress Sarah's (or any
solo tutor's) daily workflow.

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

### Timeline (provisional, captured 2026-05-18)

Andrew-provided sequencing (provisional — quality over arbitrary
deadlines; Andrew: *"quality + first impression is priority, so no
rushing for rushes sake, but that would be a nice goal."*):

| Window | Focus |
|--------|--------|
| **This week** (~through 2026-05-25) | Close current operational loops (security Tier A, legal drafts) + pilot stability |
| **~1 week** (~end of May / early June 2026) | Brand walkthrough + brand decisions + domain/handle grabs — **conditional** on Mynk name validation (see Strategic context → name-validation status below) |
| **~1–2 weeks** (~early–mid June 2026) | UI refresh executes with brand baked in (`docs/UX-REFRESH-PLAN.md`) |
| **~1–2 weeks** (~mid–late June 2026) | Phase 12 org pilot MVP build |
| **Late June+** (target) | Prof meeting prep + pitch deck |
| **Mid–late August 2026** (target deadline) | Prof meeting before end of BYU spring/summer term |
| **Before fall semester 2026** (stretch goal) | Department deal in place |

### Strategic context: warm intro to first customer

Andrew has a personal connection to a recently-retired business
professor at a local university (BYU implied by timeline anchor) who
has offered to (a) take a first presentation himself, and (b) help
approach departments afterward.

**Implications for planning:**

- **First paying customer path** runs through a **department** (warm
  intro), not solo-tutor public launch — Phase 12 is positioned
  **before** Phase 10 public-launch gates, not after.
- **Phase 10a (pricing decision)** is **pre-prof-meeting urgent**
  (mid–late August 2026 deadline), not pre-public-launch.
- **First-impression quality bar is high** — warm intros from
  credentialed sources don't come twice; demo flow must work for a
  **non-tutor-evaluator persona** (prof watches, asks pointed
  questions, does not use the product himself).
- Pricing, UX refresh ("hard refresh"), and org pilot MVP are on the
  critical path to that meeting — see Timeline above.

**Name-validation status (Mynk, 2026-05-18):** Operational commit but
**not** 100% locked. Domain/handle grabs **deferred** until
step-by-step name validation completes (trademark landscape, domain
landscape, social handle landscape, adjacent brand conflicts,
international pronunciation, SEO). Andrew: *"Let's walk through this
one step by step if we need to see if I'm being dreamy or it's a
realistic name to grab."* Once validated, brand walkthrough produces
decisions that feed the UI refresh.

Open questions to resolve before fire (do NOT answer here — these
are for Andrew when the work fires):

1. **Phase ordering** — **UPDATED 2026-05-18:** Resolved directionally.
   First paying customer path is a **department** via warm intro (see
   Strategic context above), not solo-tutor public launch. Phase 12
   org pilot MVP is on the critical path **before** Phase 10 launch
   gates (pen-test, Stripe, public solo launch). Phase 10a pricing
   decision is **pre-prof-meeting urgent** (target mid–late August
   2026), not "when tutor #2 appears." Phase 10b+ Stripe can remain
   manual/light until department deal closes. Re-validate at fire time
   only if the warm intro falls through.
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

- **2026-05-18 strategic capture** — docs-only update from Opus
  orchestration chat: hard-refresh scope + brand-feeds-refresh
  sequencing (`docs/UX-REFRESH-PLAN.md`); solo-tutor non-degradation
  hard constraint; third gating item (brand identity finalized);
  provisional timeline; warm-intro strategic context; phase-ordering
  open question #1 updated (department-first path, Phase 10a
  pre-meeting urgent). Master plan Phase 12 / Phase 10a / UX refresh
  entries updated in place.
- **2026-05-18 captured** — orchestrator dispatched this doc and
  the master-plan Phase 12 entry from the Opus chat via the new
  inline subagent dispatch pattern (see AGENTS.md "Model usage
  protocol" → "Default execution path"). Andrew dictated the full
  P0/P1/P2 spec; orchestrator added the gating, open-questions,
  and UX-refresh forward-compat hooks.
