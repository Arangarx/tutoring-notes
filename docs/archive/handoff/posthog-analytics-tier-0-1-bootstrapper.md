# PostHog analytics — Tier 0 + Tier 1 — executor briefing (Phase 11 observability foundation)

> **Recommended model: Composer.** Well-trodden patterns — npm install, a Next.js App Router provider component, event capture calls at known sites, additive CSP origins, additive privacy-policy paragraph synced from an upstream the user controls. No novel architecture. ~half day Composer time + ~30 min Andrew validation on Vercel Preview. Opus is overkill.
>
> **This file is your complete task briefing.** If you're seeing it because Andrew pasted its contents or `@`-referenced it at the start of a fresh Composer chat, your instructions are below — start by reading the AGENTS.md + the other files in the "Read first" section, then proceed through the deliverables in order. No further confirmation needed; begin work.

You are building **Phase 11 task 1 — product analytics foundation (PostHog cloud Tier 0 + Tier 1)** for the tutoring-notes app. **Branch + smoke + direct merge to master per AGENTS.md merging convention** — NO PR step.

## Workspace + path discipline

Working repository root: **`c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes`** (Windows absolute path).

**ALL file paths shown without a `c:\` drive-letter prefix are RELATIVE to that root.** Before any shell command, `Read`/`Write`/`Edit` tool call, file operation, or filename in a log message, you MUST prepend the absolute root. Example: `src/lib/security/csp.ts` resolves to `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\security\csp.ts`. Verify with `Get-Location` (PowerShell) before any file write. NEVER create files at a path that starts with a sibling-repo name.

## Branch discipline

**You are starting in a workspace where the active branch may be ANYTHING.** Cursor's per-workspace git state persists across chats; do not assume `master`. Your FIRST action after the read-first reads is to set up the branch correctly.

Run in PowerShell, sequentially, verifying each succeeds:

```powershell
git status                                                # if uncommitted changes exist, STOP and ask the user
git fetch origin                                          # retry on transient DNS failures (Andrew's git-push-retry rule applies)
git checkout master                                       # switch to master
git pull origin master                                    # fast-forward
git log -1 --format='%H %s'                               # expect tip at f30877e (UX foundation merge) or later; if older, STOP
git checkout -b feat/posthog-analytics-tier-0-1           # branch off master
git status                                                # confirm clean tree on new branch
```

**After branch setup:**
- Push after Commit 1: `git push -u origin feat/posthog-analytics-tier-0-1`. Triggers Vercel Preview deploy.
- Andrew smokes against the Vercel Preview URL using a real PostHog cloud project he provisions in advance.
- **NEVER push directly to master.** Branch → commit → push → smoke (Andrew) → merge (Andrew or you-on-Andrew's-go-ahead).

## Hard prerequisite (verify BEFORE you start)

The **mortensenapps.com umbrella privacy policy must already contain the "Analytics and logging" paragraph that names PostHog explicitly** (drafted in the orchestrator chat, deployed by Andrew to the mortensenapps.com site repo). The product `/privacy` you'll edit in this bootstrapper must match that umbrella paragraph verbatim per `docs/LEGAL-SYNC.md`.

**Action**: fetch `https://www.mortensenapps.com/privacy` and grep for the word "PostHog" in the response. If absent, **STOP and tell Andrew the umbrella deploy is pending — do not proceed**.

If you find the umbrella paragraph, copy its exact text into your scratch buffer; Commit 4 of this build embeds it into the product `/privacy`.

## Project context

> Andrew added analytics + measurable UX-refresh goals overnight 2026-05-17→18. The pilot is currently 1 tutor (Sarah, ~5 sessions/week). Two motivations:
>
> 1. **Measure the UX refresh.** The active UX work (`docs/UX-REFRESH-PLAN.md`) targets click-reduction (3→1 to start a recording, 4-6→2 to start a whiteboard session). Without analytics, those targets are aesthetic — with analytics they're measurable. Phase 2 of the UX refresh becomes data-driven once this lands.
> 2. **Dashboard for what's used vs. unused.** Combined with the existing `CostEvent` table (OpenAI usage observability shipped earlier) and the upcoming `AiNoteEditSignal` table (Idea 2 Phase 1 sibling bootstrapper), this gives a triple-axis view: behavior (PostHog) × cost (CostEvent) × AI-quality (edit signals).

