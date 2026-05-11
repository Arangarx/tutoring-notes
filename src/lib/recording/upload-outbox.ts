"use client";

/**
 * IndexedDB-backed upload outbox for recording segments (Pillar 2 of
 * the master plan, Phase 1b deliverable).
 *
 * Why this exists
 * ===============
 *
 * Pre-Phase-1b the workspace called `registerWhiteboardSessionAudioSegmentAction`
 * directly inside `useAudioRecorder.onstop` (via `WhiteboardWorkspaceClient`'s
 * `onWorkspaceAudioRecorded`). If End Session fired while register was still
 * in flight — or if the tab crashed before register returned — the segment
 * was lost. Phase 0c added a poll-loop band-aid; Phase 1b replaces that
 * structurally with this outbox.
 *
 *   captured Blob ──► outbox.enqueue (persisted in IndexedDB)
 *                       │
 *                       ▼
 *                   worker drains:
 *                     - upload to Vercel Blob if `blobRemoteUrl` is null
 *                     - mark ready (blobRemoteUrl set, attempts captured)
 *                       │
 *                       ▼
 *                   sits in outbox until atomic endWhiteboardSession
 *                   reads it via `assembleEndSessionPayload` and
 *                   registers it server-side as part of the same
 *                   transaction. After that, `outbox.finalize(sessionId)`
 *                   deletes the rows for that session.
 *
 * Multi-stream + multi-participant from day one (per plan):
 * --------------------------------------------------------
 * The outbox is keyed by `(sessionId, streamId, segmentId)`. Today only
 * `tutor:mic` is enqueued by production code; Phase 4 will add
 * `student:peer-<id>:mic` rows when student-mic capture lands. Adding a
 * stream is *just* a new `streamId` value — no code paths in this module
 * branch on it. The worker is parallel across streams and serial within
 * a stream (so a retried row never overtakes a fresh row from the same
 * stream).
 *
 * Crash-recovery contract:
 * ------------------------
 * Rows survive page refresh, tab kill, and even fresh navigations
 * (IndexedDB is per-origin, not per-tab). The worker drains on every
 * construction, so opening the workspace after a crash automatically
 * resumes any in-flight uploads. The local `blobLocalRef` is stored as
 * a Blob (browsers serialize Blobs natively into IDB), so the bytes
 * survive even if the page reload happened between MediaRecorder.stop()
 * and the upload completing.
 *
 * Note: Phase 1b's workspace wiring (Commit 3) hands the outbox a row
 * that already has `blobRemoteUrl` set (because `useAudioRecorder.onstop`
 * still does the upload inline). That means the worker has nothing to do
 * on the happy path — its retries only fire if the workspace stops
 * pre-uploading at some future phase (e.g. Phase 4 student-mic capture
 * landing the local Blob directly into the outbox). The module is
 * designed for the harder case so we don't need to redesign it later.
 *
 * Per-session ID logging (AGENTS.md convention): every log line below
 * includes `obx=<short id>` plus the session/stream/segment ids when
 * relevant, so a prod debug session can grep one row's full lifecycle.
 *
 * Tests: `src/__tests__/recording/upload-outbox.test.ts` (uses
 * fake-indexeddb).
 */

// ----------------------------------------------------------------
// Row schema (matches plan Phase 1 Task 2 verbatim)
// ----------------------------------------------------------------

