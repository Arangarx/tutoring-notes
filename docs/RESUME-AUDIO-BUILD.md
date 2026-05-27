> **SUPERSEDED 2026-05-27.** See [`docs/RECORDER-LIFECYCLE.md`](RECORDER-LIFECYCLE.md) for the current recorder architecture. This file is preserved for archival reference; do not act on it directly. Reason: the audio build shipped; the file itself said "delete this once shipped."

# Resume — Audio session capture build

Paused mid-manual-setup on **2026-04-16** due to unrelated GPU glitch. No code committed yet (working tree was clean at pause).

Plan file (Cursor-local, not in repo): `~/.cursor/plans/audio_session_capture_72c46b5d.plan.md`

---

## Where we left off

**Current step: Step 3 of manual setup walkthrough (`vercel env pull`).**

### Done
- **Step 1 — OpenAI cap bump $5 → $20.** Status: Andrew confirmed in chat (assumed done; double-check at https://platform.openai.com/account/limits if unsure).
- **Step 2 — Vercel Blob store created and connected.** `tutoring-notes-audio` blob store created, connected to `tutoring-notes` project, all three env scopes (Development / Preview / Production) checked, `BLOB` prefix kept (so env var name is `BLOB_READ_WRITE_TOKEN`). The "already connected" message confirmed it landed.

### Mid-progress (pick up here)
- **Step 3 — Pull token to local `.env.local`.** Andrew was running `npx vercel link` when the GPU glitched. The link prompts had not been answered yet.

---

## Resume sequence (do these in order)

### 1. Finish `vercel link`

```powershell
# From agenticPipeline monorepo root, or adjust to your clone path.
cd ..\agentic-projects\tutoring-notes
npx vercel link
```

Answer prompts:
- **Set up …\tutoring-notes?** → `y`
- **Which scope?** → personal account that owns `tutoring-notes`
- **Link to existing project?** → `y`
- **Project name?** → `tutoring-notes`

### 2. Pull env vars

```powershell
npx vercel env pull .env.local
```

This writes `.env.local` with all Vercel-managed env vars including `BLOB_READ_WRITE_TOKEN`. Next.js auto-loads `.env.local` in dev — nothing to copy.

### 3. Verify

Open `.env.local` and confirm `BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."` is present.

### 4. Tell the agent "done, resume audio build"

The agent will pick up at todo `deps-and-env` (install `@vercel/blob`, add env to `src/lib/env.ts`, update `.env.example`).

---

## Build sequence after resume (for context)

Tier-tagged from the plan; agent should switch to **Sonnet** for execution (Opus only needed if a step's complexity changes).

1. `[Sonnet]` deps-and-env — install `@vercel/blob`, add token to env schema
2. `[Sonnet]` recording-schema — Prisma migration: `SessionRecording` table + `SessionNote.recording`/`shareRecordingInEmail`
3. `[Sonnet]` transcribe-lib — `src/lib/transcribe.ts` Whisper wrapper
4. `[Sonnet]` transcribe-tests — unit tests with mocked OpenAI
5. `[Sonnet]` blob-helpers — `src/lib/blob.ts` thin wrapper
6. `[Sonnet]` upload-route — `src/app/api/upload/audio/route.ts` with multi-tenant check
7. `[Sonnet]` transcribe-action — `transcribeAndGenerateAction` + update `createNote`
8. `[Sonnet]` audio-isolation-test — multi-tenant tests for the new actions/route
9. `[Sonnet]` audio-upload-component — `AudioUploadInput.tsx`
10. `[Sonnet]` audio-record-component — `AudioRecordInput.tsx` (MediaRecorder)
11. `[Sonnet]` tabs-and-panel-integration — `AudioInputTabs.tsx`, wire to `AiAssistPanel`
12. `[Sonnet]` form-recording-ui — audio player + share checkbox in `NewNoteForm`
13. `[Sonnet]` share-page-audio — render `<audio>` on parent share page when opt-in true
14. `[Auto]` privacy-and-docs — privacy policy + DEPLOY.md updates
15. `[Sonnet]` playwright-upload-smoke — E2E
16. `[Sonnet]` build-commit-push — `npm run build`, commit, push
17. `[STOP - Andrew]` vercel-env-and-live-smoke — verify Vercel prod has `BLOB_READ_WRITE_TOKEN` (it should, auto-injected at Step 2), then live smoke upload + record + share-with-parent toggle

---

## Decisions locked during setup

- **Blob region:** Vercel default (`iad1`). Sarah is in Utah but Vercel functions also default to `iad1`, so cross-region function↔blob hop would be worse than user↔blob distance.
- **Blob access:** **Private.** Audio of minors / parents must require signed read URLs. Share page (`s/[token]/page.tsx`) generates signed URLs server-side per render.
- **Custom prefix:** kept default `BLOB` so the env var is the standard `BLOB_READ_WRITE_TOKEN` that `@vercel/blob` looks for.

---

## Delete this file

Once the audio build is shipped and live-smoked, delete `RESUME-AUDIO-BUILD.md` — it's only here to bridge the GPU-glitch interruption.
