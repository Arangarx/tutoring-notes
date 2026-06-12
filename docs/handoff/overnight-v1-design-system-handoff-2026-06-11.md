# Overnight handoff — full-site v1 design-system build (`v1-design-system`)

**Created:** 2026-06-11 ~23:17 (orchestrator session switch, mid-overnight run)
**For:** the fresh orchestrator chat picking up the overnight redesign.
**Read order for a fresh chat:** `AGENTS.md` → `docs/handoff/ORCHESTRATOR-STATE.md` → **this doc** (most current re: the overnight run) → `docs/V1-COMPONENT-LIBRARY.md`.

> ORCHESTRATOR-STATE.md was NOT updated for the overnight run at handoff time because the working tree was owned by the live foundation build (write/git race). **First durable-write task once the tree is free: a heavy ORCHESTRATOR-STATE restructure** folding in everything below.

---

## ⚑ UPDATE 2026-06-11 ~23:19 — FOUNDATION LANDED, TREE FREE

The foundation library build **completed and committed** to `v1-design-system` @ **`300ef0b`** (pushed). `npx next build` exit 0 (full route table, 40 static pages); jest 2219 pass / 6 pre-existing unrelated DB/env failures. The working tree is now **free** — no agent owns it.

**Fresh chat: foundation is confirmed DONE — skip the git-log verify and go straight to the two pending durable writes (scheduling-reqs + STATE restructure), then the surface fan-out (Groups A–G).**

**Foundation deferred library gaps (surface agents need these):**
- `AdminSidebarNav` composed component not built — use `AdminPageShell` new `sidebar`/`sidebarWidth` props + §1A.8 patterns for now.
- `FormattedNotesBody` / `RecapEditor` (B4) not built.
- No `rounded-panel` Tailwind alias — use `rounded-[10px]` until config extends.
- Legacy `.btn`/`.card`/`.container` still in `globals.css` — intact; delete only after surfaces migrate (final cleanup).
- `next-themes` dep pulled by shadcn CLI but unused (sonner uses app `ThemeProvider`) — removable in a cleanup pass.
- 27 primitives now in `src/components/ui/`; `Providers` mounts `TooltipProvider` + `Toaster` app-wide; `/admin/pending-approval` duplicate-nav fixed.

---

## What this overnight run is

Andrew's directive: by morning, produce a single branch with the **entire site** redesigned into the v1 look & feel, built from a **frozen canonical component library** (build the library first, then compose every surface from it). Maximize breadth/coverage; he reviews every surface in the morning. This is explicitly **not** WB-sync work (low regression risk) — that's why it's safe to run hard overnight.

**Integration branch:** `v1-design-system` (created off `v1-redesign` @ `1456581`). All overnight work merges back into it for Andrew's morning review.

## Locked decisions (Andrew, 2026-06-11)
1. **Coverage over caution** (option B): maximize surfaces; integration branch + per-surface worktrees + a `next build` gate on each merge is the safety net. A bad merge is rejected and waits for Andrew rather than poisoning the branch.
2. **Canonical styling = shadcn (new-york) + Tailwind 4 + Mynka Blue semantic tokens.** Rip out legacy `globals.css` `.btn`/`.card`/`.container` as each surface converts (delete the legacy CSS block only once grep shows zero usages — final-cleanup step).
3. **Library-first standard (now a ratified rule).** No component enters a page unless it's in the library first (or added to an existing library component **with a full regression pass against all known usages**). Extremely similar composed components are the SAME parameterized component; one new internal piece ≠ a new composition (make the layout handle the piece present/absent). No unnecessary duplication of UI surfaces OR provider/services. Foundation agent is strengthening `.cursor/rules/component-reuse.mdc` with this.
4. **New/unbuilt pages:** visual-first from the library + nav in place; wire opportunistically only if trivial & low-risk; else visual-only. Breadth + visuals primary.
5. **Whiteboard:** sync/engine OFF-LIMITS (see fence below). WB chrome is already v1. The ONE WB task permitted tonight: the phone-landscape "bars to the left" tweak — isolated, `npm run test:wb-sync`-gated, and abandoned (left for the WB thread) if not clean.