export type OutboxRow = {
  /** Stable per-row uuid. Distinct from segmentId so dedupe stays cheap. */
  id: string;
  /** WhiteboardSession id this segment belongs to. */
  sessionId: string;
  /** Capture stream id (TUTOR_MIC_STREAM_ID etc. — see lifecycle-machine). */
  streamId: string;
  /**
   * Caller-minted uuid for this MediaRecorder segment. Dedupe key:
   * enqueue with the same (sessionId, streamId, segmentId) is a no-op
   * even if `id` differs (e.g. workspace double-fires onRecorded).
   */
  segmentId: string;
  /**
   * Local Blob (or ArrayBuffer for tests that pass raw bytes). Persisted
   * in IndexedDB so the worker can re-upload after a refresh. May be
   * null when the row was enqueued post-upload (`blobRemoteUrl` set on
   * enqueue) — Phase 1b's workspace path.
   */
  blobLocalRef: Blob | ArrayBuffer | null;
  /**
   * Remote Vercel Blob URL once upload has succeeded. Worker sets this
   * after a successful PUT.
   */
  blobRemoteUrl: string | null;
  /** Content-Type stamped at capture time. */
  mimeType: string;
  /** Captured byte size — keeps the server end-session payload honest. */
  sizeBytes: number;
  /**
   * Wall-clock ms (Date.now()) when MediaRecorder started this segment.
   * Used at end-session to reconstruct the audio timeline. NOT a
   * monotonic clock — for accurate replay timing the canonical event
   * log carries its own perf.now()-based stamps.
   */
  audioStartedAtMs: number;
  /**
   * True after the atomic endWhiteboardSession action confirms this
   * segment was persisted server-side. In practice we delete the row
   * via `finalize` in the same step, so this field is mostly a
   * historical marker for log lines that fire just before finalize.
   */
  registerOk: boolean;
  /** Upload attempt count. Caps at PERMANENT_FAIL_AFTER_ATTEMPTS. */
  attempts: number;
  /** Most recent upload error message, or null. */
  lastError: string | null;
  /** ms epoch when the row was first enqueued — for ordering + logging. */
  createdAt: number;
};

// ----------------------------------------------------------------
// Observer state (consumed by the workspace audio bridge / End button)
// ----------------------------------------------------------------

export type OutboxObserverState = {
  /**
   * Coarse state for the End button copy:
   *   - `idle`        — no rows for this session; nothing to wait on.
   *   - `uploading`   — at least one row needs upload.
   *   - `registering` — all rows uploaded; awaiting end-session call.
   *   - `failed`      — at least one row hit the permanent-fail cap.
   */
  state: "idle" | "uploading" | "registering" | "failed";
  /**
   * Total rows for this session that aren't yet uploaded. The End
   * button reads this for the "Saving last N segment(s)…" copy. After
   * uploads finish but before end-session, this reads 0 even though
   * rows are still in the outbox — that matches the user-facing copy
   * "we're saving the last N segments" which only makes sense while
   * uploads are in flight.
   */
  inFlightStreamCount: number;
  /**
   * Per-stream in-flight count. Phase 1b mostly shows `{tutor:mic: N}`;
   * Phase 4 surfaces e.g. `{tutor:mic: 1, student:peer-abc:mic: 2}`
   * which the End button can use to render per-participant copy if
   * desired. The map is read-only — callers must not mutate it.
   */
  byStream: ReadonlyMap<string, number>;
  /**
   * Most recent error from any row in this session. Null when all
   * recent attempts succeeded.
   */
  lastError: string | null;
};

const IDLE_STATE_FROZEN: OutboxObserverState = Object.freeze({
  state: "idle" as const,
  inFlightStreamCount: 0,
  byStream: new Map<string, number>(),
  lastError: null as string | null,
});

// ----------------------------------------------------------------
// Tuning knobs (plan-specified)
// ----------------------------------------------------------------

/**
 * Upload backoff schedule. After hitting the last entry we plateau
 * there for every subsequent attempt until PERMANENT_FAIL_AFTER_ATTEMPTS.
 *
 * Values mirror the plan verbatim: "1s, 2s, 5s, 15s, 60s, then plateau".
 * Override via {@link OutboxConfig.backoffMsByAttempt} in tests so we
 * don't burn real seconds.
 */
export const DEFAULT_BACKOFF_MS_BY_ATTEMPT: ReadonlyArray<number> = [
  1_000, 2_000, 5_000, 15_000, 60_000,
];

/**
 * Per-row attempt cap. After this many failed uploads the row is
 * marked permanently failed (no further attempts) and surfaced via
 * the observer's `state = "failed"`. The plan recommends 50.
 */
export const PERMANENT_FAIL_AFTER_ATTEMPTS = 50;

/** Default IDB name + store; overridable from tests for parallelism. */
const DEFAULT_DB_NAME = "tutoring-notes-upload-outbox";
const STORE_NAME = "rows";
const DB_VERSION = 1;

// ----------------------------------------------------------------
// Uploader injection (so tests don't hit Vercel Blob)
// ----------------------------------------------------------------

export type OutboxUploadResult =
  | { ok: true; blobUrl: string }
  | { ok: false; error: string };

export type OutboxUploadFn = (
  row: OutboxRow,
  blob: Blob
) => Promise<OutboxUploadResult>;

