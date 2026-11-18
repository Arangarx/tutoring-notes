/**
 * Single predicate for "this stream has a video track worth painting".
 *
 * Used by `useLiveAV` to decide whether a participant exposes a `videoStream`.
 * `AVTile` uses the same predicate to decide the stream is worth mounting,
 * then keeps that `<video>` covered by "Waiting for video…" until
 * `videoWidth > 0`. Exposing the stream and painting a frame are different
 * gates — a presentable track can still be an empty picture.
 *
 * A track is presentable when it is enabled and not ended. A receiver track's
 * `muted` flag means "no RTP seen yet": it hides the stream (initials instead
 * of a black frame) UNLESS the sender has affirmatively reported
 * `camOn === true` over presence. After a peer reloads, Chrome can leave the
 * receiver's `muted` stuck `true` while RTP flows (item 35 / G1), so the
 * explicit sender signal wins and the tile waits for a decoded frame instead
 * of trusting `muted`. When the sender has not reported (`undefined`) or
 * reports off, the `muted` gate stays.
 */
export function hasPresentableVideoTrack(
  stream: MediaStream | null | undefined,
  senderReportsCamOn?: boolean
): boolean {
  if (!stream) return false;
  return stream
    .getVideoTracks()
    .some(
      (t) =>
        t.enabled &&
        t.readyState !== "ended" &&
        (senderReportsCamOn === true || !t.muted)
    );
}
