# AI notes evaluation fixtures (B3 / B4)

- **`sarah-b3b4-evaluation-transcripts.md`** — two verbatim (ASR) tutoring transcripts for Sarah-led sessions: one recording id `410b-4302-b12a-15db508c2d36`, second session (add DB id when known). **Delete after** umbrella-topic + trailing/next-meeting work is done and re-golded.
- **Rebuild from Cursor chat export:** `node scripts/build-b3b4-transcript-doc.mjs` expects a temporary `_raw-extract-b3b4-prompt.txt` from the same shape as a `user_message` in `agent-transcripts/…/….jsonl` (see script comments).