// ----------------------------------------------------------------
// Public config + factory
// ----------------------------------------------------------------

export type OutboxConfig = {
  /**
   * Custom uploader. In production this wraps
   * `uploadAudioWithRetry(uploadAudioDirect, …)`; tests inject a
   * controllable mock. Required so the module never has to import
   * Vercel-specific code from inside the worker.
   */
  upload: OutboxUploadFn;
  /**
   * Override IDB name (e.g. per-test isolation). Defaults to
   * `DEFAULT_DB_NAME`.
   */
  dbName?: string;
  /**
   * Backoff schedule override. Defaults to
   * `DEFAULT_BACKOFF_MS_BY_ATTEMPT`. Tests typically pass `[0,0,0…]`.
   */
  backoffMsByAttempt?: ReadonlyArray<number>;
  /**
   * Permanent-fail cap override. Defaults to
   * `PERMANENT_FAIL_AFTER_ATTEMPTS`. Tests use small values.
   */
  permanentFailAfter?: number;
  /**
   * IDBFactory override. In production we use `globalThis.indexedDB`
   * (or `window.indexedDB`); tests using fake-indexeddb either
   * monkey-patch the global or pass the factory explicitly.
   */
  indexedDB?: IDBFactory;
  /**
   * Optional logger injection. Defaults to `console`. Tests can
   * silence noise by passing a no-op.
   */
  logger?: Pick<Console, "log" | "warn" | "error">;
  /**
   * Optional setTimeout override. Tests using fake timers swap this
   * for `globalThis.setTimeout` so they can advance time
   * deterministically.
   */
  setTimeout?: (cb: () => void, ms: number) => unknown;
  /**
   * Optional clearTimeout override (matched with `setTimeout`).
   */
  clearTimeout?: (id: unknown) => void;
};

export type UploadOutbox = {
  /**
   * Persist a new segment to the outbox and kick the worker. Idempotent
   * by `(sessionId, streamId, segmentId)` — double enqueues for the
   * same logical segment are coalesced. Returns the row that was
   * actually written (which may be the existing row on dedupe).
   */
  enqueue: (row: NewOutboxRow) => Promise<OutboxRow>;
  /**
   * Subscribe to per-session state. The returned object exposes the
   * current snapshot via `getState()` and lets the caller add/remove
   * subscribers. Snapshots are immutable structural-equality samples
   * — the workspace's `useSyncExternalStore` (or a hand-rolled
   * subscription) will only notify React when the snapshot diff is
   * meaningful.
   */
  observe: (sessionId: string) => OutboxObservation;
  /**
   * Wait for every row of `sessionId` to have `blobRemoteUrl` set
   * (i.e. uploaded). Resolves either when the outbox is empty for
   * `sessionId` (in upload terms) OR when `timeoutMs` elapses,
   * whichever comes first. Always resolves — never rejects — so the
   * End-session flow can branch on the timeout result rather than
   * `try/catch`.
   */
  drainAndAwait: (
    sessionId: string,
    opts: { timeoutMs: number }
  ) => Promise<DrainResult>;
  /**
   * Read the uploaded rows for `sessionId` so the workspace can
   * assemble the atomic end-session payload. Returns rows in a stable
   * (createdAt, streamId, segmentId) order so the server-side
   * orderIndex assignment is deterministic across retries.
   *
   * Rows without `blobRemoteUrl` are excluded — call after
   * `drainAndAwait` to capture them all.
   */
  listUploadedSegments: (sessionId: string) => Promise<OutboxRow[]>;
  /**
   * Delete every row for `sessionId`. Called after the atomic
   * end-session action commits. Per-row deletes are wrapped in a
   * single IDB transaction so a partial finalize cannot leave a
   * mix-state behind.
   */
  finalize: (sessionId: string) => Promise<void>;
  /**
   * For tests + ops surfaces: read every row for a session (including
   * not-yet-uploaded rows + permanently-failed rows). Not consumed by
   * production code paths.
   */
  listAllRows: (sessionId: string) => Promise<OutboxRow[]>;
  /**
   * Close the underlying IDB connection and drop any timer handles.
   * Production never calls this (the connection lives as long as the
   * tab); tests call it between cases for cleanup.
   */
  close: () => Promise<void>;
};

export type OutboxObservation = {
  getState: () => OutboxObserverState;
  subscribe: (listener: (state: OutboxObserverState) => void) => () => void;
};

