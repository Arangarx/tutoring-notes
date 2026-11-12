/**
 * The mic gate (consent wave plan § 4.1, C3b). `capabilities.mic.acquire` decides whether ANY mic opener may call
 * `getUserMedia({ audio })`: the live-A/V hook's `requestMic` / `requestMicAndCam` / device swaps and the recorder's
 * `acquireMic` / device swaps all ask this one function first. Pure; the hooks hold the value in a ref so their
 * callbacks stay stable.
 */

import type { MicAcquire } from "@/lib/recording/session-capabilities";

export type MicRequestBlockedReason = Exclude<MicAcquire, "yes">;

/** `null` = the mic may be opened; otherwise the reason it may not (`defer` = ask again once the mode is known). */
export function micRequestBlockedReason(micAcquire: MicAcquire): MicRequestBlockedReason | null {
  return micAcquire === "yes" ? null : micAcquire;
}

/** The one log line for a skipped mic request. `source` names the opener that asked. */
export function logMicRequestBlocked(args: {
  sessionId: string | null | undefined;
  reason: MicRequestBlockedReason;
  source: string;
}): void {
  console.info(
    `[avx] avx=${args.sessionId ?? "none"} action=mic_request_blocked reason=${args.reason} source=${args.source}`
  );
}
