# Tutoring Notes — Backlog

Living document for open work, pilot feedback, reliability gaps, and deferred product decisions.

**Andrew decision (2026-10-21): replay audio follows the consent snapshot at recording time.** If audio consent was off, the child is not recorded, so there is nothing to hide. Do not add a second gate on the child's current audio toggle.

## Go over soon (Andrew 2026-09-28)

**Keep at the top (Andrew 2026-10-05).** This whole section stays here until Andrew explicitly clears an item. Reviewing or refining does not mean deleting the raw notes or the open items under them, and it does not mean moving them down the backlog.

**Raw — Sarah meeting notes (Andrew 2026-09-28). Review and refine later. Not decisions.** Captured in Andrew’s wording. Do not treat any line as a locked requirement until he clarifies.

- SMS signup consent (Andrew’s own note, 2026-10-05, not Sarah’s). The agreement checkbox sits after **Send code**, and the button stays disabled until the box is checked, so the prerequisite is unclear. **Decision:** put the consent checkbox before the **Send code** button so it reads as a prerequisite. Not built yet.
- Adding a student sends the invite in that same step (Andrew 2026-10-05, refined the same day). The tutor does not later copy a claim link and send it. **Self learner:** invite by email alone. **Child learner:** invite by the parent’s email plus a child identifier, or by `childid@familyid` directly. If that account already exists, they approve tying it to this tutor. They are not asked to create a new account. Until the connection is approved, the tutor sees the email or child id we were given, because that is all we know. Not built yet.
- Calendar name display (Andrew 2026-10-05). **Decision:** calendar titles default to first name and last initial (Sarah’s suggestion). Remove the full-name checkbox from the student detail page. Do not add a tutor override in calendar settings unless later feedback asks for more options. Not built yet.
- Upcoming sessions (Andrew 2026-10-05). **Decision:** the tutor’s student detail page lists that student’s upcoming sessions (cap the list if many are scheduled far out). Almost everything else currently on that page comes off — Sarah said repeatedly that the page is too cluttered; it should be clean and easy to follow. Separately, the self learner/parent and the child learner see their upcoming sessions after login. Sarah does not send them a join link. Near session time that entry is prominent, and the button becomes active and takes them into the waiting room. Waiting room today: either person can be in the room first. A live remote session still starts only when the tutor presses Start, and that button stays disabled until the student is connected. In person, the tutor can start without the student connected. Not built yet.
- Role copy across the site (Andrew 2026-10-05). **Decision:** the three labels are **Tutor**, **Self learner/Parent**, and **Child learner**. Replaces “parent” / “student” where those labels confuse a self learner with a child. Not built yet.
- Claim-page password prompt (Andrew 2026-10-05). Not urgent. **When we touch it:** get Chrome to offer “Use strong password,” not only “Select password,” on the create-account password field. Test address from the Sarah session: `arangarx+sarahstudent@gmail.com`. Play with the form until the prompt is right. Not built yet.
- Self learner vs child (Andrew 2026-10-05). Same decision as the role-copy line above: a self learner and a parent are the same kind of account (**Self learner/Parent**). A child is **Child learner**. Not built yet.
- Session entry without a sent link (Andrew 2026-10-05). This affirms the upcoming-sessions decision above. **Decision:** a logged-in self learner/parent or child learner does not need Sarah to send a join link. The session is on their page when they log in. Near session time, that entry is prominent. Not built yet.
- Waiting-room session type (Andrew 2026-10-05). **Decision:** the two labels are **Online** and **In person** (replacing “Live (remote)” and “In-person”). Not built yet.
- Button capitalization (Andrew 2026-10-05). **Decision:** keep sentence case (first word and proper nouns only), which is current web practice (Material Design 3 says not to use title case on buttons). Apple’s native apps still title-case button labels; this product is a website, so sentence case stays. Do not add a site setting unless Sarah pushes and Andrew later says to. Not a build.
- Tutor video-tile name (Andrew 2026-10-05). **Decision:** show the tutor’s name on the tile the same way the student’s name is shown. If the tutor’s name is missing, keep the fallback **Tutor**. Not built yet. Today `resolveParticipantLabel` only fills a name for the student peer, so an unlabeled tutor tile falls back to the word Tutor.
- Name the tutor sees (Andrew 2026-10-05). **Decision:** before the connection is approved, identify by email or child id. After approval, the self learner or parent sets the name, prompted “How do you want to be seen by this tutor?” or “How do you want your child to be seen by this tutor?”, prefilled with first name and last initial. Family id is the login handle, not the display name. Not built yet.
- Other person’s cursor (Andrew 2026-10-05). **Decision:** show a live cursor. It hides after about five seconds still and comes back when it moves. There is no live cursor today: pointer sync sends the laser only (`tool: "laser"`, `renderCursor: false`). Same QoL family as the ghost view, which is already **Ghost viewport bounds overlay (VP-01 / SMOKE-POST-1)** in §4. Do not add a second ghost item. Not built yet.
- Whiteboard text size and text-box bounds (Andrew 2026-10-05). **Decision:** make both possible if the board can do it: the user changes the letter size, and they can set the text box bounds. UX is not decided. Other programs often have you drag the box first, then set the size in a control next to the text tool. Do not design the interaction until Andrew has tried it. Not built yet.
- Locked squares (Andrew 2026-10-05). **Decision:** on a keyboard, Shift while drawing a rectangle is enough. No separate locked-square tool. On a phone, a square still has to be possible without a keyboard (same open touch control as perfect circles). Not built yet.
- Perfect circles (Andrew 2026-10-05). **Decision:** Shift while drawing an ellipse, plus the modifier hint, is enough on a keyboard. A phone has no Shift key, so a square and a circle must still be possible there without a keyboard. How the touch control works is not decided. Not built yet.
- Triangles (Andrew 2026-10-05). **Decision:** add a triangle tool. If we build it ourselves, a right triangle is the default. Shift draws another type, Ctrl another, and further modifiers can add more. Which other types those are is not decided. A phone still needs those variants without a keyboard, same open touch problem as square and circle. Not built yet.
- Ghost of the other view: already in the backlog as **Ghost viewport bounds overlay (VP-01 / SMOKE-POST-1)** in §4. Andrew confirmed 2026-10-05. Label-only stub today; the rectangle is the open work. Do not add a second item.
- Modifier hints (Andrew 2026-10-05). **Decision:** common modifiers show on the board. Examples: Shift for a square or circle, Space for grab/pan. Working placement: a small cluster floating at the bottom right, like control hints in a video game. Nothing like that is on the board today. Not built yet.
- Whiteboard chat (Andrew 2026-10-05). **Decision:** add it, collapsed until someone opens it, as a convenience when audio is in trouble. It must not be a way around billable time. Do not change Start, the billable timer, or when the board is usable. Already **SMOKE-POST-2 — in-app text chat**. Do not add a second item. Not built yet.
- Drawing on the graph (Andrew 2026-10-05). **Decision:** the tutor can plot points and custom marks on the graph, in the graph’s own coordinates. A point at (1, 1) stays at (1, 1) when the zoom or scale changes. Do not paint Excalidraw strokes on top of the panel. JSXGraph already keeps points and curves in math coordinates. Our saved graph state only stores the bounding box and expression strings, so those objects still have to be added and saved with the graph. Not built yet.
- Graph expression box (Andrew 2026-10-05). **Decision:** put `y=` in front of the field, and use `2x+1` as the example. Placeholder today is `e.g. x^2, sin(x)`. Not built yet.
- Graph looked wrong when zoomed out (Andrew 2026-10-05). **Not a build.** Sarah’s `(3x+1)/(x^2+2)` looked wrong because the window was too wide, and zooming in fixed it. A new graph still opens from −10 to 10. Curve-aware framing is a separate later item: **Graph smart framing** in §4.
- Board renaming (Andrew 2026-10-05). **Decision:** a tutor can rename a board. Tabs are **Board 1**, **Board 2**, and so on, with no rename today. Not built yet.
- Insert math keyboard (Andrew 2026-10-05). **Decision:** the on-screen math keys must type into the equation and leave the dialog open. Today a click outside the card closes it, and the keyboard sits outside that card. Andrew has not tested this feature. Also check that it works on a phone. Not built yet.
- Insert image (Andrew 2026-10-05). **Decision:** an image creates a new board, the same way a PDF page does. The board tab gets a small icon that reads as a picture, parallel to the PDF document icon on PDF tabs. The upload chooser is PDF-only today and points PNG, JPEG, and SVG at the toolbar image tool, which places the picture on the current board. Later, if people ask, also allow inserting onto the current board. Not built yet.
- Finish review placement (Andrew 2026-10-05). **Decision:** move **Finish review** off the top bar and group it with the other two ways to leave the notes screen: **Save to notes** and **Cancel and delete session data**. The three stay visually separate, not crammed into one cluster. Not built yet.
- Billable presentation (Andrew 2026-10-05). **Open until he talks with Sarah again.** The review screen already shows rounded billed minutes under **Your billable time:** (`55 min`, or `1h 5 min`, plus a local start–end window when those times exist). It does not show the unrounded length beside that. Hypothesis to check with her: she wanted the rounded time and already saw it, but it was not obvious. Possible later presentation: **Actual time** and **Billable time** as two labeled values. Do not build until that conversation.
- Organizations (Andrew’s own note, 2026-10-05, not Sarah’s). Seed only: people in an organization will want to see tutor sessions. This is the next major feature he wants in, and the reason for the backlog cleanup. Existing home is §12 (org / university pilot) plus [`docs/MYNK-ORG-PILOT-BACKLOG.md`](MYNK-ORG-PILOT-BACKLOG.md). Spec is not locked. Do not build from this line.
  - **Waitlist (Andrew 2026-10-06):** the tutor waitlist exists so Andrew can cap cost from unsupervised signups. He expects it to be gone by the time he courts orgs. An org does not get its own waitlist. Tutors an org adds are inside a paying customer, so they are not held for his approval.
  - **Calendars (Andrew 2026-10-06):** a session the org places on a tutor eventually has to show on that tutor’s personal calendar too. Google scopes and setup wait until that work starts. The first slice is the in-app schedule.

**Status:** `REVIEWED` 2026-10-05. Decisions are on the items above. Still open with no build: billable presentation, until Andrew talks with Sarah. Organizations is his seed for the next major feature, not a Sarah decision. This section stays at the top until he clears each item.

**Org removal choice 3 (2026-10-12).** Andrew approved the additive `WhiteboardSession.notesForbidden` boolean (NOT NULL, default false) on 2026-10-12, and "End it now, and no notes" is now offered. Proposed choice-3 warning, not yet accepted: "No notes will come from this session. Ending it does not give the time back. After the free pilot, that time still counts as time used." In-flight uploads after an org-forced end use one window, `ORG_FORCED_END_UPLOAD_WINDOW_MS` (15 minutes), named once in `src/lib/org-session-access.ts`. Proposed suspension sentence, not yet accepted: "This session will end soon because the organization that set up this tutoring has had its account suspended." Proposed pending sentence, not yet accepted: "This session will end soon because the organization that set up this tutoring is not active yet." A tutor removed with Let it finish, then covered by a later End-it-now suspension, can have `endedAt` fall between `removedAt` and that removal's deadline. The upload window then treats the end as the tutor's own and rejects a late segment. Rare; leave it until someone hits it. Mark ready still finalizes a note after the 7-day removal window. That gap is older than this flag.

**[P1][WB] Student graph keeps flashing “Click to interact.”** Andrew 2026-09-28, live session with Sarah, Andrew as the student. The graph shows Excalidraw’s `buttons.embeddableInteractionButton` (“Click to interact”) over the middle of the embed. Clicking it does not clear it; it keeps coming back.

Cause: Excalidraw only shows that hint while `activeEmbeddable.state === "hover"`, and hover is the center third of the embed (`node_modules/@excalidraw/excalidraw` `isIframeLikeElementCenter`). A click sets `state: "active"` on that element object. The match is object identity (`activeEmbeddable.element === el`), not element id. Live sync replaces the scene element, so the click no longer matches, pointer-events on `.excalidraw__embeddable-container__inner` go back to disabled, and the next pointer move over the center shows the hint again. Our graph is `renderEmbeddable` → `GraphEmbeddable` with `readOnly={false}` for both roles (`WhiteboardWorkspaceClient`). The hint is Excalidraw chrome, not our graph UI.

**Decision (Andrew 2026-10-05):** hide the “Click to interact” words. Keep the click that hands the pointer to the graph, so a drag can still move the box before that click, and point or free draw (once those exist) happen only after it. Make that click survive live sync: today sync replaces the graph object, the click no longer matches, and the graph lets go of the pointer. Not built yet.

**[P1][AUTH] Self-learner claim still asks for a child username and PIN.** Andrew 2026-09-28, after connecting Andrew M as an adult self-learner. Privacy card correctly says parental preferences do not apply. The card under it still says “Create a username and PIN so your child can sign in on their device.” Same item as **WB-ADULT-JOIN-ENABLEMENT B3** (child-only claim PIN). `src/app/claim/[token]/setup/page.tsx` gates privacy on `profile.isSelfLearner` and leaves the credential card on for every profile that has no PIN yet. A self-learner already signs in with the email and password from account creation. **Set up later** skips this card. Server `action: "credentials"` also does not reject a self-learner profile.

**Decision (Andrew 2026-10-05):** a self learner/parent signs in with email and password only. The child username and PIN card appears only for a child learner. Same item as **WB-ADULT-JOIN-ENABLEMENT B3**. Do not track a second copy. Not built yet.

**[P1][AUTH] Claim verify-email lands on “create account or sign in.”** Andrew 2026-09-28, Sarah’s claim link for student Andrew M, email `arangarx+sarahStudent@gmail.com`. After “Create parent account,” the confirmation email opened the same claim card at the logged-out chooser (“Create parent account” / “I already have an account”) instead of the signed-in claim step.

Cause: signup does not sign the browser in. `/verify-email` → `/auth/verify-done` sets `mynk_ah_session` with `SameSite=Strict` and immediately redirects to `/claim/<token>` (`src/app/auth/verify-done/route.ts`, `buildAhSessionCookie`). A click that starts in Gmail is a cross-site navigation, so that Strict cookie is not sent on the claim request. The claim page shows `ClaimAuthGate` whenever `getAccountHolderSessionFromHeaders()` is empty (`src/app/claim/[token]/page.tsx`). The on-screen copy (“come back to this claim link”) describes a second visit; the email link itself is the return. Workaround this run: “I already have an account” with the password just created, or reload the claim URL once already on the site.

**Decision (Andrew 2026-10-05):** if the self learner or parent this link is for is already signed in, the link lands them on the signed-in claim step. That is the existing design, and it does not work consistently. The link must not complete the claim for a different signed-in account. Not built yet.

**[P1][UX] Student detail declutter — workshop, then rebuild.** Sarah (2026-09-28, while setting Andrew up as a test student): the student detail page is way too cluttered. A lot of what is on it belongs behind another tab or in settings. The page must be clean and easy to use. **Workshop before any build.**

What is on the page today (`src/app/admin/students/[id]/page.tsx` + `StudentDetailShell`):

- Desktop labels (Whiteboard, Share link, Notes & email, Parent account) are scroll anchors. All four cards stack on one page. The phone already hides inactive panels.
- The Share card leads with **Calendar event titles** (`icsShowFullName`): a paragraph plus a checkbox. That is a once-in-a-while privacy preference.
- The Notes card is a full compose form, plus send-update email, plus a link to the notes page.
- The header pins a site-wide **Outbox** link on every student.
- The Parent card is claim / connected parent, or the line “Parent account linking is not enabled” when `NEXT_PUBLIC_CLAIM_INVITES_ENABLED` is not `true`. Production env on this machine does not set that flag. Turning the flag on is a separate decision from this declutter.

Direction (Andrew 2026-10-05, supersedes the 2026-09-28 workshop sketch): almost everything now on this page comes off. The page lists this student’s upcoming sessions (capped if many are scheduled far out) and stays clean and easy to follow. The calendar full-name checkbox is removed entirely (see the calendar-name decision above), not moved into a student setting. Outbox stays in the main nav. Not built yet.

Related: `ADMIN-STUDENT-DETAIL-MOBILE-DISCOVER` / `MOBILE-ICONS` (merged, verify); “Unclaimed student claim link buried.”

- Stage 6 wrote three sentences the plan described but did not lock word for word (Andrew review, 2026-10-12). Reminder dialog: “The notes and the lesson replay are already in the family's account. This email only reminds them.” Share link: “The family signs in to open this link. You can revoke or regenerate it anytime.” Deletion card: “This student's account is being deleted. Sessions are off.” plus the deletion date.

**Status:** `OPEN` — go over soon.

## 🎯 Release priorities (Andrew 2026-07-30, option B) — do these first, in order

We are on the **release track**: expand beyond Sarah to unsupervised new pilots. **Re-ranked after Sarah 2026-07-29 meeting** (Andrew chose **B**: Google external before student-detail UX). Ordered priorities:

