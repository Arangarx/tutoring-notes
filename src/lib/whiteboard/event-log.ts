/**
 * Canonical whiteboard event-log shape.
 *
 * This file is the single source of truth for what we persist to Vercel
 * Blob as `events.json` for a `WhiteboardSession`. It is deliberately
 * **library-agnostic** — see `docs/WHITEBOARD-STATUS.md` guardrail #3.
 * Excalidraw element shapes get translated through
 * `excalidraw-adapter.ts` into `WBElement` on the way IN to this format
 * and translated back on the way OUT (replay). A future tldraw or
 * custom-canvas swap only requires a new adapter; recordings on disk
 * stay valid.
 *
 * Sub-section 1.2 of the whiteboard plan. See:
 *   - prisma/schema.prisma `WhiteboardSession.eventsBlobUrl`
 *   - prisma/schema.prisma `WhiteboardSession.eventsSchemaVersion`
 *   - src/lib/whiteboard/excalidraw-adapter.ts
 *   - src/hooks/useWhiteboardRecorder.ts (writes this format)
 *   - components/WhiteboardReplay.tsx (reads this format)
 */

/**
 * Current canonical schema version.
 *
 * If the on-disk format changes in any way that an old reader can't
 * understand, bump this constant AND add a new branch to the replay
 * player's `switch (schemaVersion)`. The reader from day one switches
 * on the value (see plan blocker #18) so old recordings never become
 * unreadable.
 *
 * When you bump it, also append a row to the
 * `docs/WHITEBOARD-STATUS.md` "Schema-version log".
 */
export const WB_EVENT_LOG_SCHEMA_VERSION = 1 as const;

/**
 * A canonical whiteboard element. NOT an Excalidraw element — see file
 * docblock. The shape is intentionally minimal so the adapter can map
 * cleanly between this and any concrete library.
 *
 * The `type` discriminator covers the surfaces we persist in Phase 1:
 * freehand strokes, lines, shapes, arrows, text, images (used both for
 * raster paste AND PDF-page-tile AND math-equation-SVG), and Desmos
 * iframe embeds. Everything else (libraries-of-shapes, frames, custom
 * tools) is normalized into one of these on the way in.
 */
export type WBElement = {
  /** Stable per-element id; matches the id used by the underlying canvas. */
  id: string;
  type:
    | "freehand"
    | "line"
    | "rectangle"
    | "ellipse"
    | "diamond"
    | "arrow"
    | "text"
    | "image"
    | "desmos";
  /**
   * Top-left x of the element's bounding box in scene coordinates.
   * Floats are rounded to 2 decimal places by the adapter so identical
   * stroke updates don't generate spurious diff entries.
   */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Z-order index. */
  index?: number;
  /** Stroke color (CSS). */
  strokeColor?: string;
  /** Fill color or `transparent`. */
  backgroundColor?: string;
  /** Stroke width in scene px. */
  strokeWidth?: number;
  /** Opacity 0..100 (Excalidraw convention). */
  opacity?: number;
  /** Rotation in radians. */
  angle?: number;
  /** For freehand and lines: relative path points. */
  points?: Array<[number, number]>;
  /** For text elements. */
  text?: string;
  fontSize?: number;
  fontFamily?: number | string;
  /** For image / equation / pdf-page elements: URL of the underlying asset (Vercel Blob). */
  assetUrl?: string;
  /** Optional alt text for images / equations / desmos. */
  altText?: string;
  /**
   * For math-equation images: the source LaTeX string. Preserved so the
   * AI notes pipeline can read what was actually written rather than
   * doing OCR on the rendered SVG.
   */
  latex?: string;
  /** For desmos elements: the initial state JSON (`Calculator.getState()`). */
  desmosStateJson?: string;
  /**
   * Per-client originator id (excalidraw-room socket id). Used by the
   * replay player to color strokes by author so a parent watching the
   * replay can tell tutor strokes from student strokes apart.
   */
  clientId?: string;
};

