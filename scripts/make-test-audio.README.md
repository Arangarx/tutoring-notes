# make-test-audio

Node helper to fabricate **long test audio** for [long-form transcribe smokes](../docs/SMOKE-LONG-FORM-TRANSCRIBE.md) without recording 60–90 minutes by hand.

**Script:** `scripts/make-test-audio.cjs`  
**Dependency:** `ffmpeg-static` (resolved via `require("ffmpeg-static")`).

## Where output goes

By default files are written to the **current working directory** (usually repo root):

- `test-audio-90min.m4a` — single file
- With `--split`: also `test-audio-90min-part1-50min.m4a` and `test-audio-90min-part2-remainder.m4a`

Use `--out <path>` to override. **Do not commit** large generated files.

## Recommended workflows

### (a) Loop a 2–3 minute speech clip to 90 minutes (m4a)

Matches iPhone Safari `audio/mp4` AAC capture; best for Whisper / transcript smokes.

```bash
node scripts/make-test-audio.cjs --minutes 90 --source ./my-voice-memo-3min.m4a
```

Optional multi-segment Upload tab exercise (~50 min + remainder):

```bash
node scripts/make-test-audio.cjs --minutes 72 --source ./my-voice-memo-3min.m4a --split
```

### (b) Synthetic 90 minutes (upload / timeout only)

No microphone; **not** reliable for transcript-quality or true Whisper timing.

```bash
node scripts/make-test-audio.cjs --minutes 90
```

Desktop-Chrome-like opus:

```bash
node scripts/make-test-audio.cjs --minutes 90 --format webm
```

## Feeding the app (Upload tab smoke)

1. Deploy or use Preview with Tier 1 transcribe (`docs/SMOKE-LONG-FORM-TRANSCRIBE.md`).
2. Log in → `/admin/students/<studentId>`.
3. **Upload** tab → upload the generated file(s). With `--split`, upload **both** segments so the pending list mirrors Sarah’s 50:01 + 20:13 shape.
4. **Transcribe & generate notes** on the full pending batch.

## Sanity checks

The script prints duration, size (MB), and MB/min. Anchor: **~0.6 MB/min** at 80 kbps AAC (~17.9 MB / ~30 min in pilot).

## Quick local proof (short run)

```bash
node scripts/make-test-audio.cjs --minutes 1 --out ./tmp-1min-synth.m4a
node scripts/make-test-audio.cjs --minutes 1 --source ./tmp-1min-synth.m4a --out ./tmp-1min-looped.m4a
```