## In-flight at handoff
- **Foundation library build** — subagent `48e84797-cb34-42ca-90cc-b1902c851e15` (Composer 2.5, background, spawned by the PRIOR chat so THIS chat gets no completion notification). It builds the full primitive catalog in `src/components/ui/` (dialog, alert-dialog, dropdown-menu, select, tabs, sheet, popover, tooltip, badge, checkbox, radio-group, textarea, separator, skeleton, table, alert, accordion, progress, avatar, scroll-area, sonner, calendar — plus the existing button/input/label/card/switch), makes additive-only shell improvements, fixes the `/admin/pending-approval` duplicate-`AdminNav` bug, updates `docs/V1-COMPONENT-LIBRARY.md`, strengthens `component-reuse.mdc`, then `npx next build` (exit 0 gate) + commit + push `v1-design-system`.
  - **VERIFY ITS STATUS FIRST:** `git log --oneline v1-design-system` — look for `feat(ui): frozen v1 component-library foundation`. If present → foundation done, proceed. If absent → it may still be running in the prior chat (give it time / read its transcript) — do NOT relaunch blindly or you'll race the tree.

## Pending durable writes BLOCKED on the tree being free (do these first once foundation lands)
- **A. Scheduling + calendar requirements** → `docs/BACKLOG.md` § Scheduling + new `docs/handoff/scheduling-requirements-2026-06-11.md`. Capture (Andrew, verbatim intent):
  - Native-first: scheduling works fully through our app; not everyone integrates.
  - **Apple Calendar (Sarah's explicit request)** + **Google Calendar (Andrew)** as first-class integrations; design room for "other." When connected, events created in-app ALSO push to that calendar.
  - **Open question:** two-way sync — do we need webhooks/subscriptions (Google Calendar push / Apple CalDAV) to detect changes made ON the external calendar and reflect them back to us?
  - **Bundle the Google OAuth work:** calendar scopes need re-scoped Google access + site re-verification (ties to the Mortensen Apps consent screen — see `docs/LEGAL-SYNC.md`). Do **Google Sign-in (auth)** in the SAME consent/verification cycle as the calendar scope request to avoid repeated verification/permission extensions.
  - Tonight: **visual only, no wiring** — but the visual must bake in this model (a "connect calendar" affordance, per-event sync state, an integrations settings area).
- **B. Heavy ORCHESTRATOR-STATE.md restructure** folding in this entire overnight run (dispatch Composer from the template once the tree is free).

## Surface fan-out plan (launch AFTER foundation commit; isolated worktrees, file-disjoint, merge each `--no-ff` into `v1-design-system` with a `next build` gate between merges)
Surface agents CONSUME the frozen library and may **not** edit it (log gaps → consolidated foundation follow-up). Groups (largely route-folder-disjoint → safe true parallelism via `best-of-n-runner` worktrees, each branched off the foundation commit):
- **Group A — public/legal/feedback:** `/`, `/features`, `/privacy`, `/terms`, `/feedback` (heavy LEGACY).
- **Group B — parent share:** `/s/[token]`, `/s/[token]/all`, `/s/[token]/whiteboard/[wsid]` (heavy LEGACY; faithful to `site-redesign-mock-parent-share-2026-06-10.html`).
- **Group C — admin/tutor:** `/admin/students`(+detail+notes), `/admin/settings/**`, `/admin/outbox`, `/admin/cost`, operator lists (`/admin/feedback`, `/admin/tutor-approvals`, `/admin/dev-tools`), `/admin`. Mocks: student-list, student-detail, settings.
- **Group D — account/parent:** `/account/dashboard`, `/account/children/[id]`(+notes+devices) + **new parent consent-edit page**.
- **Group E — student:** `/students/login`, `/join` → **build the waiting room (Gate A2)**, + **new student sub-options/preferences page**.
- **Group F — scheduling:** best-shot native scheduler per the scheduling-requirements doc (A above). No mock exists — net-new design from the library + BACKLOG; flag clearly for Andrew.
- **Group G — WB phone-landscape bars-to-left:** isolated, sync-fenced, `test:wb-sync`-gated, best-effort.

Auth pages (`/login`,`/signup`,`/account/*` auth, `/students/login`, claim flow) are already **V1** — minor polish only.

## Whiteboard fence (do NOT touch in a visual pass)
`src/lib/whiteboard/**`, `src/hooks/useLiveAV.ts`, `useCollaboratorPointers.ts`, `useStudentWhiteboardCanvas.ts`, `src/lib/av/**`, `WhiteboardWorkspaceClient.tsx`, `StudentWhiteboardClient.tsx`, `src/app/admin/students/[id]/whiteboard/actions.ts` + `notes-actions.ts`, `src/components/recording/**`, `SessionCostPanel`, `TutorNotesSection`. Safe chrome boundary: `src/components/whiteboard/chrome/**` + `whiteboard-chrome.css` (already v1 — leave unless doing Group G).

## Process constraints (hard-won — honor them)
- **One tree-writer at a time** in the main working tree (shared-tree race). True parallelism = isolated worktrees (`best-of-n-runner`); never two live-stack tasks against shared services (DB 5432, relay `wb-relay-local`, port 3100, per-worktree `npm ci`).
- **Build-surface changes require a real `npx next build`** (exit 0) — jest alone is insufficient (fonts/CSS/lint/type-check pipeline).
- **WB-touching changes require `npm run test:wb-sync`** (Docker relay; `npm run relay:build` once).
- **PowerShell commits:** write msg to `.git/COMMIT_MSG_DRAFT.txt` → `git commit -F` → delete temp file in a SEPARATE sequential step.
- **Push:** retry transient network failures (backoff); never force-push.

## Already committed earlier tonight (pointers, on `v1-redesign`)
- Recording/replay invariant matrix (I1–I5/M1–M6) ratified + canonized: `docs/handoff/recording-rearchitecture-design-2026-06-05.md` @ `950d13a` (D3/D4 SUPERSEDED/CLARIFIED notes preserve audit trail; lifecycle-brief conflict resolved). Fix path B for replay: build consolidation, restore native single-stream + defer-on-release scrub (M2), don't polish the stitcher.
- Platform→tutor metering = **wall-clock** (cash + tokens) ratified @ `1456581` (`docs/BACKLOG.md` § Pricing). Distinct from tutor→student billing (already settled).

## Open threads parked for after the redesign
- Student-WB migration steps 3–9 (flag-gated shell wiring + cutover; needs Andrew confirms: student URL keep/retire, camera default; real 2-device smoke).
- Recording consolidation slice build (fix path B) implementing the matrix.
- Map/reduce auto-notes ACCURACY workstream (currently poor; own design+eval pass).
- Learner-swap design thread (learner-scoped tokens, per-learner privacy/consent, per-learner notes finalization).

## Live todo list at handoff
1. ✅ Inventory surfaces + design system
2. ✅ Create `v1-design-system` branch
3. ✅ Architectural decisions locked
4. ⏳ Foundation library build (subagent 48e84797 — verify via git log)
5. ⬜ Parallel surface conversion (Groups A–E) → merge each into `v1-design-system` with build gate
6. ⬜ New pages + scheduling (Group F) per scheduling-requirements doc
7. ⬜ WB phone-landscape tweak (Group G) — best-effort
8. ⬜ Final `next build` gate + morning status doc (every surface: done/partial + logged library gaps)
9. ⬜ Scheduling+calendar requirements durable capture (do right after foundation commit)
10. ⬜ Heavy ORCHESTRATOR-STATE restructure (do right after foundation commit)