/**
 * One event in the diff log. The recorder hook emits one of these per
 * `Excalidraw.onChange` diff, plus `pause`/`resume`/`tab-*`/
 * `sync-disconnect`/`sync-reconnect` lifecycle markers.
 *
 * `t` is **milliseconds elapsed in the AUDIO clock**, not wall-clock.
 * The hook reads it from `useAudioRecorder.getElapsedAudioMs()` so
 * stroke playback stays aligned with the audio over a 30+ minute
 * session (plan blocker #2). It does NOT use `Date.now() - startedAt`
 * because that drifts when `MediaRecorder` is paused / throttled.
 */
export type WBEvent =
  /** Full snapshot. Emitted at start, after pause/resume, and as a sync welcome packet for a joining client. */
  | { t: number; type: "snapshot"; elements: WBElement[] }
  /** Element added (locally or by remote client). */
  | { t: number; type: "add"; element: WBElement }
  /** Element updated. `patch` only contains changed fields. */
  | { t: number; type: "update"; elementId: string; patch: Partial<WBElement> }
  /** Element removed. */
  | { t: number; type: "remove"; elementId: string }
  /** Recording paused (no events between pause and resume should affect replay timing). */
  | { t: number; type: "pause" }
  /** Recording resumed. */
  | { t: number; type: "resume" }
  /** Browser tab backgrounded — debug aid for blocker #5 (visibility throttling). */
  | { t: number; type: "tab-hidden" }
  /** Browser tab returned to foreground. */
  | { t: number; type: "tab-visible" }
  /** Live-sync server connection lost — strokes after this are local-only until matching reconnect. */
  | { t: number; type: "sync-disconnect" }
  /** Live-sync server connection re-established. */
  | { t: number; type: "sync-reconnect" }
  /**
   * Phase 2 reservation — tutor and student edited a shared text/code
   * document. Carries an opaque `payload` (likely a Yjs update or
   * canonical OT op) so the format is stable from the start, even
   * though the workspace UI for it doesn't ship until Phase 2 surface
   * A or B is requested.
   */
  | { t: number; type: "text-doc-update"; payload: unknown };

/** Discriminator helper for exhaustiveness checks. */
export type WBEventType = WBEvent["type"];

/**
 * The on-disk JSON document. Wrapping the array gives us room to add
 * top-level metadata (durationMs, codec hints, future per-asset
 * manifest) without changing the schemaVersion.
 */
export type WBEventLog = {
  /** Bumped per `WB_EVENT_LOG_SCHEMA_VERSION` when the format itself changes. */
  schemaVersion: typeof WB_EVENT_LOG_SCHEMA_VERSION;
  /** ISO 8601 wall-clock when the recorder started (informational; replay uses `t` deltas). */
  startedAt: string;
  /**
   * Duration in **milliseconds** along the audio clock. Excludes paused
   * intervals — the value should match `audio.duration * 1000` modulo
   * codec-container rounding.
   */
  durationMs: number;
  events: WBEvent[];
  /**
   * Phase 5 task 8 (per-page view state, replay-mount tier b).
   *
   * Snapshot of the **active page's viewport at end-session**. Replay
   * has no page-strip today (single-scene event-log player), so it can
   * only honor one viewport — the place the tutor left things. When
   * present, replay applies this on first paint instead of auto-fit.
   *
   * Optional + additive (no schemaVersion bump). Pre-feature logs and
   * any session that ended before the recorder learned to capture the
   * viewport (network failure mid-end, etc.) simply omit it and replay
   * falls back to the default camera-fit behaviour.
   *
   * When per-page navigation lands in replay, extend this with the full
   * `pageList[].viewState` array; the additive-field pattern stays the
   * same.
   */
  finalActiveViewport?: {
    panX: number;
    panY: number;
    zoom: number;
  };
  /** Active page id at end-session (informational; `[pvs]` log tagging). */
  finalActivePageId?: string;
};