1. **External Google validation** — Apple ICS subscribe on a real device; any new OAuth scope needs its own verification. Write, ICS, and `calendar.events.owned` approval (2026-09-29) are shipped.
2. **Student-detail Start / consent / claim findability (P0)** — Shipped [`f08d56b5`](https://github.com/Arangarx/tutoring-notes/commit/f08d56b5). Remainder: optional flag-off Playwright, mobile viewport, desktop double mint button.
3. **Tutor signup / self-serve auth** — Shipped [`99da0111`](https://github.com/Arangarx/tutoring-notes/commit/99da0111) + [`c8d613ca`](https://github.com/Arangarx/tutoring-notes/commit/c8d613ca). Remainder: pagination deferred; invite links deferred (operator-invite vs open `/signup`).
4. **2FA pilots will finish** — Code shipped [`c8d613ca`](https://github.com/Arangarx/tutoring-notes/commit/c8d613ca). Remainder: SMS not live until Twilio env; TOTP upgrade; Sarah prefers SMS when available.
5. **Finish scheduling** — Native CRUD shipped [`1bbd9216`](https://github.com/Arangarx/tutoring-notes/commit/1bbd9216); Google write + ICS shipped (2026-09-21). Remainder: two-way sync (P3); Apple ICS hardware follow-up.
6. **Security MUST for strangers** — release-triage MUST security/ownership holes before unsupervised pilots.
   - **SEC-TUTOR-ADD-CAP** (Andrew 2026-10-06, deferred from feat/org-qol review): per-tutor daily cap on student adds/invite emails (prevents using our domain to spam and protects sender reputation); the existing pendingBeforeMint >= MAX check is dead for new students.
   - **SEC-ROSTER-HANDLE-ENUM** (Andrew 2026-10-06, deferred): createStudent by child username@familyid is a hit/miss oracle across families; needs rate limiting / indistinguishable responses before open signup.
   - **WB-SESSION-MAX-DURATION** (nit): end time earlier than start silently becomes ~23h session; consider a max-duration guard.
   - **SEC-AUDIT-PIPELINE + PEN-TEST — RELEASE GATE** (Andrew 2026-10-11): we do not go out to new pilots, even after `feat/org-qol` is done, until (a) a full security audit is hooked into the pipeline as a standing gate (runs on changes, not one-off), and (b) comprehensive pen testing has been run, AI pen-testing tools included (Andrew: "AI pen testing is pretty damn thorough now"). Separate follow-up plan after `feat/org-qol`; not in the org-sales plan. Supersedes the P3 "Phase 10-pre external pen-test" timing below (was "before first paying customer").
7. **Comprehensive instrumentation** — Chunk 1 shipped [`3e9cccf4`](https://github.com/Arangarx/tutoring-notes/commit/3e9cccf4). Remainder: **TXC-SWEEP-METRICS** (§10); **CAP-BOUNCE-ALERTS** (§10); no COPPA-path events yet. Terms/Privacy stay 100% honest.
   - **WB-IDLE-STILL-THERE (Andrew 2026-10-29, after release; not ordered):** the consent wave adds a 24-hour reaper that ends abandoned sessions. Later, replace waiting that long with an "are you still there?" prompt (Netflix-style) that ends idle sessions sooner. Design the idle signal (no strokes, no audio, no peers) and the timeout when picked up.
8. **Transcription language — English + Spanish (TXC-LANG, Andrew 2026-10-29).** Required before signing any tutor or family who works in Spanish. Not required for current English pilots, because the transcript hotfix tells tutors that transcription is English-only. **Build order:** after the consent wave and the org-leak fix (org UX W1), ahead of calculus. The design pass may start in parallel. **Scope v1:** a language setting per learner (English default), passed to transcription; a decision on what language the notes are written in; the in-session notice updated. **Later, separate:** safe auto-detect, only together with the silence guard (auto-detect on silent audio produced the foreign-text hallucinations). If a Spanish-speaking tutor or org gets close, move this up to right after the consent wave.
   - **Disclose before signup (Andrew 2026-10-29).** Telling the tutor at session time is too late. Nobody should subscribe before learning that a feature does not work in their language. Feature limits like this one appear on a page people see before they sign up, with where we are headed. Example wording: "Auto-notes currently support English only. Spanish is next, then more languages." Today the only roadmap is `/admin/settings/known-issues`, which requires sign-in, and its content (`src/lib/known-issues-roadmap-content.ts`) is stale. Un-stale it, and show the same content publicly (one source, not a copy), linked from the home page and signup.

**Background (not blocking the ordered list):** Wave A/B + tokens are done; Wave C/D dedupe (fragile WB/A/V — Opus-grade) remains open; agenticPipeline Phase 2; NativeSelect; design-system gallery. New work still = zero new duplication ([`docs/DEDUPE-PLAN.md`](DEDUPE-PLAN.md)).

### QUEUED — `/admin/design-system` component gallery (Andrew 2026-07-27)

**Why:** Andrew’s work days no longer have appetite for full-site manual reviews — hunting every card/subpage to eyeball dedupe/layout is too slow. Agents must give him a **findable, organized** eyeball surface instead of “go look around the app.”

**What:** Operator-gated (platform maintainer only — `OPERATOR_EMAILS` ∪ `ADMIN_EMAIL`; **not** future school/org admins) Next.js gallery at `/admin/design-system`, organized by composition tier:

1. Primitives (`ui/*` variant matrix)
2. Patterns (§1A recipes)
3. Compositions (SectionCard, SubNav, PageShell, …)
4. In-context deep links to live routes
5. Fenced (WB chrome / recording / A/V) — link-outs only; gallery does **not** claim to represent live session chrome

Each specimen: light/dark, canonical path, confidence badge (`isolated` | `composed` | `live-route-only`). Honesty rule: gallery PASS ≠ surface PASS when page-local CSS still overrides.

**Gate:** Same allowlist as feedback/dev-tools — rename/document as **site operator / platform**, never expand with org-admin roles.

**Sequencing:** Feedback anti-spam is on `master` (`src/lib/feedback-spam.ts`); thin Tier 1–2 first, then grow with inventory. Gallery waits on an executor wave. Sync with [`V1-COMPONENT-LIBRARY.md`](V1-COMPONENT-LIBRARY.md) + [`handoff/DEDUPE-EYEBALL-LIST.md`](handoff/DEDUPE-EYEBALL-LIST.md).

**Status:** `OPEN` — queued for next available executor wave (not Wave C/D fragile).

### Priority #1 — external Google approvals (ACTIVE remainder)

Sign-In UI **shipped on `master`**. **`calendar.events.owned` write, ICS feed, and Google verification approved 2026-09-29** (project `208762156520` / `my-apps-490005`; that scope only — new scopes need their own verification). Legacy connect stub [`da93ab78`](https://github.com/Arangarx/tutoring-notes/commit/da93ab78) was superseded by the calendar wave (scopes already narrowed). Native schedule CRUD **shipped** ([`1bbd9216`](https://github.com/Arangarx/tutoring-notes/commit/1bbd9216)).

**Remaining #1 work:** Apple ICS hardware follow-up; Andrew Google Cloud Console hygiene in [`docs/handoff/ANDREW-FOLLOW-UPS.md`](handoff/ANDREW-FOLLOW-UPS.md). Canonical plan: [`docs/handoff/CALENDAR-WAVE-PLAN.md`](handoff/CALENDAR-WAVE-PLAN.md).

**Optional polish (non-blocking):** shared Gmail/Calendar OAuth helper; tag `calendar-oauth-connect.spec.ts`; schedule sync badge honesty — write has shipped; badges covered by `tests/integration/calendar-sync-badge.spec.ts`. Optional Sign-In verify follow-ups: update `login.png` visual baseline; Playwright DOM-order assert; negative test when Google env unset; pre-existing login `page-has-heading-one` a11y.

### Non-negotiable standards (no exceptions without Andrew's explicit documented waiver — agents may NEVER self-authorize)

1. **ZERO unjustified duplication — no bespoke bullshit.** [`.cursor/rules/composition-no-duplication.mdc`](../.cursor/rules/composition-no-duplication.mdc).
2. **Exhaustive red/green testing to spec on every touched surface.** [`.cursor/rules/exhaustive-testing-mandate.mdc`](../.cursor/rules/exhaustive-testing-mandate.mdc).
3. **Independent agentic verification** of code + tests before done/merge; moving to a fully agentic pipeline. [`.cursor/rules/agentic-verification-pipeline.mdc`](../.cursor/rules/agentic-verification-pipeline.mdc).

**Recorded waivers**

- **WAIVER-LASER-PW-RED (Andrew 2026-10-06, `feat/org-qol`):** `tests/integration/wb-org-qol-surface.spec.ts` › "a laser drag does not add a stroke to either scene" cannot be shown red through the real app (a laser trail is an ephemeral pointer message, never a scene element). Kept as a regression guard; the red-before proof is the laser adapter unit test. Hardware regression check is item 29 in `docs/handoff/ORG-QOL-TYSON-TEST-PACKET.md`.
- **MASTER-PREEXISTING-GATE-FAILURES (Andrew 2026-10-24):** twelve Playwright tests failed the same way on hotfix `fix/wb-student-apply-race` and on unmodified master `eebafee1`. Waiver: merge the hotfix once its own tests and Sonnet review are green; these 12 stay known master failures. Full list in §9. The eight unknown-cause failures are investigated immediately after that merge. The second full gate (`0570a200`) also failed `tests/integration/wb-replay-scrub-seek.spec.ts:767` on master `eebafee1` (same VAD-harness-zero-segments family as `:645`); it is on the §9 investigate list. Recheck 2026-10-28 on `feat/org-qol`: the listed items that still failed on their own were the missing-OpenAI VAD note status and the org ad-hoc jest fixture. The rename test later timed out in a long tag run because the Next issues badge still covers the strip; that test now hides `nextjs-portal`. The rest of the list already passed. The tag grep itself stayed red on other tests. See the entry in §9.

### Triage corrections (Andrew 2026-07-10, on the swing-item review)

- **DEVICE-PICKER-DEDUPE / mobile Back-Front** — **best-effort; do NOT delay release** over it. Stays MAYBE, non-blocking.
- **Share/copy-link silent clipboard failure** — likely **fixed/moot**; VERIFY then close.
- **ST-05 laser** — bidirectional works; remaining is **color review only** (WB-LASER-ICON-CONTRAST), not functionality.
- **Student bidirectional video / dark-canvas (swing item H)** — status uncertain; **verify whether still an issue** against current `master`.
- **AI prompt v8 — homework → plan (swing item M)** — Andrew (2026-07-10): **PRIORITIZE** the prompt refinement. Promote toward MUST (note-quality moat). (Earlier "already relabeled" referred to form sections, not this.)
- **General:** backlog has stale/slightly-out-of-date rows — a **freshness pass against current `master`** is warranted when picking items up (many were extracted from now-archived docs).

---

**How to use this backlog**

| Symbol | Meaning |
|--------|---------|
| **P0** | Sarah-facing breakage — blocks confident pilot use |
| **P1** | Reliability / important — fix before scaling pilots |
| **P2** | Enhancement — real value, not day-one blocker |
| **P3** | Someday / post-pilot / strategic |

**Area tags:** `[REC]` recorder · `[AV]` live A/V · `[WB]` whiteboard · `[NOTES]` notes/AI · `[AUTH]` identity · `[CONSENT]` consent/COPPA · `[UX]` design/chrome · `[TEST]` harness · `[OPS]` platform · `[LEGAL]` legal · `[GTM]` commercial

**Status:** `OPEN` · `VERIFY` (shipped — confirm on hardware/gates, then close) · `WATCH` (merged — monitor) · `WAIVED` (known, accepted for cut)

**Sequencing:** wave order lives in [`docs/RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md) — do not duplicate here.

**Archive:** `docs/archive/` is cold storage; authoritative open work must appear here.

**Program overlay:** Experience-Driven Wedge (2026-06-12) — WB reliability = gate; continuity + note-quality = moat; instrumentation = first-party post-master. Founding principle: total honesty, no dark patterns. Spec: [`docs/research/continuity-wedge-brainstorm-2026-06-12.md`](research/continuity-wedge-brainstorm-2026-06-12.md).


## Release triage — new-pilot gate (2026-07-10)

Bucketed for expanding beyond Sarah to **unsupervised new pilots** (strangers, not Sarah). **MUST** = data loss, silent failure, broken core flow (record → notes → replay → share → lifecycle), legal/privacy/COPPA honesty violation, security/ownership hole, or untrustworthy-to-a-stranger. **MAYBE** = Andrew's risk-tolerance call. **1.x** = post-release enhancements, scale, org/university, pricing/strategy.

### MUST before new pilots

#### Recording & session lifecycle

- **B11** — release camera/mic tracks on session end (§3)
- **beforeunload guard mid-recording (reliability #9)** —  (§3)
- **Hot-swap mic / track.onended (reliability #7)** —  (§3)
- **In-progress segment IDB on crash (reliability #1)** —  (§3)
- **PRESARAH-1** — always-on recording; remove recording-intent toggles (§1)
- **recording-end-to-end** — review auto-start from 0 (§1)
- **recording-resilience** — SessionRecording rows after reopen (§1)
- **SMOKE-AUDIO-1** — first-acquire mic silent until switch-and-back (§1)
- **SMOKE-END-WINDDOWN** — disarm board + immediate student wind-down on End (§1)
- **Upload-failure blob persistence (reliability #2)** —  (§3)
- **W1-SHIP-B-FINALIZE** — `finalizeOutboxAfterEnd` drops all IDB rows (§3)
- **W1-SHIP-B-STUCK** — `stuck` semantics + UX vs `permanent-fail@50` (§3)
- **WS-B** — tab-kill resume loses pre-kill audio in replay/notes (§1)
- **WS-G** — server-side tutor:mic concat replay master (§3)
- **WS-N-PAGEHIDE** — in-progress segment flush at tab-kill (§3)
- **WS-N5** — resume FSM `armed` window drops stroke capture after reopen (§1)

#### Notes & AI

- **Map/reduce accuracy + abstain-on-low-content + eval harness** —  (§5)
- **SMOKE-NOTES-1** — post-End shimmer; form must stay visible (§1)
- **SMOKE-NOTES-3** — notes fabricate on non-teaching talk (§1)
- **WS-K** — fold the running note during the session; End only adds the tail (§3)

#### Whiteboard, sync & replay

- **AV-REFRESH-LOSS** — student hard-refresh loses A/V (§4)
- **Gate A2** — waiting room (§4)
- **Gate A5** — live bidirectional sync completeness audit (§1)
- **Gate A6** — replay fidelity + AV/timer sync comprehensive pass (§1)
- **Hide replay must pause audio** —  (§4)
- **In-person waiting-room consent projection (Plan #2)** —  (§4)
- **PDF cross-page stroke bleed / WB-STROKE-BLEED (verify/watch)** —  (§4)
- **Replay scrub drag** — 429s + frozen scene (§4)
- **SMOKE-BLOCK-5** — solo/in-person stroke capture in armed window (§4)
- **SMOKE-UX-1** — replay auto-play jumps to scrubber end (§1)
- **SSG-3 / A6-1** — multi-segment replay scrubber + proportional seek (§1)
- **Student canvas file sync (images/PDF)** —  (§4)
- **Student canvas stuck on "Loading scene…"** —  (§4)
- **Student Exit → rejoin presence desync** —  (§4)
- **Student undo/redo non-functional** —  (§4)
- **Unclaimed-student workspace entry redirect** —  (§4)
- **view-whiteboard-new-replay** — parent share strict-mode locator (§1)
- **wb-replay-scrub-seek ×3** —  (§1)
- **WS-T-8** — roster End shows replay CTA when recording-count===0 (§4)
- **WS-T-9** — gate-only End IDB crash (§4)

#### Live A/V & devices

- **BUG-8** — reconnect media transport not rebuilt after peer leave/rejoin (§1)
- **Phone student A/V** — bidirectional broken (§4)
- **SMOKE-BLOCK-1** — Start stays dead when a connected peer is under-counted; July branch deleted (§1)
- **WS-I-PRESTART-MUTE** — tutor mute before audio graph arms (§3)

#### Consent, COPPA & erasure

- **allowWhiteboardRecording real enforcement (WB-CONSENT-UNCONDITIONAL)** —  (§6)
- **assertEffectiveConsent legacy no_snapshot → pass** —  (§6)
- **CH-SMOKE-PLAYWRIGHT-GAP-CONSENT-ERASURE** —  (§6)
- **CLIENT-AUDIO-CONSENT-GATE** — client consent projection completeness (§1)
- **Consent modal removal** — Andrew legal sign-off (§6)
- **CONSENT-COLLECTION-COMPLETENESS (CC-1/CC-2)** —  (§6)
- **CONSENT-HONESTY-SARAH-MERGE-BLOCKER** —  (§6)
- **createChildLearnerAction** — no ConsentRecord at create (§6)
- **Erasure parent/account-holder self-serve UI + CRITICAL_ACTION** —  (§6)
- **Essentials-vs-optional tier ratification** —  (§6)
- **LIVE-SESSION-CONSENT-COPY** —  (§6)
- **LIVE-SESSION-START-AFFORDANCE** — hide Start when live sessions are off (§6)
- **Non-technical tombstone/grace copy** —  (§6)
- **Parent self-service erasure (non-admin)** —  (§6)
- **Sarah test-student audit + TEST purge** —  (§6)

#### Legal & privacy

- **Audio recording of minors** — consent flow research (§6)
- **CONSENT-LEGAL-CONSULT** —  (§6)
- **OpenAI vendor ops checklist** —  (§6)
- **PII / privacy policy before public launch** —  (§6)
- **SEC-POLICY-TRUTH** — retention lifecycle enforcement (§1)
- **Umbrella + product privacy retention (§312.10)** —  (§6)

#### Auth, identity & security

- **Account-takeover defense (2/3) notify-on-password-reset** —  (§6)
- **Account-takeover gap on existing-email signup** —  (§6)
- **Email-infrastructure prerequisite (Resend on usemynk.com)** —  (§6)
- **Gate B2** — parent privacy consent lattice + management UI (§6)
- **npm audit Tier B (SHOULD-FIX-4)** —  (§6)
- **SEC — /api/test/whiteboard/* gate hardening** — Core shipped [`bb6d3095`](https://github.com/Arangarx/tutoring-notes/commit/bb6d3095). Remainder: pin empty `PLAYWRIGHT_TEST_SECRET` in prod (§6).
- **VERIFY-ACCT-1** — Core shipped [`2fff57b7`](https://github.com/Arangarx/tutoring-notes/commit/2fff57b7). Remainder: Google OAuth cross-realm round-trip PLAYWRIGHT-GAP (Jest surrogate exists) (§6).
- **WB-ADULT-JOIN-ENABLEMENT B2-signup / B3 / B4** —  (§6)
- **SEC-TUTOR-ADD-CAP** (Andrew 2026-10-06, deferred from feat/org-qol review) — per-tutor daily cap on student adds/invite emails. The existing `pendingBeforeMint >= MAX` check is dead for new students.
- **SEC-ROSTER-HANDLE-ENUM** (Andrew 2026-10-06, deferred) — `createStudent` by child `username@familyid` is a hit/miss oracle across families. Needs rate limiting / indistinguishable responses before open signup.
- **WB-SESSION-MAX-DURATION** (nit) — an end time earlier than the start silently becomes about a 23-hour session. Consider a max-duration guard.
- **WB-PARENT-JOIN-AS-CHILD** — parent_session_select picker (§6)

#### Feedback and bug reports

- **FEEDBACK-BUG-BEFORE-PILOTS** (Andrew 2026-10-11) — Before unsupervised pilots, the public feedback and bug-report form needs stronger anti-spam than it has today, and it needs to let people enter anything they might want to, particularly for bugs. Today `/feedback` is public, with no account required. The form takes a type (feedback or bug report), an optional email, and one message of up to 10,000 characters. It uses a hidden honeypot field, a limit of 5 submissions an hour per address, and a spam score in `src/lib/feedback-spam.ts`. Flagged rows are stored as spam. Operators read them at `/admin/feedback`. Do not design past those two requirements.

### MAYBE — Andrew to prioritize

#### Recording & session lifecycle

- **Android Chrome matrix fill-in** —  (§8)
- **audioStartedAtMs ordering bug** —  (§3)
- **B6** — audio recovery after external app steals mic (§3)
- **Cross-session stuck/orphaned draft surfacing (1b)** —  (§3)
- **Custom SessionAudioPlayer (D10) + stitch-path retirement** —  (§3)
- **deviceHealth FSM input + `dvc` logging** —  (§3)
- **Draft clear / handleReset edge cases (1d, 1e)** —  (§3)
- **End-session replay: per-student-mic mix UX** —  (§3)
- **finalizeOutboxAfterEnd register path / legacy segment register deprecation** —  (§3)
- **Live transcription (LTX) spike** —  (§3)
- **Long-form transcribe smoke (60–90 min)** —  (§3)
- **macOS ondevicechange debounce** — unvalidated (§3)
- **network_offline FSM input not wired** —  (§3)
- **Pause vs rollover race (reliability #8)** —  (§3)
- **Per-student recording default** —  (§13)
- **Recording auto-pause on student disconnect** —  (§13)
- **Recovery banner stacking** — audio + WB + disconnect (1c) (§3)
- **rid= / lifecycle log coverage (reliability #13, #14)** —  (§3)
- **Session timer drift on iOS (reliability #4)** —  (§3)
- **SMOKE-PERF-1** — Finalizing fixed overhead (~5–10s) (§3)
- **timelineStartMs / unified wall-clock session timeline** —  (§3)
- **IOS-BACKGROUND-CLOCK** — defer until a real iPhone (§3)
- **TURN (A4 Slice-C)** —  (§3)
- **useRecordingCoordinator extraction** —  (§3)
- **WebM/MP4 duration unreliable for scrubbing (reliability #5)** —  (§3)
- **Whisper CJK / language pin** —  (§3)
- **WS-A-F-1** — outbox register-failure attempt cap (§3)
- **WS-J prod migration apply** —  (§3)
- **WS-K prod migration apply** —  (§3)

#### Notes & AI

- **AI link extraction from spoken URLs** —  (§5)
- **AI link extraction, scrubbing, playback during review, gap detection** —  (§13)
- **AI note generation context hygiene** —  (§5)
- **AI prompt** — literal vs interpretive Assessment (§5)
- **AI prompt v7 remainder** —  (§5)
- **AI prompt v8** — homework → plan (Sarah) (§5)
- **Audio playback during note review** —  (§5)
- **Audio scrubbing / duration 0:00** —  (§5)
- **MB-5 verify** — tutor_only notes path (§5)
- **Recorder gap detection in pending list** —  (§5)
- **REQ-S3-1** — Formatted markdown `.ai-prose` (§5)
- **REQ-S3-2 / REQ-S3-2a** — Save notes semantics + Cancel session (§5)
- **REQ-S3-4** — canonical notes schema (§5)
- **Slice-3 N1–N4 deferred findings** —  (§5)
- **Slice-3 S3** — notes reduce job-in-flight lock (§5)
- **SMOKE-NOTES-2** — live/progressive notes during session (§5)
- **Tutor-initiated join-link rotation** —  (§13)
- **Whisper CJK false positive** —  (§5)
- **Whisper repetition-loop hallucination** —  (§5)
- **Whisper transcription accuracy / short phrase misses** —  (§5)

#### Whiteboard, sync & replay

- **Active-ping 409 after End** —  (§4)
- **Asymmetric viewport when follow OFF** —  (§4)
- **CH-SMOKE-REPLAY-PLAYPAUSE-OVERLAP** —  (§4)
- **Cold refresh vs server truth** —  (§4)
- **Eraser bulk delete dimmed-not-deleted** —  (§4)
- **Eraser cursor vs delete path (TM-08)** —  (§4)
- **Event log + replay multi-page** —  (§4)
- **Excalidraw recovery "Load draft" popup** —  (§4)
- **Exit→rejoin A/V slow / ghost** —  (§4)
- **Freedraw latency PR-01** —  (§4)
- **Gate A3** — Pass-2 in-context end-session / review shell (§4)
- **Gate A3a** — PDF page-tab indicator (§4)
- **Gate A3b** — SR-04a video-tile sizing (§4)
- **Ghost viewport bounds overlay (VP-01 / SMOKE-POST-1)** —  (§4)
- **Graph JSXGraph swap follow-ups** —  (§4)
- **Local dev join URL parity** —  (§4)
- **MathInsertButton first-open white-box** —  (§4)
- **Mobile AV pip** — SR-16 (§4)
- **Multi-part recording warning banner stale on replay** — removed (§4)
- **Native image insert broken on drag/drop** —  (§4)
- **NR-07** — transform handles with native chrome hidden (§4)
- **p3-video-seam** —  (§4)
- **PDF open** — fit tutor vs student view (§4)
- **PDF position lock / pan-clamp design spike** —  (§4)
- **Per-board undo/redo history** —  (§4)
- **Per-page view state** — student validation (§4)
- **Post–sync-redesign smoke findings** —  (§4)
- **Preview-before-Start canvas wipe race** —  (§4)
- **Promote math insert to toolbar + library persistence** —  (§4)
- **Re-enable Playwright invariant 8 (PDF center+fit)** —  (§4)
- **Replay audio loading CLS** —  (§4)
- **Replay board tabs missing PDF icons** —  (§4)
- **Replay disabled top-bar buttons dimming** —  (§4)
- **Replay page strip PDF section grouping** —  (§4)
- **Replay pause→hide→reopen state** —  (§4)
- **Replay theme click → unexpected nav** —  (§4)
- **Room policy & joiner UX** —  (§4)
- **Session time logging** —  (§13)
- **Session type selection UX (in-person vs remote)** —  (§4)
- **SMOKE-BUG-10** — in-person "waiting for student" banner (§4)
- **SMOKE-BUG-2** — stale "Call Reconnecting" pill (§4)
- **SMOKE-BUG-3** — student text cross-page sync (§4)
- **SMOKE-BUG-5** — replay board-tab context (§4)
- **SMOKE-BUG-7 / CH-SMOKE-STUDENT-MIC-PERSIST** —  (§4)
- **SMOKE-UX-3** — replay ±10s skip (§4)
- **Snapshot link discoverability** —  (§4)
- **Snapshot multi-page coverage** —  (§4)
- **ST-05 / WB-LASER-ICON-CONTRAST** — laser colors + bidirectional visibility (§4)
- **Start/end session "flash reload" feel** —  (§4)
- **Student `[student-apply]` console spam** —  (§4)
- **Student bidirectional video (tiles flash/disappear)** —  (§4)
- **Student dark-theme canvas background stuck white** —  (§4)
- **Student default AV peer-only (self-view off)** —  (§4)
- **Student desktop mic level meter missing** —  (§4)
- **Student mobile tool/chrome parity** —  (§4)
- **Student naming paradigm** — single-student fallback (§13)
- **Student waiting room screen design** —  (§4)
- **Thin-viewport top-bar compaction** —  (§4)
- **TM-09** — tutor-mobile expectations notice + host gate (§4)
- **TU-11** — keyboard-shortcut routing parity (§4)
- **TU-12 / Excalidraw theme follows app data-theme** —  (§4)
- **Tutor tab doesn't follow new session creation** —  (§13)
- **Tutor-vs-student insert origin (viewport-center)** —  (§4)
- **WB-AV-STUDENT-INITIALS-ONLY** —  (§2)
- **WB-COMPONENTS-PASS** —  (§4)
- **WB-FINISH-REVIEW-COPY-CONTEXT** —  (§4)
- **WB-HAND-TOOL-MISSING (NR-01)** —  (§4)
- **WB-IDLE-SESSION-GUARD** —  (§3)
- **WB-IMAGE-IMPORTER** — image insert missing (§4)
- **WB-LINE-END-TOUCH** —  (§4)
- **WB-MENU-CLICK-THROUGH** —  (§4)
- **WB-PDF-BLOB-TOKEN** —  (§2)
- **WB-REPLAY-PDF-PLACEHOLDER** —  (§2)
- **WB-REPLAY-REOPEN-START-AT-0** —  (§2)
- **WB-REVIEW-DELETE-COPY** —  (§4)
- **WB-REVIEW-THUMBNAIL-PDF** —  (§4)
- **WB-SHARE-REPLAY-VIEWPORT-PHONE** —  (§4)
- **WB-STUDENT-BOARD-TABS** —  (§4)
- **WB-STUDENT-VIEW-LOCK-WHEN-SYNCED** —  (§4)
- **wb-tab-kill-audio-durability ×2** — empty tutor:mic segments (§1)
- **WB-TUTOR-REPLAY-PHONE-LAYOUT** —  (§4)
- **Whiteboard undo touch + visible button** —  (§13)
- **Workspace SSR 500** —  (§13)
- **WS-U 1.4** — empty review screen copy (§4)
- **WS-U-FRAGILE 2.4/2.5** — LIVE badge + sync pill visibility (§4)

#### Live A/V & devices

- **BUG-9** — camera hotswap mid-session does not recover cleanly (§1)
- **DEVICE-PICKER-DEDUPE / WB-DEVICE-PICKER-DUPES** —  (§8)
- **DEVICE-PICKER-MOBILE-FACINGMODE** —  (§8)
- **Mic hot-plug requires hard refresh (B1-B4 smoke)** —  (§8)
- **Slow first peer connect** —  (§3)
- **SMOKE-BUG-11** — tutor mic picker not initialized from tn-mic-device-id (§8)

#### Consent, COPPA & erasure

- **allowEducationalUse toggle + enforcement (BL-B)** —  (§6)
- **BL-A** — tutor-visible per-student consent projection (§6)
- **CH-SMOKE-DQ-CONSENT-CALLOUT-LIVE** —  (§6)
- **CH-SMOKE-DQ-ERASURE-2FA** —  (§6)
- **CH-SMOKE-DQ-ERASURE-ACCOUNT-LOOKUP** —  (§6)
- **CH-SMOKE-DQ-ERASURE-COPY-JARGON** —  (§6)
- **CH-SMOKE-DQ-MULTI-STUDENT-LIVE** —  (§6)
- **CH-SMOKE-SETTINGS-SAVE-ON-TOGGLE** —  (§6)
- **CH-SMOKE-STUDENT-MIC-PERSIST** —  (§6)
- **Erasure 2FA step-up** —  (§6)
- **Erasure operator lookup UX (MB-2)** —  (§6)
- **ERASURE-ADMIN-METADATA** —  (§6)
- **ERASURE-CLIENT-STORE-UNREACHABLE** —  (§6)
- **ERASURE-INFLIGHT-CHECKPOINT** —  (§6)
- **ERASURE-ORPHAN-AUDIO-BLOBS** —  (§6)
- **WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME** —  (§6)

#### Auth, identity & security

- **2FA remember-device open decisions** —  (§6)
- **ADMIN-PARENT-BLOCK-LIVE** —  (§6)
- **BL-ADMIN-UUID-PICKER** — 2FA reset target picker (§6)
- **BL-RESET-DOMAIN** — reset email respects originating host (§6)
- **BL-RESET-GENERATE** — Chrome suggest-password on /reset-password (§6)
- **BL-VERIFY-SUCCESS-COPY** — post-verify affirmation (§6)
- **Claim flow: self-learner shouldn't see child PIN setup** —  (§6)
- **Claim interstitial** — verify claim-email host vs preview (§6)
- **Gate B1** — approval-gating / waitlist (§6)
- **Gate B3** — security checks + final cleanups (§6)
- **In-memory rate limiters → Neon** —  (§6)
- **Notes first-class authenticated chrome (P2-AC-12/13)** —  (§6)
- **Parent→self-learner toggle post-create** —  (§6)
- **PLAYWRIGHT-GAP** — /join #k= fragment preservation (§6)
- **SEC-1 R3** — cross-preview impersonation SSO (§6)
- **Signup waitlist pagination + Google OAuth auto-provision** —  (§6)
- **WB-FLAKE-JOIN-STALECOOKIE** —  (§6)
- **WB-JOIN-LEARNER-SESSION-PERSISTENCE** —  (§6)

#### UX & design system

- **DESIGN-SYSTEM-GALLERY** — `/admin/design-system` platform-maintainer-only component gallery (Andrew 2026-07-27). See Release priorities § QUEUED. Enables eyeball without full-site hunting. (§7)
- **2FA inline verify-at-login** —  (§7)
- **ADMIN-STUDENT-DETAIL-MOBILE-DISCOVER** —  (§7)
- **Cohesive pass open questions** —  (§7)
- **Component-duplication + @layer base CSS cleanup** —  (§7)
- **dark: → semantic token migration** —  (§7)
- **Double scrollbars on admin pages** —  (§7)
- **Error/legal/public shells legacy cleanup** —  (§7)
- **Formalize IA decisions in UX-AND-A11Y-SPEC §15** —  (§7)
- **Foundation pass** — promote surface-local shells to library (§7)
- **Gate A1** — cohesive visual review + mock-faithful composition (§7)
- **Keyboard undo Ctrl+Z misbehaves (pilot B1)** —  (§7)
- **Known issues & roadmap** — top-level sidebar link (§7)
- **Known issues page placement/tone** —  (§7)
- **Known-issues section headers too muted** —  (§7)
- **L3** — student WB chrome parity on /join (§7)
- **L6** — WbStatusPill / connected-sync status (§7)
- **Learner/student logged-in top-bar oversized** —  (§7)
- **Live board ⋯ More PDF affordance discoverability** —  (§7)
- **Live board Sign out row dimmed/clipped** —  (§7)
- **MarketingHeader inline styles → primitives** —  (§7)
- **Missing primitives** —  (§7)
- **Mobile color palette dismiss I7** —  (§7)
- **Parent dashboard Manage button alignment** —  (§7)
- **Part 3 student Sign out in top-bar ⋯** —  (§7)
- **Password fields show/hide toggle** —  (§7)
- **Pen panel too large (pilot-2026-06-06 U5)** —  (§7)
- **PreSessionPanel / StartWhiteboardSession mock alignment** —  (§7)
- **Recovered-audio prompt** — always keep, no Discard (§7)
- **REQ-S3-3** — Identity chip + test-account badge (§7)
- **Scheduler Group F visual-only** —  (§7)
- **Share/copy link silent clipboard failure (pilot B2)** —  (§7)
- **Start/end session flash reload feel** —  (§7)
- **T2** — accent-recipe pass (§7)
- **Tailwind aliases rounded-panel, border-strong** —  (§7)
- **TFA2** — 2FA setup/verify pages v1 redesign (§7)
- **Thinner default pen stroke (U6)** —  (§7)
- **Time-alert UX** — visible alert clock + settings (§7)
- **Tutor toolbar reorder U4 / shape dropdowns U5-U6** —  (§7)
- **Unclaimed student claim link buried** —  (§7)
- **Verify-email success copy** —  (§7)
- **WB-REPLAY-PAUSE-COPY** —  (§2)
- **WB-WTR-DEVICE-LOADING** —  (§2)
- **WS-J richer per-session billing display** —  (§7)
- **WS-Q tutor settings** — alert defaults (§7)
- **WS-U-FRAGILE taste/IA batch (2.8–2.15)** —  (§7)
- **X2** — v1 design via shared components (DRY) (§7)
- **X3** — AV pip on/off clarity (§7)

#### Testing & harness

- **Admin notes UX Phase 0 visual regression matrix** —  (§9)
- **audio-rollover Playwright not in CI gate** —  (§9)
- **Block B remote-surgical mixdown hardware oracle** —  (§9)
- **F-1 outbox register retry cap** —  (§9)
- **installControllableUploadStub duplication** —  (§9)
- **iOS matrix S1–S14** — real hardware unfilled (§1)
- **JEST-ISOLATION-CLASS-2** — shared test Postgres; truncate-after-each design kept, branch deleted (§9)
- **phase0-stop** — break CSS deploy-abort verify (§9)
- **PIPELINE-1** — agentic pipeline before release (§9)
- **Recorder test refactor Phases 4–6** —  (§9)
- **RELAY-MARATHON-SHARDS** —  (§9)
- **Site-wide coverage P1 gaps** —  (§9)
- **TEST-REAL-INTEGRATION-SUPERSEDES-SMOKE** —  (§9)
- **upload-outbox.test parallel-race flake** —  (§9)
- **waitForPendingUploads debug surface removal** —  (§9)
- **WS-V / Part-2 site-wide mechanical test buildout** —  (§9)

#### Platform & ops

- **(SARAH-CALL-PREP.md)** —  (§13)
- **Cost observability Phase 2** —  (§10)
- **Cost-event durability hardening** —  (§10)
- **Full product usage instrumentation** — NEAR-IMMEDIATE POST-MASTER (§10)
- **TXC-SWEEP-METRICS** — transcribe-sweep cron run vs useful-work counts (§10)
- **NEON-SCALE-TO-ZERO-REVISIT** — re-review always-on vs 5-min suspend once real sessions (§10)
- **Historical SessionNote timezone backfill** —  (§10)
- **Outbox permanent-failure Datadog/Sentry breadcrumbs** —  (§3)
- **S5** — scheduled topic + notes visible in live session (§11)
- **Scheduling** — backend wiring + calendar sync (§11)
- **Session log billing rate / billed* column naming** —  (§10)
- **Session timer vs billed time during disconnect gaps** —  (§10)
- **Session-log + Wyzant/UVU export (SESSION-LOG-EXPORT)** —  (§10)
- **Solo / in-person production enable + B-5 consent copy** —  (§10)
- **Time-storage / billing display (billed*Local)** —  (§10)
- **Vercel Skew Protection enablement** —  (§10)

#### Commercial & GTM

- **Notes quality moat elevation timing** —  (§5)
- **Public wedge messaging** —  (§5)

### 1.x — can wait

| Group | Count | Notable IDs |
|-------|------:|-------------|
| **§1 Sarah/master-cut ops** | 5 | CUT-1, CUT-4, CUT-5, CUT-6, Ship-to-Sarah gate checklist (Andrew confirms) |
| **§10 Ops/scheduling** | 15 | PostHog analytics Tier 0+1, Operator scoped test-data wipe + orphaned blob sweep, scripts/smoke-long-form-transcribe.mjs headless harness, RECORDER-LIFECYCLE.md preview-before-Start doc drift, docs/WHITEBOARD-ROADMAP-NEXT.md supersede?, Dev-tools adopt manual test user as fixture, … |
| **§11 Scheduling** | 6 | S3, S4, Two-way calendar sync, Google OAuth bundling with calendar scopes, Apple CalDAV vs EventKit path, Reminders / timezone policy |
| **§12 Org/university** | 10 | BYU / institutional pitch track separate from Sarah solo story, Stripe / subscription billing, Operator dashboard scaffolding, University department pitch infrastructure, Wyzant + UVU export formatters, Org-aware billing rounding, … |
| **§13 Strategy/pilot** | 6 | Homework image import workflow, Rethink claim-screen layout, Self-service account deletion, Replay speaker indication, Collapse DRAFT/READY/SENT, Auto-email scheduling |
| **§14 Deferred/someday** | 13 | WB-SCREEN-WAKE-LOCK / WB-THUMBNAIL-GRAPH / WB-OLD-PHONE-PERF, WB-GRAPH-PLACEHOLDER, WB-ENDSESSION-THUMBNAIL-TABS, Desmos live-state capture Phase 1.5, Debounced-disconnect pause trigger confirm, Engagement/dopamine surfaces, … |
| **§2 Post-cut cleanup & WATCH** | 1 | NOTES-QUALITY-HOLD-DETAIL (waived ledgers → [`docs/SHIPPED.md`](SHIPPED.md)) |
| **§3 Recorder re-arch & scale** | 11 | Wire-level mute coordination, Remote video track recording, SFU for N>5 peers, Large-mesh CPU profiling, Tier 2 transcribe queue / VAD background job, Speaker diarization (Phase 6 task 6), … |
| **§4 WB enhancements** | 25 | Laser pointer in replay, Student tab crash, Measure wire bandwidth on real session, GitHub Actions wb-regression workflow, relayShowsCollaborator copy parity, … |
| **§5 Notes/GTM someday** | 4 | Formal eval harness + flywheel, AI edit signal Phase 1, CONTINUITY-V1-CARRYOVER, MAP-ACC |
| **§6 Consent/auth P3** | 28 | allowMessaging / allowVideoRecording when features ship, Child-facing ConsentRestriction UI, CONSENT-UX-REDESIGN / save-on-toggle, Mid-session learner swap (Phase 3), 90-day unclaimed-real-student sunset, Mid-session consent-change poll, … |
| **§7 UX P3 & strategic** | 13 | T9, T10, Consent floor-block checkbox contrast, BG2, Impersonation pip clarity, Video tile docking (SR-04 follow-up), … |
| **§8 Device matrix P3** | 5 | SMOKE-AUDIO-2, SMOKE-AUDIO-3, WS-H NB-1–NB-5, Device-picker cleanup, Firefox untested |
| **§9 Test harness P3** | 2 | Plan1 authed-join hardware failures, Preview email loopback |

**1.x total: 145 items** (all P3/DEFERRED/WAIVED/PROCESS, §12–14 strategy/commercial, master-cut/Sarah-only ops, and enhancements explicitly deferrable for first stranger pilots).

---

## 1. NOW / Sarah-facing

Hotlist: P0/P1 items affecting the live pilot.

### Recording & session lifecycle

**[P0][REC] SMOKE-AUDIO-1 — first-acquire mic silent until switch-and-back**  
Remainder: Sarah Brio hardware VERIFY; cold-start picker **WB-WTR-DEVICE-LOADING**. Merge [`3468262d`](https://github.com/Arangarx/tutoring-notes/commit/3468262d) shipped.

**[P0][NOTES] SMOKE-NOTES-1 — post-End shimmer; form must stay visible**  
REOPEN @ `3cffbb7`. Prior hide-the-form regression. Spec: all fields visible with per-field shimmer; placeholder only on empty fields. Playwright-to-spec required. Cross-ref **WB-NOTES-SKELETON** (historical).

**[P0][WB] SMOKE-UX-1 — replay auto-play jumps to scrubber end**  
REOPEN on hardware; green Jest did not catch. Independent oracle: scrubber position vs `audioDurationSettled`. Waived at master cut — still Sarah-facing. Related: **SSG-3**, **WB-REPLAY-REOPEN-START-AT-0**.

**[P0][REC] WS-B — tab-kill resume loses pre-kill audio in replay/notes**  
Master-cut #11: post-resume segment only in transcribed notes. WS-N landed partial durability; full pre-kill segment assembly still open.

**[P1][REC] SMOKE-END-WINDDOWN — disarm board + immediate student wind-down on End**  
Remainder: hardware VERIFY; PERF-1 snapshot de-await. Merges [`e58e0826`](https://github.com/Arangarx/tutoring-notes/commit/e58e0826) / [`69eacbf6`](https://github.com/Arangarx/tutoring-notes/commit/69eacbf6) shipped.

**[P1][AV] SMOKE-BLOCK-1 — reachability under-reports connected peer (Start dead)**  
Still open on `master`. Start enables only when `reachableParticipants` is at least 1, and a peer counts only when both `peerConnectionState === "connected"` and ICE is `connected` or `completed`. Safari can leave the overall connection on `connecting` while ICE is already up, so the count stays 0 and Start stays disabled. The A/V-required gate is correct. The bug is a false zero. Cross-ref **BUG-8** on reconnect.

Andrew's July 3 Android smoke did not reproduce the dead Start button. Reconnect got worse: board and laser recovered, audio and video did not, and the timer stayed paused. Notes: [`presarah-batch-resmoke-smokebook-2026-07-03.md`](archive/handoff/presarah-batch-resmoke-smokebook-2026-07-03.md) item B1.

**[P1][AV] BUG-8 — reconnect media transport not rebuilt after peer leave/rejoin**  
FRAGILE — `peer-mesh.ts` / `useLiveAV.ts`. Pre-existing; surfaced 2026-07-03 re-smoke. Plan + hardware validation before merge.

**[P1][AV] BUG-9 — camera hotswap mid-session does not recover cleanly**  
Same fragile surface as BUG-8. Deferred pending plan.

**[P1][CONSENT] CLIENT-AUDIO-CONSENT-GATE — client consent projection completeness**  
Remainder: shallow client gates on upload/IDB/transcription and per-speaker **p3-consent-recording**.

**[P1][REC] PRESARAH-1 — always-on recording; remove recording-intent toggles**  
`StudentRecordingDefaultToggle` is gone. Remainder: `userWantsRecording` still in `WhiteboardWorkspaceClient.tsx`. Fragile FSM surface — Sonnet 5-axis on diff.

**[P1][REC] WS-N5 — resume FSM `armed` window drops stroke capture after reopen**  
On reopen FSM re-enters `armed` → `wbCaptureActive` false. Related to solo/in-person stroke gap; distinct from audio-only fix.

**[P1][NOTES] SMOKE-NOTES-3 — notes fabricate on non-teaching talk**  
Map/reduce accuracy + abstain path. Prompt @ `cefc5cd` PASS for teaching; refinement flagged. Cross-ref **MAP-ACC** (#1 post-master).

**[P1][WB] Gate A5 — live bidirectional sync completeness audit**  
Remainder: full enumerated audit; ST-05 hardware verify and **WB-LASER-ICON-CONTRAST**. Laser wire shipped.

**[P1][WB] Gate A6 — replay fidelity + AV/timer sync comprehensive pass**  
Partial tests exist; enumerated completion still open. Cross-ref **SMOKE-UX-1**, **SSG-3**.

**[P1][LEGAL] SEC-POLICY-TRUTH — retention lifecycle enforcement**  
Interim honest copy on `/privacy` (PASS recheck); no enforcing cron / account-closed state modeled. Do not claim fixed retention on `master` until built.

**[P1][OPS] CUT-1 — comprehensive both-theme pre-master smoke**  
Deferral ledger KEEP; full MASTER-CUT style run before next master cut.

**[P1][OPS] CUT-4 — claim Sarah pilot family before NOTES_AUTH_WALL**  
Pre-cut prerequisite; SKIP in master-cut smoke (Sarah camping).

**[P1][OPS] CUT-5 — production env scoping confirm before master cut**  
Open Andrew-confirm.

**[P1][AUTH] CUT-6 — 2FA re-smoke on merged integration tip**  
Not run in master-cut smokebook.

**[P1][TEST] iOS matrix S1–S14 — real hardware unfilled**  
[`docs/PHASE-2-IOS-SMOKE-MATRIX.md`](PHASE-2-IOS-SMOKE-MATRIX.md) all rows empty. S3/S4/S7 dispositive on Sarah iPhone.

**[P1][WB] SSG-3 / A6-1 — multi-segment replay scrubber + proportional seek**  
DEFERRED post-Sarah per deferral ledger; still REAL-FAIL cluster. Partial: `replay-audio-timeline.ts`, WS-L. **WS-G** concat may unblock clean end-state.

**[P1][REC] Ship-to-Sarah gate checklist (Andrew confirms)**  
Proposed gates a–d: End never silent-deletes; replay scrubber; monolithic notes path retired; waiting→WB→end stable. **PENDING** ratification ([`sarah-pilot-feedback-2026-06-16-orchestrator-report.md`](handoff/sarah-pilot-feedback-2026-06-16-orchestrator-report.md)).

---

## 2. Post-master-cut cleanup (2026-07-09)

Closed history: [`docs/SHIPPED.md`](SHIPPED.md).

**[WATCH] WB-PDF-BLOB-TOKEN** — multi-page PDF import partial fail. Merged `bed79060`; 4-attempt backoff. Watch-only.

**[WATCH] WB-STROKE-BLEED** — E5 `b8f786c8`; Andrew evening did not repro. Keep PW gate.

**[WATCH] WB-AV-STUDENT-INITIALS-ONLY** — camOn acquire gate merged `e5e71900`.

**[P1][WB] AV-CAMON-NO-STREAM (2026-10-06, pre-existing on master):** presence omits camOn when no local video stream exists and permission is not denied, so a student whose camera never starts sends no explicit camera-off. Tutor tile relies on the legacy fallback. Initials in that case come only from the connected-but-no-video path (`AVTile.tsx` ~352–363): `showCamPlaceholder` is true when there is no active video track, and `remoteAwaitingVideo` is false once the peer is past `new`/`connecting` and `camOn` is not explicitly false — so the tile renders the initials placeholder rather than "Waiting for video…". Fix must not reintroduce the mid-GUM false latch (b68efd9c). Opus-owned (useLiveAV).

**[P2][AV] AVTile mount latch deferred (2026-10-07):** `useHydratedDomPeerId` in `src/components/av/AVTile.tsx` still has its own mount latch. Deferred because it touches live A/V.

**[P1][WB] AV-CAM-BUTTON-ACQUIRING (2026-10-06):** the camera button reads Off while the student camera is still starting (`isCamMuted` starts true); clicking it then means turn on, and the in-flight acquire sets `isCamMuted(false)` regardless (`useLiveAV.ts` ~1378/~1505). Consider an explicit starting state on the button. The contract comment at `useLiveAV.ts` ~347–351 does not match :1378. Opus-owned.

**[P1][WB] TYSON-CAM-NO-KEY (2026-10-15, packet item 6, not fixed):** Tyson joined with no `#k=` in the address. The student saw their own camera. The tutor’s student tile stayed empty. Not reproduced on this pass. `#k=` is the whiteboard encryption fragment. Middleware never reads it. `ServerLiveKeySeeder` writes it and `JoinHashRestorer` puts it back from sessionStorage. `useLiveAV` does not read it, so a missing key does not explain a missing camera. Do not change the mesh on a guess. Next step is one captured session where the tutor tile is empty and the student tile is not, with the `[avx]` log.

**[P2][WB] WB-REPLAY-PDF-PLACEHOLDER** — parent share PDF boards show placeholders. Asset hydrate / share proxy.

**[P2][WB] WB-REPLAY-REOPEN-START-AT-0** — pause/hide then Replay starts at 0. Non-blocking for Sarah; REAL-FAIL waived.

**[P2][UX] WB-WTR-DEVICE-LOADING** — waiting-room loading affordance during long mic/cam settle. Post-AUDIO-1 UX.

**[P2][UX] WB-REPLAY-PAUSE-COPY** — share uses "Pause"; tutor review keeps "Pause and hide replay."

**[PROCESS] NOTES-QUALITY-HOLD-DETAIL** — do not scale back reduce detail without target feedback. Prompt_wins PASS @ recheck.

---

## 3. Reliability — recorder / A/V / lifecycle / outbox

### Outbox & end-session

**[P0][REC] W1-SHIP-B-FINALIZE — `finalizeOutboxAfterEnd` drops all IDB rows**  
`finalize()` deletes every row; no `status === "uploaded"` filter. Stuck rows silently lost at End. Distinct from upload-on-retry-exhaustion (#2).

**[P1][REC] W1-SHIP-B-STUCK — `stuck` semantics + UX vs `permanent-fail@50`**  
Design: 12 attempts → `stuck`, blob retained, Retry UI. Code: 50 attempts, observer `failed`, no stuck banners.

**[P1][REC] SMOKE-PERF-1 — Finalizing fixed overhead (~5–10s)**  
De-await snapshot PNG on blocking path (biggest win). `countEventsInBlobUrl` triple-fetch; serialized drain. Andrew tolerates; not Sarah blocker.

**[P1][REC] network_offline FSM input not wired**  
FSM supports `network_offline`; host passes `networkOk: true` hardcoded (`WhiteboardWorkspaceClient.tsx`).

**[P1][REC] WS-N-PAGEHIDE — in-progress segment flush at tab-kill**  
N1–N3 landed; full in-progress segment flush at kill boundary still open.

**[P2][REC] WS-A-F-1 — outbox register-failure attempt cap**  
Unbounded retries on persistently-failing register (~10-line fix).

**[P2][REC] deviceHealth FSM input + `dvc` logging**  
W1 Ship C design; not in `src/`.

**[P2][REC] timelineStartMs / unified wall-clock session timeline**  
`getAudioMs` freeze-on-pause; no `timelineStartMs` on outbox. Re-arch D3/D4.

**[P2][REC] IOS-BACKGROUND-CLOCK**  
Deferred until Andrew has an iPhone (2026-10-01). `createSessionMsClock` reads `performance.now()` while recording and freezes while paused. Strokes, the recorder, and transcription share that clock. A background iOS tab can slow the page timer, and locking the screen may also suspend the microphone graph. A frame-counting AudioWorklet was tried on `phase1/wb-reliability-floor` (June 13) against the recorder from before this pause-freeze clock. That branch was deleted 2026-10-01. Do not revive it, and do not swap the live clock before a real device shows what lock-screen does to `performance.now()` and to the audio graph. Desktop tests can prove frame-counter math only. Acceptance is a recorded session with the screen locked, then a replay where strokes still match the audio.

**[P2][REC] audioStartedAtMs ordering bug**  
Written at enqueue from `Date.now()` vs segment start.

**[P2][OPS] Outbox permanent-failure Datadog/Sentry breadcrumbs**  
`obx=` console only.

**[P2][REC] finalizeOutboxAfterEnd register path / legacy segment register deprecation**  
`registerWhiteboardSessionAudioSegmentAction` still in `actions.ts`.

### Capture & device

**[P1][REC] Hot-swap mic / track.onended (reliability #7)**  
`MediaRecorder` continues on silence after device unplug. Subscribe `track.onended`, banner, auto-pause.

**[P1][REC] Upload-failure blob persistence (reliability #2)**  
Blob lost on navigation after retry exhaustion. W1 Ship B.

**[P1][AV] WS-I-PRESTART-MUTE — tutor mute before audio graph arms**  
Remainder: close after gate is green. Implementation shipped (`WbTopBarMicControl`, `wb-tutor-recording-mute.spec.ts`).

**[P2][REC] In-progress segment IDB on crash (reliability #1)**  
Workspace draft store shipped (Ship A); in-progress `MediaRecorder` chunks still memory-only.

**[P2][REC] Cross-session stuck/orphaned draft surfacing (1b)**  
Backlogged; shape with W1 never-delete principles.

**[P2][REC] Recovery banner stacking — audio + WB + disconnect (1c)**  
Consolidate presentation only; keep per-system Keep/Discard.

**[P2][REC] Draft clear / handleReset edge cases (1d, 1e)**  
Spurious recovery banner; duplicate audio risk.

**[P2][REC] B6 — audio recovery after external app steals mic**  
Discord overlap; `ondevicechange` feasibility.

**[P1][REC] B11 — release camera/mic tracks on session end**  
Sarah blocked re-entering Discord. `RECORDER-LIFECYCLE` Surface 2.

**[P2][REC] macOS ondevicechange debounce — unvalidated**  
500ms debounce on Safari unvalidated.

**[P3][REC] Wire-level mute coordination**  
Tutor mute local only; remote still receives RTP.

**[P3][REC] Remote video track recording**  
Audio-only `remote-stream-recorder`.

**[P3][AV] SFU for N>5 peers**  
Mesh only; deferred.

**[P3][AV] Large-mesh CPU profiling**  
No Chromebook profiling.

**[P2][REC] End-session replay: per-student-mic mix UX**  
Segments land; playback mixing post-v1.

**[P2][REC] Custom SessionAudioPlayer (D10) + stitch-path retirement**  
`replay-audio-timeline.ts` still used.

**[P2][REC] Live transcription (LTX) spike**  
Not on master; timeline assembly gap.

**[P2][REC] Long-form transcribe smoke (60–90 min)**  
[`SMOKE-LONG-FORM-TRANSCRIBE.md`](handoff/SMOKE-LONG-FORM-TRANSCRIBE.md); BLOCKER-PROD watch.

**[P3][REC] Tier 2 transcribe queue / VAD background job**  
Deprioritized unless long-form smoke fails.

**[P3][REC] Speaker diarization (Phase 6 task 6)**  
Deferred.

**[P3][REC] vad-min-tune — lower VAD_MIN_SEGMENT_SECONDS after concat**  
25s→8–10s after WS-G.

**[P3][REC] p3-vad-chunking — per-speaker VAD silence chunking**  
`segment-policy.ts` on tutor path; per-speaker lanes open.

**[P2][REC] useRecordingCoordinator extraction**  
FSM + mixdown still in `WhiteboardWorkspaceClient.tsx`. `useLiveAvCoordinator` shipped separately.

**[DEFERRED][REC] True pause (D5)**  
Tutor Pause calls stop+teardown; route through `MediaRecorder.pause()`.

**[DEFERRED][REC] Recording clock anchor / drop 10s blind gate (D3)**  
Start clock on activity; drop `AUDIO_FLOW_GATE_TIMEOUT_MS`.

**[DEFERRED][REC] On-page recording-permissions removal**  
Remove `AVPermissionsPrompt`; browser-native only.

**[P2][REC] Session timer drift on iOS (reliability #4)**  
Reconcile on `visibilitychange`; see §8 iOS matrix.

**[P2][REC] WebM/MP4 duration unreliable for scrubbing (reliability #5)**  
Server-side remux or stored duration.

**[P2][REC] Pause vs rollover race (reliability #8)**  
Manual Pause during auto-rollover finalize.

**[P2][REC] beforeunload guard mid-recording (reliability #9)**  
Pair with IDB persistence.

**[P1][REC] rid= / lifecycle log coverage (reliability #13, #14)**  
Partial `rid=` on actions; recording lifecycle log format incomplete.

**[P2][REC] TURN (A4 Slice-C)** — built 2026-10-19 (Cloudflare TURN, `src/lib/av/turn-ice-servers.ts`) after Tyson's same-Wi‑Fi remote session never connected. Live once `CLOUDFLARE_TURN_KEY_ID` + `CLOUDFLARE_TURN_API_TOKEN` are set in Vercel. Open: Privacy subprocessor line for Cloudflare (relays encrypted media; follow `docs/LEGAL-SYNC.md`).

**[P2][AV] Slow first peer connect**  
Instrumentation + optional TURN; camera-grant-before-join UX.

**[P2][REC] Whisper CJK / language pin**  
Pin `language: "en"` in `transcribe.ts`.

**[P2][WB] WB-IDLE-SESSION-GUARD**  
Session-level idle auto-end / cost guard.

**[P2][REC] WS-J prod migration apply**  
`20260705140000_wsj_billable_rounding` — Andrew greenlight for prod.

**[P2][REC] WS-K prod migration apply**  
`20260705000000_wsk_live_reduce_watermark`.

**[P1][NOTES] WS-K — fold the running note during the session; End only adds the tail (Andrew 2026-10-15)**  
Andrew: the tutor stays on this session until the notes are filled. Do not send them to the next student while finalize runs. The wait itself has to get short.

What already runs while the session is live (`transcription-worker.ts` → `extract-chunk.ts` → `enqueueLiveReduce`):

- Each finished audio chunk is transcribed, then mapped into topics, student questions, corrections, and follow-ups.
- A live reduce rewrites `TutorNote.content` and a chunk watermark. Note status stays `pending`. It fires only after 5 new done chunks or 2 minutes (`LIVE_REDUCE_CHUNK_THRESHOLD`, `LIVE_REDUCE_TIME_MS` in `notes-enqueue.ts`).
- `processLiveReduceJob` and the End job both call `buildReducePrompt` on **every** extraction so far. The End fast path (`finalize_fast_path` in `notes-worker.ts`) skips that call only when the watermark already covers every done chunk and nothing is still transcribing.

Why End is still long:

1. `handleEndSession` does not show review until the last segment has uploaded, the outbox drain finishes (15s budget; timeout copy is “Still saving audio”), `events.json` uploads, the snapshot PNG is attempted, and `finalizeWhiteboardSessionFromBackend` returns. Notes are started inside that finalize, so they cannot appear before it.
2. End usually lands between live reduces (up to 4 chunks, or up to 2 minutes of audio) or while the tail chunk is still in Whisper. The fast path misses, and the worker sends every extraction to the model again. That prompt grows with the session. If chunks are still `pending` or `transcribing`, the `after()` poll waits up to 4.5 minutes (`NOTES_COMPLETION_TIMEOUT_MS` is 5 minutes).

The work that belongs during the session: keep the map. Change the live reduce from “rewrite the whole hour” to “fold the new maps into the note already stored.” The prompt is the previous structured note plus only the chunks past the watermark. Same fields: topics, assessment, plan, links. On End, one fold of the tail, started as soon as that tail transcript exists, while events and the snapshot upload. Do not re-read the hour. Do not drop audio, the upload, or the note. Do not rewrite `lifecycle-machine.ts`, `upload-outbox.ts`, or `endWhiteboardSession` to leave early. Read `docs/RECORDER-LIFECYCLE.md` before any change to the await chain in `handleEndSession`.

Quality bar: a fold must not drop a fact that one full reduce of the same extractions would keep. The test is that fixture, red before the fold exists. A timer-only test does not count. The long End wait stays a Playwright gap until that behavior exists (§9).

**[P1][REC] WS-G — server-side tutor:mic concat replay master**  
`concatBlobUrl` / `buildReplayAudioPayload` partial; formal `tutor:mic:concat` replay master per plan not complete.

**[P2][AV] Live A/V reload — C2: fingerprint-based peer replacement (deferred from item 35, 2026-10-22)**
Fix A (one camera track per device) shipped alone for packet item 35. C2 was built and verified in jest but is NOT shipping.

- What it does: `peer-mesh.ts` remembers each peer's DTLS fingerprint set from the applied remote description. An offer carrying a different set means the peer reloaded (new `RTCPeerConnection`, same stable `peerId`), so the mesh fires `leave` to subscribers, closes the stale PC and answers from a fresh one (`event=peer-instance-replaced reason=fingerprint-changed`). Fixes a stale PC with more m-lines than the reloaded peer's offer (`signal-apply-fail`).
- Patch (peer-mesh.ts + peer-mesh.test.ts, applies with `git apply`): `docs/handoff/item35-c2-fingerprint-replace.patch`.
- Why deferred (evidence, 2026-10-22): with A + C2 the existing guard `wb-av-mesh.spec.ts` › "after the tutor reloads, both peers still see the other's camera playing" went from 5/5 (pre-fix) to failing 2 of 5, and 2 of 3 in an earlier batch. In the failing runs the tutor's video receiver `track.muted` stayed `true` while RTP flowed (`vIn=889`), so `hasActiveVideoTracks` in `useLiveAV.ts` (requires `!t.muted`) kept the student's tile hidden. A probe `<video>` bound to the muted track painted frames, so the media was fine. It correlates with the replaced peer re-offering video while the other side's late-add offer crosses it. Item 35 tests were also unreliable with C2 (toggle+reload 1/3, reload-only 0/3).
- Do NOT work around it by loosening the muted-track tile gating without a product decision (a failed camera would show black/frozen video instead of the avatar). Options: (1) when presence says `camOn === true`, require only `readyState !== "ended"`; (2) find why the receiver stays muted after replacement (offer crossing).
- Trigger to revisit: any recurrence of m-line-count growth after a reload, or un-fixme of `wb-av-mesh.spec.ts` › "tutor reload: student's PC with an extra video m-line still shows the student's camera on the tutor" (currently `test.fixme`; it documents this class and is red without C2).
- Needs a Sonnet/Opus design pass (fragile surface: `peer-mesh.ts`, `useLiveAV.ts`).

**[P3][AV] Live A/V — B: same-kind `replaceTrack` in `addLocalTrackToAllPeers` (2026-10-22)**
When a peer already has a sender of the same kind, `addLocalTrackToAllPeers` should `replaceTrack` on it instead of adding a second transceiver, so an extra m-line cannot appear when a track is re-added. Fix A removed the double acquisition that triggered this in practice. Add when m-line growth recurs. Fragile (`peer-mesh.ts`); red-before test: add the same kind twice, assert transceiver count unchanged.

**[P3][AV] Live A/V — C1: explicit per-page-load epoch for reload detection (2026-10-22)**
Alternative to C2's DTLS-fingerprint inference: each page load announces a random epoch in presence/offer metadata; a changed epoch under the same `peerId` is an unambiguous reload. Cleaner signal than SDP parsing but needs a sync/presence envelope change. Consider together with C2.

**[P3][AV] Live A/V — D: rebuild a removed peer that is still in the roster; eviction-before-offer race (2026-10-22)**
If the mesh drops a peer (eviction, `leave`) while presence still lists it, nothing re-adds the peer, and an eviction arriving just before the peer's offer can strand the pair. Rebuild the peer from the roster reconcile effect. Fragile (participants-reconcile effect, `useLiveAV.ts`); needs a two-browser Playwright test.

### Shipped (reference — do not re-open)

Closed history: [`docs/SHIPPED.md`](SHIPPED.md).

---

## 4. Whiteboard — chrome / sync / replay / PDF

### Sync & capture

**[P1][WB] WS-T-8 — roster End shows replay CTA when recording-count===0**  
`canReplay` vs DB recording-count oracle mismatch.

**[P1][WB] WS-T-9 — gate-only End IDB crash**  
Intermittent "IDB object store not found"; `wb-review-overlay-3paths.spec.ts` fixme.

**[P1][WB] SMOKE-BLOCK-5 — solo/in-person stroke capture in armed window**  
Remainder: FSM `armed` / `wbCaptureActive` false (WS-N5 family). Audio + inPersonMode shipped.

**[P2][WB] SMOKE-BUG-10 — in-person "waiting for student" banner**  
`sessionMode` not consulted for banner copy. `derivePresentation` partial.

**[P1][WB] Ghost viewport bounds overlay (VP-01 / SMOKE-POST-1)**  
Label-only stub (`wb-ghost-viewport-label`); bounds geometry deferred. Pre-release required. Andrew 2026-10-05: this is the ghost-box note from the Sarah review. Do not open a second copy. Same QoL family as the live cursor (hide after about five seconds still), which is a separate build.

**[P1][WB] ST-05 / WB-LASER-ICON-CONTRAST — laser colors + bidirectional visibility**  
Remainder: per-role color/visibility hardware verify. Wire shipped.

**[P1][WB] WB-STUDENT-V3-APPLY-ORDER (2026-10-07)**  
Student `runV3Apply` moves `activePageId` before replacing the live scene, so a document whose new page is already active can store the visible anchor stroke into the new page. Mitigated for PDF/image insert by broadcasting new boards before the switch (`a5eaa056`). Real fix in `useStudentWhiteboardCanvas.ts` — Opus-owned.

**[P1][WB] WB-STUDENT-APPLY-RACE (2026-10-23)**
`runV3Apply` (`src/hooks/useStudentWhiteboardCanvas.ts` ~575–638) snapshots `pageDataRef` before its awaits. `onCanvasChange` returns early during an apply (~936), so a local edit made while a tutor apply is in flight is dropped and the merge writes the stale tutor version back. Observed: a graph expression reverts ~70–80ms later, ~17–20% of runs on the iPhone WebKit student. Tutor `apply-v3` arrives ~7 Hz indefinitely (student viewport broadcast ↔ tutor re-broadcast), which keeps that window open. Strokes are probably affected the same way. Design in progress (Opus). Do not patch the apply path until that design lands. Red oracle: `wb-org-qol-surface.spec.ts` › "phone student tray picker edits only the chosen graph" (`test.fixme`). Unfixme with the fix.

**[P2][WB] WB-RENAME-PERSIST (2026-10-07) — Andrew decision**  
A renamed board tab is live (the student sees it) and is written into the sessionStorage board draft. Reload shows the previous title only when the last persisted event batch predates the rename. Each batch stores `boardDocumentJson` from `pageListRef` at persist time, so a later batch (a stroke after the rename) carries the new title and reload restores it. A rename by itself does not write a batch. Writing a batch via `recordPageSwitch({ evenIfNotRecording: true })` put a pre-Start `page-switch` into the replay log; that option is reverted.

Andrew decides:
- (a) Client overlay of the sessionStorage draft's `pageList` titles when painting the recovered scene. Same-tab only.
- (b) An ownership-asserted server action that patches `boardDocumentJson` on the latest batch. No migration — the column already exists.

**[P1][WB] PDF cross-page stroke bleed / WB-STROKE-BLEED (verify/watch)**  
E5/WS-X fixes ([`b8f786c8`](https://github.com/Arangarx/tutoring-notes/commit/b8f786c8), [`34f650a4`](https://github.com/Arangarx/tutoring-notes/commit/34f650a4), [`ef5fb1a0`](https://github.com/Arangarx/tutoring-notes/commit/ef5fb1a0)); keep §2 WATCH regression gate and Playwright coverage. Monitor on hardware; Andrew evening did not repro post-E5.

**[P1][WB] Student Exit → rejoin presence desync**  
Tutor shows disconnected after student rejoins.

**[P1][WB] Student undo/redo non-functional**  
Smokebook 1b; tutor undo may break when presence wrong.

**[P1][AV] Phone student A/V — bidirectional broken**  
Item 19 FAIL wave5 polish; PLAYWRIGHT-GAP.

**[P2][WB] Student bidirectional video (tiles flash/disappear)**  
Hardware cluster; overlaps WB-AV-GAPs.

**[P2][WB] Replay scrub drag — 429s + frozen scene**  
Debounce drag; abort superseded fetches; cache segments.

**[P2][WB] Hide replay must pause audio**  
Product rule: hide = pause playback.

**[P2][WB] Event log + replay multi-page**  
Flat stream; no `pageSwitch` in log.

**[P2][WB] Replay page strip PDF section grouping**  
`deriveReplayPageListFromLog` sets `isPdf: false` always.

**[P2][WB] PDF position lock / pan-clamp design spike**  
Deferred in PHASE-PDF-STATUS.

**[P2][WB] Tutor-vs-student insert origin (viewport-center)**  
`insert-asset.ts` local Excalidraw state only.

**[P2][WB] Promote math insert to toolbar + library persistence**  
Popover-only today.

**[P2][WB] WB-IMAGE-IMPORTER — image insert missing**  
Unify smoke regression.

**[P2][WB] WB-HAND-TOOL-MISSING (NR-01)**  
Hand/pan discoverable on student shell.

**[P2][WB] WB-LINE-END-TOUCH**  
Finish multi-segment line on touch.

**[P2][WB] Eraser cursor vs delete path (TM-08)**  
Mobile pointer-transform hit offset.

**[P2][WB] NR-07 — transform handles with native chrome hidden**  
Verify periodic regression.

**[P2][WB] Re-enable Playwright invariant 8 (PDF center+fit)**  
Skipped pending pdfjs headless load.

**[P2][WB] Thin-viewport top-bar compaction**  
Controls leave viewport before ⋯; End should stay visible. **WB-STUDENT-TOPBAR-CONTRACTION**.

**[P2][WB] Student desktop mic level meter missing**  
Wave5 polish item 15.

**[P2][WB] Student `[student-apply]` console spam**  
**WB-STUDENT-CONSOLE-NOISE**.

**[P2][WB] WB-STUDENT-BOARD-TABS**  
Student sees only Board 1 tab.

**[P2][WB] WB-STUDENT-VIEW-LOCK-WHEN-SYNCED**  
Student view lock when synced.

**[P2][WB] AV-REFRESH-LOSS — student hard-refresh loses A/V**  
Not proven fixed post-wave5.

**[P2][WB] Exit→rejoin A/V slow / ghost**  
Unify smoke item 21.

**[P2][WB] SMOKE-BUG-2 — stale "Call Reconnecting" pill**  
Clear when reachable.

**[P2][WB] SMOKE-BUG-3 — student text cross-page sync**  
Text carry on page switch.

**[P2][WB] SMOKE-BUG-5 — replay board-tab context**  
Which board during replay switch.

**[P2][WB] SMOKE-BUG-7 / CH-SMOKE-STUDENT-MIC-PERSIST**  
Student mic not persisted across sessions.

**[P2][WB] SMOKE-UX-3 — replay ±10s skip**  
Deferred post-Sarah.

**[P2][WB] CH-SMOKE-REPLAY-PLAYPAUSE-OVERLAP**  
Play/Pause overlaps Board tab.

**[P2][WB] Freedraw latency PR-01**  
Remainder: watch on hardware. Option A+E shipped.

**[P2][WB] Student dark-theme canvas background stuck white**  
`viewBackgroundColor` not synced on theme return.

**[P2][WB] Student mobile tool/chrome parity**  
Mobile missing tools; top bar clipped.

**[P2][WB] Student canvas stuck on "Loading scene…"**  
Intermittent join sync.

**[P2][WB] Preview-before-Start canvas wipe race**  
Low reachability; escape hatches work.

**[P2][WB] Native image insert broken on drag/drop**  
Skip `uploadWhiteboardAsset` path.

**[P2][WB] Cold refresh vs server truth**  
Excalidraw IDB vs app checkpoints.

**[P2][WB] Excalidraw recovery "Load draft" popup**  
Suppress or single restore story.

**[P2][WB] Snapshot multi-page coverage**  
Single-page snapshot only.

**[P2][WB] Snapshot link discoverability**  
Muted footer link.

**[P2][WB] Active-ping 409 after End**  
Benign; cleanup options.

**[P2][WB] MathInsertButton first-open white-box**  
MathLive race on first open.

**[P2][WB] Per-page view state — student validation**  
Tutor shipped; student follow untested.

**[P2][WB] Local dev join URL parity**  
`WHITEBOARD_SYNC_URL` vs app host triangle.

**[P2][WB] Student canvas file sync (images/PDF)**  
BinaryFiles not mirrored to student.

**[P2][WB] Room policy & joiner UX**  
1:1 vs multi-joiner; joiner list.

**[P2][WB] Mobile AV pip — SR-16**  
Fixed top-right on touch; no drag/resize.

**[P2][WB] Per-board undo/redo history**  
Cleared on page switch by design; remount strategy if Sarah asks.

**[P2][WB] PDF open — fit tutor vs student view**  
Owner-requested if Sarah raises.

**[P2][WB] Post–sync-redesign smoke findings**  
Page insert order; mobile hit offset; student mic picker (partially addressed).

**[P2][WB] Eraser bulk delete dimmed-not-deleted**  
Excalidraw upstream; workaround second tap.

**[P2][WB] WB-MENU-CLICK-THROUGH**  
Menu dismiss falls through to canvas.

**[P2][WB] WB-COMPONENTS-PASS**  
Unified `WbTopBar`; kill `whiteboard-chrome.css` monolith.

**[P2][WB] Graph JSXGraph swap follow-ups**  
Remainder: legacy Desmos read-only cleanup in `excalidraw-adapter.ts`, not a fresh swap.

**[P3][WB] Graph smart framing**  
Andrew 2026-10-05, split out of the Sarah zoom note. A new graph opens on −10 to 10 (`DEFAULT_GRAPH_BBOX`). Later: choose a window from the shape of the curve instead of that fixed box. Not part of the `y=` / `2x+1` expression-box change.

**[P2][WB] p3-video-seam**  
Per-participant video finalize/replay — capture NOT built.

**[P3][WB] Laser pointer in replay**  
Not in events.json.

**[P3][WB] Student tab crash — IDB pageDataRef**  
If student-authored content grows.

**[P3][WB] Measure wire bandwidth on real session**  
Delta payload contingency.

**[P3][WB] GitHub Actions wb-regression workflow**  
Phase 2 CI gate.

**[P3][WB] relayShowsCollaborator copy parity**  
Optional tutor-presence copy.

**[P3][WB] PDF large imports on mobile Safari**  
Manual-only gap.

**[P3][WB] Rename everHadAudioFlow → everHadSessionActivity**  
FSM input rename.

**[P3][WB] Replay empty-state armedReason copy**  
vs generic "nothing recorded".

**[P3][WB] NR-09 shortcuts help**  
Optional `?` in Mynk overflow.

**[P3][WB] NR-12 verify native S/G popups**  
Periodic regression.

**[P3][WB] Q9 map chrome controls to v1 tokens**  
No one-offs.

**[P3][WB] XPPen / TM-04 hardware verification**  
Sarah hardware smoke.

**[P3][WB] Graph embed — student expression entry**  
Product decision.

**[P3][WB] Tutor scratchy audio B4**  
Record-side; not replay blocker.

**[P3][WB] Mobile alt-shape picker discoverability**  
Long-press vs tap.

**[P3][WB] Multi-point line rubber-band / close-at-origin**  
Touch UX.

**[P3][WB] BL-LEARNER-JOIN-LINK**  
Learner-side join link backup.

**[P3][WB] BL-WB-SEPARATE-TAB-OPTIN**  
Desktop-only separate-tab WB.

**[P3][WB] Phone/tablet default zoom design**  
Ghost viewport coupling.

**[P3][WB] Whiteboard Phase 2 surfaces**  
Collab essay, code, Office, Wolfram — gated on Sarah 3-session demo ([`docs/WHITEBOARD-STATUS.md`](WHITEBOARD-STATUS.md)).

### Waiting room & session shell

**[VERIFY][WB] Gate A2 — waiting room**  
Remainder: acceptance verify; Plan #2 in-person consent projection. Overlay shipped.

**[P2][WB] Gate A3 — Pass-2 in-context end-session / review shell**  
`SessionReviewMode.tsx` still legacy `.card`. Shell flip architecture shipped partially.

**[P2][WB] Gate A3a — PDF page-tab indicator**  
`PageStripRow.isPdf` propagation.

**[P2][WB] Gate A3b — SR-04a video-tile sizing**  
Auto-expand multi-tile.

**[P2][WB] TM-09 — tutor-mobile expectations notice + host gate**  
Desktop-only tutoring copy + block non-desktop Start.

**[P2][WB] Student default AV peer-only (self-view off)**  
Design §7.5.1; code still `defaultShowLocalVideo: true`.

**[P2][WB] Session type selection UX (in-person vs remote)**  
Open Q1 session-shell design.

**[P2][WB] Student waiting room screen design**  
Open Q2 — tutor side done.

**[P2][WB] Asymmetric viewport when follow OFF**  
Open Q7.

**[P2][WB] TU-11 — keyboard-shortcut routing parity**  
Desktop + student mobile.

**[P2][WB] TU-12 / Excalidraw theme follows app data-theme**  
Pre-master; `useExcalidrawThemeFromSystem` → app theme.

**[P3][WB] SMOKE-POST-2 — in-app text chat**  
Waiting room + live session. Andrew 2026-10-05: yes, add it, collapsed until opened, as a convenience. It must not bypass billable time. Do not change Start, the timer, or when the board is usable. This is the only chat row.

**[P3][WB] SMOKE-POST-3 — tutor "Start anyway" degraded mode**  
After SMOKE-BLOCK-1 fix.

**[P3][WB] Waiting room 10-minute learner timeout**  
Deferred.

**[P2][WB] In-person waiting-room consent projection (Plan #2)**  
`WaitingRoomOverlay` explicit deferral.

**[P2][WB] Unclaimed-student workspace entry redirect**  
Replace bare `notFound()` with actionable redirect.

### Replay & review chrome

**[P2][WB] WB-REVIEW-THUMBNAIL-PDF**  
Hero thumbnail placeholder for PDF boards.

**[P2][WB] WB-REVIEW-DELETE-COPY**  
"Delete session data" not "Cancel and delete…"

**[P2][WB] WB-FINISH-REVIEW-COPY-CONTEXT**  
"Finish review" odd when opened from notes link.

**[P2][WB] WB-TUTOR-REPLAY-PHONE-LAYOUT**  
Notes eat half screen on tutor phone replay.

**[P2][WB] WB-SHARE-REPLAY-VIEWPORT-PHONE**  
Remainder: verify share path. Merged [`8a6ab878`](https://github.com/Arangarx/tutoring-notes/commit/8a6ab878).

**[P2][WB] Replay pause→hide→reopen state**  
Should resume scrub position.

**[P2][WB] Multi-part recording warning banner stale on replay**  
Removed. By replay time the audio is one stream, including a tutor-plus-student recording that still has two segments and no canonical URL. Covered by `tests/integration/wb-replay-no-multipart-banner.spec.ts` and `src/__tests__/regressions/multipart-replay-banner-retired.test.ts`.

**[P2][WB] Replay audio loading CLS**  
Layout jump below scrubber.

**[P2][WB] Replay theme click → unexpected nav**  
Intermittent.

**[P2][WB] Replay disabled top-bar buttons dimming**  
Match sidebar disabled style.

**[P2][WB] Replay board tabs missing PDF icons**  
Live tabs have them.

**[P3][WB] WB-REPLAY-UNVISITED-BOARDS**  
Unvisited boards absent from replay strip (OK post-Sarah).

**[P2][WB] WS-U-FRAGILE 2.4/2.5 — LIVE badge + sync pill visibility**  
Presentation binding gaps.

**[P2][WB] WS-U 1.4 — empty review screen copy**  
No audio/notes empty state.

**[P2][WB] Start/end session "flash reload" feel**  
Perceived perf.

---

## 5. Notes & AI quality

**[P1][NOTES] Map/reduce accuracy + abstain-on-low-content + eval harness**  
Remainder: formal eval harness and abstain bar. Prompts/models exist.

**[P1][NOTES] WS-K — see §3** (fold the running note; End only adds the tail).

**[P2][NOTES] SMOKE-NOTES-2 — live/progressive notes during session**  
DEFERRED post-Sarah. Incremental reduce + live surface; distinct from WS-K End fast-path.

**[P2][NOTES] AI prompt v7 remainder**  
Keep (a) Whisper reframe, (c) speaker hint, fixture suite. v7 itself shipped.

**[P2][NOTES] AI prompt — literal vs interpretive Assessment**  
Gated on Sarah/parent feedback or fixture suite.

**[P2][NOTES] AI prompt v8 — homework → plan (Sarah)**  
Collapse homework section; plan forward-looking. `ai.ts` still emits `homework`; `NewNoteForm` renders Homework.

**[P2][NOTES] Whisper transcription accuracy / short phrase misses**  
"good job" → "did a term"; word-list-only bias option.

**[P2][NOTES] Whisper CJK false positive**  
Pin `language: "en"`.

**[P2][NOTES] Whisper repetition-loop hallucination**  
Trim loops; warn on high trim fraction.

**[P2][NOTES] AI link extraction from spoken URLs**  
Normalize domains; no brand-only guesses.

**[P2][NOTES] AI note generation context hygiene**  
Stale UI / cross-session bleed tests.

**[P2][NOTES] Audio playback during note review**  
Preview disappears after AI fill.

**[P2][NOTES] Recorder gap detection in pending list**  
>500ms gap warning chip.

**[P2][NOTES] Audio scrubbing / duration 0:00**  
WebM/MP4 seek index; server remux.

**[P2][NOTES] Slice-3 S3 — notes reduce job-in-flight lock**  
Orphan DRAFT `SessionNote` race.

**[P2][NOTES] Slice-3 N1–N4 deferred findings**  
See recording-slice3 adversarial review.

**[P2][NOTES] MB-5 verify — tutor_only notes path**  
Smoke PARTIAL; re-verify without impersonation.

**[P2][NOTES] REQ-S3-1 — Formatted markdown `.ai-prose`**  
`FormattedNotesBody` not in `src/`.

**[P2][NOTES] REQ-S3-2 / REQ-S3-2a — Save notes semantics + Cancel session**  
`RecapEditor` not shipped; SSG-2 related.

**[P2][NOTES] REQ-S3-4 — canonical notes schema**  
Map-reduce vs `NewNoteForm` field alignment.

**[P3][NOTES] Formal eval harness + flywheel**  
Phase 11; post-master.

**[P3][NOTES] AI edit signal Phase 1**  
Unbuilt. Full spec: [`docs/archive/handoff/ai-edit-signal-phase-1-bootstrapper.md`](archive/handoff/ai-edit-signal-phase-1-bootstrapper.md) — `AiNoteEditSignal`, `npe` logging, per-field AI-draft columns.

**[P1][GTM] CONTINUITY-V1-CARRYOVER — continuity engine V1**  
Banner-only today. First spine: open loops, pre-session brief, "would you agree?" — spec [`docs/research/continuity-wedge-brainstorm-2026-06-12.md`](research/continuity-wedge-brainstorm-2026-06-12.md).

**[P2][GTM] Public wedge messaging**  
"Structured memory" not "whiteboard+" — marketing copy open.

**[P2][GTM] Notes quality moat elevation timing**  
Pull forward vs Gate A only.

**[PROCESS] MAP-ACC — notes quality tuning #1 post-master**  
Deferral ledger; prompt fix landed — recheck PASS.

---

## 6. Auth / identity / consent / privacy / legal / COPPA

### Consent collection & enforcement

**[P1][CONSENT] Expected refusals that still THROW from server actions are invisible in production (2026-10-30, feat/org-qol redaction fix).** A production build redacts a thrown server-action error to a generic message plus a digest; only a returned value survives (`next dev`, which every Playwright project runs, hides this). The consent Start/create refusals now return `{ ok: false, reason }` (`EntryRefusal`). Same class, still throwing: (1) `startWhiteboardSession` erasure suspension (`ErasureAccessSuspendedError`) and `ORG_ADMISSION_DENIED`; (2) the schedule bridge tutor refusal (`entryRefusalError` from `getOrCreateWhiteboardForSchedule`; its UI is disabled, so reachable only by a stale click); (3) `ConsentError` thrown by `issueJoinToken` for a missing record. Convert each to typed data with its own prod-shape test. Pattern: `src/app/admin/tutor-approvals/actions.ts`.

**[P1][TEST] Enroll `npm run test:prod-shape` in the master gate (2026-10-30).** New project `playwright.prod-shape.config.ts` runs `next build && next start` on :3102 and proves a refused waiting-room Start shows the learner's line in a real production build (red on e1994f9c: generic "Couldn't start the session"). It is NOT yet in `test-selection.mdc` / the `master` merge tier, and it writes `.next`, so it cannot run beside `next dev`. Add it to the merge-to-master checklist, and give it a build output dir of its own (`distDir`) so it can run while a dev server is up. Only the waiting-room Start is covered: the student-detail Start button (`createWhiteboardSession`) has no prod-shape test because its refusal is reachable only by a race (the control is disabled when entry is blocked); add one with a deterministic hook if that path ever matters. Auth is a minted post-2FA session JWT, not a login (production 2FA cannot be completed unattended).

**[P1][CONSENT][ORG-W4] Entry refusals read the rule, then act: loader/Start TOCTOU (2026-10-30, org W4 review).** `startWhiteboardSession` and the schedule bridge load the entry state (`loadSessionEntryState`), then write in a separate step. A family that flips "Allow online sessions" off, or a tutor whose org admission changes, between the read and the PENDING→ACTIVE update can still be let through (or refused) on the old answer. Closed by consent wave **C3a**: the rule is evaluated twice inside one transaction (`startSessionTx`) and the Start throws and rolls back if the second read disagrees (`consent-wave-plan.md` § 3.6 step 4a). Do not patch it separately before C3a.

**[P2][ORG-W4] A stale Open room click on a suspended org throws "Scheduled session not found." instead of the reason (2026-10-30, org W4 review).** Open room is a plain `<form action={openScheduledWhiteboardSession}>`. If the org was suspended (or the instructor removed) after the page loaded, the bridge's admission check returns `not_found` and the action throws, so the tutor lands on the error boundary with "Scheduled session not found." and not the `org_inactive` / `instructor_not_admitted` line the refreshed page would show. The entry rule is already the source of the reason; the fix is to have the action return the reason to the form (or redirect back with it) instead of throwing. Rare (stale tab only); not in W4 scope.

**[P2][CONSENT] Dead `assertConsentFromLiveRecord` and `LIVE_RECORD_DENIAL_COPY.allowLiveSession` (2026-10-30, org W4 review).** After W4 the schedule bridge refuses through `sessionEntryState`, so `assertConsentFromLiveRecord(…, "allowLiveSession")` and the `allowLiveSession` entry of `LIVE_RECORD_DENIAL_COPY` in `src/lib/consent-scope.ts` have no product caller (only `allowNoteSending` is still used, by the notes email path). Delete the `allowLiveSession` branch and copy in consent wave **C5**, with `assertConsentRecordExists` (no alias survives; `consent-wave-plan.md` § 2.4, SF1). Until then the copy there is not shown to anyone.

**[P0][CONSENT] CONSENT-COLLECTION-COMPLETENESS (CC-1/CC-2)**  
Remainder: Playwright gap **CH-SMOKE-PLAYWRIGHT-GAP-CONSENT-ERASURE**.

**[P1][CONSENT] CONSENT-HONESTY-SARAH-MERGE-BLOCKER**  
Remainder: Andrew legal sign-off on modal removal.

**[P1][CONSENT] createChildLearnerAction — no ConsentRecord at create**  
Learner exists before parent visits consent editor.

**[P1][CONSENT] Sarah test-student audit + TEST purge**  
Operator action before V1.

**[P1][CONSENT] Essentials-vs-optional tier ratification**  
§4.1 PROPOSED — awaiting Andrew.

**[P1][LEGAL] CONSENT-LEGAL-CONSULT**  
VPC method, OpenAI processor status, retention timeframe. Questions for counsel, including the 2026-10-11 erasure fingerprint, live in [`docs/LEGAL-SYNC.md`](LEGAL-SYNC.md) under Questions for counsel. Do not start a second list. Research pack: [`docs/coppa-compliance-research-2026-05-31.md`](handoff/coppa-compliance-research-2026-05-31.md).

**[P1][LEGAL] Umbrella + product privacy retention (§312.10)**  
Honest interim on `/privacy`; mortensenapps sync.

**[P2][CONSENT] allowEducationalUse toggle + enforcement (BL-B)**  
Not in schema; spine-locked in lifecycle design.

**[P2][CONSENT] allowWhiteboardRecording real enforcement (WB-CONSENT-UNCONDITIONAL)**  
Toggle hidden; frozen false — gates parent replay only, not capture paths.

**[P2][CONSENT] BL-A — tutor-visible per-student consent projection**  
Read-only `ConsentRecord` on student detail + scheduler chip.

**[P2][CONSENT] assertEffectiveConsent legacy no_snapshot → pass**  
Pre-CC-1 sessions; verify end-path fail-closed.

**[P2][CONSENT] Self-learner audio-off banner still says a parent refused**  
The tutor in-person banner (`wb-audio-consent-banner`) says "this student's parent has not allowed session audio" even when a self-learner turned audio off themselves. The banner still appears. Copy only — leave `WhiteboardWorkspaceClient` until the wording is decided.

**[P2][CONSENT] Self-learner Start with no consent record — Start button fixed 2026-10-13**  
`canStartSession` hides Start when a consent record is missing, including for a self-learner. `assertEffectiveConsent` still returns on a missing snapshot without reading the live record, and it has no production caller. `resolveRecordedConsent` also has no production caller; stage 4 should use `resolveEffectiveConsentForStudent` or delete the raw helper.

**[P2][CONSENT] LIVE-SESSION-CONSENT-COPY**  
Remainder: verify on hardware if needed. Copy module shipped.

**[P2][CONSENT] LIVE-SESSION-START-AFFORDANCE**  
If `allowLiveSession` is false, hide Start (server already rejects). **OPEN UI bug:** Start still shows; tutor learns only after click. Waiting room does not edit consent.

**[P2][CONSENT] WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME**  
`allowNoteSending` not email privacy gate; manual tutor email ungated interim.

**[P3][CONSENT] allowMessaging / allowVideoRecording when features ship**  
`NOT_SHIPPING_PERMISSIONS`.

**[P3][CONSENT] Child-facing ConsentRestriction UI**  
Schema only.

**[P3][CONSENT] CONSENT-UX-REDESIGN / save-on-toggle**  
Guided setup; **CH-SMOKE-SETTINGS-SAVE-ON-TOGGLE**.

**[P3][CONSENT] Mid-session learner swap (Phase 3)**  
No `activeSwapId`; design only.

**[P3][CONSENT] 90-day unclaimed-real-student sunset**  
No cron.

**[P3][CONSENT] Mid-session consent-change poll**  
Defer unless Sarah asks.

**[P3][CONSENT] Orphaned IDB audio admin re-register**  
Post-consent admin path.

**[P3][CONSENT] H-1/H-2 canvas carry-forward on swap**  
Product decisions.

**[P3][CONSENT] PARENT-INITIATED-TUTOR-REQUEST**  
Post-Sarah.

**[P3][CONSENT] WB-INPERSON-AUDIO-SUBTOGGLE**  
Future in-person sub-toggle.

**[P3][CONSENT] WB-SESSION-CONSENT-OVERRIDE**  
Won't build for Sarah.

**[P3][CONSENT] P3 Neon test-account migration script**  
`forward-migrate-p3-test-accounts.ts` not in repo.

**[P2][CONSENT] Consent modal removal — Andrew legal sign-off**  
If not ratified in smoke.

### Erasure (grace = **access suspension**, NOT tutor read-access)

**[P1][CONSENT] Parent self-service erasure (non-admin)**  
`requestLearnerErasureAction` not built; admin-only today.

**[P1][CONSENT] Erasure parent/account-holder self-serve UI + CRITICAL_ACTION**  
Plan §3.1.

**[P1][CONSENT] Non-technical tombstone/grace copy**  
**CORRECT:** during grace, tutor access is **suspended** (`assertStudentNotErased`, `erasure-tutor-gate.spec.ts`) — NOT read-access. Admin/operator copy must not claim grace read-access.

**[P2][CONSENT] Erasure operator lookup UX (MB-2)**  
**CH-SMOKE-DQ-ERASURE-ACCOUNT-LOOKUP**.

**[P2][CONSENT] Erasure 2FA step-up**  
**CH-SMOKE-DQ-ERASURE-2FA**.

**[P2][CONSENT] ERASURE-ORPHAN-AUDIO-BLOBS**  
Inventory gaps.

**[P2][CONSENT] ERASURE-CLIENT-STORE-UNREACHABLE**  
Client IDB not server-purgeable.

**[P2][CONSENT] ERASURE-INFLIGHT-CHECKPOINT**  
In-flight checkpoint at erasure.

**[P2][CONSENT] ERASURE-ADMIN-METADATA**  
Operator metadata gaps.

**[P3][CONSENT] Tutor notification when learner erased**  
Open item.

**[P3][CONSENT] WhiteboardAsset enumeration at scale (H-3)**  
events.json parse timeout risk.

**[P3][CONSENT] At-rest envelope encryption**  
Spike: not COPPA-mandated; optional hardening.

### Identity & join

**[P1][AUTH] Gate B2 — parent privacy consent lattice + management UI**  
Schema shipped; B2-AC-1/2 per-tutor re-consent at claim. Parent editor shipped (`saveParentConsentAction`).

**[P1][AUTH] WB-ADULT-JOIN-ENABLEMENT B2-signup / B3 / B4**  
B1 won't-fix. B2-signup `isSelfLearner`; B3 child-only claim PIN (Andrew 2026-10-05: self learner/parent is email login only; the username and PIN card is for a child learner). B4 parent→self-learner toggle.

**[P1][AUTH] WB-PARENT-JOIN-AS-CHILD — parent_session_select picker**  
Interim `ParentJoinGapCallout` shipped.

**[P1][AUTH] VERIFY-ACCT-1 — duplicate-account creation block**  
Core shipped [`2fff57b7`](https://github.com/Arangarx/tutoring-notes/commit/2fff57b7). Remainder: Google OAuth cross-realm round-trip PLAYWRIGHT-GAP (Jest surrogate exists).

**[P2][AUTH] BL-RESET-DOMAIN — reset email respects originating host**  
`getPublicBaseUrl` vs request Host.

**[P2][AUTH] BL-RESET-GENERATE — Chrome suggest-password on /reset-password**  
`ba2012a` reverted.

**[P2][AUTH] BL-ADMIN-UUID-PICKER — 2FA reset target picker**  
Typeahead for admin UUID.

**[P2][AUTH] BL-VERIFY-SUCCESS-COPY — post-verify affirmation**  
Silent landing after verify.

**[P2][AUTH] WB-JOIN-LEARNER-SESSION-PERSISTENCE**  
Tab-switch re-login.

**[P2][AUTH] WB-FLAKE-JOIN-STALECOOKIE**  
Join route cold-compile flake.

**[P2][AUTH] PLAYWRIGHT-GAP — /join #k= fragment preservation**  
Middleware may drop hash before `JoinAuthGate`.

**[P2][AUTH] Claim interstitial — verify claim-email host vs preview**  
Before AuthGate fix.

**[P2][AUTH] Parent→self-learner toggle post-create**  
Waiting-polish item 7.

**[P2][AUTH] Claim flow: self-learner shouldn't see child PIN setup**  
Adult self-learner claim UX.

**[P2][AUTH] Signup waitlist pagination + Google OAuth auto-provision**  
Remainder: pagination and any remaining REJECTED UI. First chunk shipped.

**[P2][AUTH] BL-SIGNUP-SMTP-LEAK — signup error exposes env var names**  
Minor info disclosure + poor UX on public `/signup`. Found 2026-09-17 (code inspection for Tyson external-tester packet; tutor-auth [`c8d613ca`](https://github.com/Arangarx/tutoring-notes/commit/c8d613ca); not live-reproduced — prod SMTP config unknown). When email+password signup cannot send confirmation mail, `signup` in `src/app/signup/actions.ts` deletes the new `AdminUser` (fail-closed) but returns the underlying error to the form; with SMTP unconfigured that is `platformSmtpMissingError()` from `src/lib/email.ts` — "Platform SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS." — rendered to anyone attempting signup. **Fix:** return the existing generic copy ("We couldn't send a confirmation email. Try again later, or contact support if this keeps happening.") and log the operator reason server-side. **Tests:** red/green Jest — action must never surface raw SMTP text ([`.cursor/rules/exhaustive-testing-mandate.mdc`](../.cursor/rules/exhaustive-testing-mandate.mdc)).

**[P2][AUTH] 2FA remember-device open decisions**  
`__Secure-` prefix; max devices; backup codes interaction.

**[P1][AUTH] BL-SMS-A2P-CONSENT — SMS 2FA opt-in is not A2P-reviewable**  
Queued Andrew 2026-09-21: ship **now** — `feat/calendar-wave` is on `master`. Twilio A2P campaign cannot be filed honestly today — phone collect is field + Send code (`TwoFactorSetupForm` `sms-phone`, change-method in `TwoFactorManageView`); no unchecked consent checkbox; no rates/HELP/STOP/frequency/legal links; OTP bodies in `sendSmsOtpChallenge` have no STOP line; privacy/terms name Twilio but lack CTIA SMS-program sentences. Plan: [`docs/handoff/SMS-A2P-CONSENT-PLAN.md`](handoff/SMS-A2P-CONSENT-PLAN.md). Reuse `Checkbox`/`CheckboxField`; server must require `smsConsent`; legal per [`docs/LEGAL-SYNC.md`](LEGAL-SYNC.md). Do not describe fictional consent on the Twilio form.

**[P1][AUTH] BL-2FA-EMAIL-AVAIL — chooser default dead-end without SMTP**  
User-facing; can strand newly-approved tutors (not data-loss). Found 2026-09-17 (code inspection for Tyson external-tester packet; tutor-auth [`c8d613ca`](https://github.com/Arangarx/tutoring-notes/commit/c8d613ca); not live-reproduced — prod SMTP/Twilio/TOTP config unknown). SMS card honestly gates via `isSms2faEnrollmentAvailable()` in `src/lib/two-factor-enrollment.ts` ("Not available yet — SMS sender is not configured." / disabled "SMS not available"). EMAIL card has no check: always the highlighted default ("Default — we send a 6-digit code to your account email at sign-in.") with enabled "Set up with email" even when platform SMTP is unconfigured (`isEmailConfigured()` in `src/lib/env.ts`); user only fails after committing when `startEmailOtpEnrollment` → `sendEmailOtpChallenge` → `sendPlatformMail` ("We could not send the verification email. Check email delivery settings or try again later."). Surfaces: `src/app/admin/settings/2fa/TwoFactorMethodChooserCards.tsx`, `src/lib/otp-challenge.ts`. **Fix:** pass an email-availability flag like existing `smsEnrollmentAvailable`, from `isEmailConfigured()` — composition only ([`.cursor/rules/composition-no-duplication.mdc`](../.cursor/rules/composition-no-duplication.mdc)). **Related risk:** mandatory 2FA has exactly three methods — email (SMTP), SMS (Twilio), authenticator (`TOTP_ENCRYPTION_KEY`); if none are configured, new tutors cannot complete 2FA or reach the product (enrolled users unaffected) — needs startup/health check or operator-visible warning so this cannot fail silently in production. **Tests:** red/green; chooser gating Playwright ([`.cursor/rules/playwright-on-fix.mdc`](../.cursor/rules/playwright-on-fix.mdc)).

**[P1][AUTH] SEC-1 R3 — cross-preview impersonation SSO**  
usemynk cutover deferred.

**[P3][AUTH] AUTH-IDENTITY-REDESIGN**  
Unified login/signup post-Sarah. Spec: [`docs/AUTH-IDENTITY-REDESIGN.md`](AUTH-IDENTITY-REDESIGN.md).

**[P3][AUTH] AUTH-FAMILYID-* / AUTH-AGE-NO-HARD-CUTOFF**  
Dot-in-segment routing; counsel on age copy.

**[P3][AUTH] Cross-realm email uniqueness + Google OAuth signup**  
IAC-14.

**[P3][AUTH] Operator / true-admin login**  
Distinct from tutor login; `/operator/*`.

**[P3][AUTH] Identity Phase 3–6**  
Messaging, ShareLink sunset, AH 2FA enrollment.

**[P3][AUTH] Auth-form unification (8 credential forms)**  
Password primitive drift.

**[P3][AUTH] WB-IMPERSONATION-SESSION**  
Continue in-progress WB after impersonation switch.

**[P3][AUTH] BL-IMP-REAL — impersonate real accounts**  
Hard-blocked today; needs step-up, audit, legal.

**[P3][AUTH] SEC-1 nice-to-haves**  
Test-account UI, active-session list, env-only admin warning.

**[P3][AUTH] Real email provider (P2b)**  
Code shipped [`673c54f3`](https://github.com/Arangarx/tutoring-notes/commit/673c54f3) (`sendPlatformMail`). Remainder: ops row (Resend/DNS/Vercel) — see Email-infrastructure prerequisite.

**[P2][AUTH] Notes first-class authenticated chrome (P2-AC-12/13)**  
`/s/*` wall shipped; full parent chrome integration deferred.

**[P2][AUTH] ADMIN-PARENT-BLOCK-LIVE**  
Ajax refresh parent block after claim.

### Gate B fast-follow

**[P1][AUTH] Gate B1 — approval-gating / waitlist**  
Remainder: pagination and invite links. Core waitlist shipped [`99da0111`](https://github.com/Arangarx/tutoring-notes/commit/99da0111).

**[P2][AUTH] Gate B3 — security checks + final cleanups**  
Tier B audit remainder.

### Consent-honesty smoke follow-ups (CH-SMOKE-*)

**[P2][CONSENT] CH-SMOKE-PLAYWRIGHT-GAP-CONSENT-ERASURE**  
CC-1/CC-2 + erasure admin e2e gaps. Matrix in EXTRACT-D.

**[P2][CONSENT] CH-SMOKE-DQ-ERASURE-ACCOUNT-LOOKUP** · **CH-SMOKE-DQ-ERASURE-2FA** · **CH-SMOKE-DQ-ERASURE-COPY-JARGON** · **CH-SMOKE-DQ-MULTI-STUDENT-LIVE** · **CH-SMOKE-DQ-CONSENT-CALLOUT-LIVE** · **CH-SMOKE-SETTINGS-SAVE-ON-TOGGLE** · **CH-SMOKE-STUDENT-MIC-PERSIST** · **CH-SMOKE-REPLAY-PLAYPAUSE-OVERLAP**  
Details in [`consent-honesty-smoke-findings-2026-07-01.md`](handoff/consent-honesty-smoke-findings-2026-07-01.md). Andrew-only Notes fields blank in smokebooks.

### Security

**[P1][AUTH] npm audit Tier B (SHOULD-FIX-4)**  
22 vulns; `npm audit fix` no-op on peer conflicts.

**[P1][AUTH] Account-takeover gap on existing-email signup**  
Mitigations: email-confirmation signup, notify-on-reset.

**[P2][AUTH] Email-infrastructure prerequisite (Resend on usemynk.com)**  
Transactional sender for confirmation + reset notify.

**[P2][AUTH] Account-takeover defense (2/3) notify-on-password-reset**  
Inform existing holder.

**[P3][AUTH] Account-takeover defense (3/3) notify-on-new-device-signin**  
Defense in depth.

**[P2][AUTH] In-memory rate limiters → Neon**  
Remainder: `api:<ip>` and `setup:<ip>`. Learner PIN/auth/2FA durable limiters shipped.

**[P2][SEC] createStudent burst bucket** — 10 attempts per 15 minutes per tutor. Andrew can change those two numbers. This bucket does not survive a cold start.

**[P2][SEC] SEC — /api/test/whiteboard/* gate hardening**  
Core shipped [`bb6d3095`](https://github.com/Arangarx/tutoring-notes/commit/bb6d3095). Remainder: pin empty `PLAYWRIGHT_TEST_SECRET` in prod env.

**[P3][LEGAL] Phase 10-pre external pen-test**  
Before first paying customer. Now pulled forward: see **SEC-AUDIT-PIPELINE + PEN-TEST — RELEASE GATE** under Release priorities #6 (Andrew 2026-10-11).

**[P2][LEGAL] Audio recording of minors — consent flow research**  
Per jurisdiction before scale.

**[P2][LEGAL] OpenAI vendor ops checklist**  
DPA, ZDR, prod path verification.

**[P2][LEGAL] PII / privacy policy before public launch**  
Beyond pilot stub.

---

## 7. UX / design system / brand / a11y

### Gate A1 — pre-master visual / component pass

**[P0][UX] Gate A1 — cohesive visual review + mock-faithful composition**  
Andrew-confirms open. `v1-design-gap-inventory` baseline; many surfaces still legacy `.card`/`.btn`.

**[P0][UX] X2 — v1 design via shared components (DRY)**  
Kill per-page hardcoded styling; [`V1-COMPONENT-LIBRARY.md`](V1-COMPONENT-LIBRARY.md) §2.12.

**[P1][UX] Component-duplication + @layer base CSS cleanup**  
Unlayered `globals.css` beats Tailwind utilities. CheckboxField label weight follow-up.

**[P1][UX] dark: → semantic token migration**  
~10 files still `dark:`; TU-12 Excalidraw theme.

**[P1][UX] TFA2 — 2FA setup/verify pages v1 redesign**  
Still `className="card"`; `TwoFactorSetupForm` dark: variants.

**[P1][UX] L3 — student WB chrome parity on /join**  
Student join lacks full `mynk-wb-chrome`.

**[P1][UX] L6 — WbStatusPill / connected-sync status**  
Student legacy inline pills.

**[P2][UX] X3 — AV pip on/off clarity**  
Tutor `WbAVCluster` vs student floating controls.

**[P2][UX] Foundation pass — promote surface-local shells to library**  
`PublicDocumentShell`, `ParentShareShell`, etc.

**[P2][UX] Missing primitives**  
Chip, SheetMenuRow, SettingsRow, week grid, sync Badge.

**[P2][UX] SettingsNavList as a LinkRow variant**  
Evaluate before building. `SettingsNavList` (`src/components/admin/SettingsNavList.tsx`, used on `/admin/settings`) is a second chevron link-row: a full-width link, a title, a secondary line, a trailing `ChevronRight`, and a focus ring. `LinkRow` / `LinkRowList` (`src/components/LinkRow.tsx`) is the card stack on the student roster and both organization lists.

They are not the same chrome. `LinkRow` is one rounded bordered card per row (`w-full`, shadow, optional leading slot, badges, mono meta). `SettingsNavList` is one card around a divided list (`divide-y`), full-bleed on small screens, an accent left border, and a description paragraph. The nav landmark (`aria-label="Settings sections"`) and the bleed stay on the settings shell.

A `variant` on `LinkRow` (`card` | `divided`) could own the shared row so the chevron link is not a second primitive. `SettingsNavList` would keep the nav shell and pass `variant="divided"`. The divided row has no leading slot or badges, and the card row has no divided-list chrome, so the variant has to express those as present or absent rather than forking the row. Not built. Needs Andrew's call before folding them.

**[P2][UX] Tailwind aliases rounded-panel, border-strong**  
Still `rounded-[10px]` in places.

**[P2][UX] MarketingHeader inline styles → primitives**  
Group A follow-up.

**[P2][UX] PreSessionPanel / StartWhiteboardSession mock alignment**  
PARTIAL vs mock.

**[P2][UX] Scheduler Group F visual-only**  
See §11 Scheduling.

**[P2][UX] Error/legal/public shells legacy cleanup**  
`not-found.tsx`, `error.tsx`.

**[P2][UX] Cohesive pass open questions**  
Settings density, validation-state coloring.

**[P2][UX] REQ-S3-3 — Identity chip + test-account badge**  
Partial; test-account badge missing.

**[P2][UX] T2 — accent-recipe pass**  
Proposal branch awaiting Andrew.

**[P2][UX] Formalize IA decisions in UX-AND-A11Y-SPEC §15**  
Scheduling=no, session-centric model — rows 2–5 still open.

**[P2][UX] Tutor toolbar reorder U4 / shape dropdowns U5-U6**  
Custom chrome required; Excalidraw 0.18.1 cannot reorder native toolbar.

**[P2][UX] Mobile color palette dismiss I7**  
Click-away dismiss on student-mobile.

**[P2][UX] Pen panel too large (pilot-2026-06-06 U5)**  
Quarter-screen takeover.

**[P2][UX] Thinner default pen stroke (U6)**  
Stroke width presets.

**[P2][UX] Keyboard undo Ctrl+Z misbehaves (pilot B1)**  
Desktop regression vs on-screen undo.

**[P2][UX] Share/copy link silent clipboard failure (pilot B2)**  
Toast + error on failure.

**[P2][UX] Learner/student logged-in top-bar oversized**  
Mis-scoped fix @ `f412767`; target learner shell bar.

**[P2][UX] ADMIN-STUDENT-DETAIL-MOBILE-DISCOVER**  
Remainder: verify. Merged [`b5472ab8`](https://github.com/Arangarx/tutoring-notes/commit/b5472ab8).

**[P2][UX] Double scrollbars on admin pages**  
Single architectural root.

**[P2][UX] Known issues & roadmap — top-level sidebar link**  
Not buried in Settings.

**[P2][UX] Unclaimed student claim link buried**  
Top-level affordance. **Part of Priority #2 epic** (after Google #1): Start/consent/claim findability — `ConsentRequiredCallout` salience + claim mint not buried in Parent tab (Sarah 2026-07-29).

**[P2][UX] Parent dashboard Manage button alignment**  
Polish.

**[P2][UX] Known-issues section headers too muted**  
Optional polish.

**[P2][UX] Live board Sign out row dimmed/clipped**  
Student chrome.

**[P2][UX] Live board ⋯ More PDF affordance discoverability**  
Chrome.

**[P2][UX] Password fields show/hide toggle**  
Phone priority.

**[P2][UX] Verify-email success copy**  
Polish confirm item 3.

**[P2][UX] Recovered-audio prompt — always keep, no Discard**  
Part1 checkpoint preference.

**[P2][UX] WS-U-FRAGILE taste/IA batch (2.8–2.15)**  
Student Exit confirm, admin Outbox rename, etc.

**[P2][UX] Known issues page placement/tone**  
Remainder: Andrew review. Draft exists.

**[P2][UX] Start/end session flash reload feel**  
Nav perceived perf.

**[P2][UX] Time-alert UX — visible alert clock + settings**  
Master-cut #7 PARTIAL.

**[P2][UX] WS-Q tutor settings — alert defaults**  
Configurable interval, chime, DB columns.

**[P2][UX] WS-J richer per-session billing display**  
Beyond label pass.

**[P2][UX] Part 3 student Sign out in top-bar ⋯**  
Touch layouts; ORCHESTRATOR-STATE tracked.

### v1 design-system smoke follow-ups

**[P2][UX] 2FA inline verify-at-login**  
Distinct from TFA2 setup page.

**[P3][UX] T9 — theme toggle on signup pages**  
Missing vs authenticated shells.

**[P3][UX] T10 — per-tutor names collapsible subsection**  
Parent child detail.

**[P3][UX] Consent floor-block checkbox contrast**  
Light borders on same background.

**[P3][UX] BG2 — students-roster search inner effect**  
Needs Andrew clarification.

**[P3][UX] Impersonation pip clarity**  
Mask icon, click-to-exit.

**[P3][UX] Video tile docking (SR-04 follow-up)**  
Remainder: post-V1 docking. Base shipped.

**[P3][UX] Triangle / n-gon shapes v1.1**  
No native Excalidraw triangle.

**[P3][UX] Age/grade-adaptive interface complexity**  
2.0 / post-V1.

**[P3][UX] Parents marketing page Phase D v2**  
Parent-targeted page backlogged.

**[P3][UX] Per-org data-org theming**  
University pilot bonus.

**[P3][UX] Spacing/radius/motion tokens**  
DESIGN-TOKENS-PLAN out-of-scope partial.

**[P3][UX] Default light vs dark theme**  
DESIGN-TOKENS Phase 0 kickoff Q.

**[P3][STRATEGIC] Pricing transparency — AI cost stance**  
Strategy discussion only.

### Shipped design reference

Closed history: [`docs/SHIPPED.md`](SHIPPED.md).

---

## 8. Device pickers / hardware

**[P1][AV] SMOKE-AUDIO-1** — see §1 (Brio first-acquire).

**[P2][AV] SMOKE-BUG-11 — tutor mic picker not initialized from tn-mic-device-id**  
Capture restores; UI reads `pickedMicSlot` never bridged.

**[P2][AV] DEVICE-PICKER-DEDUPE / WB-DEVICE-PICKER-DUPES**  
Collapse duplicate enumerateDevices entries via groupId + label normalization.

**[P2][AV] DEVICE-PICKER-MOBILE-FACINGMODE**  
Phone: Back/Front only via facingMode.

**[P2][AV] Mic hot-plug requires hard refresh (B1-B4 smoke)**  
Asymmetric vs camera; W1 ondevicechange policy.

**[P3][AV] SMOKE-AUDIO-2 — phantom tutor self-unmute**  
Watch item.

**[P3][AV] SMOKE-AUDIO-3 — wrong mic after cancel→rejoin**  
Cancel path fixed 2026-07-09; mic wrong-device watch.

**[P3][AV] WS-H NB-1–NB-5**  
Per-attempt timeout, log enumerate error, stale groupId clear, collision test.

**[P3][AV] Device-picker cleanup — phone front/back only**  
Sarah ask; usersmoke quicklist.

**[P1][TEST] iOS matrix** — see §1.

**[P2][REC] Android Chrome matrix fill-in**  
Second pilot.

**[P3][REC] Firefox untested**  
Lower priority.

---

## 9. Testing & harness (PLAYWRIGHT-GAPs)

**[P3][TEST] TSC-PREEXISTING-TEST-ERRORS (2026-10-30, `feat/org-qol`)**

`npx tsc --noEmit` exits non-zero from type errors that are all in **test files**, so `tsc` is not a clean gate yet: new errors are caught by diffing against this list, not by exit code. Run on `feat/org-qol` at the W4-hardening verify fix. **None of these files is in `git diff --name-only b180ab84..HEAD`** (the org-qol branch's own diff). `tests/integration/wb-org-booking.spec.ts` was the one file that was in that diff and had errors (12: `displayName: string | null` passed where `string` was typed, and an `offsetWidth` on `SVGElement | HTMLElement`); fixed in the same wave, so it is no longer on the list. `next build` is unaffected (it type-checks the app, not these specs).

Error count per file (code):

- `src/__tests__/admin/design-system-page.test.tsx` — 1 (TS2352)
- `src/__tests__/api/learner-logout-route.test.ts` — 2 (TS2554)
- `src/__tests__/calendar/ics-feed-stability.test.ts` — 1 (TS2503)
- `src/__tests__/calendar/ics-google-timezone.test.ts` — 1 (TS2503)
- `src/__tests__/components/SubNav.dom.test.tsx` — 2 (TS2307)
- `src/__tests__/components/ui/form-submit-button.dom.test.tsx` — 2 (TS2345)
- `src/__tests__/components/whiteboard/WbTopBarMicControl.dom.test.tsx` — 1 (TS2322)
- `src/__tests__/dom/RecordingControlPanel.dom.test.tsx` — 1 (TS2322)
- `src/__tests__/dom/WhiteboardWorkspaceAudioBridge.dom.test.tsx` — 1 (TS2322)
- `src/__tests__/email.test.ts` — 1 (TS2339)
- `src/__tests__/hooks/useViewportWireBroadcast.test.tsx` — 1 (TS2345)
- `src/__tests__/identity/email-otp-challenge.test.ts` — 4 (TS2345)
- `src/__tests__/org/org-booking-bridge.integration.test.ts` — 1 (TS2345)
- `src/__tests__/org/org-removal-suspend.integration.test.ts` — 1 (TS2556)
- `src/__tests__/playwright-harness-gate.test.ts` — 1 (TS2493)
- `src/__tests__/playwright-mute-output.test.ts` — 13 (TS7006 / TS7034 / TS7005)
- `src/__tests__/recording/audio-capture-policy.test.tsx` — 1 (TS2322)
- `src/__tests__/whiteboard/adhoc-scheduled-session.integration.test.ts` — 1 (TS2554)
- `src/lib/av/__tests__/mic-first-acquire.test.ts` — 2 (TS2493)
- `tests/integration/wb-ghost-viewport.spec.ts` — 2 (TS2339, TS2352)
- `tests/integration/wb-replay-camera-fit.spec.ts` — 7 (TS2305, TS7006, TS2339)
- `tests/integration/wb-tutor-recenter.spec.ts` — 3 (TS2339)
- `tests/integration/wb-wave5-polish.spec.ts` — 1 (TS2345)

Fix them file by file, then make `npx tsc --noEmit` a required gate. Also noted: the TS2578 guard in `src/__tests__/scheduling/family-entry-brand.types.test.tsx` only has teeth while `tsc` runs, so it is checked by diffing this list.

**[P1][TEST] MASTER-PREEXISTING-GATE-FAILURES (2026-10-24)**

During the pre-master gate for hotfix `fix/wb-student-apply-race` (clean `npm ci` worktree), 12 Playwright tests failed identically on the hotfix branch and on unmodified master `eebafee1`.

**Andrew decision 2026-10-24 (explicit waiver):** merge the hotfix once its own tests and Sonnet review are green. Treat these 12 as known master failures. Investigate the 8 recording/replay ones immediately after the hotfix merges. The second full gate on `0570a200` added `tests/integration/wb-replay-scrub-seek.spec.ts:767` (also fails on master `eebafee1`; same VAD-harness-zero-segments family as `:645`) to that investigate list.

**Environment-only** (no `OPENAI_API_KEY` in the local dev env; `.env` has it empty):

- `tests/audio-upload.spec.ts:138`, `:151`, `:217` — ai-assist-panel omitted without the key
- `tests/integration/wb-vad-per-speaker-durability.spec.ts:284` — transcription `failed`

**Unknown cause, to investigate** (harness vs real bug). These eight, plus `:767` from the second full gate on `0570a200`:

- `tests/integration/recording-end-to-end.spec.ts:110` — first-open `currentTime` near the end
- `tests/integration/wb-replay-scrub-seek.spec.ts:533` — `concat_skipped` / `no_mixdown_segments`, 300s timeout
- `tests/integration/wb-replay-scrub-seek.spec.ts:645` — VAD harness, 0 `tutor:mic` segments
- `tests/integration/wb-replay-scrub-seek.spec.ts:767` — "multi-segment VAD: seek into later segment lands at intra-segment offset"; `tutor:mic` segments 0, expected >=2; also fails on master `eebafee1`; same VAD-harness-zero-segments family as `:645`
- `tests/integration/recording-resilience.spec.ts:224` — `SessionRecording` count 0, `no_mixdown_segments`
- `tests/integration/wb-tab-kill-audio-durability.spec.ts:181` — 0 `tutor:mic` outbox rows/segments
- `tests/integration/wb-tab-kill-audio-durability.spec.ts:275` — 0 `tutor:mic` outbox rows/segments
- `tests/integration/view-whiteboard-new-replay.spec.ts:189` — `share-wb-replay-links` matched 3; shared local DB reuses `Playwright Student` with many READY notes (test isolation)
- `tests/integration/wb-cancel-pending-session.spec.ts:176` — `wb-waiting-cancel-confirm` never appears

**Flakes seen** (not part of the 12): `tests/integration/wb-wave5-polish.spec.ts:568` and `:777`, `tests/integration/wb-cancel-pending-session.spec.ts:121`, `tests/integration/calendar-sync-badge.spec.ts:16`, `tests/integration/wb-notes-shimmer.spec.ts:289` and `:326`. Second full gate (`0570a200`) also flaked: `tests/integration/wb-session-lifecycle.spec.ts:1564`, `tests/integration/wb-notes-shimmer.spec.ts:254`, and jest `src/__tests__/dom/WhiteboardWorkspaceOutboxDrainUI.dom.test.tsx` "shows Saving your recording…" (outbox row `seg-pending-p2-j5` still present; passed alone).

**Status:** `WAIVED` for the hotfix merge. Rechecked on `feat/org-qol` 2026-10-28 (below). The silent-mic family and the cancel-confirm race were already fixed on this branch (`9d67dc69`, `cde3fcca`).

**Resolution (2026-10-28, `feat/org-qol`):**

1. **audio-upload** — already green. The live test asserts the coming-soon sentence and zero Record/Upload tabs. The old upload flow is `test.skip` (`PLAYWRIGHT-GAP`). Nothing looks up an `audio-upload` testid while AI is unconfigured.
2. **VAD per-speaker** (`wb-vad-per-speaker-durability.spec.ts`) — was red: `tutorNoteStatus` `"failed"` vs `/^(done|partial)$/` because `OPENAI_API_KEY` is empty (`[txc] transcribe_failed err=OPENAI_API_KEY not configured`, 240s poll). Fixed in `f1494ce1`: the poll accepts that exact persisted note and chunk error, and any other failure still fails the test. Red 5.1m, green 1.2m. Mixdown asserts unchanged.
3. **view-whiteboard-new-replay** — already green (all 4 tests, including the parent share link). The replay link is scoped to this session's href. No change.
4. **recording-end-to-end `duration - 2`** — already green (1.1m). First open and re-open stayed near the start. No change.
5. **tab-kill storageState** — already green (both tests, ~39s). `browser.newContext()` inherits the project tutor `storageState`. The old zero-segment failures were the silent mic, not missing auth. No change.
6. **wb-replay-scrub-seek `:767`** — already green (1.0m) with the fake mic. `tutor:mic` segments met `>= 2`. No change.
7. **tutor can rename the current board** — isolated run was green 3/3 (`--repeat-each=3 --retries=0`). The later `@wb-recording` tag grep timed out twice at 180s. The page at timeout already had "Student connected", the Board 1 tab, and `Rename Board 1`, plus `button "Open issues overlay"` ("1 Issue"). Verified in Next 15.5 devtools: `devIndicators: false` removes the Dev Tools logo and still renders that issues button while the error count is above zero. A reused `npm run dev` ( `reuseExistingServer` when not CI) can also skip the flag entirely because `next.config.ts` reads `PLAYWRIGHT_TEST` only at process start; globalSetup now rejects that server. Not a rename product bug and `WhiteboardWorkspaceClient` was not touched. The test hides `nextjs-portal`, records console errors as non-failing annotations, and asserts `elementFromPoint` on the rename button is inside the Boards tablist before the click. Re-run after the hide: 25.7s pass. Whether the long run's "1 Issue" was the peer-mesh m-line `console.error` is assumed, not confirmed. That renegotiation failure is an open live-A/V bug (below).
8. **jest `adhoc-scheduled-session`** — red was the organization-owned case only: `ORG_ADMISSION_DENIED` instead of `NEXT_REDIRECT`. The two personal-tutor cases already redirected. Fixture gap after the admission gate: the org was `pending` and the tutor was not a member. Fixed in `bdb03f7d` by seeding an active org and an instructor membership. The no-appointment asserts are unchanged. Green 3/3. Not a product regression for personal tutors.

The same tag grep passed `wb-replay-scrub-seek.spec.ts:533` and `:645`, and `recording-resilience.spec.ts:224`. `:645` is the same fake-mic family as `:767`. That grep was not a clean gate: 194 passed, 6 failed, 4 flaky, 5 skipped. Hard failures outside this list: `wb-cancel-pending-session.spec.ts:264` (copy link is the other session), `wb-org-booking.spec.ts:282` and `:475`, `wb-replay-no-multipart-banner.spec.ts:27`, and `tests/smoke/whiteboard-workspace.spec.ts:109`. Flaky (failed, then passed retry): `wb-org-removal.spec.ts:415`, `wb-session-lifecycle.spec.ts:173` and `:1191`, and tab-kill `:275`. The tag script's own `test:wb-jest` re-run flaked `sync-client.test.ts` "broadcastScene is throttled"; a dedicated `npm run test:wb-jest` before that was 108 suites / 1069 passed.

**[P2][TEST] PLAYWRIGHT-GAP — iOS soft keyboard covers the phone graph expression tray (2026-10-22)**  
On a phone, graph expression editing opens in a bottom sheet (`wb-graph-expr-tray`). The sheet offsets itself with `visualViewport` when the keyboard shrinks the visible area. Playwright cannot summon the iOS keyboard or reproduce that occlusion. Hardware check: on an iPhone, open ƒ Expressions, focus the expression field, and confirm the field stays above the keyboard. Surrogate: `wb-org-qol-surface.spec.ts` › "phone expression editing opens a bottom tray inside the viewport and plots on both peers" (input inside the layout viewport, no keyboard).

**[P3][WB] graph phone tray follow-ups (2026-10-23; launcher updated 2026-10-27; review blockers 2026-10-27)**
- The phone expression launcher is one viewport-fixed chrome control (`WbGraphExprTray`), shown only in phone layout when the current board has a graph. One graph edits directly; more than one uses a picker labeled Graph 1, Graph 2 in board order. The per-graph strip toggle remains on desktop and tablet.
- Graphs Excalidraw never mounts (scrolled off the current board) are not registered with the phone tray, so the picker can undercount and skip a "Graph N". Fixing that means reading the scene without going through the embed mount. Not done — it is easy to get wrong next to the apply path.
- Fit graph to student's screen updates when the peer viewport wire changes (`emitFitPeerView`), not on a 400ms poll.

**[P2][TEST] Fixed 2026-10-23 — `wb-graph-ink.spec.ts` draw-preview strokes stay off the graph controls**  
"draw preview follows the drag locally…" failed 3 of 3 at the third in-progress stroke (`previews` length 0). Cause was test geometry: the stroke started at 40% / 70% of `.wb-graph-board-host`, and `.wb-graph-controls` (taller since the y= helper in `44b18050`) covered that point, so `elementFromPoint` returned `div.wb-graph-controls-strip`. Stroke points now come from the live board rect with the controls rect removed, and each stroke start asserts `elementFromPoint` is inside `.wb-graph-board-host` and not inside `.wb-graph-controls`. Product code unchanged. Spec green 3/3 on `feat/org-qol`.

**[P1][AV] OPEN — ICE restart fails when the next offer's m-line order changes (2026-10-28)**  
`restartInternal` in `src/lib/av/peer-mesh.ts` (~927) `console.error`s `[peer-mesh] … event=restart-fail … setLocalDescription: The order of m-lines in subsequent offer doesn't match order from previous offer/answer`. Fragile surface (`docs/LIVE-AV.md`). Not fixed. A long `@wb-recording` run the same day showed Next's "1 Issue" badge over the Board 1 tab. That the badge's one issue was this log line is assumed, not confirmed — that run did not keep the console text.

**[P2][TEST] Pre-existing flake — "tutor can rename the current board" hangs on hover (2026-10-23)**  
`wb-org-qol-surface.spec.ts` › "tutor can rename the current board" used to fail 1 of 3 with `--repeat-each=3 --retries=0` (always the third repeat), both on `aaddfdfe` without the tray work (2 pass / 1 fail) and with it (2 pass / 1 fail); 180 s timeout, `hover()` on the Board 1 tab never completes. One trace showed a tutor console error `[peer-mesh] … event=restart-fail … setLocalDescription: The order of m-lines in subsequent offer doesn't match order from previous offer/answer` (open live-A/V bug above). Next dev mode can surface a `console.error` as the "1 Issue" badge, which sits bottom-left over the Board 1 tab and takes the pointer. Recheck 2026-10-28 on `feat/org-qol`: isolated `--repeat-each=3 --retries=0` passed 3/3. A long tag grep the same day timed out at 180s with the "1 Issue" badge still in the tree. Verified: Next 15.5 keeps that button when the error count is above zero even with `devIndicators: false`. Whether this run's badge was the m-line error is assumed, not confirmed. The rename test hides `nextjs-portal`, attaches console errors without failing, and checks the hit target before clicking.

**[P2][TEST] PLAYWRIGHT-GAP — long End wait before review (2026-10-12; goal corrected 2026-10-15)**  
The tutor still waits on the upload drain and the caller in front of `endWhiteboardSession` before review. Notes-blur tests do not measure it. Do not add timing logs. The product goal is WS-K in §3: a running note during the session, and End only folds the tail. The tutor does not leave for the next student while that runs. A timer-only test does not count.

**[P2][TEST] PLAYWRIGHT-GAP — on-page Record/Upload resilience**  
On-page Record/Upload resilience has no surface until that recorder returns. `tests/audio-upload.spec.ts` skips the pending-segment and transcribe cases. The Notes page coming-soon sentence stays a real test.

**[P2][TEST] identity-e2e known-unrelated failures observed on auth ship-ready gate (2026-09-11, WS3 SMS 2FA run; merged [`c8d613ca`](https://github.com/Arangarx/tutoring-notes/commit/c8d613ca))**  
Full `npm run test:identity-e2e` run (60 passed, 7 failed) surfaced failures unrelated to the SMS 2FA change under test:
- `claim-setup-skip-credential.spec.ts` (both tests) — "consent done → Set up later" and "attach_existing" flows; pre-existing, not touched by WS3.
- `erasure.spec.ts` (both "404 during grace" tests) + `erasure-post-grace-purge.spec.ts` (hard-purge oracle) — all assert `404` during/after erasure grace but receive `200`; pre-existing per prior orchestrator note, not touched by WS3.
- `tutor-2fa-login.spec.ts` › "security teeth: enrollment QR is local data-URI" — times out waiting for **"Use authenticator app instead"** button immediately after navigating to `/admin/settings/2fa/setup` for a brand-new unenrolled tutor. Verified via `git show HEAD:...TwoFactorSetupForm.tsx`/`page.tsx` that the idle-state method-chooser-requires-a-click structure is **identical pre- and post-WS3** (SMS work only added a 3rd chooser card via composition, did not change the email-default gating) — this test's setup already assumed a since-superseded "auto-start email on mount" behavior that isn't present in the checked-in component on either side of this diff. NOT caused by WS3.
- `tutor-approvals-operator.spec.ts` › "operator rejects WAITLISTED tutor" — `alertdialog` never becomes visible after clicking reject; file untouched by WS3, unrelated surface (tutor-approvals admin flow).

None of these were fixed as part of WS3 (SMS 2FA) — flagged per the "report, don't fix unless you caused it" scope discipline. Needs its own investigation pass.

**[P2][TEST] identity-e2e enroll chooser expects "SMS not available" while Playwright sets dummy Twilio (observed 2026-10-11, org stage 2; this stage did not cause it)**  
`tests/integration/identity/tutor-email-2fa-login.spec.ts` › `enroll default: unenrolled tutor sees first-class chooser with email default` expects a disabled button named "SMS not available". `playwright.config.ts` sets dummy `TWILIO_*`, so the button reads "Set up with text message". Pre-existing. Not fixed in the org stage 2 pass.

**[P1][TEST] WS-V / Part-2 site-wide mechanical test buildout**  
Remainder: P1-WB and P1-ID relay batches. Pure-jest tranche done 2026-07-05.

**[P1][TEST] CH-SMOKE-PLAYWRIGHT-GAP-CONSENT-ERASURE**  
See §6.

**[P1][TEST] Block B remote-surgical mixdown hardware oracle**  
jsdom cannot prove student absent from mixdown while heard live.

**[P2][TEST] RELAY-MARATHON-SHARDS**  
Remainder: marathon/shard runner ops. Shard merge fix [`fb3c0391`](https://github.com/Arangarx/tutoring-notes/commit/fb3c0391) shipped.

**[P2][TEST] JEST-ISOLATION-CLASS-2**  
Jest shares one local Postgres (`tutoring_notes_test`). Parallel workers race each other's rows, so the suite stays on `--workers=1` until per-test cleanup is proven on its own.

A global `TRUNCATE ... CASCADE` in `afterEach` was tried 2026-07-06 and failed three `--workers=1` runs (about 40 suites each): `40P01` deadlocks and "Engine is not yet connected." Truncate takes `AccessExclusiveLock` while fire-and-forget DB work from the test is still running. Andrew deferred it (2026-07-06, and again 2026-09-10: do not wire this during another wave).

A second harness lived on `chore/jest-db-cleanup-wip` (`43acd75c`) and was **deleted 2026-09-30** without ever being added to `jest.config.ts`. Do not revive that branch. The next attempt starts from these notes and has to be proven on the suite as it is then:

- `pg_advisory_xact_lock` so only one worker truncates at a time
- `pg_terminate_backend` on idle-in-transaction backends (the stragglers)
- drain the event loop before truncating
- retry on `40P01` / `55P03` / `57014`
- `beforeEach` waits until any in-flight truncate finishes
- skip suites that never touch Postgres
- fail closed unless the URL is `tutoring_notes_test` on localhost port 5432 (reject Neon, Vercel, Supabase, AWS)

Prove a full Jest run with one worker first, then with several. A drive-by wire-up is how the July deadlock shipped into the suite.

**[P2][TEST] Site-wide coverage P1 gaps**  
Blob token in PW gate, recording E2E, replay scrub gate, billing activeMs E2E, etc. (~15 items self-skip without `BLOB_READ_WRITE_TOKEN`). [`site-wide-coverage-audit.md`](handoff/site-wide-coverage-audit.md).

**[P2][TEST] TEST-REAL-INTEGRATION-SUPERSEDES-SMOKE**  
Real multi-instance harness post-master.

**[P2][TEST] Admin notes UX Phase 0 visual regression matrix**  
axe + 4-viewport screenshots not enrolled.

**[P2][TEST] F-1 outbox register retry cap**  
Pre-merge optional.

**[P2][TEST] audio-rollover Playwright not in CI gate**  
`tests/e2e/audio-rollover.spec.ts` opt-in.

**[P2][TEST] upload-outbox.test parallel-race flake**  
50ms sleep concurrency test.

**[P2][TEST] waitForPendingUploads debug surface removal**  
Test/ops cleanup.

**[P2][TEST] installControllableUploadStub duplication**  
Extract shared test helper.

**[P2][TEST] Recorder test refactor Phases 4–6**  
MicControls shell split; audio-rollover PW; Opus pass.

**[P2][TEST] phase0-stop — break CSS deploy-abort verify**  
Visual gate ritual.

**[P2][TEST] PIPELINE-1 — agentic pipeline before release**  
Agents auditing agents; tests-to-spec discipline.

**[P3][TEST] Plan1 authed-join hardware failures**  
Dual-device takeover; waiting-room A/V.

**[P3][TEST] Preview email loopback**  
Signup on preview lands on production.

**[P2][TEST] PLAYWRIGHT-GAP — hermetic Google OAuth signup round-trip**  
No IdP in the identity harness. Surrogate: jest `google-signup-waitlisted.test.ts` (signup-intent + `signIn` provision/reject) + `cross-realm-email.test.ts` (cross-realm `signIn` deny) + Playwright `/signup` Google UI. Named gap: `tests/integration/identity/tutor-signup-waitlisted.spec.ts`, `cross-realm-email.spec.ts` (Google cross-realm block).

### PLAYWRIGHT-GAP hardware oracles (summary)

| ID | Surface | Oracle |
|----|---------|--------|
| WB-AV-GAP-1 | enumerate×acquire corruption | Windows hardware only |
| WB-AV-GAP-2 | tutor can't hear student E2E | real WebRTC hardware only |
| WB-AV-GAP-3 | Brio silent-first-acquire | hardware |
| Phone student A/V item 19 | bidirectional A/V on phone | hardware |

Surrogates shipped in jest/dom; hardware rows remain named gaps per playwright-on-fix rule.

---

## 10. Platform / ops / cost / observability

**[P2][OPS] Cost observability Phase 2**  
Remainder: Phase 2 cron/API reconciliation. Phase 1 page shipped.

**[P2][OPS] Cost-event durability hardening**  
`tutorKey`, `isTestFixture`, recent events table — V1-gating follow-ons.

**[P2][OPS] Full product usage instrumentation — NEAR-IMMEDIATE POST-MASTER**  
First-party, learner-type-keyed; sub-learner zero 3rd-party egress. Reframes PostHog bootstrapper.

**[P2][OPS] CAP-BOUNCE-ALERTS — half-cap and bounce alerts (Andrew 2026-10-11)**  
Alert when an account or an organization reaches half of a daily cap, or when bounces spike. Detection is a later layer. The caps themselves stay. Not part of the org stage build.

**[P2][OPS][REC] TXC-SWEEP-METRICS — transcribe-sweep usefulness (Andrew 2026-08-28)**  
Remainder: metrics + decision gate. Cadence `*/15` already in `vercel.json`.

**[P2][OPS] NEON-SCALE-TO-ZERO-REVISIT**  
Remainder: re-review under real pilot traffic. Setting is live.

**[P3][OPS] PostHog analytics Tier 0+1**  
**Unbuilt** (`posthog` absent in `src/`). Event taxonomy reference: [`docs/archive/handoff/posthog-analytics-tier-0-1-bootstrapper.md`](archive/handoff/posthog-analytics-tier-0-1-bootstrapper.md). Product direction = first-party instrumentation above.

**[P3][OPS] AI edit signal Phase 1**  
See §5 + archive bootstrapper.

**[P2][OPS] Vercel Skew Protection enablement**  
Remainder: Andrew dashboard enable. Other WS-P deliverables shipped.

**[P2][OPS] SEC-POLICY-TRUTH** — see §1.

**[P3][OPS] Operator scoped test-data wipe + orphaned blob sweep**  
Remainder: no `operator:wipe` script. `scripts/blob-cleanup.mjs` and `scripts/branch-sweep.mjs` shipped.

**[P3][OPS] scripts/smoke-long-form-transcribe.mjs headless harness**  
UI Server Action only today.

**[P3][OPS] RECORDER-LIFECYCLE.md preview-before-Start doc drift**  
Ended sessions mount `SessionReviewMode`.

**[P3][OPS] docs/WHITEBOARD-ROADMAP-NEXT.md supersede?**  
Doc housekeeping.

**[P3][OPS] Dev-tools adopt manual test user as fixture**  
`arangarx+test1@gmail.com` not `isTestFixture`.

**[P3][OPS] Dev-tools impersonation list placement**  
Undecided UX.

**[P3][OPS] ROAD-TO-GA Gate 1**  
LLC, business bank, sales tax — [`docs/ROAD-TO-GA.md`](ROAD-TO-GA.md).

**[P3][OPS] ROAD-TO-GA Gate 2 cash**  
Scoped legal counsel consult.

**[P3][OPS] ROAD-TO-GA cheap-but-early**  
Monitoring/alerting, DR runbook drill, email deliverability.

**[P3][OPS] Usage tracking prerequisite**  
`UsageLedger` for marginal vs fully-loaded cost.

**[P3][OPS] Workspace SSR 500 dig**  
Transient; needs Vercel log correlation.

**[P3][OPS] p-test-account-reset at master cut**  
Preserve Andrew + Sarah admins.

**[P3][OPS] Log prefixes slg / exp registration**  
Before session-log B3 UI.

**[P2][OPS] Session-log + Wyzant/UVU export (SESSION-LOG-EXPORT)**  
Date-range search, consolidated export, Wyzant 25-word + UVU pay-period aggregates. Market review OQ2/O6; stubs until artifacts. [`docs/research/market-analysis-strategic-review-2026-06-12.md`](research/market-analysis-strategic-review-2026-06-12.md).

**[P2][OPS] Session log billing rate / billed* column naming**  
Andrew confirm before Wave 2.5 migration; `ratePerHour` / `billedAmount` open Q.

**[P2][OPS] Historical SessionNote timezone backfill**  
Lossy backfill vs accept UTC for old notes.

**[P2][OPS] Session timer vs billed time during disconnect gaps**  
Displayed timer pause vs billed-only subtraction.

**[P2][OPS] Solo / in-person production enable + B-5 consent copy**  
FSM supports `IN_PERSON`; production gating review.

**[P2][OPS] Time-storage / billing display (billed*Local)**  
B3 `/sessions` route not shipped.

**[P3][OPS] Phase 11 blocked until umbrella legal paragraphs**  
AI edit signal + instrumentation.

---

## 11. Scheduling & calendar (post-V1)

**Decision (Andrew 2026-06-08):** post-V1, pre-release (before recruiting new pilots). Requirements: [`docs/handoff/scheduling-requirements-2026-06-11.md`](handoff/scheduling-requirements-2026-06-11.md) (canonical; may move to archive with backlog pointer).

**[P2][OPS] Scheduling — backend wiring + calendar sync**  
`ScheduledSession` + schedule page load real sessions; Google write shipped. **Remainder:** Apple ICS hardware, two-way sync (P3), native-first gaps.

**[P2][OPS] S5 — scheduled topic + notes visible in live session**  
"Today's plan" panel; depends on scheduler→session linkage.

**[P3][OPS] S3 — Agenda as default scheduler view**  
Possible tutor login landing.

**[P3][OPS] S4 — Month view density for full-time tutors**  
Visual prototype only.

**[P3][OPS] Two-way calendar sync**  
Google watch / Apple CalDAV + conflict policy — unresolved.

**[P1][OPS] Calendar integration wave (ICS feed + Google `calendar.events.owned` write)**  
Shipped [`f53ee658`](https://github.com/Arangarx/tutoring-notes/commit/f53ee658) (calendar-wave merge 2026-09-21). **Remainder:** PLAYWRIGHT-GAP Apple ICS + poll lag.

**PLAYWRIGHT-GAP — live ICS subscribe (calendar wave WS1 surrogate)**  
Hermetic stand-in: jest `src/__tests__/calendar/ics-feed-stability.test.ts`, `ics-summary-privacy.test.ts`, `ics-google-timezone.test.ts` (third-party `node-ical` parser oracle). **Still owed:** subscribe feed URL in **Apple Calendar** (Sarah-primary; no device on 2026-09-21 merge) + Google Calendar “From URL” poll lag. Not a merge blocker.

**[P3][UX] Double-check schedule end-time logic (Andrew 2026-09-26)**  
Andrew asked for a later pass after the planned-length behavior landed. Playwright covers a new session (start and length move the end until the end is edited) and one saved session whose end is not start + length. Still open: a start near midnight wraps the clock (23:30 + 90 min shows 01:00) but the session date does not move to the next day, so the stored end can fall earlier on the same date. Confirm that on a real form before relying on late-night sessions.

**Calendar wave follow-up nits (non-blocking):** Outlook/desktop clients may need explicit `VTIMEZONE` blocks for some recurring-edge cases (jest oracle covers primary paths; hardware spot-check). Google Calendar URL-subscribe can lag on **event list identity** (`UID`/`iCalUID` stability) even when individual `VEVENT` bytes are correct — track if tutors report duplicate or stale rows after reschedule. Playwright: calendar specs live on `wb-regression` (`workers: 1`); `schedule-native-crud.spec.ts` still mutates the same `TEST_ADMIN` Google row on the parallel `integration` project — a concurrent full multi-project `playwright test` could race (normal `test:integration` vs `test:wb-playwright` split does not).

**[P3][OPS] Google OAuth calendar scopes (legacy row)**  
Superseded by calendar wave [`f53ee658`](https://github.com/Arangarx/tutoring-notes/commit/f53ee658) — see [`docs/SHIPPED.md`](SHIPPED.md) Superseded plans; not an open build task.

**[P3][OPS] Apple CalDAV vs EventKit path**  
Not started.

**[P3][OPS] Reminders / timezone policy**  
Not started.

In-app schedule layer, student/parent join surface, soft session length — still relevant from 2026-06-08 proposal (see requirements doc).

---

## 12. Org / university pilot & commercial launch (future)

**[P2][GTM] BYU / institutional pitch track separate from Sarah solo story**  
Org MVP Wave 5; demo flow.

**[P3][GTM] Stripe / subscription billing**  
Checkout, webhook, `subscriptionStatus`.

**[P3][GTM] Operator dashboard scaffolding**  
`/operator/*` beyond tutor admin.

**[P3][GTM] University department pitch infrastructure**  
Aug 2026 soft deadline per [`docs/RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md).

**[P3][GTM] Wyzant + UVU export formatters**  
See **SESSION-LOG-EXPORT** §10.

**[P3][GTM] Org-aware billing rounding**  
When multi-tutor.

**[P3][GTM] Marketplace substrate**  
Explicitly deferred; design-compatible-only.

**[P3][GTM] Parent progress arc / engagement surfaces**  
Deferred per wedge program.

**[P3][GTM] COMMERCIAL-LAUNCH-CHECKLIST items**  
See [`docs/COMMERCIAL-LAUNCH-CHECKLIST.md`](COMMERCIAL-LAUNCH-CHECKLIST.md).

**[P3][GTM] Master plan Phases 7–12**  
Status model, Stripe, org MVP, etc. — roadmap waves 4–5.

**[P3][GTM] Auto-finalize notes when the finalize window ends (Andrew 2026-10-11)**  
Future. When a removed tutor was allowed to finalize notes and the deadline passes, finalize automatically as if the tutor had accepted the draft and saved it unchanged. Not in the current org finish. Ask organizations whether they want this. See [docs/interviews/ORG-INTERVIEW-GUIDE.md](interviews/ORG-INTERVIEW-GUIDE.md).

**[P2][ORG] ORG-ROLE-DROP-ORPHAN-APPOINTMENTS (org W3 design 2026-10-29)**  
`setOrgMemberRoles` cancels nothing when an instructor loses the `instructor` role, so their future appointments stay assigned to them. The tutor Schedule and the ICS feed now hide those rows (the shared `activeOrgInstructorMemberWhere` fragment requires the role), but the rows remain in the database and on the organization page with no instructor who can teach them. Decide: block the role change while future appointments exist, or reassign/cancel them. Test the choice with a real-DB case next to J9 in `src/__tests__/schedule/tutor-schedule-and-feed.integration.test.ts`.

**[P3][ORG] Inline "organization-owned student" checks outside the canonical guard (org W3 2026-10-29)**  
`isOrgOwnedStudent` in `src/lib/scheduling/tutor-appointments.ts` is the one definition (organizationId set, adminUserId null). The same expression is still written inline in fragile files: `src/lib/whiteboard/schedule-bridge.ts:79`, `src/app/admin/students/[id]/whiteboard/actions.ts:173` and `:277`, `src/lib/whiteboard-scope.ts:67`, `src/lib/org-force-end-touch.ts:22`, `src/app/api/whiteboard/[sessionId]/join-timer/route.ts:111` and `:276`. Not touched in W3 (whiteboard and lifecycle surface). Consolidate in small steps, each behind its own tests.

**[P3][ORG] ICS and Google event descriptions are built twice (org W3 2026-10-29)**  
`buildDescription` in `src/lib/calendar/ics-feed.ts` and `descriptionParts` in `src/lib/calendar/google-calendar-event-payload.ts` assemble the same Subject / location / notes text separately, and the summary helper is shared only in part. The W3 design adds no organization line to either, so they were left alone. Merge into one description builder with one test.

**[P2][ORG][SCHED] Google Calendar reassign uses the new instructor's token against the old event id (org W3 2026-10-29, not verified)**  
When `updateScheduledSession` reassigns an appointment, the Google patch runs with the NEW instructor's token and the OLD `googleEventId`. Google events belong to the first instructor's calendar, so this probably returns not-found and logs `[gcw] ... action=patch_error` (fail-soft, no crash). Not confirmed against Google. Expected correct behavior: delete the event with the old instructor's token and insert with the new instructor's. Needs a Google-scopes check first (priority #1 external validation).

**[P3][ORG] Consolidate org test seeders onto `org-seed` (org W3 nits 2026-10-29)**  
`src/__tests__/helpers/org-seed.ts` is the one seeder for the W3 schedule suites. The same admin / organization / member / learner / appointment setup is still copied in `src/__tests__/org/org-booking-bridge.integration.test.ts`, `src/__tests__/org/org-slice1.integration.test.ts`, and the Playwright W3 spec `tests/integration/wb-org-booking.spec.ts`. Move those onto `org-seed` so a membership or learner-shape change is made once. The Playwright spec opens its own Prisma client; share the seed functions without giving it a second database wrapper.

---

## 13. Strategy / positioning / pricing / research

### Product positioning (ratified)

Closed history: [`docs/SHIPPED.md`](SHIPPED.md).


### Pilot feedback — action items (selected open)

**[P2][REC] Recording auto-pause on student disconnect**  
Structurally shipped in `lifecycle-machine.ts`. Remainder: verify replay gap-marker rendering.

**[P2][REC] Per-student recording default**  
Remainder: coordinate with consent B2. Schema field exists.

**[P2][WB] Whiteboard undo touch + visible button**  
Remainder: verify iOS Safari touch. Playwright coverage exists.

**[P2][WB] Session time logging**  
Remainder: timezone follow-up.

**[P2][NOTES] AI link extraction, scrubbing, playback during review, gap detection**  
See §5.

**[P2][NOTES] Tutor-initiated join-link rotation**  
`rotateJoinToken` affordance.

**[P2][WB] Student naming paradigm — single-student fallback**  
Tile shows student name not `Student · hash`.

**[P2][WB] Tutor tab doesn't follow new session creation**  
Navigate tutor tab on create/resume.

**[P2][WB] Workspace SSR 500**  
See §10.

**[P3][WB] Homework image import workflow**  
Camera roll vs email vs scanner.

**[P3][GTM] Rethink claim-screen layout**  
Post-Sarah.

**[P3][AUTH] Self-service account deletion**  
Parents/students.

**[P3][WB] Replay speaker indication**  
With video-record work.

### Pending / received pilot input

**[`docs/SARAH-CALL-PREP.md`](SARAH-CALL-PREP.md)** — living home for next-call questions (Q4 pain point, Wyzant/UVU artifacts, primary device, scheduling=no, log-the-time, wedge). Add: session-log billing rate question; homework import workflow.

### Pricing & unit economics (research — not decisions)

- **RATIFIED 2026-06-11:** platform→tutor metering = wall-clock for cash + session tokens.
- Minimum viable subscription; anchor vs Wyzant 25% cut; tier structure; per-feature gating / metering for AI+transcription.
- **True API costs:** gpt-4o-mini negligible per note; **Whisper ~$0.36/hr** = cost-watch; whiteboard sync TBD.
- Per-user AI quotas; CAC/LTV unknown until ≥3 months paying users.
- Draft tier table (Starter/Pro/Growth/Studio) — sanity reference only.
- Founding-tutor lock-in pattern; don't price so low it signals missing product.
- Cost instrumentation: marginal vs fully-loaded $/hr separately.
- Competitive surface: TutorBird, TutorCruncher, Teachworks, etc.
- Naming shortlist + pre-commitment checklist (Mynk brand).
- Wyzant 0% on bring-your-own-student vs 25% marketplace.
- Crowded ≠ overserved — session memory moat mantra.

### Marketing / acquisition (research)

Tutor subreddits, Facebook groups; referral nudge; paid ads deferred. Mynk brand capture mostly done; YouTube pending; TikTok deferred.

### Legal / trust (research)

Audio of minors jurisdiction-sensitive. PII honest privacy policy before public launch.

### Feedback handling discipline

3–5 tutor advisory; watch-them-use-it sessions; ≥2 tutors for roadmap; track metric not thanks.

### Status-model rethink + auto-email (paired, post-Phase-5)

**[P3][NOTES] Collapse DRAFT/READY/SENT**  
Design in backlog §815–845 legacy; revisit when triggered.

**[P3][NOTES] Auto-email scheduling**  
Depends on status-model rethink.

### Adversarial review UX gaps (2026-04-19)

Real bugs: admin audio proxy env-only admin; share seen-tracking; time-storage display. Slow-burn: orphan session cleanup cron, storage ledger. Scaling: rate limits partially migrated. UX tutor/parent gaps — remainder cross-linked in open backlog rows.

### Component redesign B2 smoke (2026-06-01)

NewNoteForm clear bugs, outbox responsive, a11y id/name, bold-on-teal verify — spot-check during Gate A1.

### V1 marketing Phase D

Public surfaces brand sign-off pending.

### Strategic lessons (ChatGPT brainstorm 2026-05-15)

Closed history: [`docs/SHIPPED.md`](SHIPPED.md).


### Tonight / days / weeks / months buckets (historical sequencing)

Closed history: [`docs/SHIPPED.md`](SHIPPED.md).


---

## 14. Deferred / someday

**[P3][WB] WB-SCREEN-WAKE-LOCK / WB-THUMBNAIL-GRAPH / WB-OLD-PHONE-PERF**  
Unify plan out-of-scope.

**[P3][WB] WB-GRAPH-PLACEHOLDER**  
Review hero graph thumbnail.

**[P3][WB] WB-ENDSESSION-THUMBNAIL-TABS**  
End-session thumbnail tabs.

**[P3][WB] Desmos live-state capture Phase 1.5**  
[`docs/RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md) backlog.

**[P3][GTM] Engagement/dopamine surfaces**  
Mascot, charts, streaks — design-compatible-only.

**[P3][GTM] Parent progress arc**  
Deferred.

**[P3][GTM] Durability-B seasonal presence**  
Pull/in-app, never email-default.

**[P3][GTM] School-handoff bigger bet**  
Deferred.

**[P3][AUTH] AUTH-AGE-NO-HARD-CUTOFF + counsel**  
Self-attested capacity.

**[P3][TEST] Duplicate solo_recording plan files**  
Process cleanup.

**[P3][DOCS] Docs cleanup pass**  
[`docs/INDEX.md`](INDEX.md) § archival policy; whiteboard chrome sources swept to requirements doc.

**[P3][DOCS] Usersmoke quicklists**  
[`docs/handoff/usersmoke-2026-07-08-problem-quicklist.md`](handoff/usersmoke-2026-07-08-problem-quicklist.md), [`usersmoke-2026-07-09-recheck-quicklist.md`](handoff/usersmoke-2026-07-09-recheck-quicklist.md) — living triage until master cut complete.

**Resolved / do not re-open (reference):**

Closed history: [`docs/SHIPPED.md`](SHIPPED.md).


---

*Last reorganized: 2026-10-05 (open-work split — shipped items moved to [`docs/SHIPPED.md`](SHIPPED.md)).*