This is **Tier 0 + Tier 1 combined**. Tier 0 alone (just install + identify) would be ~1 hour; Tier 1 adds the custom events + session replay + masking audit and brings the total to ~half day. Both Tiers are landed in one branch because Tier 0 alone has no measurable value without event coverage.

**Tier 2 (dashboard at `/admin/insights` joining PostHog + CostEvent + AiNoteEditSignal) is NOT in this scope** — it's a separate phase once we have data accumulating.

### What you are NOT building (explicit non-scope)

- **NOT a custom `/admin/insights` dashboard.** Tier 2 — different bootstrapper, post-data-accumulation.
- **NOT funnels / cohorts / retention reports in code.** Those live in the PostHog dashboard UI Andrew configures; not our infrastructure.
- **NOT analytics for share-link surfaces** (`/s/**`, `/w/**`). Those are parent / student / unauthenticated audiences — capture nothing, no replay. Hard rule.
- **NOT email tracking** (opens, clicks, deliveries). Different observability axis; out of scope.
- **NOT A/B testing or feature flags YET.** PostHog supports both, but we're not wiring any specific A/B in this build. The SDK install enables both for future use.
- **NOT a custom event taxonomy beyond the 7 listed in Commit 3.** Resist scope creep; new events ship in later bootstrappers as new features land.
- **NOT self-hosted PostHog.** Andrew chose cloud (US region) explicitly. Migration cloud→self-host is a future possibility, not this build.

## Critical safety constraints (READ before implementing)

**Constraint #1 — Masking discipline is non-negotiable.** PostHog session replay captures DOM mutations including every `<input>` / `<textarea>` / `contenteditable` value. Without explicit masking, student names / parent emails / session notes / share emails / transcripts all end up in PostHog's storage. One missed surface = student data in third-party SaaS. **Commit 5 is a masking audit that MUST be completed before replay is enabled in any environment.** If you skip the audit or short-cut it, you ship a privacy regression.

**Constraint #2 — Replay scope must be admin-only.** PostHog provides config to allowlist URL patterns for replay capture. Set the allowlist to `/admin/*` only. Share links (`/s/*`, `/w/*`) and public surfaces (`/`, `/login`, `/signup`, `/privacy`, `/terms`, `/feedback`) are never replayed. Test by visiting a share link in incognito on the Preview deploy and confirming the PostHog dashboard shows zero replay sessions from that surface.

**Constraint #3 — Identify the tutor by `adminUserId` only, never by email or name.** `posthog.identify(adminUserId)` once after NextAuth session loads. Do not pass `properties.email`, `properties.name`, or any human-identifying string. PostHog's distinct-id is sufficient; we can join to our own User table by adminUserId if we need a name later. (Yes this means PostHog's UI shows opaque UUIDs as user identifiers — that's fine for a tiny pilot, and protects us from accidentally leaking PII into a third party.)

**Constraint #4 — CSP additions must use the canonical PostHog ingest hosts for US cloud.** The hosts are:
- `https://us.i.posthog.com` (ingest endpoint — events, replays)
- `https://us-assets.i.posthog.com` (static assets — the SDK loader, recorder script)

Add both to `connect-src` AND `script-src` in `src/lib/security/csp.ts`. The regression test (`src/__tests__/regressions/csp-headers.test.ts`) will need an additive update. Verify the test still passes after your changes.

**Constraint #5 — Privacy-policy embed must match upstream verbatim.** Per `docs/LEGAL-SYNC.md`, when the umbrella adds a section, the product version embeds it verbatim. Copy the umbrella's "Analytics and logging" paragraph EXACTLY into `src/app/privacy/page.tsx`. Do not paraphrase. Update the "SYNCED FROM ... as of YYYY-MM-DD" date in the file header to today's date. Update the in-UI "Last updated: May 2026" string if needed.

**Constraint #6 — No analytics on the public landing page.** The PostHog provider should NOT fire any events on `/` (the public landing). PostHog auto-captures pageviews; you must disable auto-pageview for public surfaces OR scope the provider mount to authenticated routes only. The cleanest path: mount the provider only inside an `(authenticated)` route group, or check session status before enabling capture.

**Constraint #7 — Logging discipline.** Per AGENTS.md per-session-ID convention, custom events should include the relevant session ID where applicable. For per-recording events use `rid`, for per-whiteboard-session use `wbsid`, for per-action invocations use `aid` (already exists via `createActionCorrelationId`). Pass these as PostHog event properties so the UI can filter by session.

