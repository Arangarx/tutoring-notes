# Dedupe eyeball list — Wave A + Wave B

Lightweight Andrew eyeball tracker after agent executor→verifier→merge passes land. **Not** a full smokebook — quick visual sanity on consolidated surfaces.

**Branch:** `master` @ _(tip at run time)_  
**Preview:** _(fill from Vercel `branchAlias` when running)_

---

## Wave A (merged — still needs eyeball)

Run each in **light** and **dark** unless noted.

### ErrorStateCard

- [ ] `/` — force error surface (bad URL / throw if needed)
- [ ] `/` — not-found
- [ ] `/admin` — error
- [ ] `/admin` — not-found

### LegalDocumentShell

Shell chrome only — legal bodies unchanged.

- [ ] `/privacy` — light
- [ ] `/privacy` — dark
- [ ] `/terms` — light
- [ ] `/terms` — dark

### Admin nav

`AdminNav` + `AdminSidebarNav` — link set still correct (active states, all links).

- [ ] Desktop / wide — active states + full link set
- [ ] Narrow / mobile drawer — same link set + active states

### formatDurationMs

Spot-check WB replay / workspace duration strings look normal (byte-identical expected — quick glance).

- [ ] Replay duration display
- [ ] Workspace / in-session duration display

---

## Wave B (as items land — leave unchecked)

### SectionCard realms

Admin pages using `AdminSectionCard` + account pages using `AccountSectionCard` — cards look identical to before **per realm**.

- [ ] Admin realm — representative pages
- [ ] Account realm — representative pages

### PageShell / AppHeader _(if in wave)_

Admin / account / student / share shells.

- [ ] Admin shell
- [ ] Account shell
- [ ] Student shell _(if touched)_
- [ ] Share shell _(if touched)_

### SubNav

Settings + account child nav.

- [ ] Settings sub-nav
- [ ] Account child nav

### consent-write

No UI — **agent gates only; Andrew eyeball N/A** unless consent flow smoke.

- [ ] N/A — agent gates

### blob / share proxy

No UI — **agent gates**; optional share-link asset load smoke.

- [ ] N/A — agent gates _(optional: share-link asset load)_

### Kill `/api/upload/audio`

No UI if callers migrated — **agent gates**.

- [ ] N/A — agent gates

---

## tokens.css dark-palette _(after theme-plumbing branch)_

Same surfaces **light / dark / system** (system = OS prefers-dark with resolved `data-theme`).

- [ ] Login — light / dark / system
- [ ] Admin home — light / dark / system
- [ ] Privacy shell — light / dark / system

---

## Overall

- [ ] PASS
- [ ] FAIL
