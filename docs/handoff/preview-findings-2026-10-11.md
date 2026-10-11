# Preview findings — 2026-10-11 (Andrew)

Andrew showed the deployed preview to his brother. The student was on an **iPhone**. Build seen: most likely `feat/org-qol` @ `0dfcdec1` (stage 2 staff UI plus its state line). It did not include stage 3 (`99ae4b93`) or the ad-hoc session list (`9f3c73e7`). Reproduce on `0dfcdec1` or confirm the finding still holds at the current tip before calling it fixed or not. Notes are in Andrew's words, then a short restatement. Each item stays open until a named test (Playwright for UI, session, sync, replay, and layout) is red before the fix and green after. **Do not mark any item fixed on green Jest alone.**

Andrew's worry behind this list: agents are assuming things are done that are not. Treat "it was fixed before" as unverified until a test proves it on the current tip.

## A. Child learner has no dashboard

> Child learners who log in have absolutely no dashboard at all right now. They can't change their pin themselves, I don't know yet if they can see upcoming sessions, they cant make their privacy toggles MORE restrictive (because they can't get to their privacy toggles at all.

- A child who signs in with the family login has no home page.
- They cannot change their own PIN.
- Unknown whether they see upcoming sessions. Audit, do not assume.
- They cannot reach privacy switches, so they cannot make them more restrictive than the parent's.

**Audit, 2026-10-11 ([Audit child learner pages](cc8bf1d4-3a8b-4bdf-86e5-140fe16fa693), code at `14f4c740`):**

| Capability | Built |
|---|---|
| Child sign-in (`username@familyid` + PIN) | Yes |
| Child home / dashboard | No. Login lands on `/join` (greeting, "no active session" copy, sign out). |
| Upcoming sessions | Partial. `/join` shows `UpcomingSessionsCard` with Join, but the card is hidden when the list is empty, so a child with nothing booked sees no section at all. |
| Change own PIN | No. `ChangePinForm` and `PATCH /api/learner-profiles/[id]/credentials` are parent (account holder) only. |
| Reach privacy switches | No. `/account/children/[id]/consent` is parent only. |
| Make consent stricter only | No child writer. `ConsentRestriction` exists (schema only, backlog `[P3][CONSENT] Child-facing ConsentRestriction UI`). The parent upsert has no stricter-only check. |
| Sign out | Yes. |
| Past notes / replay | No list. Only reachable with a share link the child already has. |

Earlier design (`docs/handoff/org-qol-opus-design.md` Wave B item 3) called `/join` "the learner dashboard" and only promised upcoming sessions there. Nothing promised a PIN change, privacy switches, or past notes for a child.

**Andrew decided, 2026-10-11:**

- The child home lists their own past session notes and replays.
- When nothing is booked, the child sees an Upcoming sessions section that says nothing is scheduled. It is not hidden.
- PIN change: open. Andrew asked what the argument against it is. Recommendation given: let the child change it after entering the current PIN; the parent can still reset it.
- Privacy switches: open. Andrew leans toward all four, but asked whether a parent simply overrides a minor's preference.

## B. Consent wording

> For those two lines: I don't think parents and children are going to know what to do with "recorded". We should say more along the lines that consent has not been given yet. You can't join a session till you consent to it in settings -> blah blah. etc

Applies to the two new self-learner decline sentences (stage 3) and any similar "recorded" wording shown to parents or children. Say that consent has not been given yet, and name the real place in Settings where they give it.

## C. Preview, whiteboard and session (student on iPhone)

1. **Locked view.** "The student view being locked to tutor probably needs some sort of visual indicator that they're locked. Also, on the phone when their view is locked they can still sometimes move and zoom and it snaps back. That was supposed to be fixed so that students locked to the tutor view can't even attempt to zoom or pan."
2. **Viewport indicator while panning.** "When I'm panning or zooming the update of the other person's view should probably freeze till I stopped. It also needs to stay in the same position, not move with the whiteboard like a drawing. Otherwise what happens is I try to pan something into their view and their viewport indicator pans with everything else so I can't tell what will actually be in their viewport when I'm done panning or zooming."
3. **Viewport bounds wrong.** "It seems to be getting the position and zoom mostly correct, but not the actual bounds. i.e. what he could see on his phone was not accurately represented on the tutor side."
4. **Hint placement.** "Hints should place relative to the bottom of the visible whiteboard. Right now if the bottom bar is small it is 'hovering' over the whiteboard, but it still covers the bottom again like when the student opens the styles menu."
5. **Shortcuts window.** "I like what the hints look like on the desktop, and I love the shortcuts button, but the shortcuts window needs to close when you click away."
6. **Multiboard.** "Multiboard is not as smooth as it should be. The other person's view does not show up fast enough if it shows up at all. We might want to add some sort of coordinate system or an indicator where 'center' is at some point as well." (The coordinate system or center marker is a suggestion, not yet a decided feature.)
7. **Graph point/draw offset.** "The point/draw functions are offset from where I actually click with the mouse."
8. **Notes skeleton and slow finalize.** "The blurry skeleton loading overlay thingy is lasting longer than the notes take to fill. The finalizing of the session took a really long time... When the notes did show they were basically already filled and the blurring was just nonsense."
9. **Parent → child → whiteboard 404.** "From the parent dashboard, drilled down into a child learner, their session notes button takes them to a notes screen but their 'go to whiteboard' link 404's. The link from the tutor's share link still works fine."
10. **Multipart warning on replay.** "WHY DOES THE RECORDING STILL HAVE THE LINE UP TOP ABOUT IT BEING MULTIPART???! I've told agents to get rid of this entirely. EVERY REPLAY is a multipart recording before it's put together and by the time it replays it's a single stream of data. Get rid of that stupid warning." **This was already asked for and came back.** Remove the warning entirely, and add a test that fails if it reappears.
11. **Replay does not match the session.** "Either the graph is not in the replay or the replay is NOT syncing to what the tutor was seeing during their session. This is a pretty major failure."

## Triage, 2026-10-11 ([Triage preview findings](80a0ec50-f7e3-4496-b434-f5fcf6aff16b))

All eleven are still in the code. Several earlier "fixes" did not do what was asked, and their tests would stay green on what Andrew saw:

- **1.** Lock is a snap-back after the gesture (`useStudentWhiteboardCanvas`, passive listeners, no `preventDefault` / `touch-action`, no Safari gesture handler). The unit test treats snap-back as success. No WebKit or touch Playwright. On a phone the follow control is inside the overflow menu; there is no on-canvas lock mark.
- **2.** The ghost is the student's scene rectangle reprojected through the tutor's live camera, so it moves with the drawing. No freeze during the tutor's pan.
- **3.** The bounds come from Excalidraw `appState.width/height`, not `visualViewport`, so the iPhone's visible area is wrong. The presence test compares against the same Excalidraw size.
- **4.** Hints are `position: fixed` with pixel `bottom` guesses, not the bottom of the visible board or the styles sheet.
- **5.** The shortcuts panel closes only on a second click of its button.
- **6.** The ghost hides on a page mismatch, and no view message is sent on a board switch (500ms sample plus 200ms debounce).
- **7.** Graph point and draw use JSXGraph `getUsrCoordsOfMouse` inside a transformed embed. The Playwright oracle uses the same function, so it shares the offset.
- **8.** The blur is tied to note status, and content fills in while status is still `generating`. The long wait is outbox drain plus `endWhiteboardSession`.
- **9.** The parent notes page builds `/s/${token}/whiteboard/${id}` with a token that can be empty, and the share page 404s when the token is missing or the session is not ended.
- **10.** The banner `Multi-part recording — timing may drift at part boundaries` is still in `WhiteboardReplayInFrame.tsx`. Concat only collapses two or more tutor mixdowns, so a normal tutor-plus-student session keeps showing it. Earlier work only collapsed the segment list. It never deleted the banner, and no test asserts that the text is absent.
- **11.** Graph state is only in replay if the last recorded element carried `graphStateJson`. The replay camera matches the center in a different-size frame, so the visible region is not the tutor's. One real session log needs a trace before any design.

Fix order: quick, non-fragile 10, 5, 4, 9 first. Fragile 1, 2, 3, 6, 7, 8, 11 get a step-back plan and a Sonnet review before edits.

Open question for Andrew on 6: a center marker or coordinate grid, or only a faster ghost after a board switch.

## Status

Nothing on this list is fixed yet. The consent wording is changed but uncommitted ("Consent has not been given yet. You cannot join a session until you give consent. Open Manage, then Privacy."). Quick fixes 10, 5, 4, 9 are in progress. Fragile surfaces (viewport follow and sync, replay and recording) get a plan-mode step-back and a Sonnet review before any edit.
