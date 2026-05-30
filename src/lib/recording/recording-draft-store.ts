"use client";

/**
 * IndexedDB draft store for in-progress MediaRecorder segments (W1 Surface 1).
 *
 * Separate from `tutoring-notes-upload-outbox` — drafts are live chunks that may
 * never reach `stop()`; the outbox contract is completed segments only.
 *
 * Per-session ID logging: every transition logs `dft=<shortId>` (AGENTS.md).
 *
 * Tests: `src/__tests__/recording/recording-draft-store.test.ts`
 */

/** IDB database name — must not collide with upload-outbox (`tutoring-notes-upload-outbox`). */
export const DRAFT_DB_NAME = "tutoring-notes-recording-draft";

/** Object store name within {@link DRAFT_DB_NAME}. */
export const DRAFT_STORE_NAME = "drafts";

const DB_VERSION = 1;

export type DraftSegmentRow = {
  /** `${sessionId}:${streamId}` — one draft per stream per session. */
  key: string;
  sessionId: string;
  streamId: string;
  /** Segment id used when this segment is enqueued to the outbox after recovery. */
  segmentId: string;
  mimeType: string;
  /** Ordered chunks from MediaRecorder.ondataavailable. */
  chunks: Blob[];
  chunkCount: number;
  /** Wall-clock ms when the first chunk arrived (or recording started). */
  firstChunkMs: number;
  /** Wall-clock ms of the most recent chunk / checkpoint. */
  lastChunkMs: number;
  checkpointedAt: number;
  /** Display duration for recovery banner `[N:NN]` (whole seconds). */
  estimatedDurationSec: number;
};

export function draftRowKey(sessionId: string, streamId: string): string {
  return `${sessionId}:${streamId}`;
}

export type RecordingDraftStoreConfig = {
  dbName?: string;
  indexedDB?: IDBFactory;
  logger?: Pick<Console, "log" | "warn" | "error">;
};

export type RecordingDraftStore = {
  checkpoint: (row: DraftSegmentRow) => Promise<void>;
  findInProgress: (
    sessionId: string,
    streamId: string
  ) => Promise<DraftSegmentRow | null>;
  clear: (sessionId: string, streamId: string) => Promise<void>;
  assemble: (row: DraftSegmentRow) => Blob;
  close: () => Promise<void>;
};

/**
 * Concatenate ordered draft chunks into one Blob (recovery Keep path).
 */
export function assembleDraftChunks(row: DraftSegmentRow): Blob {
  return new Blob(row.chunks, { type: row.mimeType });
}

function newDftShortId(): string {
  return Math.random().toString(36).slice(2, 7);
}

export function createRecordingDraftStore(
  config: RecordingDraftStoreConfig = {}
): RecordingDraftStore {
  const dbName = config.dbName ?? DRAFT_DB_NAME;
  const logger = config.logger ?? console;
  const idbFactory = config.indexedDB ?? globalThis.indexedDB;
  if (!idbFactory) {
    throw new Error(
      "createRecordingDraftStore: IndexedDB is not available. Pass `config.indexedDB` in tests."
    );
  }

  let dbPromise: Promise<IDBDatabase> | null = null;

  function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = idbFactory.open(dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DRAFT_STORE_NAME)) {
          db.createObjectStore(DRAFT_STORE_NAME, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
      req.onblocked = () =>
        logger.warn?.("[recording-draft] IDB upgrade blocked by another tab");
    });
    return dbPromise;
  }

  async function withStore<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => Promise<T> | T
  ): Promise<T> {
    const db = await openDb();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE_NAME, mode);
      const store = tx.objectStore(DRAFT_STORE_NAME);
      let result: T;
      let settled = false;
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
            /* ignore */
          }
        });
    });
  }

  return {
    async checkpoint(row: DraftSegmentRow): Promise<void> {
      const dft = newDftShortId();
      await withStore("readwrite", (store) => {
        store.put(row);
      });
      logger.log?.(
        `[recording-draft] dft=${dft} chunk-checkpoint sessionId=${row.sessionId} streamId=${row.streamId} segmentId=${row.segmentId} chunkCount=${row.chunkCount} estimatedDurationSec=${row.estimatedDurationSec}`
      );
    },

    async findInProgress(
      sessionId: string,
      streamId: string
    ): Promise<DraftSegmentRow | null> {
      const key = draftRowKey(sessionId, streamId);
      const row = await withStore("readonly", (store) => {
        return new Promise<DraftSegmentRow | undefined>((resolve, reject) => {
          const req = store.get(key);
          req.onsuccess = () =>
            resolve(req.result as DraftSegmentRow | undefined);
          req.onerror = () => reject(req.error ?? new Error("IDB get failed"));
        });
      });
      if (!row || row.chunkCount === 0) return null;
      const dft = newDftShortId();
      logger.log?.(
        `[recording-draft] dft=${dft} found-on-mount sessionId=${sessionId} streamId=${streamId} chunkCount=${row.chunkCount} segmentId=${row.segmentId}`
      );
      return row;
    },

    async clear(sessionId: string, streamId: string): Promise<void> {
      const key = draftRowKey(sessionId, streamId);
      const dft = newDftShortId();
      await withStore("readwrite", (store) => {
        store.delete(key);
      });
      logger.log?.(
        `[recording-draft] dft=${dft} cleared sessionId=${sessionId} streamId=${streamId}`
      );
    },

    assemble: assembleDraftChunks,

    async close(): Promise<void> {
      if (!dbPromise) return;
      const db = await dbPromise;
      db.close();
      dbPromise = null;
    },
  };
}

// ----------------------------------------------------------------
// Browser singleton (mirrors upload-outbox-instance)
// ----------------------------------------------------------------

let singleton: RecordingDraftStore | null = null;

export function getOrCreateRecordingDraftStore(): RecordingDraftStore {
  if (singleton) return singleton;
  if (typeof window === "undefined" || !globalThis.indexedDB) {
    throw new Error(
      "getOrCreateRecordingDraftStore called outside the browser."
    );
  }
  singleton = createRecordingDraftStore();
  return singleton;
}

export function setRecordingDraftStoreForTests(
  store: RecordingDraftStore | null
): void {
  singleton = store;
}

export function resetRecordingDraftStoreForTests(): void {
  singleton = null;
}
