"use client";

/**
 * Merges a peer's full scene snapshot into the local Excalidraw instance
 * using Excalidraw's `reconcileElements` (same helper their collab / Firebase
 * save path uses). Without this, `updateScene({ elements: remote })` replaces
 * the entire array and the last 50ms snapshot wins — concurrent strokes
 * vanish, and erasers can appear to "snap" wrong until the next message.
 *
 * @see `packages/excalidraw/data/reconcile.ts` in upstream Excalidraw.
 */

import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";

function elementIdOf(el: unknown): string | null {
  if (!el || typeof el !== "object") return null;
  const id = (el as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

export type MergeRemoteSceneOptions = {
  /**
   * Ids to strip from the peer snapshot before `reconcileElements`
   * (see `useSyncTombstonedElementIds` — undoes/ deletes vs stale full scenes).
   */
  shouldDropRemoteElement?: (elementId: string) => boolean;
};

export type ReconcileElementsFn =
  typeof import("@excalidraw/excalidraw")["reconcileElements"];

let reconcileElementsPromise: Promise<ReconcileElementsFn> | null = null;

/**
 * Dynamic import so the tutor/student first paint is not forced to
 * fully initialize `@excalidraw/excalidraw` before `next/dynamic` loads
 * the Excalidraw component chunk. Cached: after the first load, callers
 * can await it before reading the live scene and then read → reconcile →
 * `updateScene` with no await in between.
 */
export function loadReconcileElements(): Promise<ReconcileElementsFn> {
  if (!reconcileElementsPromise) {
    reconcileElementsPromise = import("@excalidraw/excalidraw").then(
      (m) => m.reconcileElements,
      (err) => {
        reconcileElementsPromise = null;
        throw err;
      }
    );
  }
  return reconcileElementsPromise;
}

/**
 * The live canvas as a reconcile baseline. MUST include deleted elements:
 * `getSceneElements` omits `isDeleted: true` tombstones, so a stale peer
 * snapshot that still carries an erased/undone element as non-deleted
 * would be re-added by `reconcileElements` (resurrection).
 */
export function readLiveSceneIncludingDeleted(
  api: ExcalidrawApiLike
): ReadonlyArray<ExcalidrawLikeElement> {
  return (api.getSceneElementsIncludingDeleted?.() ??
    api.getSceneElements()) as ReadonlyArray<ExcalidrawLikeElement>;
}

/**
 * True when the two scenes differ in any element's `(id, version,
 * versionNonce)`, including order-independent additions and removals.
 */
export function sceneElementsDiffer(
  a: ReadonlyArray<ExcalidrawLikeElement>,
  b: ReadonlyArray<ExcalidrawLikeElement>
): boolean {
  if (a.length !== b.length) return true;
  const byId = new Map<string, ExcalidrawLikeElement>();
  for (const el of b) {
    const id = elementIdOf(el);
    if (id === null) return true;
    byId.set(id, el);
  }
  if (byId.size !== b.length) return true;
  for (const el of a) {
    const id = elementIdOf(el);
    const other = id === null ? undefined : byId.get(id);
    if (
      !other ||
      other.version !== el.version ||
      other.versionNonce !== el.versionNonce
    ) {
      return true;
    }
  }
  return false;
}

function filterRemote(
  remoteElements: ReadonlyArray<ExcalidrawLikeElement | unknown>,
  shouldDropRemoteElement: MergeRemoteSceneOptions["shouldDropRemoteElement"]
): ExcalidrawLikeElement[] {
  return shouldDropRemoteElement
    ? (remoteElements as ExcalidrawLikeElement[]).filter((el) => {
        const id = el.id ?? elementIdOf(el);
        if (typeof id !== "string") return true;
        return !shouldDropRemoteElement(id);
      })
    : (remoteElements as ExcalidrawLikeElement[]);
}

function waitDoubleRaf(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    } else {
      setTimeout(() => resolve(), 0);
    }
  });
}

export async function updateSceneMergingWithRemote(
  excalidrawAPI: ExcalidrawApiLike,
  remoteElements: ReadonlyArray<ExcalidrawLikeElement | unknown>,
  options?: MergeRemoteSceneOptions
): Promise<void> {
  const reconcileElements = await loadReconcileElements();
  const filteredRemote = filterRemote(
    remoteElements,
    options?.shouldDropRemoteElement
  );
  // Let any pending local `updateScene` (e.g. IDB "Resume" restore) land in
  // Excalidraw's scene store before we read it — same-tick `getSceneElements`
  // is often still empty/stale, so `reconcile` with a late peer `[]` clobbers
  // a freshly restored canvas (flash then blank).
  await waitDoubleRaf();
  const local = excalidrawAPI.getSceneElements() as Parameters<
    typeof reconcileElements
  >[0];
  // A joiner's first broadcast is often an empty scene before they receive
  // the tutor. Reconciling that against a non-empty local wipes the restorer.
  if (filteredRemote.length === 0 && local.length > 0) {
    return;
  }
  const appState = excalidrawAPI.getAppState() as Parameters<
    typeof reconcileElements
  >[2];
  const merged = reconcileElements(
    local,
    filteredRemote as unknown as Parameters<typeof reconcileElements>[1],
    appState
  );
  // captureUpdate: "NEVER" — remote-origin scene merges must not enter
  // the local undo/redo stack. Without this, pressing undo would replay
  // a remote peer's strokes rather than the local user's own actions.
  (excalidrawAPI as typeof excalidrawAPI & {
    updateScene: (s: { elements: ReadonlyArray<unknown>; captureUpdate?: string }) => void;
  }).updateScene({
    elements: merged as ReadonlyArray<unknown>,
    captureUpdate: "NEVER",
  });
}

/**
 * Synchronous reconcile of a peer snapshot against `localElements` with an
 * already-loaded `reconcileElements` (see {@link loadReconcileElements}).
 */
export function reconcileScenesWith(
  reconcileElements: ReconcileElementsFn,
  localElements: ReadonlyArray<ExcalidrawLikeElement | unknown>,
  remoteElements: ReadonlyArray<ExcalidrawLikeElement | unknown>,
  appState: unknown,
  options?: MergeRemoteSceneOptions
): ReadonlyArray<ExcalidrawLikeElement> {
  const filteredRemote = filterRemote(
    remoteElements,
    options?.shouldDropRemoteElement
  );
  if (filteredRemote.length === 0 && localElements.length > 0) {
    return localElements as ExcalidrawLikeElement[];
  }
  const local = localElements as Parameters<ReconcileElementsFn>[0];
  return reconcileElements(
    local,
    filteredRemote as unknown as Parameters<ReconcileElementsFn>[1],
    appState as Parameters<ReconcileElementsFn>[2]
  ) as ReadonlyArray<ExcalidrawLikeElement>;
}

/**
 * Reconcile a peer snapshot into a page bucket without reading the current
 * Excalidraw canvas. Used when the tutor is viewing page A and the
 * student’s strokes target page B (multi-page).
 */
export async function mergeScenesReconciled(
  localElements: ReadonlyArray<ExcalidrawLikeElement | unknown>,
  remoteElements: ReadonlyArray<ExcalidrawLikeElement | unknown>,
  appState: unknown,
  options?: MergeRemoteSceneOptions
): Promise<ReadonlyArray<ExcalidrawLikeElement>> {
  const reconcileElements = await loadReconcileElements();
  return reconcileScenesWith(
    reconcileElements,
    localElements,
    remoteElements,
    appState,
    options
  );
}
