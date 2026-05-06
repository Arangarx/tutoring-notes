---
name: Whiteboard improvement execution
overview: Whiteboard pilot-hardening pass: W2 tutor+student native image sync, W6 sessionStorage + beforeunload, Playwright workspace spec. **Manual smoke still required** (docs/whiteboard-smoke-log.md § Pending).
todos:
  - id: wb-w2-native-image
    content: "W2 — Native image drag/drop/paste: tutor pageDataRef + recorder flush before v3 broadcast (fixes placeholders). Manual smoke: docs/whiteboard-smoke-log.md § Pending manual smoke."
    status: completed
  - id: wb-w6-refresh-truth
    content: "W6 — sessionStorage flush on pagehide, visibility hidden, beforeunload; student native-image page cache sync. Remaining: Excalidraw IndexedDB banner vs app draft — manual smoke."
    status: completed
  - id: wb-playwright-smoke
    content: "Playwright: tests/smoke/whiteboard-workspace.spec.ts (seeded workspace + consent→workspace if BLOB token). Run desktop project; needs webServer DB per playwright.config."
    status: completed
  - id: wb-lockstep-docs
    content: "After a substantive whiteboard change or smoke pass, update in one PR — docs/BACKLOG.md, docs/whiteboard-smoke-log.md, docs/WHITEBOARD-STATUS.md, WHITEBOARD-IMPROVEMENT-PLAN.md § folds."
    status: completed
isProject: false
---

# Whiteboard improvement execution

## Where to work

- **App repo:** `tutoring-notes` (this workspace).
- **Spec / W-items:** [WHITEBOARD-IMPROVEMENT-PLAN.md](./WHITEBOARD-IMPROVEMENT-PLAN.md)
- **Phase status:** [docs/WHITEBOARD-STATUS.md](../../docs/WHITEBOARD-STATUS.md)

## Build workflow

Open this file in Cursor with the **tutoring-notes** folder as the workspace root so **Build** appears on the YAML todos above. If Build does not show, confirm the file is `.cursor/plans/*.plan.md` and the frontmatter includes `todos:` with `id` / `content` / `status`.