**Constraint #8 — Don't break existing tests.** The CSP regression test enforces an exact match against `buildContentSecurityPolicy(...)` output. Update the expected string in the test to include the new PostHog hosts. `npx jest src/__tests__/regressions/csp-headers.test.ts` must be green. No other existing test should regress.

## Read first (in order)

1. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\AGENTS.md` — workspace conventions (per-session ID logging, CSP discipline, merge convention, the legal-sync rule).
2. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\docs\LEGAL-SYNC.md` — read the full sync protocol. Your privacy-policy edit follows it.
3. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\docs\PLATFORM-ASSUMPTIONS.md` — you'll be adding a new external dependency (PostHog cloud, US region); document it here per the platform-assumptions convention.
4. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\security\csp.ts` — the CSP builder. Add PostHog hosts to `connect-src` AND `script-src`.
5. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\middleware.ts` — sees the CSP builder being called; no changes here, just understand the call site.
6. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\__tests__\regressions\csp-headers.test.ts` — the regression test you must update.
7. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\layout.tsx` — the root layout; PostHog provider mounts here (or in a child layout for authenticated-only scope).
8. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\admin\layout.tsx` (if it exists; check) — the admin route group; if present, this is where to scope the provider.
9. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\admin\students\[id]\page.tsx` — the busiest tutor surface; useful reference for what events to fire and where.
10. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\admin\students\[id]\AudioInputTabs.tsx` + `AudioRecordInput.tsx` — recording controls; `recording_stopped` event fires here.
11. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\admin\students\[id]\AiAssistPanel.tsx` — AI fill; `transcribe_invoked` and `ai_fill_accepted` events fire here.
12. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\admin\students\[id]\whiteboard\StartWhiteboardSession.tsx` — `whiteboard_started` event fires here (post-consent, pre-redirect).
13. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\privacy\page.tsx` — the product privacy policy; embed the umbrella's PostHog paragraph + restore "Analytics and logging" as a dedicated section.
14. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\env.ts` — env-var validator; add `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` as optional strings (analytics is a soft-fail dep, not hard-required).

## YOUR SCOPE — what is IN this chat

### Commit 1 — Install + env wiring + provider scaffolding (no events yet)

Files: `package.json`, `src/lib/env.ts`, `src/app/layout.tsx` (or appropriate child layout), new `src/components/analytics/PostHogProvider.tsx`.

- `npm install posthog-js` (latest stable; pin a major version in package.json).
- Add `NEXT_PUBLIC_POSTHOG_KEY` (string, optional) and `NEXT_PUBLIC_POSTHOG_HOST` (string, optional, default `https://us.i.posthog.com`) to `src/lib/env.ts`. Both optional so the app boots without PostHog configured (dev or self-hoster who skips analytics).
- Create `src/components/analytics/PostHogProvider.tsx` — client component that initializes PostHog if env vars are present, no-ops otherwise. Pattern:
  ```tsx
  "use client";
  import posthog from "posthog-js";
  import { PostHogProvider } from "posthog-js/react";
  import { useEffect } from "react";

  export default function AppPostHogProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
      const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
      if (!key) return;
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
        capture_pageview: false,  // we will fire pageviews manually, scoped to /admin/*
        autocapture: false,        // manual event taxonomy only
        disable_session_recording: true, // turned on in Commit 5 after masking audit
        person_profiles: "identified_only", // anonymous visitors do not get a profile
      });
    }, []);
    return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
  }
  ```
- Mount in the **admin route group's layout** (not the root layout — public landing must not load PostHog at all). If `src/app/admin/layout.tsx` does not yet exist, create it as a passthrough that wraps `{children}` in `AppPostHogProvider`.
- **Identify the tutor**: in a child client component inside the admin layout (`src/components/analytics/IdentifyTutor.tsx`), use `useSession()` from next-auth and call `posthog.identify(session.user.id)` exactly once when session becomes authenticated. Do NOT pass email, name, or any human-identifying property.
- Commit message: `posthog: install SDK + scaffold admin-scoped provider (no events yet)`.

Tests: new `src/__tests__/components/analytics/PostHogProvider.dom.test.tsx`:
- Renders no-op when `NEXT_PUBLIC_POSTHOG_KEY` is undefined.
- Calls `posthog.init` exactly once when the key is defined (mock posthog).
- Does NOT call `posthog.identify` when session is unauthenticated.
- Calls `posthog.identify` exactly once after session becomes authenticated.

