"use client";

import { useEffect } from "react";

/**
 * Keeps an interactive embed (the graph) interactive when its element is
 * replaced in the scene.
 *
 * Excalidraw decides an embed is interactive by object identity:
 * `appState.activeEmbeddable.element === element`. Every graph edit persists
 * `customData.graphStateJson` with a version bump, and every remote apply
 * swaps in a new element object, so the stored reference goes stale and the
 * embed drops back to "click to interact" mid-drag. Activation is local UI
 * state only — nothing here is broadcast.
 */

type EmbeddableRef = { id: string; isDeleted?: boolean };
type ActiveEmbeddable = { element: EmbeddableRef; state: "hover" | "active" } | null;

/**
 * The element to rebind to, or null when nothing should change: no active
 * embed, hover only, the reference is still current, or the element is gone.
 */
export function staleActiveEmbeddableReplacement(
  elements: ReadonlyArray<EmbeddableRef>,
  active: ActiveEmbeddable | undefined
): EmbeddableRef | null {
  if (!active || active.state !== "active") return null;
  const current = elements.find((el) => el.id === active.element.id);
  if (!current || current.isDeleted) return null;
  return current === active.element ? null : current;
}

type RebindApi = {
  onChange?: (
    cb: (
      elements: ReadonlyArray<EmbeddableRef>,
      appState: { activeEmbeddable?: ActiveEmbeddable }
    ) => void
  ) => () => void;
  updateScene: (data: { appState?: Record<string, unknown> }) => void;
};

export function useActiveEmbeddableRebind(api: unknown): void {
  useEffect(() => {
    const rebindApi = api as RebindApi | null;
    if (!rebindApi?.onChange) return;
    return rebindApi.onChange((elements, appState) => {
      const next = staleActiveEmbeddableReplacement(elements, appState.activeEmbeddable);
      if (!next) return;
      rebindApi.updateScene({
        appState: { activeEmbeddable: { element: next, state: "active" } },
      });
    });
  }, [api]);
}
