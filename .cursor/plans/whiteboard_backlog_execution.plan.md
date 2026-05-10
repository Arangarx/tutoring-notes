---
name: Whiteboard backlog execution (post-W2/W6)
overview: "Phased execution: validate smoke → pilot trust (audio + disconnect pause) → PDF/replay/multipage backlog → maintenance follow-ups. Do not code Phase 2 surfaces until WHITEBOARD-STATUS demo gate clears. Canonical narrative: docs/WHITEBOARD-ROADMAP-NEXT.md."
todos:
  - id: wave0-smoke-w2-w6
    content: "Wave 0 — Run manual smoke (docs/whiteboard-smoke-log.md § Pending): W2 native image tutor+student; W6 fast refresh; Playwright whiteboard spec with reachable DB + optional BLOB. Update BACKLOG rows 15–16 and WHITEBOARD-IMPROVEMENT-PLAN W2/W6 notes with verify date or residual repro."
    status: pending
  - id: wave1-audio-pause-student
    content: "Wave 1 — Recording auto-pause on student disconnect + visible banner (BACKLOG Sarah Apr 24). Thread bothPresent/sync into workspace + recorder pause; resume on reconnect; log marker in event log if missing."
    status: pending
  - id: wave1-whiteboard-audio
    content: "Wave 1 — Whiteboard session audio: mount mic/recorder in WhiteboardWorkspaceClient; SessionRecording + existing upload path; gate with adversarial review (recorder + whiteboard)."
    status: pending
  - id: wave2-pdf-workbook
    content: "Wave 2 — PDF workbook pages + Wyzant-style page range picker (BACKLOG); wire pageList + insert path tutor+student; default zoom-to-fit per page."
    status: pending
  - id: wave2-replay-scrub-multipage
    content: "Wave 2 — Replay scrub without audio + multi-page event log / replay (BACKLOG P2b–P2c); order after or parallel PDF depending on team capacity."
    status: pending
  - id: wave3-maintenance
    content: "Wave 3 — Pick 1: orphan WB session sweep OR CI Excalidraw smoke budget OR cost doc — per WHITEBOARD-STATUS follow-ups when triggers hit."
    status: pending
  - id: gate-phase2-surfaces
    content: "STOP — Phase 2 collab surfaces: no code until WHITEBOARD-STATUS demo gate (3 sessions + PO checklist). Then one surface only per Sarah ask."
    status: pending
isProject: false
---

# Whiteboard backlog execution

**Full prioritization and source citations:** [docs/WHITEBOARD-ROADMAP-NEXT.md](../../docs/WHITEBOARD-ROADMAP-NEXT.md)

Use this file for Cursor **Build** on the YAML todos above. Execute **top to bottom**; **wave0-smoke** should complete before large Wave 1 merges unless explicitly parallelizing.
