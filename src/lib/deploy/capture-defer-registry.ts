/**
 * Ref-counted registry: capture surfaces signal when a live session should
 * block deploy-freshness / chunk-recovery reloads.
 */

const activeSources = new Set<string>();
const listeners = new Set<() => void>();

function notifyListeners(sourceId: string, active: boolean): void {
  const deferred = activeSources.size > 0;
  console.info(`[dfr] source=${sourceId} active=${active} deferred=${deferred}`);
  for (const listener of listeners) {
    listener();
  }
}

export function setCaptureDeferActive(sourceId: string, active: boolean): void {
  const hadSource = activeSources.has(sourceId);

  if (active) {
    if (hadSource) {
      return;
    }
    activeSources.add(sourceId);
  } else {
    if (!hadSource) {
      return;
    }
    activeSources.delete(sourceId);
  }

  notifyListeners(sourceId, active);
}

export function isCaptureDeferred(): boolean {
  return activeSources.size > 0;
}

export function subscribeCaptureDefer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Full-page reload — centralized so deploy-freshness tests can mock jsdom navigation. */
export function triggerDeployReload(): void {
  location.reload();
}

if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST === "1") {
  (
    window as Window & {
      __TN_CAPTURE_DEFER__?: {
        setCaptureDeferActive: typeof setCaptureDeferActive;
        isCaptureDeferred: typeof isCaptureDeferred;
      };
    }
  ).__TN_CAPTURE_DEFER__ = {
    setCaptureDeferActive,
    isCaptureDeferred,
  };
}
