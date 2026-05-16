# Long-form transcribe smoke fixtures

Synthetic inputs for `scripts/spike-long-form-transcribe-smoke.mjs` (Sarah-session scale).

## `audio-55min-sine.webm`

- **Codec:** Opus in WebM (~64 kb/s mono, 48 kHz).
- **Content:** 440 Hz sine (continuous tone), **55 minutes** (~3300 s).
- **Why sine:** Fast to generate with `ffmpeg`; size lands **above Whisper’s ~25 MB per-request ceiling** so the server-side **ffmpeg split / bisect** path is exercised (see `src/lib/transcribe-ffmpeg.ts`). Transcript quality is not representative of speech — this spike is for **timing / timeouts / split behavior**, not ASR accuracy.
- **Regenerate** (repo root, Windows / macOS / Linux — uses `ffmpeg-static` from devDependencies):

```bash
node_modules/ffmpeg-static/ffmpeg -y -f lavfi -i "sine=frequency=440:sample_rate=48000" -t 3300 -c:a libopus -b:a 64k tests/fixtures/long-form-transcribe-smoke/audio-55min-sine.webm
```

Shorter / longer variants for bracketing (e.g. 30 min, 75 min): change `-t` seconds (1800 / 4500).

## `pasted-text-50k.txt`

- **Size:** 48 000 UTF-8 characters (slice capped for repeatability).
- **Source body:** Lewis Carroll, *Alice’s Adventures in Wonderland* (Project Gutenberg [pg11](https://www.gutenberg.org/ebooks/11)); prefixed with a short synthetic “session notes” header (homework / assessment / plan cues) so `generateSessionNote` has structure to extract.
- **Regenerate:** Re-download pg11.txt, strip Gutenberg headers, prepend the same header block, truncate to 48 000 chars (see spike findings doc for the PowerShell one-liner used on 2026-05-15).