### Commit 2 — CSP + Permissions-Policy + regression test update

Files: `src/lib/security/csp.ts`, `src/__tests__/regressions/csp-headers.test.ts`.

- Add to `connect-src`: `"https://us.i.posthog.com"` and `"https://us-assets.i.posthog.com"`.
- Add to `script-src`: `"https://us-assets.i.posthog.com"` (the SDK loader + recorder bundle is fetched from this host).
- Update the regression test's expected string to include the new hosts.
- Update `docs/PLATFORM-ASSUMPTIONS.md` — add PostHog to the "External APIs" section with the cloud-tier + US region + free-tier limits documented.
- Commit message: `posthog: add CSP origins for ingest + assets; update regression test + platform assumptions`.

### Commit 3 — Custom event taxonomy + manual pageview

Files: a new `src/lib/analytics/events.ts` + the surfaces that fire events.

- Create `src/lib/analytics/events.ts` exporting a typed wrapper:
  ```ts
  import posthog from "posthog-js";

  type EventName =
    | "session_started"       // tutor opens student detail page
    | "recording_stopped"     // MediaRecorder.stop() resolves
    | "transcribe_invoked"    // transcribeAndGenerateAction starts
    | "ai_fill_accepted"      // AI populates form, tutor doesn't immediately re-record
    | "note_saved"            // SessionNote created or updated
    | "email_sent"            // outbound email queued/sent
    | "whiteboard_started";   // workspace mounts post-consent

  export function track(event: EventName, properties?: Record<string, unknown>) {
    if (typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    posthog.capture(event, properties);
  }

  export function trackPageview(pathname: string) {
    if (typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    if (!pathname.startsWith("/admin")) return; // hard rule: admin-only
    posthog.capture("$pageview", { $current_url: pathname });
  }
  ```
- Wire `trackPageview` in `src/components/analytics/PostHogProvider.tsx` to fire on `usePathname()` changes, gated on admin path.
- Wire `track("session_started", ...)` in the student detail page when it mounts for a logged-in tutor (include `studentId`).
- Wire `track("recording_stopped", { rid, durationSec })` in `useAudioRecorder.ts` (the hook that owns the FSM) at the same point a recording finalizes.
- Wire `track("transcribe_invoked", { aid, segmentCount })` in `AiAssistPanel.tsx` just before `transcribeAndGenerateAction` is called.
- Wire `track("ai_fill_accepted", { aid, promptVersion })` in `AiAssistPanel.tsx`'s handle-fill path (after `formRef.populate(...)` returns and the tutor has not immediately re-recorded — i.e. the form held the AI-filled values).
- Wire `track("note_saved", { noteId, aiGenerated })` in the save-action result handler in `NewNoteForm.tsx` (client-side success path).
- Wire `track("email_sent", { noteId, provider })` in the email send-action result handler.
- Wire `track("whiteboard_started", { wbsid, studentId })` in `StartWhiteboardSession.tsx` right before the redirect to the workspace.
- Commit message: `posthog: wire 7 custom events + admin-scoped pageviews`.

Tests: extend `src/__tests__/components/analytics/PostHogProvider.dom.test.tsx`:
- `trackPageview` is a no-op for `/` and `/login`.
- `trackPageview` calls `posthog.capture` for `/admin/students/123`.
- `track` is a no-op when env key is missing.

### Commit 4 — Privacy-policy embed (umbrella sync)

Files: `src/app/privacy/page.tsx`, `docs/LEGAL-SYNC.md`.

- Fetch `https://www.mortensenapps.com/privacy` and locate the "Analytics and logging" section. Copy the umbrella's paragraph(s) verbatim.
- In `src/app/privacy/page.tsx`, restore "Analytics and logging" as a dedicated section (it was previously inlined into "What data we collect"). Position it between "Where data is stored" and "Data retention and deletion" (matches umbrella order).
- Update the file-header doc-comment `SYNCED FROM https://www.mortensenapps.com/privacy as of 2026-05-17` date to today's date.
- Update the in-UI `<p className="muted">Last updated: May 2026</p>` if the umbrella's "Last updated" date moved.
- Update `docs/LEGAL-SYNC.md`:
  - In the per-section classification table for `/privacy`, add a row: `| Analytics and logging | **Umbrella** — names PostHog cloud (US region) explicitly per the umbrella; product page reproduces verbatim |`.
  - Append a History entry dated today: "Analytics-and-logging section restored as dedicated header. Umbrella paragraph naming PostHog cloud verbatim embedded. Triggered by PostHog Tier-0+1 install on feat/posthog-analytics-tier-0-1."
