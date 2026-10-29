# Tyson feedback — 2026-10-28 (relayed by Andrew)

Branch: `feat/org-qol` on preview.usemynk.com. Most items passed. Items Tyson has **not** retested yet are unknown — do not assume they still fail.

## Packet items tested today

- **54 — FAIL.** An appointment scheduled by the org scheduler shows on the scheduler's schedule but **not on the actual instructor's schedule**.
- **52 — PARTIAL.** Org scheduler schedules a brand-new student (not in the tutor's list) → the student does **not appear in the tutor's student list** (Andrew: probably same class of bug as 54).
  - Andrew's answer to Tyson: if the student is the same learner the tutor already has, it should be the **same learner** in the tutor's list, with the appointment **flagged as from the organization**. (Andrew asks: flag if this contradicts anything he said before.)
- **55 — SKIPPED** (blocked by 54; couldn't set up).
- **58 — PARTIAL.** Start session is (correctly) unavailable, but there is **no explanation** (e.g. the "privacy preferences are not complete" line). The user isn't told WHY they can't start.
- **60 — PARTIAL.** Notes get saved, but the user has **no View whiteboard button / no way to open the replay**. It shows notes exist for the session but nothing to view.

## Graph

- Very happy with Fit to student view. Trig, log, etc. work now.
- **Calculus:** to pitch universities, graphs must handle calculus functions.
- **Bug:** tutor enters an equation in the expressions box + Enter → graphs. The list of expressions beside the box has red X delete buttons. **They work for the student but NOT for the tutor.**

## Notes / review

- The bottom-left of the session review screen shows the **whole session transcript**. Andrew doesn't recall asking for it to be visible (it did prove useful here).
- **Transcripts are full of hallucinations** (Andrew: looks like silence hallucination — is the silence filter not working anymore?). Tyson's examples:
  - Block 1: what he said is there, plus junk.
  - Block 2: he was whistling, humming, clicking; only real speech was "trigonometric functions work again, finally. The log of x. OK". Rest is junk.

Example 1:

```
you Let's see if the notes are better this time. Actually, I should probably draw something. There we go. Now, zoom, zoom, zoom. Pan, pan, pan. 点击【下方】的【选择】键,然后点击【OK】键,然后点击【OK】键。 I'm not seeing that. Anywhere. 0040 Ä, Ä, ä, ä, ä, … (long run of ä) … ä Thanks for watching! Silence. Exhaling. Silence. Exhaling. Silence. Exhaling. SKIP SKIP SKIP SKIP SKIP ் ব ৑ ��� ব ০ ৉ ᴉ ᴉᴉᴵ ᴸᴬᴵ ᴹᴱᴀᴱᴵᴵlection ᴵ ᴳᴵᴯᴴᴵᴴᴵᴵᴴᴰ ᴴᴸᴱᴴᴵᴵᴴᴵ ᴺᴰᴰᴼᴵᴵᴴᴵᴷᴻᴵ ᴹᴸᴰᴴᴷᴴ ᴵᴵᴴᴵ ᴵᴵᴵ Press Quit. 초록색3, Keep Jaw Barrier 保持左面3emicК candle 保持右面4micK candle 保持右面3emicK candle 保持左面移動 保持右面4micK candle 如果您的電話沒有充電,請先關機。 如果您的電話沒有充電,請先關機。 如果您的電話沒有充電,請先關機。 Draw. Draw. How? That's not even possible! Go to third stroke, and while still holding, click pan. Okay, it worked. Not sure how. Sound of typing on computer screen. Kris hums completely. Thank you. Bye. Bye. 温度の高いレンジのみの温度 LEDs đượcテスト 温度必須 電圧が入る 電圧分崩 peu de boundaries ead 電电微波 Echo flat Flat End session.
```

Example 2:

```
whistling humming clicking clicking Bye. Okay. Okay. Thank you. Bye. Bye. Bye. Bye. Bye. Bye. Bye. 5.5mm 6mm 7mm 8mm 9mm 10mm 11mm 12mm 13mm 14mm 15mm 16mm 17mm 18mm 19mm 20mm trigonometric functions work again, finally. The log of x. OK. 7,7-10 min later... Once again, i will not deselect the setup button... You can go back to Settings and then Uninstall all the apps... Thank you for watching! Thank you. Okay. Okay. Okay. Okay. Okay. Okay. Okay. Okay. Okay. Okay. Okay. Okay. Okay. Bye-bye.
```

## Organization UI

- As anyone who can see the Organization tab (admin, scheduler, …): click away to another tab, then back to Organization → lands on an **organizations list** (screenshot: page title "Organization", subtitle "Members, invitations, and activation for organizations you run.", card "Your organizations" with a plain-text row "DeWitt Tootering / active. Your roles: Owner, Admin." — no button/link styling; saved at `../../.cursor/projects/c-Users-arang-Documents-Andrew-dev-agentic-projects-tutoring-notes/assets/image-e547a091-e69b-4e75-a135-3f58d9d17ae2.png`). The **org names in the list don't look clickable**. Same problem in the **site-admin org list**. Andrew: clickables must be obvious like the rest of the site.
- On first login (any role) you land on your specific org page, but after clicking away you must click your org in the list to get back in. Problems:
  1. If someone owns or belongs to **multiple orgs**, which org detail page do they land on now?
  2. If they were working in a specific org, clicked away and came back, they should **still be in that org**.
- Andrew: if someone CAN be in multiple orgs, it must **always be clear which org they're acting under**, including as they click around. (Tyson says it's pretty clear; if multi-org isn't possible, less of a worry.)
- Andrew: **all the new UI needs an Opus usability pass.** To present to organizations it must just work, cleanly, and flow smoothly.

## Andrew's decisions (2026-10-28 evening)

1. **Transcript hallucination fix ships as a hotfix off master** (like the WB apply-race hotfix), then merges into feat/org-qol. Root cause (agent 406b0769): chunk path treats empty/cliché primary output as a cue to re-transcribe with whisper-1 and stores that hallucination; no `language: "en"`; VAD never discards silent segments. Present on master since June.
2. **Review-screen transcript: keep, but collapsed behind a "Show transcript" toggle** (tutor-only, as now).
3. **Instructors see org-booked appointments on their own Schedule with an organization badge**, plus an Organization tab scoped to just their appointments.
4. **Same person (org learner + tutor's private student): display-only merge** — shown once in the tutor's student list with org appointments badged; records stay separate underneath (single-owner CHECK unchanged). This is a deliberate change from org-learner-design.md §§0, 2.1, 8.
5. **Disabled Start / Open room / Join always show a one-line reason** (reverses packet line ~196 "no line").
6. **Multi-org: remember the last org per account** — but be careful: no clutter, no confusion. Single-org users should never see switcher chrome.
7. **Glossary: "instructor" and "learner" on organization screens; "tutor" and "student" on personal screens.**
9. **Item 60 / privacy switches: HOLD.** Andrew wants to review all privacy options with the orchestrator (next session) before any change. His stated model: "Allow live session" off means no whiteboard session at all, so nothing to record. Questions he raised: when was "Allow whiteboard recording" added (answer: B2 consent schema `1f6fd13c`, 2026-06-11) and does it default off only for children? Prep a one-page privacy-switch summary for that review; do not change replay/consent gating until then.
10. **`log(x)` = calculator default (base 10)**; `ln(x)` stays natural. Backlog: make the default dynamic if the learner's grade/education level is known.
11. **Calculus: backlog as the immediate follow-up to the org work** — "anything college students might need to be tutored on" (derivatives, integrals, piecewise, implicit, parametric/polar, sec/csc, etc.).
8. Org creation when the future owner has no account: longer-term question (Andrew unsure about forcing a tutor account first). Not now.

## Andrew's open questions

1. Can a tutor schedule learners who are **only owned by the organization**? (They shouldn't.)
2. If a tutor privately schedules a learner they had personally before the learner joined the org, that appointment must **not show up for the org**. Is that guaranteed?
3. Does "same learner in the tutor's list, appointment flagged as org" contradict prior decisions?
4. Was transcript visibility on the review screen ever requested? When/why was it added?
5. Is the silence filter broken?

12. **Transcription language (Andrew 2026-10-28):** pinning transcription to English is OK for now, BUT users must be told clearly that transcription currently assumes English (honesty). Not a long-term answer: backlog a per-tutor / per-learner (or per-session) language setting with English default.

    - Notice placement (Andrew): short line next to the recording / audio control in the session (tutor sees it before recording). Ships with the transcript hotfix.
    - Priority (Andrew): language support must be figured out QUICKLY: Spanish at minimum to operate in the US; worldwide needs more. Backlog as near-term high priority: per-learner / per-tutor transcription language setting (English + Spanish first), plus investigate safe auto-detection (auto-detect on silent audio is what produced the foreign-text hallucinations, so detection must be paired with the silence guard).

