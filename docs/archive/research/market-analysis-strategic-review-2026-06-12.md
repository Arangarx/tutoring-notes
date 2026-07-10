# Market Analysis — Strategic Review

> Companion strategic review of "Tutoring Software Market Analysis and Competitive Positioning.pdf"; produced 2026-06-12; GPT-deep-research input treated as external signal, not ground truth.

---

## TL;DR — Highest-leverage takeaways

- **The doc validates our reliability-first sequencing harder than we expected.** Its strongest finding is that tutors won't switch for features alone; the session must not break. Our "no backup recorder" north star is the correct bar, and getting there before expanding is the right call.
- **We are mis-labeling our wedge.** Our current framing is "whiteboard + live recording," but the doc (and Sarah's own quotes) suggest the real moat is the *integrated live session that auto-generates structured memory* — not the whiteboard per se. Whiteboard is table stakes. The unique claim is that the session itself produces reliable, searchable, editable history with zero post-session clerical work.
- **Notes quality is a slow-burning threat we are underweighting.** Generic meeting AI (Teams, Fathom, Read AI) is moving into this space. We know our AI notes quality is currently poor. The doc's strongest recommendation is exactly the area where we are currently most behind.
- **Sarah may be systematically underrating the notes value.** Her context (Wyzant 25-word compliance, UVU grant sheet) makes notes feel like overhead. The doc's market evidence and the institutional pitch angle (BYU dept head) both suggest notes-as-structured-history is load-bearing for the buyer who writes the check — not just the tutor.
- **Scheduling is overserved globally but underserved *cross-system* — and we've correctly deferred basic scheduling while leaving the real pain (session-log + billing + search) insufficiently prioritized.** Sarah's Q2 follow-up is the doc's "cross-system" pain point, just smaller-scale. This needs earlier prioritization than Wave 6.
- **The BYU-pitch buyer and the Sarah-solo-tutor buyer have different primary jobs.** The doc's coexist-with-marketplaces advice applies to Sarah; it doesn't apply to an institutional dept head who already has no marketplace dependency. We may need two distinct positioning tracks.
- **Whiteboard sync completeness (Gate A5) is non-negotiable before any pitch.** The doc identifies "reliability under pressure" as the literal deciding factor for Zoom-loyal tutors. A tutoring app where sync is broken is worse than Zoom + OneNote — not better.

---

## The doc in brief

### Thesis

The market is split into three non-overlapping jobs: (1) student acquisition / trust (marketplaces), (2) admin / back-office operations (management suites), and (3) live instruction (teaching tools). No product does all three well. The switching trigger is not "better features" — it is materially reducing admin drag and session-to-session continuity loss while preserving the live teaching workflow the tutor already trusts.

### Market sizing / segments

The doc treats the market qualitatively, not with dollar figures. It identifies four tutor archetypes:
- Independent solo tutors (low cost, low overhead, flexible tools)
- Small tutoring businesses (hit the ceiling of DIY → need reminders, invoicing, payroll)
- Marketplace-dependent tutors (Wyzant / Varsity Tutors / Superprof — acquisition-locked)
- Institutional tutors (UVU, school-based, higher-ed — compliance and grant reporting)

The fourth archetype is underrepresented in the doc but is central to our Aug 2026 university pitch.

### Competitor framing (doc's table)

| Platform | Main job | Wins | Weaker at | Role for us |
|---|---|---|---|---|
| **Wyzant** | Acquisition + lesson execution | 65K tutors, built-in summaries/recordings, whiteboard, dispute/payment infra | Platform policies, anti-disintermediation, recording restrictions (30-day, no download), ranking volatility | Both competitor and complement |
| **Varsity Tutors** | Managed marketplace | Packaged demand, live learning platform, recorded sessions | Buggy platform, low tutor pay, weak support | Mostly competitor |
| **Superprof** | Lead generation | Broad coverage, low barrier, off-platform payment OK | Weak classroom tooling, transparent subscription opacity | Both competitor and complement |
| **TutorBird** | Solo/small-biz admin | Ease-of-use, calendar, attendance, notes, portal, payments, website | Lighter integrations, relies on external links/Lessonspace for live teaching | Direct back-office competitor |
| **Teachworks** | Small/mid teaching biz admin | Scheduling, invoicing, lesson completion, Lessonspace integration | Onboarding complexity, historical sync complaints, setup burden | Direct back-office competitor |
| **TutorCruncher** | CRM-heavy scaling | Pipeline/CRM, customizable profiles, multi-WB integrations, enterprise fit | Non-intuitive nav, customization cost, bugs, slow support | Direct back-office competitor |
| **Zoom + OneNote/Goodnotes** | Live teaching quality | Familiarity, reliability, stylus, student participation, screen annotation | Continuity and admin remain external/manual | Core workflow competitor |

### Doc's explicit recommendations

1. **Match or exceed current ad-hoc setups on pen latency, student co-writing, worksheet/PDF import, math/graph support, and reliable save/export** — whiteboard is threshold, not differentiator.
2. **Build an editable post-session artifact pipeline**: transcript → tutor summary → student recap → parent update → homework/plan extraction → searchable student timeline.
3. **Replace the most painful cross-system admin** (two-way calendar sync, stable lesson links, reminders, attendance, parent notifications) — don't rebuild every mature billing feature.
4. **Treat marketplaces as a coexistence problem**, not an enemy. Help tutors run their Wyzant-sourced students on the platform without forcing an immediate break.
5. **Don't lead with "AI for tutors" generically.** Lead with tutoring-native continuity that makes the documentation work tutors already do feel like part of teaching.

---

## KEEP — What we're doing right that the doc validates

### K1. Reliability-first sequencing ("no backup recorder")

**Doc claim:** The biggest tutor praise for Zoom is not features — it is reliability. "The session must not break." Tutors cite Wyzant recording corruption and reconnect issues as the main reasons to leave, not missing whiteboard toolbar icons. Once a tool is "good enough" for instruction, reliability beats any additional feature.

**What we do:** Wave 1 explicitly gates everything on the solo-tutor reliability floor. BLOCKER-PROD status for audio crash/upload durability. Gate A5 (live bidirectional sync completeness) and A6 (replay fidelity) are pre-master gates. North star is a tutor never needing a backup recorder alongside our app.

**Verdict:** This sequencing is correct and the doc validates it strongly. Do not let brand polish, admin features, or pitch-readiness work pull engineers off the reliability floor until the wave 1 exit signal is met. The doc is explicit: a tutor who has a live-session failure will not switch based on how good the admin side is.

**Confidence: High.** This is the doc's most evidence-backed finding and directly maps to our stated north star. **Clear call — no Andrew decision needed.**

---

### K2. Coexist with Wyzant rather than fight it

**Doc claim:** Wyzant's moat is acquisition and trust, not superior software. The winning posture for a new entrant is to help tutors run lessons and continuity for marketplace-sourced students without forcing an immediate break. Over time, the new platform becomes the operating system while the marketplace remains the lead source.

**What we do:** Our positioning explicitly targets tutors who use Wyzant for acquisition but want better lesson delivery and continuity. We are not building a competing marketplace. Sarah's own decision was to keep Wyzant as lead source while using Mynk as the delivery layer.

**Verdict:** Correct call. The doc's evidence on Wyzant's anti-disintermediation enforcement also suggests being careful how we publicly frame this — don't trigger Wyzant's off-platform rules during pilot.

**Confidence: High. Clear call.**

---

### K3. Session as the primary mental anchor noun

**Doc claim:** The most overserved area is commodity scheduling and billing. The underserved area is the bridge between live teaching and admin — what happened in the session, what the student struggled with, what's next. That bridge is where tutors lose the most time.

**What we do:** Sarah explicitly confirmed session is the anchor noun (2026-05-19, 2026-05-26). The dashboard starts from sessions, not students or calendar entries. The session is the container for whiteboard + audio + A/V + AI notes.

**Verdict:** Confirmed. The doc's "bridge between live teaching and admin" framing is our exact territory. We're in the right place.

**Confidence: High. Clear call.**

---

### K4. "Plan" replaces "homework" in AI prompt framing

**Doc claim:** The value isn't transcription — it's *structured pedagogical memory*. Users want a clean "your gaps from today" list and a forward-looking plan, not a raw transcript dump. One tutor said Fathom "changed their business" because it created hyperlinked summaries tied to session goals, nearly instantaneously.

**What we do:** Sarah's 2026-05-26 feedback explicitly replaced "homework" with "plan" (plan moving forward + any assignments). This is in the AI prompt backlog.

**Verdict:** Right direction. The doc's framing ("structured pedagogical memory") is stronger than what we've articulated internally. This is the correct reframe for the AI notes section, and it should be surfaced in the university pitch narrative too — it maps directly to institutional reporting requirements.

**Confidence: High. Clear call.**

---

### K5. Session-log + reporting + search as a real feature surface

**Doc claim:** The most painful admin isn't calendar or billing (those are well-served). It's "what happened last session" and "what do I tell the parent / institution this pay period" — the cross-session aggregation problem. The doc specifically names billing/compliance as a trigger for tutors switching from DIY.

**What we do:** Sarah's Q2 follow-up (2026-05-26) revealed "log the time + notes" is a billing/compliance feature: session start/end, rounded to nearest 5 minutes, disconnect-gap adjustment, searchable by student and date range, consolidated export format for Wyzant (25-word per session) and UVU (pay-period sheet). Reclassified from Wave 6 to its own surface.

**Verdict:** This is more strategically important than we've treated it. For the institutional pitch (BYU dept head), this is the *primary* use case, not a polish item. Needs earlier roadmap placement. The doc validates this directly.

**Confidence: High.** Surfacing as OQ6 because priority timing is an Andrew call.

---

## HURTS US — Consider removing or changing

### H1. Framing the wedge as "whiteboard + live recording" rather than "session that becomes structured memory"

**Doc claim:** "Whiteboard presence alone is not enough to motivate switching." Tutor preferences for whiteboard tools are fragmented — some swear by Zoom annotation, some prefer OneNote/Goodnotes on a tablet, some want Lessonspace or Pencil Spaces. Whiteboard is a threshold feature, not a winner-take-all differentiator. The distinguishing claim must be the *bridge* between live teaching and continuity.

**What we do:** Our current framing (AGENTS.md north star: "match Wyzant for Sarah plus our wedge") positions whiteboard + live recording as the primary wedge. Sarah reinforced this: "that is unique, which I love." But the specific thing she called unique was the *integrated* live session that generates session memory — not the whiteboard per se. Our public framing emphasizes the whiteboard more than the session artifact pipeline.

**Verdict:** Partially hurts us. The whiteboard investment is necessary (table stakes), but leading *marketing and pitch messaging* with "whiteboard" undersells the moat. The stronger claim is: "the session produces its own structured record; no post-session clerical work; searchable across students and time." This maps to the doc's recommendations and to the institutional buyer (BYU) more directly than "great whiteboard."

**Confidence: Med.** Sarah's own words do validate "live session" as the wedge; the question is whether that's whiteboard-centric or continuity-centric. **Andrew decision — how to message this publicly.**

---

### H2. Deferred AI notes quality

**Doc claim:** Generic meeting AI (Teams intelligent recap, Google Meet "Take notes for me," Fathom, Read AI) is already serving the continuity need at ~90–95% accuracy per one tutor. The gap is that it's not tutoring-native — it doesn't produce "your student's gaps today." A tutoring-native solution that makes those outputs trustworthy and easy to edit would solve real work tutors already do, and is the most defensible position.

**What we do:** Our AI notes quality is currently acknowledged as poor (ORCHESTRATOR-STATE.md: "Map/reduce auto-notes ACCURACY — Currently poor — own design+eval pass"). We have deferred quality improvements to a parked thread. Phase 11b (AI edit signal) is blocked on legal umbrella publish. The AI prompt is at v7 with fixture tests partially done.

**Verdict:** This hurts us. If generic tools achieve ~90–95% accuracy and our notes quality is poor, we're inverted on the one area the doc says is most defensible. Every time Sarah (or a prospective user) sees low-quality notes, it undermines the entire "session produces its own memory" pitch. We should move the notes quality workstream earlier — likely ahead of most of Wave 6 — and treat it as a reliability issue, not a polish item.

**Confidence: High.** The gap is acknowledged internally; the doc makes clear it's the most contested area.  **Andrew decision on when to pull this forward vs. finish Gate A.**

---

### H3. Scheduling deferred post-V1 may be correct for Sarah but wrong for the institutional buyer

**Doc claim:** Basic scheduling is overserved. But *cross-system* scheduling pain is real: rescheduling with policies, two-way calendar sync, stable lesson links, reminders, parent-facing updates. The trigger for tutors leaving DIY stacks is scale — "eventually they get tired of manual reminders and fragmented history." For institutional buyers, scheduling + compliance reporting is mandatory infrastructure, not optional.

**What we do:** Sarah explicitly said no scheduling in v1. "I am not meeting and communicating with people through the app." This is locked. Wave 3 includes scheduling as Gate B (post-V1, pre-release).

**Verdict:** The Sarah decision is correct for solo pilots. But the doc's framing of institutional tutors suggests a university dept head cares deeply about session scheduling + compliance reporting as a coordinated system. If we pitch BYU before the scheduling surface exists, we may be pitching "good for solo tutors" rather than "good for your 40-tutor center." This is a gap in our Aug 2026 pitch readiness, not a product mistake.

**Confidence: Med.** The decision was right for Sarah. Whether it remains right for the BYU pitch is an open question. **Andrew decision — OQ5.**

---

## DE-EMPHASIZE — Over-investment relative to payoff

### D1. Feature-for-feature competition with TutorBird / Teachworks / TutorCruncher on admin

**Doc claim:** These three are mature back-office systems with years of notes, billing logic, automation, and operational habits inside them. Tutors who use Teachworks stay because *"reluctance to switch came from years of notes and not wanting to learn a new system."* The switching case is not "more admin features" — it's "same simplicity, but now the session, notes, homework, parent update, and next-session prep all happen in one coherent flow."

**What we do:** Our roadmap includes full admin features: `/superadmin/metrics`, `/admin/insights`, invoicing, attendance, etc. Some of this is in Wave 4. There's a risk that Wave 4 admin features are shaped like "build what TutorBird has" rather than "make session continuity the center of gravity."

**Verdict:** De-emphasize any admin feature that duplicates TutorBird/Teachworks capabilities without adding session-memory value. The investment in scheduling integration and billing compliance (session-log + reporting from K5 above) is right. Investment in a stand-alone invoicing system that doesn't connect to sessions is not.

**Confidence: Med.** The line between "session-adjacent admin" and "generic admin" is a product judgment call. **Andrew decision — what's in scope for Wave 4.**

---

### D2. Parent recap depth (for non-institutional tutors)

**Doc claim:** Parent communication that "flows naturally from the session" is part of the continuity layer. But for self-acquired students, parents often don't want notes artifacts — they want a quick verbal update. Parent recaps as a primary feature may be over-built for the solo tutor case.

**What we do:** We have significant investment in parent share links, session note sharing, and the parent portal. The consent architecture (Gate B2) is parent-centric.

**Verdict:** Don't cut the parent share infrastructure (it's load-bearing for institutional compliance and for the half of Sarah's parents who engage). But don't lead with "parent recaps" in pitch materials aimed at solo tutors who don't report to an institution. Sarah's own framing: "it is a cool feature so the parents can stay in the loop better. more communication is always better" — warm, secondary, not mission-critical.

**Confidence: Med. Clear call for messaging; not a build priority call.**

---

### D3. Video recording and replay

**Doc claim:** Tutors who care about recordings already use Zoom (local recording, reliable) or Wyzant. The evidence shows tutors who use Fathom or Read AI are using screen recording + AI summary — not whiteboard-native video replay. The doc doesn't identify video replay as a missing feature tutors want; it identifies *structured session summaries* as the gap.

**What we do:** Video recording and replay is in the backlog, designed but not built. Sarah explicitly said: "Live video is great, recorded video is actually lower priority." ORCHESTRATOR-STATE.md lists it as a top post-smoke build candidate.

**Verdict:** Maintain the deferral. The doc doesn't identify this as a critical gap. Sarah has explicitly deprioritized it. The resource cost of building reliable video recording + replay is significant and the payoff relative to notes quality improvement is unclear. De-emphasize.

**Confidence: High. Clear call — stay deferred until Sarah explicitly requests it.**

---

## TENSIONS — Where the doc is wrong or thin for us

### T1. "Notes-as-continuity is the primary wedge" vs. "live session is unique"

The doc's core recommendation — own the continuity layer, make notes feel like part of teaching — is derived from the general tutor market, which is dominated by tutors who do their own admin on Notion/spreadsheets/Fathom and are looking for workflow automation. Sarah's context is different: she works within institutional rails (Wyzant 25-word, UVU pay-period) that define what notes need to be. For her, AI-generated notes are "pretty cool but secondary" — the live whiteboard session is the unique thing because Wyzant and Zoom don't offer reliable, integrated, searchable, whiteboard-native session capture.

**Our contrarian bet is defensible:** for math/science tutors who do live whiteboard instruction, the live session with a connected whiteboard artifact is a more durable differentiator than post-session notes alone. Notes quality matters, but the combination of live + notes is the moat, not notes in isolation. The doc is correct that notes are underserved; it may be wrong that notes alone are the primary switching lever for our target tutor type.

**Don't let the doc talk us out of the live-session-as-primary-wedge positioning.** But do accelerate notes quality — the two are complementary, not competing.

---

### T2. "Whiteboard is not the cleanest wedge" vs. our Gate A5/A6 investment

The doc says whiteboard preferences are fragmented and tutors won't switch for a better whiteboard alone. We are investing heavily in whiteboard sync completeness (Gate A5) and replay fidelity (Gate A6). Is this over-investment?

No. The doc's specific argument is that *whiteboard alone* won't motivate switching — a tutor won't leave Zoom + OneNote just because our board is nicer. But if our board is *broken* (sync failures, laser offset, viewport not following tutor) — which it currently is in several respects — that is actively WORSE than Zoom + OneNote for the tutor's core use case. Gate A5 is not "make the whiteboard better than Zoom." It's "make the whiteboard not broken." The doc validates this distinction explicitly: "once a tool is 'good enough' for instruction, reliability becomes more important than another toolbar icon."

**The investment is correct. But framing it internally as 'reliability floor' rather than 'whiteboard differentiation' keeps the right mental model.**

---

### T3. Generic "solo tutor" market advice vs. our institutional buyer thesis

The doc's analysis is strongest for independent solo tutors and small tutoring businesses. The BYU university-department pitch is a fundamentally different buyer: institutional, multi-tutor, needs compliance reporting, grant documentation, student-roster management, session logging for pay/reimbursement, and potentially org-level admin. The doc identifies "TutorCruncher" as the product that wins here, and notes it is a "CRM-heavy operations for scaling tutoring companies" product.

Our Wave 5 "org MVP" is targeted at this buyer but is currently spec-level and not built. The doc doesn't directly address the institutional buyer pitch, which means we can't rely on it for that segment — this is an area where our own research (Sarah's UVU grant compliance requirements) is more concrete than the doc's market evidence.

**The doc validates the solo-tutor strategy. It doesn't validate the institutional pitch. Don't use the doc to justify Wave 5 scope decisions — those need separate validation.**

---

### T4. The compliance/reporting angle is a strategic differentiator the doc misses

The doc's analysis of TutorBird, Teachworks, and TutorCruncher treats "notes" as a generic admin feature. But Sarah's Q2 follow-up reveals a specific institutional requirement: session-log + time-rounding + date-range search + consolidated export for Wyzant and UVU compliance. This is not generic "notes." It is a **tutoring-specific compliance and billing artifact** that generic meeting-AI (Fathom, Teams) does not produce.

A session-log surface that auto-populates from the session, rounds time, adjusts for disconnect gaps, and exports in Wyzant/UVU-compatible format would remove a real recurring pain point for institutionally-employed tutors — and it's differentiated from both generic AI tools AND generic admin platforms. The doc hints at this ("billing/grant compliance" triggers) but doesn't develop it.

**This is an underrated part of our moat. Prioritize the session-log surface for the institutional pitch, not as a Wave 6 polish item.**

---

## Open questions for Andrew

### OQ1. When does AI notes quality move to priority?

The doc is clear that generic meeting AI is already at ~90–95% accuracy for transcript summaries. Our notes quality is currently acknowledged as poor. At what point does "notes quality is unacceptably bad" become a brand/trust risk that overrides finishing Gate A? Is there a quality bar below which we shouldn't pitch Mynk on the notes value at all?

**What it gates:** Whether notes quality workstream should be pulled before master cut, or whether the pilot framing ("this is the AI notes in progress — it will improve") is acceptable for the BYU pitch.

---

### OQ2. Does session-log + reporting (K5) move ahead of Wave 6?

Sarah's Q2 follow-up positions session-log + billing/compliance search as a major feature surface. The doc validates it as a real gap. Currently it's in Wave 6 polish. Should it move to Wave 4 or even Wave 3, given that (a) it's load-bearing for the institutional pitch and (b) it's the feature most likely to motivate a TutorBird/Teachworks tutor to consider switching?

**What it gates:** Wave sequencing. This is a direct re-prioritization call.

---

### OQ3. Should the BYU pitch have a separate track from the Sarah solo-tutor story?

The doc's market framing and our Sarah validation apply to independent/institutional tutors. The BYU pitch is a dept-head buyer who doesn't personally tutor — they care about student outcomes at scale, compliance, cost, and tutor management. Our current pitch materials are tutor-centric. Should we build a separate institutional pitch track (org pilot backlog) ahead of Aug, or go with the solo-tutor story and explain scaling later?

**What it gates:** Whether Wave 5 org MVP work (Phase 12) should start earlier than currently sequenced.

---

### OQ4. "Coexist with Wyzant" messaging — how explicit should we be?

The doc recommends treating Wyzant as complement, not enemy. Should we actively surface "works alongside your Wyzant pipeline" as a marketing message, or keep it implicit? If Sarah moves some of her Wyzant sessions to Mynk delivery, what's the anti-off-platform risk?

**What it gates:** Marketing copy and the beta/pilot onboarding story for new tutors who currently use Wyzant.

---

### OQ5. Scheduling scope for the Aug 2026 pitch

The doc identifies cross-system scheduling pain as a real switching trigger for small-biz and institutional tutors. We've locked out scheduling from V1 (correctly, for Sarah). But if we're pitching a BYU dept head in Aug 2026, do we need at least a credible scheduling story — even if it's integration-based (Apple Calendar, Google Calendar sync) rather than built-in scheduling? The BACKLOG already has scheduling as Gate B (post-V1, pre-release). Is Aug pitch timing compatible with Gate B completion?

**What it gates:** Whether scheduling integration should be accelerated into the pre-BYU-pitch window, even if it ships after master cut.

---

### OQ6. Does "session-log + reporting" get its own dedicated workstream before V1 or after?

Sarah's Q2 follow-up revealed this is billing/compliance infrastructure — Wyzant 25-word-per-session, UVU pay-period aggregate, date-range search, time-rounding. It's not in the current Gate A checklist. Should it be a Gate B item (pre-release), a Wave 4 item (after Wave 1 stable), or should it be pulled earlier given that it's likely the #1 feature that would move an institutionally-employed tutor (UVU type) to consider Mynk over their current stack?

**What it gates:** Roadmap sequencing and what we can demo at the Aug 2026 pitch. If we can show session-log + aggregate reporting in the demo, the institutional story becomes materially stronger.

---

*Last updated: 2026-06-12. Companion file: `docs/research/Tutoring Software Market Analysis and Competitive Positioning.pdf`.*
