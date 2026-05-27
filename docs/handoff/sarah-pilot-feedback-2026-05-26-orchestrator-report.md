---
status: CAPTURE COMPLETE — 2026-05-26 evening call + 12:03–12:17 AM follow-up thread landed
authored_by: Opus orchestrator in-chat (carve-out per .cursor/rules/orchestrator-discipline.mdc — conversation IS the doc content; Composer dispatch would lose live-appending capability)
to_be_polished_by: Composer 2.5 once the call data fully settles
---

# Sarah pilot feedback capture — 2026-05-26 evening call

> **Source.** Voice call between Andrew and Sarah (Mynk pilot tutor),
> 2026-05-26 ~9:30 PM MT, lasting ~1.5+ hrs. Includes a live A/V smoke
> earlier in the call (Andrew = tutor, Sarah = student on her iPhone).
> Sarah is the live commercial pilot user. Her answers route v1 IA +
> Wave 1 reliability sequencing per [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md).
>
> **Method.** Verbatim-first. Sarah's exact words preserved (don't
> paraphrase, don't rearrange). Andrew's observations + orchestrator
> interpretations sit in clearly-marked subsections, separated from
> her quotes.
>
> **Do not edit while the call is ongoing.** Andrew may still be
> dumping data. Slots below marked `(pending — to be filled)` are
> placeholders for incoming content.
>
> **Generalization caveat (n=1).** All decisions and preferences
> here come from a **single pilot user**. Sarah's workflow is real;
> her preferences are real-user-tested. But pilot scope is currently
> one tutor. When tutor #2+ onboards, some Sarah-specific preferences
> may not generalize — e.g. her billing in 5/15-min increments may
> differ for hourly-billing tutors; her non-assignment teaching
> style may not match task-oriented tutors; her tool-order
> preferences are her own. **Decisions in § 3 that lean on
> structural product-shape** (anchor noun = session, Wyzant-shaped
> layout, no scheduling in v1, student accounts + consent, mobile
> parity, live > recorded video) **are more durable** — they're
> framings that match the product category, not just Sarah. **Tutor-
> workflow preferences** (timer display, toolbar order, AI prompt
> sections, default-on camera, etc.) **may need revisiting at tutor
> #2+.** Andrew note 2026-05-26 11:38 PM: *"we'll see what happens
> when our pilot scope moves beyond 1 person, but it's still good
> feedback on a real user."* For now this is the best real-user
> signal we have.
>
> **Methodology caveat (student-side observation).** Andrew (not in
> screenshots — orchestrator note):
>
> > I was the one driving the tutor side to show her things, she was
> > seeing most of it from the student side while live, so at some
> > point I'll need to have her drive the tutor side, but I think her
> > feedback was still tutor centric, but figured it's worth mentioning
>
> **Complements** the n=1 caveat above; does not replace it. **Action:**
> schedule a follow-up where Sarah drives the tutor side end-to-end
> before heavy n=1 dependency on tutor-side UX friction we may have missed.

---

## 1. Sarah's answers — verbatim

### Q1. Top-10 most-frequent actions in the app

#### Answer #1 (Discord, 2026-05-26 11:12 PM):

> opening a white board session so a student can see and hear me and see what I am writing, importing images of their homework, writing on the homework, importing or inserting a graph, drawing shapes or images or geometry, having it log the time and notes so i don't have to

