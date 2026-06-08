# Smoke runbook — 2026-06-07 merge-ready branches

> Type your results inline in the `**→ Result:**` lines. Check boxes with `[x]`.
> Merge order when all pass: **slice 3 first** (owns the migration lock), then component, then IAC-13.
> Preview links open in your browser. Each branch alias always points to that branch's latest ready deploy.

---

## 1. Recording Slice 3 — auto-notes ✅ ready (fix pushed @ `b7fb120`)

**Branch:** `feat/recording-p1-slice3-autonotes`
**Preview:** [slice-3 preview](https://tutoring-notes-git-feat-recordin-5af9c9-arangarx-5209s-projects.vercel.app) (rebuilding from the fix — give it ~2 min before smoking)

> Fix landed: the notes-pipeline BLOCKER (serverless fire-and-forget killed before completion; no cron on preview to recover) is resolved via Next.js `after()`, so notes complete in-request without depending on cron. Cost panel gated server-side; spinner → skeleton. Allow ~1 min after ending a session for notes to appear.

- [x] Start a session with **2+ audio segments**, end it → land on review page
- [x] Notes appear **automatically within ~5s**, no manual click
  ```
  → Result: Got the notes, already informed you of what it looks like with markdown and no buttons except the regenerate notes.
  ```
- [x] Loading shows a **skeleton/blurred** state (NOT a spinner)
  ```
  → Result: It loaded fast enough that I couldn't see if there was one, but there was no spinner that I could see.
  ```
- [x] Manual "Transcribe and generate notes" button is **gone**
  ```
  → Result: pass
  ```
- [ ] Deliberately fail/short a chunk → **partial badge** appears, notes still render
  ```
  → Result:
  ```
- [x] **Regenerate notes** works (doesn't hit the 5-min defeat on a healthy session)
  ```
  → Result: Pass...but pass 1 was very different from pass 2.  Pass 1 filled everything in with more verbose language like "No academic questions were posed during this session." instead of "None" in pass 2.  But also...These sections are completely different from the notes form, did the prompt change?
  ```
- [x] As a **normal (non-test) tutor**, the **Session cost panel is NOT visible**
  ```
  → Result: I think pass, but this pointed out a flaw with the current design we need to make sure makes it into the final re-desgin.  I have no easy way to see who I am at a glance.  There's no page indication of who I'm logged in as.  This is not a fix now, this is a make sure it gets in in the re-design note.
  ```
- [x] As **ADMIN (you), impersonating, or a test account**, the cost panel **is** visible and shows **non-zero** estimates (whisper min > 0, notes tokens > 0)
  ```
  → Result: Well it lists tokens.  And...I don't know if the estimates are still actual 0 and wrong or we're not showing enough precision.
  ```
- [x] `/admin/cost` shows notes-generation cost events for the session
  ```
  → Result: Hard to say, there's no list of n most recents or anything.
  ```

**Overall slice 3:**  ☐ PASS  ☐ FAIL
→ Notes:

---

## 2. Component Chunk 1 — Settings/operator reskin ✅ ready

**Branch:** `v1-component-spine`
**Preview:** [component-spine preview](https://tutoring-notes-git-v1-component-spine-arangarx-5209s-projects.vercel.app)

- [x] `/admin/settings` — settings nav renders as a **plain bordered list with chevron rows** (NOT a card per item); feels right vs. the approved mock
  ```
  → Result: Is this the standard for settings pages or is a side nav more standard for settings pages?  Also, didn't you say this should be looking like the final re-design, this still just looks like a minor refresh?  This is better than before.  Though the sub pages feel cluttered and hard to parse.  Everything is on the same justification, there's no indention, etc  Have those been touched? How much am I actually smoking here?
  ```
- [x] **Profile** page — profile + change-password forms render cleanly (shadcn inputs); submit works
  ```
  → Result: What are shadcn inputs? If I should be seeing the red/yellow/green bar stuff, I am not.  Password updated successfully.
  ```
- [x] **Email** settings — SMTP form renders; the **Google "Connect Gmail" OAuth notice is preserved** and correctly placed
  ```
  → Result: I'm not sure if the placement is good or not. If I were parsing the page, I'd probably click the button before even glancing at the text underneath that it'll be handled through mortensenapps.com. It should probably be above the button (or possibly IN?)
  ```
- [x] Email page **warning text shows actual amber color** (the `text-warning` token fix — not default/black)
  ```
  → Result: I don't know that I'd call it amber...but it's not black. I'd say more yellow?
  ```
- [x] **2FA** settings page renders correctly
  ```
  → Result: I think so.
  ```
- [x] **Outbox / Feedback / Waitlist** — each renders as a section card with a row list (no nested card-per-row)
  ```
  → Result: Admin doesn't have an outbox. The other two seem to render correctly, but again, have no idea what I'm looking for here.  Everything still looks about the same as before.
  ```
- [x] Overall: dark theme + Mynka colors/fonts consistent with the approved mock; no visual regressions
  ```
  → Result: I guess, there isn't a lot of variety of color use like in the mock, it's all pretty monochrome, but I again I don't know if I'm even looking for re-design yet or just existence.
  ```

**Overall component Chunk 1:**  ☐ PASS  ☐ FAIL
→ Notes:

---

## 3. IAC-13 — connected-parent visibility + scoped disconnect ✅ ready

**Branch:** `iac-13-connected-parent-disconnect`
**Preview:** [iac-13 preview](https://tutoring-notes-git-iac-13-connec-d94feb-arangarx-5209s-projects.vercel.app)

- [x] On a **claimed** student, the **Connected parent** section shows: email, display name, verified status, "connected since" date
  ```
  → Result: If verified status is separate from "connected since" then I don't see anything like that. Other 3 are there.
  ```
- [x] On an **unclaimed** student, no connected-parent section (claim-invite UI shown instead)
  ```
  → Result: pass
  ```
- [x] **Disconnect** control is **confirm-gated**; the copy honestly says it affects **this student only** (not the learner's other tutors)
  ```
  → Result: I'm seriously confused about the copy on the disconnect confirm. Why does it say "This removes the parent's access to Child1 McFamily only."  Oh, you're talking about the student name vs the child learner name.  That's massively confusing terminology, because the tutor probably has no f'ing clue that a "learner" and their "student" are entirely different things.  This makes it sound like you're about to take the parent's access to their child away ;p  Should be something more along the lines of "Disconnect your student record "Child1 McFamily" from Parent McFamily's child account "child1" " I understand the tension here if we're not trying to leak child login name, but...there's gotta be better than what is there now.

  I just realized we let the tutor's student record name the child learner name...this is entirely backwards lol.  It's okay if the tutor wants to name students in their own way, but the parent should be naming the child, lmao
  ```
- [x] After disconnect → student returns to **invitable** state; you can **re-issue a claim invite**
  ```
  → Result: Pass, but as an extension of the note for the previous one, the child learner remains under the parent but named the way the tutor did lmao.

  I just did another claim to test something and it made me log in again, which is probably correct, but it's weird because when I first opened edge today to test the claim, I finished a claim I'd started a day or two ago and it let me finish.
  ```
- [x] (If easy to set up) a 2nd tutor sharing the same learner is **unaffected** by the disconnect *(also covered by automated tests)*
  ```
  → Result: I'll save this for future smoke.
  ```

**Overall IAC-13:**  ☐ PASS  ☐ FAIL
→ Notes:

---

## 4. Slice 3 — notes Save-bridge (NEW build on the slice-3 preview) ✅ ready (B1 fix landing)

**Branch:** `feat/recording-p1-slice3-autonotes` (same preview as §1; smoke the **latest** deploy after the B1 fix rebuilds — ~2 min)
**Preview:** [slice-3 preview](https://tutoring-notes-git-feat-recordin-5af9c9-arangarx-5209s-projects.vercel.app)

> This replaces the raw-markdown notes view from §1. The review page now shows **editable structured fields** (topics / assessment / Plan / links — homework folded into Plan per Sarah) with **Save to notes**, **Cancel and delete session data**, and a guarded **Regenerate**. Auto-notes land as a **DRAFT** `SessionNote` and only become institutional memory on Save.

- [x] End a session → review page shows **editable fields** (topics/assessment/Plan/links), NOT a markdown blob
  ```
  → Result: Shows the editable fields again.  Since there was already a form for this, make sure we don't end up with duplicate forms.  Either the transcription or note accuracy might need a little work.  I explicitly said "my assessment is, you're bad at math" and you can see that it put "understands basic addition, needs reinforcement on addition accuracy"  I don't know what I said that justifies that first part.  The plan/Next steps is basically right.  Topics covered is technically right, but we did go specifically over 1+1

  There wasn't really a "loading" skeleton with blurs, all the info just appeared. So if the blurs should be there I haven't seen them yet.

  Okay...these notes are actually really bad. I did another test for one of the other steps and the notes are just....bad
  ```
- [x] **Save to notes** → the session appears in the student's **notes list** (`/admin/students/[id]/notes`) as a finalized note
  ```
  → Result: Pass, but I just noticed the share page says "Notes shared by Sarah Peterson" is her name hard coded on that page???
  ```
- [x] Before Save, the auto-draft is **NOT visible on the parent share page** (open a share link → draft absent until saved)
  ```
  → Result:pass
  ```
- [x] **Regenerate** is **confirm-gated** and **non-destructive** (declining keeps the current notes; a failed regen does not blank them)
  ```
  → Result:Pass, but I don't like javascript alert() calls, the confirm gate should be part of the site. Was the prompt already changed? I think I got the exact same generation.
  ```
- [x] **Cancel and delete session data** → confirm dialog reads *"Are you sure you want to delete this session and all related data?"* → session + its data are removed
  ```
  → Result:Pass, but again, javascript alerts are super ugly and imo unprofessional. There is a bug, the page stays on the end session screen and never stops saying "Deleting..." Oh, apparently it was a weird timeout, actually got an "An unexpected response..." error message.  Should we even bother the tutor with a failed delete of the session data like this?  Shouldn't we redirect them back to the student detail regardless and let our cleanup crons handle unsaved orphan data?
  ```
- [x] Delete is **denied on an already-saved (finalized) note** (you can't nuke a session whose note is READY/SENT)
  ```
  → Result: I think your understanding is out of date or the site has conflicting systems in place.  There is no more concept of "sending" notes.  The parent has access as soon as the tutor saves it, at least in the current design.
  ```
- [x] **B1 (privacy):** sending a **parent update email** for a session with an **unsaved draft** does NOT email or count the draft (only saved/READY notes go out)
  ```
  → Result: The whole concept of a draft was supposed to be removed. As soon as a tutor saves the notes the parent can see it.  The only system that was supposed to be in place was notes being marked as "new".
  ```

**Local gate (required before merge):** run `npm run test:wb-sync` locally (Docker relay) — `TutorNotesSection.tsx` is whiteboard-surface.
→ `test:wb-sync` result:  ☐ green  ☐ fail

**Overall save-bridge:**  ☐ PASS  ☐ FAIL
→ Notes:

---

## Decision needed (fold before merging IAC-13)

- **IAC-13(c) TTL drop** — reduce `CLAIM_INVITE_TTL_MS` from **7d → 48h** (defense-in-depth; recommended yes)?
→ Your call:  ☐ Yes, fold it in   ☐ No, leave at 7d

---

## After smoke

- Tell me the PASS/FAILs. On pass I'll `merge --no-ff` in order (slice 3 → component → IAC-13) into `v1-redesign`, then dispatch the heavy ORCHESTRATOR-STATE restructure and tee up the now-unblocked migration wave (Phase 3 consent / `StudentDisconnectLog` / cost-durability).
- Any FAIL → I dispatch a fix on that branch and we re-smoke just that one.

