"use client";

import { transcriptionLanguageNotice } from "@/lib/transcribe-constants";
import { cn } from "@/lib/utils";

/**
 * Short tutor-facing line: transcription is pinned to one language.
 * Owns its type style (muted helper). Callers only pass layout classes.
 */
export function TranscriptionLanguageNotice({
  className,
}: {
  className?: string;
}) {
  return (
    <p
      className={cn(
        "m-0 text-xs leading-relaxed text-muted-foreground",
        className
      )}
      data-testid="wb-transcription-language-notice"
    >
      {transcriptionLanguageNotice()}
    </p>
  );
}