export type NewOutboxRow = Omit<
  OutboxRow,
  "id" | "blobRemoteUrl" | "registerOk" | "attempts" | "lastError" | "createdAt"
> & {
  /**
   * Optional pre-uploaded URL. Phase 1b's workspace path sets this on
   * enqueue because `useAudioRecorder.onstop` already did the upload;
   * the worker then has nothing to do for the row. Future paths
   * (Phase 4 student-mic capture) may enqueue with `blobRemoteUrl:
   * null` and let the worker upload.
   */
  blobRemoteUrl?: string | null;
};

export type DrainResult = {
  /** True if `timeoutMs` elapsed before the outbox emptied. */
  timedOut: boolean;
  /** Count of rows still missing `blobRemoteUrl` at return time. */
  remainingCount: number;
  /** Per-stream remaining count, mirrors observer state. */
  remainingByStream: ReadonlyMap<string, number>;
  /** Most recent upload error, if any. */
  lastError: string | null;
};

// ----------------------------------------------------------------
// Factory
// ----------------------------------------------------------------

/**
 * Build an `UploadOutbox`. Caller-supplied config keeps this module
 * decoupled from Vercel Blob + the workspace's specific IDB scope.
 *
 * The instance opens its IDB connection lazily (first enqueue / observe
 * / listSegments). Tests that want eager open can call `listAllRows`
 * with any session id to force the upgrade pathway.
 */
