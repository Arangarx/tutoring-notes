/**
 * Single predicate for "this stream has a video track worth painting".
 *
 * Used by `useLiveAV` (to decide whether a participant exposes a `videoStream`)
 * and by `AVTile` (to choose between the <video> and the initials placeholder),
 * so both always agree.
 *
 * A track is presentable when it is enabled and not ended. A receiver track's
 * `muted` flag means "no RTP seen yet": it hides the tile (initials instead of
 * a black frame) UNLESS the sender has affirmatively reported `camOn === true`
 * over presence. After a peer reloads, Chrome can leave the receiver's `muted`
 * stuck `true` while RTP flows (item 35 / G1: a probe <video> bound to the
 * muted track painted frames), so the explicit sender signal wins. When the
 * sender has not reported (`undefined`) or reports off, the `muted` gate stays.
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