![Sarah's first action answer (Discord)](assets/sarah-pilot-feedback-2026-05-26/01-action-q1-discord.png)

#### Orchestrator parse — the actions, numbered:

1. **Open whiteboard session** (bundled: whiteboard + audio + video + AI notes — single mental action)
2. **Import images of homework**
3. **Write on the homework** (annotate)
4. **Import / insert a graph** (likely Desmos / mathematical graph)
5. **Draw shapes / images / geometry**
6. **Have it log the time + notes so I don't have to** — see [Q2 follow-up — log the time + notes](#q2-follow-up--log-the-time--notes-verbatim-much-bigger-than-the-prior-interpretation) below; **reclassified** as major session-log + reporting + search surface (not Wave 6 polish)

#### Key framing observation (load-bearing for IA):

Sarah does NOT separate "start audio recording" from "open whiteboard"
from "start live A/V." To her, **"whiteboard session" is the unified
container** for everything — whiteboard + audio + video + AI notes.

**Implication for v1 IA:** ONE start-session affordance, not three
separate buttons. The session IS the unit. The phrase she used —
"open a white board session so a student can see and hear me" — frames
the session as inherently multi-stream (visual + auditory) and
inherently student-facing (live A/V).

#### Continuation status — answered 11:48 PM (solo / in-person mode add-on):

Andrew asked at 11:20 PM (see [follow-up questions screenshot](assets/sarah-pilot-feedback-2026-05-26/06-followup-questions-asked.png)); Sarah replied after 11:43 PM close (see [Andrew thanks + follow-ups noticed](assets/sarah-pilot-feedback-2026-05-26/07-andrew-thanks-sarah-followups-noticed.png)).

**11:43 PM Sarah (positive close from prior thread):**

> yes it is looking really good. you have made great progress. Glad I could help!

**11:48 PM Sarah — Q1 continuation:**

> 1. to add to that, we did talk about possible logging in to use the whiteboard in person so it can record while in person, that is slightly different than what we did today. I just can't thing of anything more right now, but if I do I'll let you know.

![Sarah Q1 solo / in-person mode add-on](assets/sarah-pilot-feedback-2026-05-26/08-sarah-q1-solo-mode-add-on.png)

**11:49 PM Andrew:**

> Funny enough...that actually works, it's how I tested solo, sounds like you might want it as a first class feature. I did wonder about that, forgot to ask. It's turned off in production right now

**Orchestrator parse:** This is **not** a new action verb on top of #1–#6 — it is a **foundational use-case shift**. Sarah wants **solo / in-person tutor mode** as a **first-class feature**: tutor logs in on a whiteboard at a physical session and records + transcribes + maintains the whiteboard artifact **without** a remote student connection. See [§ 9 — Solo / in-person tutor mode](#9-first-class-feature-solo--in-person-tutor-mode).

**Retroactive action #7:** At 11:57 PM Sarah added *"Looking back at notes"* as item 1 in her log-the-time answer (see [Q2 follow-up](#q2-follow-up--log-the-time--notes-verbatim-much-bigger-than-the-prior-interpretation) below) — that is her actual **#7**, not the solo-mode add-on above.

**Still open:** Sarah may add more later (*"if I do I'll let you know"*).

---

### Q2. Scheduling Y/N — THE gating question

#### Answer (Discord, 2026-05-26 11:16 PM):

> I use the calendar on my iphone and sometimes my google calendar which is synced with my iphone calendar. I dont think I would use a calendar if it had one because I am not meeting and communicating with people through the app.

![Sarah's scheduling answer (Discord)](assets/sarah-pilot-feedback-2026-05-26/03-scheduling-answer-discord.png)

#### Decision: **LOCKED — Option 1, no scheduling in v1.**

Her reasoning is also a clean product-positioning line worth keeping
for the eventual schools pitch narrative:

> "I am not meeting and communicating with people through the app."

→ Mynk is the **tutoring-delivery layer**, not the
**relationship/scheduling layer**. The relationship layer lives
outside (text, email, iPhone calendar synced with Google, parent
contact via Discord/text/etc.). This is a sharper positioning frame
than anything we'd derived from the master plan.

#### Follow-up reinforcement (Discord, 2026-05-26 11:19 PM):

In response to Andrew asking her to think about it more:

> i would probably just want it to be the recording/recap tool. i like my iphone calendar.

![Sarah's recording/recap follow-up (Discord)](assets/sarah-pilot-feedback-2026-05-26/04-recording-recap-tool-followup.png)

**Even cleaner positioning line in her own words:** *"I would probably
just want it to be the recording/recap tool."* This is the canonical
phrase to use in the Wave 3 brand/copy work and in the eventual
schools pitch. Worth preserving verbatim.

---

### Q3. Recap reading patterns — parent engagement (answered 12:03–12:04 AM)

**12:03 AM Sarah:**

> 3. I'm not sure what the parents usually read it on. I have never asked. They probably use both. Wyzant requires me to send a 25 word minimum to parents each session, uvu requires I give a very brief recap on my notes sheet I send to them each pay period so i can get paid and they can get their grant money. If I give a recap to the parents, I prefer to give it in person and I have never looked up any notes to do it. Half the parents just let me do my thing and are just grateful their student is learning and doing better. The other half like to talk to me in person or sometime over text and ask follow up questions to see where their student is at.

![Sarah Q3 parent recap patterns](assets/sarah-pilot-feedback-2026-05-26/10-sarah-q3-parent-recap-patterns.png)

**12:04 AM Sarah (continuation — self-acquired students):**

> when i get students on my own, none of them have asked for notes per say. they just want to know if their kids is getting it and where are they at in their understanding. A lot of the time I have this convo at the beginning or end of a tutoring session.

![Sarah self-acquired students — no notes asked](assets/sarah-pilot-feedback-2026-05-26/11-sarah-self-acquired-students-no-notes-asked.png)

#### Orchestrator parse:

- **Parent device unknown** — Sarah has never asked → assume **both** phone and desktop → **mobile-first parent share view** (already decided earlier in session) remains correct.
- **Wyzant:** 25-word minimum recap to parents **per session** — institutional billing rail.
- **UVU:** brief recap on notes sheet **per pay period** for grant disbursement — institutional billing rail.
- **Sarah prefers in-person recaps** for parents; does **not** look up notes to deliver them.
- **Parent split ~50/50:** half hands-off / grateful; half want in-person or text follow-ups → validates **"ask follow-up" affordance** demand for the engaged half.
- **Self-acquired students** (no Wyzant/UVU): parents don't ask for notes — **verbal/conversational** status update at session boundaries, not artifact-based.

---

### Q4. Pain point worked around — patient-user underreporting (optional from prep doc)

**Not asked tonight** — Andrew prioritized the other follow-ups over Q4. Q4 remains queued for the next Sarah thread.

---

### Q2 follow-up — log the time + notes (verbatim, much bigger than the prior interpretation)

**11:57 PM Sarah:**

> 2. log time and notes would log total time and when you started and ended a session, if you got disconnected, and there is time gap, it would adjust to the total time with the end time being the correct time and it might be 5 mins later we actually started, example. now that im thinking about it. I would want the total time to be rounded to the nearest 5 at the very end and the time, like if i tutored 55 mins, it would show that amount and that I tutored from 10:00am-10:55am. Might be nice if i can get my notes , time, amount of time, and date and give a total time for that time period into a consolodated formate. I will have to show you what wyzant had and what I am required to fill out for my work with uvu and that might give you an idea of what I mean. I would want to be able to search for the notes for a certain time period, I would want to be able to enter the dates and say for which students, maybe it just one, maybe its all of them for the last two weeks.
>
> 1. Looking back at notes. forgot to add that one. What I talked about above is something I would use it for.

![Sarah Q2 log-the-time + billing + search](assets/sarah-pilot-feedback-2026-05-26/09-sarah-q2-log-time-billing-search.png)

#### Orchestrator parse:

- **Total time per session** with start/end timestamps (e.g. tutored 55 mins, 10:00am–10:55am).
- **Auto-adjustment for disconnect gaps** — smart calc when there is a time gap; end time is the correct time even if actual start was ~5 mins later than recorded.
- **Round to nearest 5 minutes** at the very end (billing increment alignment).
- **Aggregated consolidated format** — notes + time + amount of time + date for a time period; total time across the period.
- **Search** across notes by **date range** AND by **student(s)** — single student OR all students (e.g. last two weeks).
- **Wyzant + UVU billing/grant compliance** — Sarah will share Wyzant + UVU forms as artifacts to inform design.
- **"Looking back at notes"** — Sarah's retroactive **action #7** (uses the session-log / search surface above).

> **RECLASSIFICATION:** Previously categorized as *"Wave 6 polish — surface total session duration in recap header."* **Now:** major feature surface — **session-log + reporting + search**, including billing/grant compliance. **Roadmap update needed.**

**Open follow-up: Wyzant + UVU forms** — Sarah said she'll share what those forms look like; track as artifact follow-up for session-log + reporting design.

---

### Q5+. Anything else Sarah surfaced

(pending — open slot for spontaneous feedback / topics she raised on her own)

---

## 2. iPhone live-A/V smoke — Sarah as student

Andrew ran a live A/V smoke earlier in the same call. Andrew = tutor
(desktop), Sarah = student joining via `/w/[joinToken]` on her iPhone.
Sarah explicitly sent a Wyzant reference image mid-call, which is
captured below as a layout reference artifact.

### Setup context

- **Tutor side:** Andrew, desktop browser
- **Student side:** Sarah, iPhone Safari, joined via `/w/[joinToken]`
- **Goal:** validate iOS S12 (Live A/V join) + adjacent matrix
  scenarios per [`docs/PHASE-2-IOS-SMOKE-MATRIX.md`](../PHASE-2-IOS-SMOKE-MATRIX.md)
  with the actual blocking real user
- **Sarah's iPhone model + iOS version:** (pending — Andrew to capture)

### Reference artifact — Wyzant layout (Sarah sent for reference)

Sarah sent this photo of a Wyzant tutoring session interface mid-call.
She didn't explicitly say why; Andrew's read was she wanted to show
the layout most tutors / students expect.

![Wyzant tutoring layout reference, sent by Sarah](assets/sarah-pilot-feedback-2026-05-26/02-wyzant-layout-reference.png)

#### Orchestrator interpretation:

- **Whiteboard ~85–90% of visible area.** Everything else is corner chrome.
- **Video tiles top-right, small.** Tucked-away participant strip.
- **Toolbar minimal across top of whiteboard.** No dominant left/right sidebars.
- **Asset/file zone subtle at bottom.**

Consistent with the master plan's strategy doc title — "match Wyzant
for Sarah plus our wedge." Sarah's reference image confirms the
"match Wyzant" half should literally look familiar to Wyzant users.

**Spot-check needed:** does the current `WhiteboardWorkspaceClient`
mock (Surface 4 in `docs/brand-previews/palette-mocks-FINAL-mynka-blue.html`)
already match this layout, or does it deviate? Verify before any
Wave 3 visual refresh.

### Raw smoke notes — verbatim (Andrew's capture)

> Source: [`docs/Sarah-Chat-05-26-2026.txt`](../Sarah-Chat-05-26-2026.txt).
> Embedded here for self-contained reading. Andrew's note: "very much
> not clean right now and some things that could be together are
> separate." Don't normalize the raw section — preserve as-is.

```
Iphone Smoke
We both seem to be getting video but sound doesn't seem to be going either way.
	turns out discord stole sound.  Can we get sound back without complete refresh?
On Iphone is it asking her every time to allow camera (she doesn't want to have to allow it every time) She's talking about our button
	She wants the camera to go straight to on.
	She's actually thinking a waiting room might be better. Like google meet/teams etc
		Session timer shouldn't start till they've left the waiting room.
she likes the delete
the order in which things are aligned at the top
	Can the icons on the whiteboard be re-arranged
		Cursor
		Pencil
		Eraser
		Typing
		Can line and arrow be consolidated into dropdown
		Can square/diamond/circle be consolidated into dropdown
Sloppiness should default to architect and Edges should default to sharp
she's reloading the page or something but it says she's connected and the timer is running...guess she's just taking time to load
when she reloads into the page there are two things often at first.  The old one reloads with the new one (the camera tile)
When she leaves safari the camera goes black (this is possibly normal)
the board goes off her phone (get picture from discord)
would be nice to get video closer to the whiteboard on the phone
She's not sure if she needs the student to be able to add a page.  She says she'd have to work with it to know if it's annoying or not.
she has the checkbox checked to sync to my view, it doesn't seem to be following
sync button doesn't seem to go to my view
	both should match my center and zoom
An alarm went off on her phone and messed with the session? (sound and possibly video)
When she disconnected the auto-pause from the student perspective isn't happening fast enough.  From tutor side it only pauses once they've completely disconnected.
	I wonder if there is a way to detect that their browser closed/disconnected faster.
	timer stopped at 28:09 and picked up as soon as she connected.
		She doesn't think she or the student cares to see the seconds on the timer
		When she does her time she rounds to 5/15 minutes
		she does NOT want to see seconds.  Only minutes.
Camera swap works
	when she switches to front camera the view is inverted for her (can we swap her view) (is it even possible to detect when it's inverted programmatically)
	can we limit the camera options to just front and back?
PDFs
	She sees text, not placeholder.
Laser pointer is waaay off cursor (to the right right now)
	She does not see the laser pointer
Sync pan and zoom to tutor should be checked by default (and working)
Sometimes last stroke isn't syncing till page change
Images and possibly pdfs are not syncing till page change.
Right now you have to click back on the color pallette thing on the phone to switch off of it.
	Can it close with just click away.
She likes that she can zoom in for precise labeling

Ended the session and tried dragging the scrubber ->
	After session ended she had a hard time getting back into discord
	When session ends it needs to let go of her audio and camera

She's not sure there should be a homework section. (She think's it could be taken out and that plan probably covers it) Make sure prompts are updated.  Plan should be plan moving forward, what to do next, and it would also be homework if she gives any.  Typically though she's helping them to be ABLE to complete their homework.  Quite often they're working on specific homework already anyway.  She might tell someone to use AI or redo some homework problems or tell them to get more practice on those kinds of problems.  Often it's just "complete your homework and we'll meet again in two days to work on the next one" kind of stuff.  Other tutors might be more task oriented but she doesn't see herself assigning homework directly.

She's wondering if students wouldn't want to actually have to be able to log in for privacy and security reasons.  So students might need a basic account.  So we need another account type for the students.  She thinks if just anyone with the link can see the audio and stuff people would be upset.

She would think the student should be the one to give consent to be recorded or not.
	Also maybe a question indicating if it's okay to be used for educational purposes or not.
	Remember consent for recording
	Remember consent for educational purposes
	Video and audio should be able to be toggled individually
	If a child is under 18 they have to have written permission to do photos or videos of children.
		So she's wondering if kids should have it off by default.
		Until we get an age verification system in, maybe we don't record audio by default.
	"Your video will not be recorded, but are you okay with audio being used for educational purposes."
	Tutor might want their video recorded.
	Live video is great, recorded video is actually lower priority.
This means the tutor doesn't need to ask for consent every time.

Her highest priorities:
	The syncing needs to be fixed.  Centering, viewport accomodation, etc.  Sync to tutor needs to be on by default and needs to work.
	She would really like a writing pad to work. She currently has an XPPen Star G640
	Then the tools lined up by most used
	Being able to close the styles window without hitting the button again
```

---

### Structured parse

#### 2.1 Critical breakage observed (existing features failing)

| # | Symptom | Detail | Severity |
|---|---|---|---|
| B1 | **Sync-to-tutor checkbox broken** | "she has the checkbox checked to sync to my view, it doesn't seem to be following" — Sarah's **#1 priority** below | **CRITICAL** |
| B2 | **Sync button broken** | "sync button doesn't seem to go to my view" + "both should match my center and zoom" | **CRITICAL** |
| B3 | Last stroke not syncing till page change | "Sometimes last stroke isn't syncing till page change" | High — sync race |
| B4 | Images / PDFs not syncing till page change | "Images and possibly pdfs are not syncing till page change" | High — sync race |
| B5 | Duplicate camera tiles on reload | "when she reloads into the page there are two things often at first. The old one reloads with the new one (the camera tile)" | High — ghost peer / lifecycle |
| B6 | Audio one-way → no-way recoverable only by refresh | "We both seem to be getting video but sound doesn't seem to be going either way. ... turns out discord stole sound." → "Can we get sound back without complete refresh?" | High — needs audio-route recovery affordance |
| B7 | Auto-pause too slow on student disconnect | "From tutor side it only pauses once they've completely disconnected." → "I wonder if there is a way to detect that their browser closed/disconnected faster." | Medium |
| B8 | Laser pointer offset from cursor | "Laser pointer is waaay off cursor (to the right right now)" | High |
| B9 | Laser pointer invisible to student | "She does not see the laser pointer" | High — defeats the feature |
| B10 | Front camera view mirrored/inverted | "when she switches to front camera the view is inverted for her" | Medium — confusing |
| B11 | Devices not released on session end | "After session ended she had a hard time getting back into discord. When session ends it needs to let go of her audio and camera" | High — blocks other-app use |
| B12 | Phone alarm interrupts session | "An alarm went off on her phone and messed with the session? (sound and possibly video)" | Medium — iOS audio-routing interrupt |

#### 2.2 iPhone-specific friction (S2/S11/S12 matrix coverage)

| # | Item | Detail |
|---|---|---|
| I1 | Camera permission asked every time | "is it asking her every time to allow camera (she doesn't want to have to allow it every time)" |
| I2 | Wants camera default-on | "She wants the camera to go straight to on" |
| I3 | Slow page load on iPhone | "she's reloading the page or something but it says she's connected and the timer is running...guess she's just taking time to load" |
| I4 | Safari background → camera black | "When she leaves safari the camera goes black (this is possibly normal)" — Andrew flags as likely iOS-normal; verify and add to matrix § 7 known-quirks if so |
| I5 | Whiteboard off phone viewport | "the board goes off her phone" — see [iPhone screenshot](assets/sarah-pilot-feedback-2026-05-26/05-iphone-whiteboard-viewport.png). Drawing surface is ~30–35% of viewport; rest is chrome (Safari URL bar, partial camera tile, "Board pages" explainer card consuming ~25% of screen, separate Undo/Redo buttons, full Excalidraw toolbar, right-side floating panel, bottom control bar). **Violates Sarah's own Wyzant-shaped intuition** that whiteboard should be ~85% of visible area. |
| I6 | Video tile far from whiteboard on phone | "would be nice to get video closer to the whiteboard on the phone" |
| I7 | Color palette doesn't dismiss on click-away (mobile) | "Right now you have to click back on the color pallette thing on the phone to switch off of it. Can it close with just click away." |

#### 2.3 Sarah's UX requests / friction (non-bug)

| # | Item | Detail |
|---|---|---|
| U1 | **Waiting room concept** | "She's actually thinking a waiting room might be better. Like google meet/teams etc. Session timer shouldn't start till they've left the waiting room." |
| U2 | Likes the delete | "she likes the delete" |
| U3 | Likes ordering at top | "the order in which things are aligned at the top" |
| U4 | **Toolbar icon reorder** | Order: **Cursor, Pencil, Eraser, Typing**, then dropdowns. (Sarah's #3 priority) |
| U5 | Consolidate line + arrow into dropdown | — |
| U6 | Consolidate square + diamond + circle into dropdown | — |
| U7 | Default sloppiness → architect | "Sloppiness should default to architect" |
| U8 | Default edges → sharp | "and Edges should default to sharp" |
| U9 | **Timer minutes-only (no seconds)** | "she does NOT want to see seconds. Only minutes." Rounds billing to 5/15 min increments. |
| U10 | Limit camera options to front/back only | "can we limit the camera options to just front and back?" |
| U11 | Likes zoom-in for precise labeling | "She likes that she can zoom in for precise labeling" |
| U12 | Camera swap works (positive confirmation) | "Camera swap works" |
| U13 | **PDFs: "She sees text, not placeholder"** | **Ambiguous** — Andrew, was Sarah expecting placeholder and got text, or vice versa? Capture for clarification. |

#### 2.4 Sarah's feature requests

| # | Item | Detail |
|---|---|---|
| F1 | **Writing pad / drawing tablet support** | She owns an **XPPen Star G640**. Would "really like" it to work. (Sarah's #2 priority) |
| F2 | Front camera un-mirror affordance | "can we swap her view" + "is it even possible to detect when it's inverted programmatically" |
| F3 | Faster student-disconnect detection | "I wonder if there is a way to detect that their browser closed/disconnected faster" |
| F4 | Student-side "add page" affordance? | "She's not sure if she needs the student to be able to add a page. She says she'd have to work with it to know if it's annoying or not." — **open question**, not yet a request |

#### 2.5 NEW PRODUCT AREA — Student accounts + consent + minor-data path

**This is the single biggest new product area revealed by the smoke.** Verbatim Sarah quotes:

> "She's wondering if students wouldn't want to actually have to be able to log in for privacy and security reasons. So students might need a basic account. So we need another account type for the students. She thinks if just anyone with the link can see the audio and stuff people would be upset."

> "She would think the student should be the one to give consent to be recorded or not. Also maybe a question indicating if it's okay to be used for educational purposes or not. Remember consent for recording. Remember consent for educational purposes. Video and audio should be able to be toggled individually."

> "If a child is under 18 they have to have written permission to do photos or videos of children. So she's wondering if kids should have it off by default. Until we get an age verification system in, maybe we don't record audio by default."

> Model consent prompt phrasing: *"Your video will not be recorded, but are you okay with audio being used for educational purposes."*

> "Tutor might want their video recorded."

> **"Live video is great, recorded video is actually lower priority."**

> "This means the tutor doesn't need to ask for consent every time." (Consent persisted per-student.)

**Orchestrator interpretation:**

- **New entity:** `Student` account type, separate from existing `AdminUser` (tutor).
- **New consent persistence model** per-student, ≥4 booleans:
  - `consentRecordingAudio`
  - `consentRecordingVideo`
  - `consentEducationalUseAudio`
  - `consentEducationalUseVideo`
- **Minor-data path:** under-18 = different defaults (off by default); need age-verification (long-term) OR tutor-attests-parent-consent (short-term).
- **Live ≠ recorded:** Live A/V stays Phase 4 critical; recording the A/V stream to Blob can be skipped if consent denied. Whiteboard recording (strokes + audio for AI notes input) is a separately-gated decision.
- **Tutor-opt-in for own video** is independent of student consent.
- **Persistence model:** consent stored on Student entity; tutor doesn't re-prompt each session.
- **Schools-pitch implication:** institutional buyers will require FERPA-adjacent compliance. "Just anyone with the link can see audio" = non-starter. Student accounts + consent = required for university-tutoring-department pitch.

**Net-new work** — not in master plan or `docs/RELEASE-ROADMAP.md`. Likely Wave 1 + Wave 3 spanning multiple subagent dispatches:

1. Schema design (Student model, consent fields, FKs) — Sonnet-tier design (auth-boundary + persistence schema)
2. Student login / account UX (basic) — Composer
3. Consent capture flow (per-student, first session) — Composer
4. A/V + audio recording gating logic (respect consent) — Sonnet-tier (cross-cuts recorder + outbox + live A/V)
5. Minor-data defaults + tutor-attest flow — Composer
6. Tutor-video opt-in toggle — Composer

#### 2.6 AI prompt / framing change — "homework" → "plan"

> "She's not sure there should be a homework section. ... Plan should be plan moving forward, what to do next, and it would also be homework if she gives any."

Sarah's tutoring-style narrative (capture for prompt-writing examples):

> "Typically though she's helping them to be ABLE to complete their homework. Quite often they're working on specific homework already anyway. She might tell someone to use AI or redo some homework problems or tell them to get more practice on those kinds of problems. Often it's just 'complete your homework and we'll meet again in two days to work on the next one' kind of stuff. Other tutors might be more task oriented but she doesn't see herself assigning homework directly."

**Action:** Next AI prompt iteration (v8 after `docs/handoff/reliability-and-prompt-v7-2026-05-20-orchestrator-report.md`) replaces "homework" section with "plan" section. Plan = (a) plan moving forward / what to do next, (b) any specific assignments tutor gave (if any). Use Sarah's narrative as one of the few-shot examples.

#### 2.7 Sarah's explicit priority order (her words, her ranking)

> Her highest priorities:
> 1. The syncing needs to be fixed. Centering, viewport accomodation, etc. Sync to tutor needs to be on by default and needs to work.
> 2. She would really like a writing pad to work. She currently has an XPPen Star G640
> 3. Then the tools lined up by most used
> 4. Being able to close the styles window without hitting the button again

**Priority list provenance:**

- **Items 1–3 are Sarah's own mentions, in her order.**
- **Item 4 (close styles window) was added by Andrew** because Sarah explicitly complained about it and called it annoying — promoted into the top-priority bucket on that basis.
- **Implicit top-tier addition:** **Laser pointer working (B8+B9)** — Sarah didn't list it in priorities, but Andrew notes she got actively excited at the idea of it working. Treat as effectively top-tier (≈ tied with item 3 toolbar reorder for daily impact). The fact that the laser pointer is currently both offset AND invisible to the student makes the feature a no-op for her right now.

**This is the authoritative dispatch order for items affecting Sarah's daily use.** Anything in § 2.1 (B1–B4 sync items) outranks the audio crash/refresh durability #1/#2 paired dispatch I was previously planning to recommend next.

---

### Orchestrator observations — framing shifts the smoke revealed

#### 1. Live video critical; recorded video low priority — architectural simplification

Sarah's quote: *"Live video is great, recorded video is actually lower priority."*

Implication: Phase 4 live A/V stays critical. But video-stream upload-to-Blob, recorded-video replay quality, video codec hardening — all of that **deprioritizes**. Audio recording stays critical (it's the AI notes input). Whiteboard recording stays critical (it's the visual replay artifact).

This simplifies a chunk of `BACKLOG.md` and master plan Phase 6 work. Video-track recording in the master plan was already deferred ("Until Sarah asks"); now we have explicit Sarah-says-don't.

#### 2. Student accounts + consent is a NEW BLOCKER-class product area

Already detailed in § 2.5. Cascades to:
- New schema work (Student model)
- New auth boundary (`assertOwnsStudent` → `assertStudentSelf` or similar)
- New consent UI surfaces
- A/V + recording gating logic
- Minor-data defaults
- FERPA-adjacent compliance posture for schools pitch
- Replaces or supplements current `/w/[joinToken]` anonymous-link model

#### 3. Sync is Sarah's #1 priority — re-sequences Wave 1

The audio durability #1/#2 paired dispatch I was planning to recommend is **not** the obvious next call anymore. Sarah's #1 priority is sync reliability — B1, B2, B3, B4 in § 2.1. These are likely the same root cause (some sync surface broke recently or never fully worked across the new per-page view state shipping). One Composer-2.5 dispatch should target the sync surface holistically.

Audio durability stays Wave 1 but moves behind sync (and behind student-accounts+consent for institutional readiness).

#### 4. "Plan" replaces "homework" in AI prompt framing — universal positioning win

Sarah explicitly doesn't assign homework. "Homework" is a K-12-shaped framing. "Plan moving forward + what to do next + assignments if any" is more universal across all tutoring contexts (universities, agencies, peer-tutoring, etc.) — and matches Sarah's actual workflow. This is a small AI prompt change that doubles as positioning improvement.

#### 5. Whiteboard mobile viewport breakage (I5)

"The board goes off her phone." Likely needs a mobile-specific workspace layout pass — and ties to U1 (waiting room) + I6 (video tile placement) + I7 (palette click-away dismiss). Mobile-specific layout work clusters into one Wave 3 dispatch.

---

### Items the smoke surfaces that need NEW BACKLOG entries

Tag suggestion: `pilot-2026-05-26`. Each entry below maps to one row above.

- B1 + B2 + B3 + B4 (consolidate as "Sync-to-tutor + whiteboard sync reliability sweep")
- B5 (Duplicate camera tile on reload — ghost peer / lifecycle)
- B6 (Audio recovery affordance after device-route theft)
- B7 (Auto-pause on student disconnect — faster detection)
- B8 + B9 (Laser pointer offset + invisible to student — consolidate)
- B10 (Front camera mirroring on iPhone — un-mirror affordance)
- B11 (Camera/audio device release on session end)
- B12 (Phone alarm session interruption — capture as known iOS limit OR mitigate)
- I1 + I2 (Camera permission persistence / default-on)
- I3 (Slow iPhone page load — investigate)
- I4 (Safari background → camera black — confirm iOS normal, document)
- I5 (Whiteboard off iPhone viewport — needs mobile layout pass)
- I6 (Video tile placement on phone — closer to whiteboard)
- I7 (Color palette click-away dismiss on mobile)
- U1 (Waiting room concept)
- U4 + U5 + U6 (Toolbar reorder + dropdown consolidation)
- U7 + U8 (Excalidraw defaults: sloppiness=architect, edges=sharp)
- U9 (Timer: minutes-only display)
- U10 (Camera options limited to front/back)
- F1 (Writing pad / XPPen Star G640 support)
- F3 (Faster student-disconnect detection — pairs with B7)
- F4 (Student-side add-page affordance — pending Sarah's own decision)
- "Plan replaces homework" — AI prompt v8 change
- **Tutor-on-mobile full experience** — Andrew note 11:37 PM: Sarah doesn't tutor from phone much, but eventually the tutor-side mobile path should be solid. Backlog (not Wave 1 reliability gate).
- **Session transfer between devices** — Andrew note 11:37 PM: Sarah might eventually want a way to transfer an in-flight session from one device to another without losing it. Building blocks exist (session continuing), but a discrete UX surface for the transfer isn't built. Backlog (not immediate).

### Open questions / clarifications for Andrew

- **U13 — PDFs "she sees text, not placeholder."** What was she expecting? Did PDFs used to show as placeholders and now render real text (i.e. shipped behavior), or vice versa?
- **I5 — "the board goes off her phone (get picture from discord)"** — Sarah took a screenshot of the broken viewport. Capture into `assets/sarah-pilot-feedback-2026-05-26/` when available.

---

## 3. Decisions locked from this call (running tally)

| Decision | Locked value | Source |
|---|---|---|
| Mental anchor noun | **Session** (formally — was directional before) | Q1 + Q2 |
| Scheduling in v1 | **NO — out of scope** | Q2 verbatim |
| Default landing surface | **"Next actions" dashboard** (start session + finish recaps; no "Today" landing, no calendar surface) | Falls out of Q2 |
| Workspace layout direction | **Wyzant-shaped** (whiteboard ~85–90% dominant, video tiles corner-tucked, minimal toolbar) | Q1 + Wyzant reference image |
| Session = bundled container | **Yes** — one start-session affordance, not three separate buttons; whiteboard + audio + video + AI notes ship as one | Q1 framing |
| Product positioning frame | **Mynk = tutoring-delivery layer, NOT relationship/scheduling layer** | Q2 verbatim ("not meeting and communicating with people through the app") |
| **Mobile parity (student-side)** | **Student-mobile is first-class.** Refinement 11:37 PM: in practice **tutor is almost always desktop** (Sarah voice-calls on her phone occasionally while driving, but that's a regular phone call, not Mynk). The common mobile scenario is **student-on-iPhone joining a desktop-tutor session.** So: any Wave 1 sync/reliability fix must cover desktop-tutor + (desktop-student AND mobile-student). Any Wave 3 layout pass must treat **student-side mobile** as a full design, not a media-query overlay. **Tutor-on-mobile** moves to backlog. | Andrew notes 2026-05-26 11:34 PM + 11:37 PM: *"most sessions are desktop to desktop, but mobile cannot be second class"* + *"the tutor is almost always desktop ... but it doesn't sound like the tutor themselves will often tutor from phone. That is something we should backlog though to make sure is solid."* |
| **Video recording priority** | **Live A/V = critical; recorded video = LOW priority.** Audio recording + whiteboard recording stay critical (AI notes input + replay artifact); video-stream upload/storage/replay deprioritizes. | § 2.5 verbatim: *"Live video is great, recorded video is actually lower priority"* |
| **Student accounts + consent required** | **YES — new product surface.** Student account type + persistent consent (4 booleans: `consentRecordingAudio`, `consentRecordingVideo`, `consentEducationalUseAudio`, `consentEducationalUseVideo`) + minor-data defaults. Open-link access to student content = institutional blocker. | § 2.5 verbatim: *"if just anyone with the link can see the audio and stuff people would be upset"* |
| **AI prompt framing** | **"Plan" replaces "homework" section.** Plan = forward-looking plan + any specific assignments tutor gave. Sarah's narrative becomes a few-shot example. | § 2.6 verbatim |
| **Solo / in-person tutor mode** | **First-class v1 feature** — tutor logs in on whiteboard at physical session, records without remote student | Q1 continuation 11:48 PM + § 9 |
| **"Log the time"** | **Major feature surface** — session-log + reporting + search + billing/compliance; NOT Wave 6 polish | Q2 follow-up 11:57 PM |
| **Product wedge** | **Whiteboard + live recording (live session)** is THE wedge; AI notes valuable but **secondary** | § 8 strategic reframe |
| **Brand reveal** | **Clean cold-pronunciation test** — Sarah heard "Mynk" for the first time tonight (UI refresh hadn't shipped to her surface; Andrew hadn't told anyone outside immediate family). Pronounced "Mink" without the mink-animal hint → intended pronunciation lands. Positive on mascot/logo direction. Brand reveal landed cleanly. | § 10 |

---

## 4. Items that need revising as a result

- [`docs/brand-previews/palette-mocks-FINAL-mynka-blue.html`](../brand-previews/palette-mocks-FINAL-mynka-blue.html)
  Surface 2 — "Up next · Aiden K. at 4 PM today" card is **wrong**
  post-Q2. Replace with "pending recaps" / "start session" framing,
  no time-of-day, no calendar concept.
- [`docs/UX-AND-A11Y-SPEC.md`](../UX-AND-A11Y-SPEC.md) § 15 — multiple
  rows can now move from "deferred" to "resolved" (anchor noun,
  default landing, scheduling decision). Update during the v1 design
  session resumption.
- [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md) Wave 3 — one of
  two gates cleared (scheduling). Top-10 gate still partial. Update
  Wave 3 status when call settles.
- [`docs/SARAH-CALL-PREP.md`](../SARAH-CALL-PREP.md) — **done:** 2026-05-26
  entry in Answers landed; new Next call section for next thread.

---

## 5. Items elevated in priority by this call

- **Native image insert** (currently Wave 1) — confirmed top-tier
  action ("import images of their homework"), not "Sarah-essential
  but quiet." Stays Wave 1.
- **Desmos / graph insert** (currently Wave 6 polish) — Sarah
  **explicitly named it** as a top action ("importing or inserting
  a graph"). Should move up to Wave 2 or Wave 3.
- **Whiteboard / live A/V reliability** — Sarah's #1 action IS the
  whiteboard session. Any iPhone smoke failures are BLOCKER-PROD
  class for her primary use case. iOS Safari matrix exit signal
  becomes harder.
- **"Match Wyzant" layout fidelity** — Sarah surfaced the visual
  reference unprompted. Wave 3 UX refresh on the workspace surface
  should bias toward the Wyzant pattern, not invent a fresh one.
- **Solo / in-person tutor mode** → Wave 1 or Wave 2 (gating + UX) —
  TBD by upcoming reliability redesign pass. See § 9.
- **Session log + reporting** (search / filter / aggregate,
  billing/compliance) → **new feature surface**; needs its own phase
  placement in roadmap. See Q2 follow-up.
- **Whiteboard + recording reliability** (already #1) — **REINFORCED**
  as THE wedge after § 8 strategic reframe.

---

## 6. Open ambiguities to clarify later (don't ask mid-call)

- **"Log the time"** — **ANSWERED** (11:57 PM; much richer than Andrew's prior interpretation). See [Q2 follow-up](#q2-follow-up--log-the-time--notes-verbatim-much-bigger-than-the-prior-interpretation). Reclassified; roadmap update needed. Remaining artifact follow-up: Wyzant + UVU forms.

- **What kind of "graph" does she insert?** — Desmos is the natural
  assumption (math tutoring), but worth confirming. If it's static
  images of graphs (e.g. graph paper photo), the work is just "image
  insert." If it's interactive Desmos, that's an embed integration.

- **How does she currently import homework images?** — From iPhone
  camera roll? From email attachments? From a scanner? Routes the
  shape of the image-insert UX (photo picker vs file picker vs
  drag-drop vs paste).

---

## 7. Downstream impact — what gets re-sequenced

Once the call settles, the orchestrator should:

1. **Update [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md):**
   - Move "Desmos / graph insert" from Wave 6 Backlog-adjacent to
     Wave 2 or Wave 3 (depending on smoke findings + remaining
     top-10).
   - Mark Wave 1 "native image insert + cold refresh verification"
     as confirmed-top-priority (no priority change, but add the
     Sarah quote as rationale).
   - Tighten Wave 1 iOS matrix exit signal language to require
     S12 (Live A/V join from iOS) PASS specifically.
2. **Update [`docs/SARAH-CALL-PREP.md`](../SARAH-CALL-PREP.md) §
   Answers landed:** done (2026-05-26 / 2026-05-27 entry).
3. **Update [`docs/UX-AND-A11Y-SPEC.md`](../UX-AND-A11Y-SPEC.md) § 15:**
   move at least 3 rows (anchor noun, default landing, scheduling)
   from "deferred" → "resolved" with this call as the source.
4. **Trigger v1 design session resumption:** the gating decision is
   now locked; the v1 design bootstrapper at
   [`docs/handoff/v1-design-session-2026-05-19-pm-orchestrator-report.md`](v1-design-session-2026-05-19-pm-orchestrator-report.md)
   § "Next session — starting context" can now actually execute.
5. **File new BACKLOG entries** (with `pilot-2026-05-26` tag) for:
   - Any smoke failures from § 2.
   - The "log the time" ambiguity clarification.
   - The "graph" type clarification.
   - The "match Wyzant layout" spot-check action.
6. **Dispatch a Composer 2.5 polish pass on this doc** once all
   data lands — restructure if needed, tighten language, add
   any cross-links I missed.
7. **Roadmap:** reclassify "log the time" per Q2 follow-up; reinforce
   whiteboard + live recording as wedge per § 8; scope solo mode per § 9.

---

## 8. Strategic reframe (called out by Sarah, validated explicitly)

Late-night thread 12:06–12:12 AM. Institutional vs. universal value.

**12:06 AM Andrew (synthesis question):**

> So, really, most of the notes is more for historical/accounting with schools purposes, etc
>
> If I replaced wyzant for you, your only requirement would be for specific orgs like uvu?

![Strategic reframe — notes are institutional](assets/sarah-pilot-feedback-2026-05-26/12-strategic-reframe-notes-are-institutional.png)

**12:09 AM Sarah:**

> yes. That is why the white board and recording functions is probably more valuable and versatile for various tutors.

![Whiteboard + recording is the wedge](assets/sarah-pilot-feedback-2026-05-26/13-whiteboard-recording-is-the-wedge.png)

**12:09 AM Sarah (continuation):**

> it is a cool feature so the parents can stay in the loop better. more communication is always better.

**12:10 AM Andrew:**

> that's a really valuable note though, because that reframes a few things

**12:11 AM Sarah:**

> but I'm not going to lie, they AI generated notes is pretty cool

**12:11 AM Andrew:**

> the transcription is a time saver for you, but the major saves for you is what you get with the live session itself.
>
> is that right?

**12:11 AM Sarah (moat statement):**

> that is unique, which I love

**12:12 AM Sarah:**

> yes, the live session is more valuable

![Live session more valuable than AI notes](assets/sarah-pilot-feedback-2026-05-26/14-live-session-more-valuable-than-ai-notes.png)

### What this reframes

- **Notes-to-parents** are MOSTLY **institutional compliance** (Wyzant 25-word per session, UVU pay-period sheet). For tutors not bound to those institutions, parent recaps are **conversational**, not artifact-driven.
- The **UNIVERSAL value** is **live whiteboard + recording**. AI notes are a **"pretty cool"** add-on but **secondary**.
- **Brand messaging:** lead with **"live session moat"** + **"session is unique"**; deemphasize **"AI auto-notes"** as the headline.
- **Roadmap:** Wave 1 reliability for **whiteboard + live A/V** is even more critical (it's THE wedge). Parent share view depth depends on how many of the user's sessions are institution-bound.

---

## 9. First-class feature: Solo / in-person tutor mode

**Use case:** Tutor at a physical whiteboard with the student in-person; logs into Mynk to **record + transcribe + maintain whiteboard artifact** for the session — no remote student panel required.

**Status today:** Works in dev (Andrew tested solo); **disabled in production**.

**Sarah:** explicitly wants this (11:48 PM Q1 continuation). See [08-sarah-q1-solo-mode-add-on.png](assets/sarah-pilot-feedback-2026-05-26/08-sarah-q1-solo-mode-add-on.png).

### Implications

- **Gating:** "Start Session" flow currently expects remote student-side connection (or assumes one). Need explicit **solo / in-person** gate.
- **UX:** Live mode with **no remote student panel** — what does the tutor see?
- **Schools pitch:** in-person classroom recording highly relevant for college departments (Andrew noted earlier in thread).
- **Privacy/consent:** still required without remote student — in-person consent flow; tutor attests on behalf of in-person minor for school context.

**Action:** gating + UX design in upcoming reliability redesign / Wave 1–2.

---

## 10. Brand reveal — first surface to Sarah (clean cold-pronunciation test)

**Critical context (corrected post-call by Andrew, 2026-05-27 12:26 AM).** Sarah heard the "Mynk" name for the **first time tonight**. Andrew had **not** mentioned the brand to anyone outside immediate family; the upcoming UI refresh would have been the first surface to display "Mynk" + logo. So Sarah not noticing the name **in the app** is NOT a brand-visibility-too-quiet signal — the brand simply wasn't there yet to notice. Tonight **was the brand reveal** to her, deliberately or not.

- When Andrew said *"I picked a name I like"*: Sarah → *"i didn't"* (i.e., had not been told before tonight).
- After the name + evolution were shared (Mind Sync → Mync + Mink → Mynk): *"you mentioned it, but thought i was a program you were using to help you / interesting"* — she had glimpsed the word in passing during build talk but contextualized it as a tool Andrew was using, not the product brand.
- **Cold pronunciation test** (Andrew designed the ask deliberately without giving the mink-animal hint): Sarah → **"Mink"** → clean confirmation that the intended pronunciation lands without prompting.
- **Positive on the mascot/logo direction** (mink riding/driving a pencil): *"should be interesting, which is good. It catches people's attention and makes look agian"* + *"well, cool name!"*.

![Brand reveal — Mynk cold-pronunciation test](assets/sarah-pilot-feedback-2026-05-26/15-brand-awareness-mynk-pronunciation.png)

![Mynk mascot + logo direction](assets/sarah-pilot-feedback-2026-05-26/16-mynk-mascot-logo-direction.png)

**Late-night brand thread (12:12–12:17 AM)** — Andrew introduced name evolution; Sarah: *"well, cool name!"*; Erin logo work noted. Close:

![Call close — good night](assets/sarah-pilot-feedback-2026-05-26/17-call-close-good-night.png)

> well i have to head to bed
>
> good luck with the changes

**Implication:** brand reveal **landed cleanly**. Cold pronunciation worked, mascot direction got positive reaction, name itself got *"well, cool name!"* once explained. This is a **green light on the brand reveal**, not a visibility-too-quiet warning. (Real "brand presence in UI" feedback can only come *after* the UI refresh ships the brand to Sarah's surface — see § 4 deferred-until-shipped check in [`docs/SARAH-CALL-PREP.md`](../SARAH-CALL-PREP.md).)

**Operational follow-up (NOT a brand-presence issue, but adjacent).** Andrew has secured the "Mynk" social handles + the `mortensenapps.com` site domain, but most platforms (especially Reddit) reclaim or retire inactive handles before public launch. Captured as a **do-soon-not-convenient** pre-launch task in [`docs/BACKLOG.md`](../BACKLOG.md) under "Operational follow-ups": highest priority is `/r/usemynk` (Reddit auto-archives subs with no activity over a long-enough window — sniped/reclaimed brand subreddits are painful to recover), plus an audit of other secured handles (X, IG, TikTok, YouTube, Bluesky, Threads, GitHub org) + a planned `docs/BRAND-SOCIAL-INVENTORY.md` to track preservation status.

---

## 11. Open follow-ups for next Sarah thread

| Item | Status |
|---|---|
| Q1 continuation (more actions?) | **ANSWERED** (solo mode add) — watch for Sarah adding more (*"if I do I'll let you know"*) |
| Log-the-time clarification | **ANSWERED** (much richer than expected) — **artifact follow-up:** Wyzant + UVU forms |
| Q3 recap reading patterns | **ANSWERED** (devices, billing rails, parent reply behavior, self-acquired gap) |
| Q4 pain point worked around | **STILL PENDING** — never asked |
| Sarah-drives-tutor-side follow-up | **NEW** — methodology; schedule session where Sarah drives tutor side end-to-end |
| Wyzant + UVU forms | **NEW** — Sarah will share screenshots / templates / fields; informs session-log + reporting design |

---

## 12. Maintenance

- **Append only while the call is ongoing.** Don't edit prior
  verbatim sections.
- **Verbatim quotes stay verbatim.** Don't normalize Sarah's casing,
  punctuation, typos, or spacing. Her actual words are the signal.
- **Screenshots stay in `assets/sarah-pilot-feedback-2026-05-26/`.**
  Don't move or rename without updating references.
- **Final pass:** once Andrew confirms the call is done, dispatch
  Composer 2.5 for a polish + cross-link sweep, then commit + push
  on a branch like `pilot/sarah-feedback-2026-05-26`.

---

## Changelog

- **2026-05-27 ~12:17 AM MT:** Late-night follow-up thread landed
  (11:43 PM–12:17 AM). Q1 continuation (solo mode), log-the-time
  (reclassified), Q3 parent recap patterns, strategic reframe (wedge =
  whiteboard + live recording), brand awareness. § 8–11 added.
  Methodology caveat (student-side observation) added.
- **2026-05-26 ~11:17 PM MT:** Initial capture during live call.
  Q1 first answer + Q2 scheduling answer + Wyzant reference image
  captured. Smoke writeup pending. More content slots created.
