# Tyson packet fixes — executor briefing

> **Recommended model: Grok 4.7** (bug-fix burndown on a known branch). Hands work stays on Grok. Send each batch to a separate Sonnet review (`claude-sonnet-5-5-high`, read-only) before calling it done. Two items are fragile: the camera report, and the end-session wait. Plan those before editing. A second failed fix on the same cause stops. Do not use Composer fast.
>
> **This file is your complete task briefing.** If you're seeing it because Andrew pasted its contents or `@`-referenced it at the start of a fresh chat, your instructions are below. Start by reading the files in "Read first," then proceed in the order given. No further confirmation needed.

## Workspace and branch

Repo: tutoring-notes. Checkout **`feat/org-qol`**. Product code under the docs tip is `9be6546f`. Push only `origin feat/org-qol`.

Do not commit on `sec/audit-pipeline`. Do not merge to `master`. Do not touch production Neon. Do not seed Sarah's or Tyson's emails. Ignore worktrees `tn-org` and `tn-qol-hydrate`. Preview stays [preview.usemynk.com](https://preview.usemynk.com), which tracks this branch.

If `git switch` is blocked by uncommitted work, stop. Do not `git restore`, `reset --hard`, or `stash drop`.

Do not ask Tyson to retest until every item below is implemented, tested, and the in-repo packet matches the new behavior. Do not edit the Google Doc. Andrew updates that book himself when he says go.

## Read first

- [`AGENTS.md`](../../AGENTS.md) — branch, tests, model, commit rules
- [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) — head only
- [`docs/handoff/ORG-QOL-TYSON-TEST-PACKET.md`](ORG-QOL-TYSON-TEST-PACKET.md) — items 5, 6, 7, 10, 11, 13
- [`.cursor/rules/playwright-on-fix.mdc`](../../.cursor/rules/playwright-on-fix.mdc)
- [`.cursor/rules/exhaustive-testing-mandate.mdc`](../../.cursor/rules/exhaustive-testing-mandate.mdc)

A Tyson note belongs to the test item it was written under. Do not apply a note to a different surface.

## How to work

Fix in the order below. One commit per item, pushed to `origin feat/org-qol`. PowerShell commit messages go through `.git/COMMIT_MSG_DRAFT.txt` as UTF-8 with no BOM, then `git commit -F`.

Each user-visible fix gets a test that fails on the old behavior and passes after. Playwright for join buttons, scheduling, and pages. Jest for a pure rule. A Sonnet review follows each item before the next one starts. `npx next build` when the change touches a page or a server action.

Update the matching section of `docs/handoff/ORG-QOL-TYSON-TEST-PACKET.md` in the same commit when the steps or the expected sentence change. Leave Tyson's checkboxes empty.

## 1. Display name — packet item 13

Tyson can set a display name for a self-learner and cannot find that card for a child learner. After a name is saved, it cannot be edited. Andrew: a display name is always editable, for both kinds of learner.

The one-time card is `src/app/claim/[token]/setup/DisplayNameSetupForm.tsx`. The child setup path must show the same card the self-learner sees, with the child prompt already specified in item 13 ("How do you want your child to be seen by this tutor?"). After save, the parent (and the self-learner, for their own name) can open that name again and change it. The 80-character cap stays. The tutor roster shows the saved name.

Done when a child claim shows the card, a saved name can be changed later, and the roster updates. Playwright or a jsdom test covers both the first save and a second save with a different name.

## 2. Schedule a child who has no login

Tyson: the tutor cannot schedule a child who does not have their own login. Andrew: that is not intentional. A tutor can schedule a child learner with no username and no PIN.

Find the gate that refuses scheduling in that case and remove it. Do not require the parent to create a PIN first. Joining that session still follows the parent-joins-for-the-child path that already works (item 7). Add a test that creates a schedule for a child with no login and gets a success, and that a child who has a login still schedules as before.

## 3. No active join when the session is not valid — packet item 5, plus the tutor

Packet item 5 currently tells the parent to press Join and then read "This session is not available to join right now." Andrew's rule replaces that: if consent blocks the tutor from starting, the parent and the student also have no active join control. In general, when the session is not valid, neither the tutor nor the student side has an active join link.

"Active" means the control can be pressed and enters a room. A valid in-window session with consent still joins. Item 4 (too early) stays as it is. Update item 5's Action and Expect so they describe an inactive control, not a press-then-refuse. Cover the tutor control and the parent or student control. The existing Playwright title is `Parent Join shows refusal when live session consent is off` in `tests/integration/wb-org-qol-bridge.spec.ts`. Change it to the new rule and show it red on the old pressable button.

## 4. Packet item 7, step 2 — the missing notice

Tyson never saw "Live sessions need the child's own login (for now)." The correct parent, with the join link, reaches the waiting room. A different parent does not. He wants to know whether step 2 is moot.

It is moot. That sentence was removed on purpose. `src/__tests__/account/ParentJoinGapCallout.dom.test.tsx` asserts the old sentence is absent. The callout now says the parent can join for the child and does not need the PIN (`src/components/account/ParentJoinGapCallout.tsx`). Do not put the old sentence back.

Rewrite item 7 so step 2 no longer asks anyone to find that sentence. Keep the Expect: the right parent reaches the waiting room; the other parent does not. While you are there, `src/lib/known-issues-roadmap-content.ts` still tells a reader the parent cannot open the session without the child's login. If that text is shown to users, replace it with the current rule. If it is not shown, leave it and say so in the report.

## 5. Packet item 10 — which refusal sentence

Tyson, on an unapproved tutor, only ever saw "Your account is pending approval." He never reached "Your account is not approved to add learners yet." He passed the item because adding a learner is blocked. He wants the steps that produce the second sentence, if those steps exist.

The pending page is `src/app/admin/pending-approval/page.tsx`. The add-learner sentence is returned by `src/app/admin/students/actions.ts` and locked by `src/__tests__/identity/create-student-gate.integration.test.ts`.

Trace what an unapproved signup actually hits. If the site never lets that tutor open the add form, the packet Expect is the wrong sentence. Change item 10 to the pending-approval sentence and write the real steps. Keep the server refusal so a direct action still cannot create a learner. If there is a signed-in path that opens Students without the pending page, that path must show the add-learner sentence, and the packet must say how to get there. Do not weaken the block.

## 6. Packet item 11 — where the cap message lives

The packet says claim links are on Account & sharing, not on the main student page. Tyson sees the same cap message on both. He wants to know which is correct.

The packet is the rule: one place, Account & sharing. If the student detail page also has Create claim link, remove that control from the student page. A status line with no second button can stay. Update item 11 only if the steps change. The cap of three pending links stays.

## 7. Camera missing on the tutor side — found under packet item 6

Not reliably reproduced. Tyson joined with the link and no `#k=`. Sometimes the student saw their own camera and the tutor did not see the student's camera.

Treat this as an investigation first. Read [`docs/LIVE-AV.md`](../LIVE-AV.md) before touching `peer-mesh.ts`, `useLiveAV.ts`, or `mic-recorder-audio.ts`. Do not rewrite the mesh. Try to reproduce on the no-key join path. If you cannot reproduce it, write that down, do not ship a speculative change, and leave the item open. If you can reproduce it, fix the smallest cause and add a Playwright test that fails before the fix. A second failed fix on the same cause stops. Escalate that note instead of attempting a third.

## 8. End-session wait

Andrew: finalizing a session takes too long, especially when another student is waiting. The tutor should be able to leave and open the next session while finalize continues in the background. The goal is notes within seconds of the session ending.

This is the fragile one. Read [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) before any edit to `lifecycle-machine.ts`, `upload-outbox.ts`, or `endWhiteboardSession`. Plan the approach and the tradeoff before changing those files. The tutor's next action must not sit on the long wait. Do not drop audio, notes, or the upload. Do not claim "notes within seconds" unless a test or a measured local run shows the note appearing that fast. If the only way to hit that goal rewrites the recorder state machine, stop and write the plan for a higher-tier review instead of editing the machine.

The long End wait is already called out as a Playwright gap in the state doc. A new test has to lock whatever behavior you actually change (the tutor can start the next flow while finalize is still running). A test that only checks a timer you invented does not count.

## Stop

- Do not merge.
- Do not ask Tyson to run the book.
- Do not edit the Google Doc.
- Do not start Strix, Shannon, or a security scan.
- Do not downgrade Prisma or Excalidraw.
- Second failed fix on the same bug: stop that item and record it in [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md).

## Report back

For each item: what changed, the test that went red then green, and the commit. For item 7 (the camera), say whether it reproduced. For the end-session wait, say what the tutor can do during finalize and how fast the note appeared in the test you ran.
