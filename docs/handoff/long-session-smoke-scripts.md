# Long-session field-coverage smoke — scripts & procedure

> **Purpose:** One **~90 minute** stitched recording proves (1) large upload on paid Preview and (2) Whisper + `generateSessionNote` retain content from the **beginning, middle, and end** of the file — the classic long-form failure where only the opening minutes make it into the note.

**Stitcher:** `scripts/make-test-session.cjs`  
**Companion:** `scripts/make-test-audio.cjs` (synthetic short clips for stitcher sanity checks only)  
**Canonical transcribe smoke:** [`docs/SMOKE-LONG-FORM-TRANSCRIBE.md`](../SMOKE-LONG-FORM-TRANSCRIBE.md)

---

## AI fields under test (authoritative)

From `src/lib/ai.ts` (`generateSessionNote`, prompt v7) → `AiAssistPanel` → `NewNoteForm`:

| JSON / code key | UI label | DB column |
|-----------------|----------|-----------|
| `topics` | Topics covered | `topics` |
| `homework` | Homework | `homework` |
| `assessment` | Assessment | `assessment` |
| `plan` | Plan | `nextSteps` |
| `links` | Links | `linksJson` (one URL per line in form) |

There are **five** structured fields only (no separate summary, mood, engagement, or parent-note fields). `MAX_INPUT_TOKENS` = 30_000 (~2.5 h of speech) — this smoke targets **region retention** inside a 90 min file, not the token ceiling.

**Pass criterion:** After **Transcribe & generate**, every row in the coverage table below is **non-empty** in the note form. An empty field means that clip’s region was likely dropped or never reached the model.

---

## Coverage table

Record **five** separate clips (`clip1.m4a` … `clip5.m4a`). Stitch order is fixed: clip1 → … → clip5.

| Script | Clip file | Timestamp region | Note field(s) | Distinctive phrase to grep mentally |
|--------|-----------|------------------|---------------|-------------------------------------|
| 1 | `clip1.m4a` | **Start** (~0:00) | `topics` | “quadratic formula”, “factoring with leading coefficient” |
| 2 | `clip2.m4a` | Early middle | `homework` | “twelve problems from section eight point four” |
| 3 | `clip3.m4a` | Mid session | `assessment` | “almost on completing the square”, “got it on graphing” |
| 4 | `clip4.m4a` | Late middle | `plan` | “systems of equations next Tuesday” |
| 5 | `clip5.m4a` | **End** (~89:xx) | `links` | “khan academy slash math slash algebra” |

---

## Recording instructions

1. **One clip per script** — read each script below as its own take (~30–45 seconds). Do not read the table aloud.
2. Save as **`clip1.m4a` … `clip5.m4a`** (or `.webm` if you prefer; match `--format` when stitching). Same fake student throughout: **Maya**, 9th grade algebra.
3. Quiet room, normal tutoring pace. Clips are **reusable** — record once, re-stitch anytime.
4. **Cost:** Only the **~$0.60 Preview transcribe** (Whisper + notes) recurs per full smoke. Re-stitching with `make-test-session.cjs` is free local ffmpeg.

---

## Read-aloud scripts

**Student:** Maya (9th grade). **Topic:** Quadratic equations.

### Script 1 — Topics covered (clip1, session start)

> Okay, quick recap for Maya’s parent. Today we worked through the quadratic formula and practiced factoring when the leading coefficient isn’t one. We also graphed a few parabolas and talked about what the vertex means in a word problem about a ball being tossed. That was the bulk of the hour.

### Script 2 — Homework (clip2)

> For homework before our next meeting, Maya should finish twelve problems from section eight point four — the factoring set, odd numbers only. If she gets stuck on any with a leading coefficient other than one, she should write down where she stopped so we can start there.

### Script 3 — Assessment (clip3)

> On assessment: she’s still wrestling with completing the square — I had to say “almost” a couple of times when she mixed up half of b squared. But when we shifted to graphing, she got it — I heard “yes, that’s the vertex” without prompting. Factoring with a negative leading term is shaky; positives she’s comfortable with.

### Script 4 — Plan (clip4)

> Plan for next time: we’re moving to systems of equations next Tuesday, two-variable elimination first, then we’ll revisit completing the square if her homework shows she’s still stuck.

### Script 5 — Links (clip5, session end)

> One link for Maya: Khan Academy slash math slash algebra — the quadratic formula video, about twelve minutes. I’ll text her the exact URL; parents can search that title if needed.

---

## Stitch → upload → verify

### 1. Stitch (local)

```bash
# From repo root; clips in ./smoke-clips/ or comma-separated
node scripts/make-test-session.cjs --clips ./smoke-clips --minutes 90 --out ./test-session-90min.m4a
```

Optional 50 min rollover segments (Sarah-shaped upload):

```bash
node scripts/make-test-session.cjs --clips ./smoke-clips --minutes 90 --split
```

The script prints a **TIMELINE** — confirm clip1 at `0:00`, clip5 near the end, middles spaced in between.

**Filler:** silence between clips (see script header comment). Long silent gaps may be trimmed by Whisper; that does not fail the smoke if all **spoken** clips survive in the note fields.

### 2. Upload (paid Preview)

Follow [`docs/SMOKE-LONG-FORM-TRANSCRIBE.md`](../SMOKE-LONG-FORM-TRANSCRIBE.md) pre-conditions (Vercel Pro, Blob, OpenAI key).

1. Log in → `/admin/students/<testStudentId>`.
2. **Upload** tab → upload `test-session-90min.m4a` (or both split parts if using `--split`).
3. Confirm upload completes — **no 413**, file size roughly **~50–55 MB** at 90 min / 80 kbps (~0.6 MB/min).

### 3. Transcribe & generate

1. **Transcribe & generate notes** on the pending batch.
2. Wait for completion inside the 300s Server Action budget (Tier 1).
3. Open each note field and check against the **coverage table** above.

### 4. Record results

| Check | Pass? |
|-------|-------|
| Upload landed (no 413 / client abort) | |
| Transcribe finished (no timeout error) | |
| Topics covered populated (Script 1) | |
| Homework populated (Script 2) | |
| Assessment populated (Script 3) | |
| Plan populated (Script 4) | |
| Links populated (Script 5) | |

**Fail triage:** One empty field → note which script/region; check Vercel logs (`rid=`) for truncation vs Whisper skip vs AI empty-string rules in `src/lib/ai.ts`.

---

## Cost discipline

- Full smoke ≈ **one long Whisper job + one gpt-4o-mini notes call** on Preview (~$0.60 order of magnitude).
- Run **sparingly** — after infra changes, before declaring long-form fixed, or when validating a transcript-pipeline change.
- Local stitcher proof (`--minutes 2`) is free; do not upload the 2-minute file for AI verification unless debugging the stitcher itself.

---

## Local stitcher sanity check (short run)

```bash
mkdir -p .tmp/smoke-clips
node scripts/make-test-audio.cjs --minutes 0.03 --out .tmp/smoke-clips/clip1.m4a
node scripts/make-test-audio.cjs --minutes 0.03 --out .tmp/smoke-clips/clip2.m4a
node scripts/make-test-audio.cjs --minutes 0.03 --out .tmp/smoke-clips/clip3.m4a
node scripts/make-test-session.cjs --clips .tmp/smoke-clips --minutes 2 --out .tmp/test-session-2min.m4a
```

Expect timeline: three short clips at start, middle, and ~2:00 minus last clip duration; silence between. **Do not** commit `.tmp/` outputs.