- Commit message: `legal: sync /privacy with umbrella's new Analytics-and-logging section (PostHog)`.

### Commit 5 — Masking audit + enable session replay

Files: every `<input>` / `<textarea>` / `contenteditable` site under `src/app/admin/**`, plus `src/components/analytics/PostHogProvider.tsx`.

This is the hardest commit and demands discipline. The masking audit must be exhaustive before replay is enabled.

**Audit procedure:**

1. `rg --type tsx 'textarea|<input|contentEditable' src/app/admin src/components | tee /tmp/masking-audit.txt` — enumerate every potential student-data surface.
2. For each result, categorize:
   - **Safe (no PII)**: filter inputs, date pickers, session-type selects, settings toggles. → no masking needed.
   - **Student-touching**: note body (topics/homework/assessment/plan), student name, parent email, share link form, AI textarea (`#ai-session-text`), whiteboard consent name input. → must be masked.
3. For each student-touching surface, apply masking via one of:
   - HTML attribute: `<textarea data-ph-no-capture>...</textarea>` (entire element + value not captured in replay; events still fire).
   - PostHog config: in the provider init, add `session_recording: { maskAllInputs: true, maskInputOptions: { ... } }` for global default-mask-all. **Recommended**: use global default `maskAllInputs: true` for the safest posture, then explicitly opt-OUT specific safe inputs with `data-ph-mask="false"`. Less surface area for human error.
4. Document the audit result in a new file `docs/POSTHOG-MASKING-AUDIT.md` listing every audited surface and its decision. This is the artifact a future contributor checks before adding any new input element to `/admin/**`.
5. In `PostHogProvider.tsx`, flip `disable_session_recording: false` AND configure replay with the chosen masking strategy AND configure replay URL allowlist:
   ```ts
   session_recording: {
     maskAllInputs: true,   // safest default
     maskTextSelector: "*", // mask all text content too
     // ...
   },
   ```
6. **Smoke verification step in the commit message + checklist**: visit `/s/<some-token>` (share-link surface) in incognito on the Vercel Preview. After 30 seconds, check the PostHog dashboard's Replay tab — there must be ZERO sessions from `/s/*`. If any appear, the URL allowlist isn't working; STOP and fix before merge.

Commit message: `posthog: complete masking audit + enable session replay (admin-only, masked-by-default)`.

### Commit 6 — Wrap-up STATUS doc + master plan slot

Files: new `docs/PHASE-11-STATUS.md` (or your judgment on doc name), `docs/UX-REFRESH-PLAN.md`.

- Create the STATUS doc capturing what shipped, the masking-audit summary (count of student-touching inputs masked), the PostHog project URL Andrew should bookmark, and follow-up Tier 2 work (dashboard at `/admin/insights`).
- Update `docs/UX-REFRESH-PLAN.md`'s decisions log + add a note that Phase 1 / Phase 2 of the UX refresh now have measurable click-reduction goals (e.g. "Phase 2 success criteria: PostHog funnel `/admin → session_started → recording_stopped` completes in <= 2 events for >= 80% of tutor sessions").

Commit message: `posthog: STATUS doc + UX-refresh plan integration`.

## SMOKE CHECKLIST FOR ANDREW (executor: copy verbatim into your final report)