/**
 * Build an empty log object. Used by the recorder hook on session
 * start and by tests. The `events` array starts empty; the first
 * `onChange` triggers the initial snapshot via the adapter's diff.
 */
export function createEmptyEventLog(startedAtIso?: string): WBEventLog {
  return {
    schemaVersion: WB_EVENT_LOG_SCHEMA_VERSION,
    startedAt: startedAtIso ?? new Date().toISOString(),
    durationMs: 0,
    events: [],
  };
}

/**
 * Append an event to the log and bump `durationMs` if `t` exceeds it.
 * Mutates `log.events` and `log.durationMs` in place because the hook
 * holds a single ref across the whole session — copying on every
 * stroke would defeat the diff-log size win.
 *
 * Returns the same log for fluent chaining in tests.
 */
export function appendEvent(log: WBEventLog, event: WBEvent): WBEventLog {
  log.events.push(event);
  if (event.t > log.durationMs) {
    log.durationMs = event.t;
  }
  return log;
}

/**
 * Latest `t` among all events — independent of {@link WBEventLog.durationMs}.
 *
 * Writers normally keep `durationMs` in sync via {@link appendEvent}, but blobs
 * built by migrations, manual repair, or a race on session end can have
 * `durationMs` trailing the final scene events. Replay uses `max(durationMs,
 * maxEventTimestampMs)` for the no-audio “final frame” so we never clip the
 * last strokes off.
 */
export function maxEventTimestampMs(log: WBEventLog): number {
  let maxT = 0;
  for (const e of log.events) {
    if (e.t > maxT) maxT = e.t;
  }
  return maxT;
}

/**
 * Type guard: is this event one that affects the replay scene shape?
 * Used by the replay player to filter pure-debug markers
 * (`tab-hidden`, `sync-*`) when reconstructing the canvas at time T.
 */
export function isSceneAffectingEvent(
  event: WBEvent
): event is Extract<WBEvent, { type: "snapshot" | "add" | "update" | "remove" }> {
  return (
    event.type === "snapshot" ||
    event.type === "add" ||
    event.type === "update" ||
    event.type === "remove"
  );
}

/**
 * Reconstruct the scene shape (id-keyed map of WBElement) from the
 * sequence of events up to and including `untilT`. Used by the replay
 * player to produce a snapshot for any seek position.
 *
 * Honors:
 *   - `snapshot` events RESET the scene (they're the canonical reseed).
 *   - `add` puts the element into the map.
 *   - `update` deep-merges the patch onto an existing element if any,
 *     otherwise treats it as an `add` (defensive for crash-recovered
 *     logs that may have missed the original add).
 *   - `remove` deletes the element from the map.
 */
export function reconstructSceneAt(
  log: WBEventLog,
  untilT: number
): Map<string, WBElement> {
  const scene = new Map<string, WBElement>();
  for (const event of log.events) {
    if (event.t > untilT) break;
    switch (event.type) {
      case "snapshot": {
        scene.clear();
        for (const el of event.elements) {
          scene.set(el.id, el);
        }
        break;
      }
      case "add": {
        scene.set(event.element.id, event.element);
        break;
      }
      case "update": {
        const existing = scene.get(event.elementId);
        if (existing) {
          scene.set(event.elementId, { ...existing, ...event.patch });
        } else {
          // Defensive: a missing prior `add` shouldn't crash the player.
          // Synthesise a minimal element from the patch and keep going.
          const synth: WBElement = {
            id: event.elementId,
            type: "freehand",
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            ...event.patch,
          };
          scene.set(event.elementId, synth);
        }
        break;
      }
      case "remove": {
        scene.delete(event.elementId);
        break;
      }
      default:
        // pause / resume / tab-* / sync-* / text-doc-update don't affect
        // scene reconstruction. text-doc-update will get its own
        // reconstruction path in Phase 2.
        break;
    }
  }
  return scene;
}
