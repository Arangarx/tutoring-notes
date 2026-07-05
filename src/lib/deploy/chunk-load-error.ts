const CHUNK_RECOVERY_STORAGE_KEY = "deploy-chunk-recovery-reload";

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    return typeof message === "string" ? message : null;
  }
  return null;
}

/**
 * Detect webpack/Next chunk load failures that often follow a mid-deploy skew.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (error instanceof Error && error.name === "ChunkLoadError") {
    return true;
  }

  const message = getErrorMessage(error);
  if (!message) {
    return false;
  }

  return (
    message.includes("Loading chunk") ||
    message.includes("Failed to fetch dynamically imported module")
  );
}

/**
 * One-shot full-page reload to recover from a stale chunk graph.
 * Returns false on subsequent calls in the same tab session to break loops.
 */
export function attemptChunkRecoveryReload(): boolean {
  if (typeof sessionStorage === "undefined") {
    return false;
  }

  if (sessionStorage.getItem(CHUNK_RECOVERY_STORAGE_KEY)) {
    return false;
  }

  sessionStorage.setItem(CHUNK_RECOVERY_STORAGE_KEY, "1");
  location.reload();
  return true;
}

/** Clear the loop guard after a clean mount (successful load). */
export function clearChunkRecoveryFlag(): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  sessionStorage.removeItem(CHUNK_RECOVERY_STORAGE_KEY);
}