### Pre-smoke setup
- [ ] Provision a PostHog cloud project (US region) at https://us.i.posthog.com — note the project API key.
- [ ] Add to Vercel Preview env: `NEXT_PUBLIC_POSTHOG_KEY=phc_...` and `NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com`.
- [ ] Verify the umbrella deploy of `www.mortensenapps.com/privacy` contains the "Analytics and logging" paragraph naming PostHog (the bootstrapper's hard prerequisite check should have passed; this is a re-confirmation before tutor smoke).

### Functional smoke (Andrew runs on Vercel Preview)
- [ ] Visit `/` (public landing) → PostHog dashboard should show **zero events** from this surface.
- [ ] Visit `/login`, then sign in → land on `/admin/students` → PostHog dashboard should show 1 pageview event for `/admin/students` and `posthog.identify` was called with your `adminUserId`.
- [ ] Open a student page → `session_started` event with `studentId=...`.
- [ ] Record a short audio clip → stop → `recording_stopped` event with `rid=...` and `durationSec`.
- [ ] Click Transcribe → `transcribe_invoked` event with `aid=...` and `segmentCount=1`.
- [ ] AI populates form → wait 5s without re-recording → `ai_fill_accepted` event with `promptVersion=...`.
- [ ] Save the note → `note_saved` with `noteId` + `aiGenerated=true`.
- [ ] Send the parent email → `email_sent` with `noteId` + `provider`.
- [ ] Start a whiteboard session → `whiteboard_started` with `wbsid=...`.

### Masking + scope smoke
- [ ] In the PostHog Replay tab: confirm there are replay sessions from `/admin/*`.
- [ ] In a replay: confirm the textarea / form input values are MASKED (display as asterisks or "[redacted]") in the replay player. If any session-content text is visible, **STOP** and fix masking.
- [ ] Visit a share link `/s/<token>` (or `/w/<joinToken>`) in incognito → wait 30s → PostHog Replay tab must show **zero replays** from these surfaces. If any appear, the URL allowlist is broken.
- [ ] CSP smoke: open DevTools → Console on `/admin/students` → no CSP violations for `posthog.com` or `i.posthog.com`. If you see violations, the CSP didn't pick up the new origins.

### Final QA bars
- [ ] `npx jest src/__tests__/regressions/csp-headers.test.ts` — green.
- [ ] `npx jest src/__tests__/components/analytics/PostHogProvider.dom.test.tsx` — green.
- [ ] `npx jest` — no NEW failures vs repo baseline.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx eslint src/` — no new errors.

## WRAP-UP

1. Full test suite: `npx jest` (modulo documented DB failures from prior phases).
2. `npx tsc --noEmit` clean.
3. Final push: `git push origin feat/posthog-analytics-tier-0-1`.
4. Report back to Andrew with:
   - **Branch name**: `feat/posthog-analytics-tier-0-1`
   - **Test counts** (passed / failed; flag any NEW failures)
   - **Commit hashes** (Commit 1 → Commit 6 with brief description each)
   - **Masking audit summary**: count of student-touching inputs masked + count of safe inputs explicitly opted-out + path to `docs/POSTHOG-MASKING-AUDIT.md`
   - **Smoke checklist** (full list above, copy verbatim)
   - **Notable findings** (e.g. "Discovered an unmasked input in /admin/settings/profile during audit — also masked")
5. **STOP and wait for Andrew's smoke confirmation. Do NOT merge to master yourself.**
6. **If Andrew confirms smoke pass and asks you to merge**:
   ```powershell
   git checkout master
   git pull origin master
   git merge --no-ff feat/posthog-analytics-tier-0-1
   git push origin master
   ```

## STOP CONDITIONS

- **Don't enable session replay before the masking audit is complete.** Commit 5 is one indivisible unit; do not split "enable replay" and "do audit" into separate commits where replay could land alone.
- **Don't fire events on share-link or public surfaces.** Hard rule.
- **Don't pass tutor email or name to PostHog.** `posthog.identify(adminUserId)` only.
- **Don't introduce email tracking, A/B tests, or feature flags.** Out of scope; future bootstrappers.
- **Don't edit the umbrella mortensenapps.com legal text from this chat.** Andrew owns that repo; you only sync the product copy in `/privacy` to embed what's already there.
- **Don't touch `prisma/schema.prisma` or generate migrations.** Zero schema work.
- **Don't change `Permissions-Policy`.** Only `Content-Security-Policy` directives need updates.
- **Don't merge to master yourself.** Branch + push + WAIT for Andrew's smoke + go-ahead.
- **Don't modify the master plan file.** Orchestrator's job.

## HARD RULES

- Per-session ID logging extended to PostHog events: `rid` (audio), `wbsid` (whiteboard), `aid` (action correlation). Pass as event properties.
- CSP additions must be reflected in the regression test in the same commit (Commit 2).
- Privacy-policy embed must be verbatim from upstream (Constraint #5); paraphrasing breaks LEGAL-SYNC discipline.
- Replay scope is `/admin/*` only. Hard rule, no exceptions.
- Masking strategy is default-mask-all + explicit opt-out for safe inputs. Less error-prone than default-capture-all + explicit-mask.
- Identify uses `adminUserId` only, never email or name.
- `docs/POSTHOG-MASKING-AUDIT.md` is required Commit 5 deliverable; future PRs adding inputs to `/admin/*` check this doc before merging.