export function createUploadOutbox(config: OutboxConfig): UploadOutbox {
  const dbName = config.dbName ?? DEFAULT_DB_NAME;
  const backoff = config.backoffMsByAttempt ?? DEFAULT_BACKOFF_MS_BY_ATTEMPT;
  const permanentFailAfter =
    config.permanentFailAfter ?? PERMANENT_FAIL_AFTER_ATTEMPTS;
  const logger = config.logger ?? console;
  const setTimeoutFn: (cb: () => void, ms: number) => unknown =
    config.setTimeout ??
    ((cb, ms) => globalThis.setTimeout(cb, ms) as unknown);
  const clearTimeoutFn: (id: unknown) => void =
    config.clearTimeout ??
    ((id) => globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>));
  const idbFactory = config.indexedDB ?? globalThis.indexedDB;
  if (!idbFactory) {
    throw new Error(
      "createUploadOutbox: IndexedDB is not available. Pass `config.indexedDB` (fake-indexeddb in tests, window.indexedDB in browsers)."
    );
  }

  let dbPromise: Promise<IDBDatabase> | null = null;

  function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = idbFactory.open(dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          // Indexed by sessionId for the bulk read path used by
          // drainAndAwait + listUploadedSegments + finalize. Composite
          // (sessionId, streamId) supports byStream rollups without a
          // full scan.
          store.createIndex("by_session", "sessionId", { unique: false });
          store.createIndex("by_session_stream", ["sessionId", "streamId"], {
            unique: false,
          });
          // Composite uniqueness for dedupe — enqueue with the same
          // logical key is a no-op, enforced at the IDB layer too so
          // we can never silently insert duplicates even if two
          // worker passes race.
          store.createIndex(
            "by_session_stream_segment",
            ["sessionId", "streamId", "segmentId"],
            { unique: true }
          );
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
      req.onblocked = () =>
        logger.warn?.("[upload-outbox] IDB upgrade blocked by another tab");
    });
    return dbPromise;
  }

  // ----------------------------------------------------------------
  // IDB helpers (promise-wrappers around the raw event API)
  // ----------------------------------------------------------------

  async function withStore<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => Promise<T> | T
  ): Promise<T> {
    const db = await openDb();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result: T;
      let settled = false;
      // Wire tx lifecycle BEFORE running user code. A no-op `fn` would
      // otherwise let the tx auto-commit and fire `oncomplete` before
      // we'd attached the handler, leaving the promise hanging forever.
      tx.oncomplete = () => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };
      tx.onerror = () => {
        if (!settled) {
          settled = true;
          reject(tx.error ?? new Error("IDB tx error"));
        }
      };
      tx.onabort = () => {
        if (!settled) {
          settled = true;
          reject(tx.error ?? new Error("IDB tx aborted"));
        }
      };
      Promise.resolve()
        .then(() => fn(store))
        .then((v) => {
          result = v;
        })
        .catch((err) => {
          if (!settled) {
            settled = true;
            reject(err);
          }
          try {
            tx.abort();
          } catch {
            /* tx may already be done */
          }
        });
    });
  }

  function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IDB request error"));
    });
  }

  // ----------------------------------------------------------------
  // Subscribers (per-session)
  // ----------------------------------------------------------------

  type Listener = (state: OutboxObserverState) => void;
  const listenersBySession = new Map<string, Set<Listener>>();
  const lastStateBySession = new Map<string, OutboxObserverState>();

  function notifySession(sessionId: string, next: OutboxObserverState) {
    const prev = lastStateBySession.get(sessionId);
    if (
      prev &&
      prev.state === next.state &&
      prev.inFlightStreamCount === next.inFlightStreamCount &&
      prev.lastError === next.lastError &&
      mapsShallowEqual(prev.byStream, next.byStream)
    ) {
      return;
    }
    lastStateBySession.set(sessionId, next);
    const listeners = listenersBySession.get(sessionId);
    if (!listeners || listeners.size === 0) return;
    for (const fn of listeners) {
      try {
        fn(next);
      } catch (err) {
        logger.error?.("[upload-outbox] subscriber threw", err);
      }
    }
  }

  async function recomputeState(sessionId: string): Promise<OutboxObserverState> {
    const rows = await listAllRowsInternal(sessionId);
    const byStream = new Map<string, number>();
    let pending = 0;
    let permanentlyFailed = 0;
    let lastError: string | null = null;
    for (const row of rows) {
      if (row.blobRemoteUrl) continue;
      if (row.attempts >= permanentFailAfter) {
        permanentlyFailed += 1;
        if (row.lastError) lastError = row.lastError;
        continue;
      }
      pending += 1;
      byStream.set(row.streamId, (byStream.get(row.streamId) ?? 0) + 1);
      if (row.lastError) lastError = row.lastError;
    }
    const totalRows = rows.length;
    const uploadedRows = rows.filter((r) => r.blobRemoteUrl !== null).length;
    let state: OutboxObserverState["state"];
    if (permanentlyFailed > 0 && pending === 0) {
      state = "failed";
    } else if (pending > 0) {
      state = "uploading";
    } else if (totalRows > 0 && uploadedRows === totalRows) {
      state = "registering";
    } else {
      state = "idle";
    }
    return {
      state,
      inFlightStreamCount: pending,
      byStream,
      lastError,
    };
  }

  async function refreshStateAndNotify(sessionId: string): Promise<void> {
    const next = await recomputeState(sessionId);
    notifySession(sessionId, next);
  }

  // ----------------------------------------------------------------
  // Worker (per-stream serial; per-session parallel)
  // ----------------------------------------------------------------

  // Per-stream "draining" promise — chained so retries on the same
  // stream stay serial. The plan calls for "drain order honored
  // within a stream, parallel across streams" — using one chain per
  // (sessionId|streamId) key delivers that.
  const drainChainByStream = new Map<string, Promise<void>>();
  const pendingRetryTimerByRow = new Map<string, unknown>();

  function streamKey(sessionId: string, streamId: string): string {
    return `${sessionId}|${streamId}`;
  }

  function kickWorker(sessionId: string, streamId?: string): void {
    // Without an explicit streamId, drain every stream that has work
    // pending for this session. We discover them by reading the rows.
    void (async () => {
      try {
        const rows = await listAllRowsInternal(sessionId);
        const streams = streamId
          ? [streamId]
          : Array.from(new Set(rows.map((r) => r.streamId)));
        for (const s of streams) {
          const key = streamKey(sessionId, s);
          const prev = drainChainByStream.get(key) ?? Promise.resolve();
          const next = prev.then(() => drainStreamOnce(sessionId, s));
          drainChainByStream.set(
            key,
            next.catch((err) => {
              logger.error?.(
                `[upload-outbox] obx=${shortObx} drain chain failed sessionId=${sessionId} streamId=${s}`,
                err
              );
            })
          );
        }
      } catch (err) {
        logger.error?.(
          `[upload-outbox] obx=${shortObx} kickWorker scan failed sessionId=${sessionId}`,
          err
        );
      }
    })();
  }

  async function drainStreamOnce(
    sessionId: string,
    streamId: string
  ): Promise<void> {
    // Pull all rows for this session+stream that need work.
    const rows = (await listAllRowsInternal(sessionId)).filter(
      (r) =>
        r.streamId === streamId &&
        !r.blobRemoteUrl &&
        r.attempts < permanentFailAfter
    );
    rows.sort((a, b) => a.createdAt - b.createdAt);

    for (const row of rows) {
      // Cancel any pending retry timer for this row — we're handling
      // it now.
      const existingTimer = pendingRetryTimerByRow.get(row.id);
      if (existingTimer !== undefined) {
        clearTimeoutFn(existingTimer);
        pendingRetryTimerByRow.delete(row.id);
      }

      const fresh = await getRowById(row.id);
      if (!fresh || fresh.blobRemoteUrl) continue;
      if (!fresh.blobLocalRef) {
        // Row has no local blob (likely test corruption or future
        // code path that lost the blob). Mark as failed-permanent so
        // we don't loop forever.
        await writeRow({
          ...fresh,
          attempts: permanentFailAfter,
          lastError: "no blobLocalRef available for upload",
        });
        await refreshStateAndNotify(sessionId);
        continue;
      }
      const blob =
        fresh.blobLocalRef instanceof Blob
          ? fresh.blobLocalRef
          : new Blob([fresh.blobLocalRef as ArrayBuffer], {
              type: fresh.mimeType,
            });
      const result = await safelyInvokeUpload(fresh, blob);
      // Re-read the row after the upload completes (or fails) so a
      // concurrent enqueue that sideloaded `blobRemoteUrl` in the
      // meantime doesn't get clobbered by the worker's write. Same
      // pattern as the FSM in lifecycle-machine — read the latest
      // input before producing the next output.
      const post = (await getRowById(fresh.id)) ?? fresh;
      if (result.ok) {
        await writeRow({
          ...post,
          // Worker's URL wins iff no concurrent setter beat us to it.
          blobRemoteUrl: post.blobRemoteUrl ?? result.blobUrl,
          lastError: null,
        });
        logger.log?.(
          `[upload-outbox] obx=${shortObx} uploaded sessionId=${sessionId} streamId=${streamId} segmentId=${fresh.segmentId} attempts=${fresh.attempts + 1}`
        );
      } else {
        // If a concurrent enqueue sideloaded the URL, the row is
        // effectively done — don't keep retrying. Otherwise record
        // the new attempts counter + error.
        if (post.blobRemoteUrl) {
          await refreshStateAndNotify(sessionId);
          continue;
        }
        const nextAttempts = post.attempts + 1;
        await writeRow({
          ...post,
          attempts: nextAttempts,
          lastError: result.error,
        });
        if (nextAttempts < permanentFailAfter) {
          const delayMs = backoffForAttempt(nextAttempts);
          logger.warn?.(
            `[upload-outbox] obx=${shortObx} upload failed sessionId=${sessionId} streamId=${streamId} segmentId=${fresh.segmentId} attempts=${nextAttempts} retryInMs=${delayMs} error=${result.error}`
          );
          const timer = setTimeoutFn(() => {
            pendingRetryTimerByRow.delete(fresh.id);
            kickWorker(sessionId, streamId);
          }, delayMs);
          pendingRetryTimerByRow.set(fresh.id, timer);
        } else {
          logger.error?.(
            `[upload-outbox] obx=${shortObx} permanent failure sessionId=${sessionId} streamId=${streamId} segmentId=${fresh.segmentId} attempts=${nextAttempts} error=${result.error}`
          );
        }
      }
      await refreshStateAndNotify(sessionId);
    }
  }

  async function safelyInvokeUpload(
    row: OutboxRow,
    blob: Blob
  ): Promise<OutboxUploadResult> {
    try {
      return await config.upload(row, blob);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  function backoffForAttempt(attempt: number): number {
    // attempt is 1-based after a failure (1 = "we just failed once")
    const idx = Math.min(attempt - 1, backoff.length - 1);
    return Math.max(0, backoff[idx] ?? 0);
  }

  // ----------------------------------------------------------------
  // Row CRUD
  // ----------------------------------------------------------------

  async function getRowById(id: string): Promise<OutboxRow | null> {
    return withStore("readonly", async (store) => {
      const row = await reqAsPromise(store.get(id));
      return (row as OutboxRow | undefined) ?? null;
    });
  }

  async function writeRow(row: OutboxRow): Promise<void> {
    await withStore("readwrite", async (store) => {
      await reqAsPromise(store.put(row));
    });
  }

  async function listAllRowsInternal(sessionId: string): Promise<OutboxRow[]> {
    return withStore("readonly", async (store) => {
      const index = store.index("by_session");
      const cursor = index.openCursor(IDBKeyRange.only(sessionId));
      const out: OutboxRow[] = [];
      return new Promise<OutboxRow[]>((resolve, reject) => {
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (c) {
            out.push(c.value as OutboxRow);
            c.continue();
          } else {
            resolve(out);
          }
        };
        cursor.onerror = () =>
          reject(cursor.error ?? new Error("IDB cursor error"));
      });
    });
  }

  async function findRowByLogicalKey(
    sessionId: string,
    streamId: string,
    segmentId: string
  ): Promise<OutboxRow | null> {
    return withStore("readonly", async (store) => {
      const index = store.index("by_session_stream_segment");
      const row = await reqAsPromise(
        index.get([sessionId, streamId, segmentId])
      );
      return (row as OutboxRow | undefined) ?? null;
    });
  }

  // ----------------------------------------------------------------
  // Public API impls
  // ----------------------------------------------------------------

  const shortObx = Math.random().toString(36).slice(2, 7);

  async function enqueue(input: NewOutboxRow): Promise<OutboxRow> {
    const existing = await findRowByLogicalKey(
      input.sessionId,
      input.streamId,
      input.segmentId
    );
    if (existing) {
      // Dedupe — same logical segment, possibly a re-fire of onRecorded.
      // We may want to ATTACH a freshly known blobRemoteUrl if the
      // existing row didn't have one yet (e.g. upload succeeded in a
      // background path but the row stayed in IDB without the url).
      if (!existing.blobRemoteUrl && input.blobRemoteUrl) {
        const merged: OutboxRow = {
          ...existing,
          blobRemoteUrl: input.blobRemoteUrl,
          lastError: null,
        };
        await writeRow(merged);
        await refreshStateAndNotify(input.sessionId);
        return merged;
      }
      logger.log?.(
        `[upload-outbox] obx=${shortObx} dedupe sessionId=${input.sessionId} streamId=${input.streamId} segmentId=${input.segmentId}`
      );
      return existing;
    }
    const row: OutboxRow = {
      id: uuidish(),
      sessionId: input.sessionId,
      streamId: input.streamId,
      segmentId: input.segmentId,
      blobLocalRef: input.blobLocalRef,
      blobRemoteUrl: input.blobRemoteUrl ?? null,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      audioStartedAtMs: input.audioStartedAtMs,
      registerOk: false,
      attempts: 0,
      lastError: null,
      createdAt: Date.now(),
    };
    await writeRow(row);
    logger.log?.(
      `[upload-outbox] obx=${shortObx} enqueued sessionId=${input.sessionId} streamId=${input.streamId} segmentId=${input.segmentId} hasRemoteUrl=${row.blobRemoteUrl !== null}`
    );
    await refreshStateAndNotify(input.sessionId);
    if (!row.blobRemoteUrl) {
      kickWorker(input.sessionId, input.streamId);
    }
    return row;
  }

  function observe(sessionId: string): OutboxObservation {
    if (!listenersBySession.has(sessionId)) {
      listenersBySession.set(sessionId, new Set());
    }
    // Kick a fresh recompute so first-mount consumers get a real
    // snapshot rather than the idle frozen default. Fire-and-forget;
    // the subscriber will pick up the next-tick notify.
    void refreshStateAndNotify(sessionId);

    return {
      getState: () =>
        lastStateBySession.get(sessionId) ?? IDLE_STATE_FROZEN,
      subscribe: (listener) => {
        const set = listenersBySession.get(sessionId)!;
        set.add(listener);
        // Fire the current snapshot synchronously so the caller can
        // populate its initial UI state.
        const initial = lastStateBySession.get(sessionId);
        if (initial) {
          try {
            listener(initial);
          } catch (err) {
            logger.error?.(
              "[upload-outbox] initial-snapshot subscriber threw",
              err
            );
          }
        }
        return () => {
          set.delete(listener);
        };
      },
    };
  }

  async function drainAndAwait(
    sessionId: string,
    opts: { timeoutMs: number }
  ): Promise<DrainResult> {
    // Quick path — outbox already drained.
    const initial = await recomputeState(sessionId);
    if (initial.inFlightStreamCount === 0) {
      return {
        timedOut: false,
        remainingCount: 0,
        remainingByStream: initial.byStream,
        lastError: initial.lastError,
      };
    }

    // Kick the worker so any newly-enqueued rows start uploading
    // immediately, then poll observer state until empty or timeout.
    kickWorker(sessionId);

    const deadline = Date.now() + Math.max(0, opts.timeoutMs);
    return new Promise<DrainResult>((resolve) => {
      let timer: unknown = null;
      const unsubscribe = observe(sessionId).subscribe((state) => {
        if (state.inFlightStreamCount === 0) {
          if (timer !== null) clearTimeoutFn(timer);
          unsubscribe();
          resolve({
            timedOut: false,
            remainingCount: 0,
            remainingByStream: state.byStream,
            lastError: state.lastError,
          });
        }
      });

      const remainingMs = Math.max(0, deadline - Date.now());
      timer = setTimeoutFn(() => {
        unsubscribe();
        void recomputeState(sessionId).then((final) => {
          resolve({
            timedOut: final.inFlightStreamCount > 0,
            remainingCount: final.inFlightStreamCount,
            remainingByStream: final.byStream,
            lastError: final.lastError,
          });
        });
      }, remainingMs);
    });
  }

  async function listUploadedSegments(sessionId: string): Promise<OutboxRow[]> {
    const all = await listAllRowsInternal(sessionId);
    const uploaded = all.filter((r) => r.blobRemoteUrl !== null);
    // Deterministic ordering: createdAt, then streamId, then segmentId
    // — so two clients computing the payload from the same outbox
    // produce identical orderIndex assignments server-side.
    uploaded.sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      if (a.streamId !== b.streamId) return a.streamId < b.streamId ? -1 : 1;
      return a.segmentId < b.segmentId ? -1 : a.segmentId === b.segmentId ? 0 : 1;
    });
    return uploaded;
  }

  async function finalize(sessionId: string): Promise<void> {
    const rows = await listAllRowsInternal(sessionId);
    if (rows.length === 0) {
      return;
    }
    await withStore("readwrite", async (store) => {
      for (const r of rows) {
        await reqAsPromise(store.delete(r.id));
      }
    });
    // Drop any timers tied to the removed rows so they can't kick
    // a worker for a session that no longer exists.
    for (const r of rows) {
      const timer = pendingRetryTimerByRow.get(r.id);
      if (timer !== undefined) {
        clearTimeoutFn(timer);
        pendingRetryTimerByRow.delete(r.id);
      }
    }
    // Forget per-session subscribers' last state so the next observe
    // call recomputes from an empty IDB (and emits the new "idle"
    // snapshot).
    lastStateBySession.delete(sessionId);
    await refreshStateAndNotify(sessionId);
    logger.log?.(
      `[upload-outbox] obx=${shortObx} finalized sessionId=${sessionId} rowsDeleted=${rows.length}`
    );
  }

  async function listAllRows(sessionId: string): Promise<OutboxRow[]> {
    return listAllRowsInternal(sessionId);
  }

  async function close(): Promise<void> {
    if (dbPromise) {
      const db = await dbPromise;
      db.close();
      dbPromise = null;
    }
    for (const timer of pendingRetryTimerByRow.values()) {
      clearTimeoutFn(timer);
    }
    pendingRetryTimerByRow.clear();
    drainChainByStream.clear();
    listenersBySession.clear();
    lastStateBySession.clear();
  }

  return {
    enqueue,
    observe,
    drainAndAwait,
    listUploadedSegments,
    finalize,
    listAllRows,
    close,
  };
}

// ----------------------------------------------------------------
// Small utilities
// ----------------------------------------------------------------

function mapsShallowEqual<K, V>(
  a: ReadonlyMap<K, V>,
  b: ReadonlyMap<K, V>
): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    if (b.get(k) !== v) return false;
  }
  return true;
}

/**
 * RFC4122-ish v4 uuid using `crypto.randomUUID` when available, else
 * a `Math.random()` fallback for legacy test runners. We don't need
 * cryptographic strength — these ids are local to one IDB store.
 */
function uuidish(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // 32 chars of base16-ish randomness — collision risk is acceptable.
  return (
    Math.random().toString(16).slice(2) +
    Math.random().toString(16).slice(2)
  ).slice(0, 32);
}
