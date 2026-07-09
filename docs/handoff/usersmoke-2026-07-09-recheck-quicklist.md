# Recheck quicklist — Andrew, 2026-07-09 afternoon

**Branch:** `v1-redesign`  
**Tip:** [`29b01d7`](https://github.com/Arangarx/tutoring-notes/commit/29b01d7c) (includes E4 PDF bleed)  
**Preview:** [v1-redesign](https://tutoring-notes-git-v1-redesign-arangarx-5209s-projects.vercel.app) *(wait for READY after E4 merge)*

Scannable “what’s left for your eyes.” Full triage: `[usersmoke-2026-07-08-problem-quicklist.md](usersmoke-2026-07-08-problem-quicklist.md)`.

Legend: `- [ ]` not yet / `- [x]` done · **Must** = overnight merges you likely haven’t smoked · **Optional** = early-night greens you said you already verified · **Still open** = not fixed yet (expect fail / skip)

---



## A. Optional — early-night greens (skip if you’re sure)

You believed these were already verified. Spot-check only if in doubt:

- [x] Dark-mode billing `<select>` options readable (`ca19c16`)
- [x] Known-issues page: categorized “Recently improved” sections (`bb81cbd`) — *headers still feel muted; polish later*
- [x] Phone landscape: left-rail **⋮ More** visible / tappable (`e771e4b`)
- [x] Phone: no “Hold Alt…” / Escape-Enter hints; multipoint shows floating **Done** (`90762a9`)
- [x] Phone landscape: **Sign out** in ⋯ overflow, not between sync/⋮ (`90762a9`) — *last-row dimming still noted in intake*
- [x] Phone styles sheet: “More styles” fully visible, not half-clipped (`90762a9`)
- [ ] Stroke bleed blank Board 3 (`9c36cb1`) — still worth a quick check
- [x] **Stroke bleed after PDF** — FAIL then fixed same day: Board 3→4. Merged `29b01d7` / E4. **Recheck on tip:** draw on Board 3 → import PDF → Board 4 must stay clean (round-trip Board 3↔4). Preview rebuilds after push.
- [ ] Share wall: logged-out `/s/…` → login; entitled parent still sees notes (`561d7a9`)

---



## B. Must recheck — merged overnight, not yet smoked by you



### Integrity / Sarah path

1. **Cancel strands student**
  Tutor Cancel in waiting room → student sees clear “canceled” copy and can leave (not stuck forever).
2. **Cancel → fresh join link**
  Cancel A → Start new B → Copy link is `/join/{B}` (not deleted A). Prefer: don’t use Back into the old workspace.
3. **Pending-erasure tutor gate**
  Student in erasure grace: detail page is blocked shell (no notes / share / upload / start) — banner matches reality.
4. **View whiteboard → new replay**
  From tutor notes **and** parent share: lands on **new** in-frame replay (board tabs + scrubber), not legacy tiny board + old range input.
5. **Claim: Set up later + escape**
  After consent: “Set up later” visible (no forced child login). If learner already has a login: dashboard / Continue escape without manual reload.
6. **Finish review**
  Save stays in review (chip OK). Explicit **Finish review** → student detail.
7. **Privacy / terms honesty (interim)**
  Product `/privacy` + `/terms`: no hard “24 months after closure” promise; wording matches what we actually do. (Umbrella mortensenapps.com may still differ.)
8. **Notes quality (prompt)**
  Run one real-ish session → notes: Plan/next-steps not doubled; Assessment grounded (not inventing strengths).



### UX bundle (same tip)

1. **Wordmark → marketing**
  Logged-in tutor: click wordmark → `/?view=home` marketing hero (not bounce-only to `/admin`).
2. **Billing round-up + label**
  End-session / billing: default rounding **up**; copy reads as **tutor’s billable time** (not “we bill you”).
3. **Known-issues header weight** (if you care this pass)
  Section headers should read stronger than bullets — *may still be soft; intake item*.

---



## C. Still open — do **not** expect fixed (note if still broken)

Skip or mark “still broken / known” — agents haven’t shipped these yet:


| Area               | What’s still open                                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replay polish      | Multi-part banner still there; pause→hide→reopen restarts at 0; scrubber “audio loading” layout jump; Theme intermittent nav; disabled top-bar buttons not dimmed; PDF icons missing on replay tabs |
| Nav / layout       | Start/end “flash reload” feel; double admin scrollbars; Known-issues still under Settings; claim-link buried; parent Manage alignment                                                               |
| Claim interstitial | Logged-in parent AuthGate vs “signed in as…” — **first verify email claim URL host vs preview host** before treating as product bug                                                                 |
| Audio              | Wrong student mic after cancel→rejoin (SMOKE-AUDIO-3); first-acquire meter dead (AUDIO-1); phantom unmute watch (AUDIO-2)                                                                           |
| Perf               | “Finalizing” slow feel (PERF-1) — queued, not shipped                                                                                                                                               |
| Intake polish      | Sign-out dimmed in overflow; PDF hard to find in More; top-bar compaction aggressive; password show/hide                                                                                            |


**Replay active board tab during scrub:** product was already OK on hardware; gate was a **test oracle** fix. No need to re-prove unless something looks wrong.

---



## D. One-pass suggested order (~20–30 min)

1. Share wall (logged-out + entitled)
2. Erasure-blocked student detail
3. Cancel + student exit + new copy-link
4. Short live → End → Save stays / Finish review / billable time label
5. View whiteboard (tutor note + parent share) → new replay
6. Wordmark → marketing
7. Claim setup later / already-has-login escape (if you have a fixture)
8. Privacy/terms skim
9. Optional: notes quality on a throwaway session

---



## Notes (Andrew)

*Leave blank until you run.*