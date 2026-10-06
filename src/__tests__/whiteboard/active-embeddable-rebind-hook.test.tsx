/**
 * @jest-environment jsdom
 *
 * Spec: after a replacement the hook rebinds once and settles (the rebind's
 * own change notification is not a new replacement), and the rebind stays out
 * of the undo history. The fake API mirrors Excalidraw: `updateScene` merges
 * appState and notifies every `onChange` subscriber.
 */

import { renderHook } from "@testing-library/react";
import { useActiveEmbeddableRebind } from "@/lib/whiteboard/active-embeddable-rebind";

type El = { id: string };
type AppState = { activeEmbeddable: { element: El; state: "active" | "hover" } | null };

function fakeExcalidraw(elements: El[], appState: AppState) {
  const subs = new Set<(els: El[], st: AppState) => void>();
  const updates: Array<Record<string, unknown>> = [];
  let depth = 0;
  const api = {
    onChange(cb: (els: El[], st: AppState) => void) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    updateScene(data: { elements?: El[]; appState?: Partial<AppState>; captureUpdate?: string }) {
      updates.push(data);
      if (data.elements) elements = data.elements;
      if (data.appState) appState = { ...appState, ...data.appState };
      if (++depth > 20) throw new Error("update loop");
      subs.forEach((cb) => cb(elements, appState));
      depth--;
    },
  };
  return { api, updates, state: () => appState };
}

it("rebinds once to the replacement, settles, and skips the undo history", () => {
  const original = { id: "g1" };
  const fx = fakeExcalidraw([original], { activeEmbeddable: { element: original, state: "active" } });
  renderHook(() => useActiveEmbeddableRebind(fx.api));

  const replaced = { id: "g1" };
  fx.api.updateScene({ elements: [replaced] });

  const rebinds = fx.updates.filter((u) => u.appState);
  expect(rebinds).toHaveLength(1);
  expect(rebinds[0]).toMatchObject({ captureUpdate: "NEVER" });
  expect(fx.state().activeEmbeddable?.element).toBe(replaced);
  expect(fx.state().activeEmbeddable?.state).toBe("active");
});

it("unsubscribes on unmount", () => {
  const original = { id: "g1" };
  const fx = fakeExcalidraw([original], { activeEmbeddable: { element: original, state: "active" } });
  const { unmount } = renderHook(() => useActiveEmbeddableRebind(fx.api));
  unmount();
  fx.api.updateScene({ elements: [{ id: "g1" }] });
  expect(fx.updates.filter((u) => u.appState)).toHaveLength(0);
});
