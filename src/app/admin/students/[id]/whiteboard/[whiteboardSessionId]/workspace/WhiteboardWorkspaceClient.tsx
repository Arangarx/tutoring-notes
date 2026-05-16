"use client";

/**
 * Tutor-side live whiteboard orchestrator.
 *
 * Composes (in dependency order):
 *
 *   1. URL-fragment encryption key — generated on first mount, parked
 *      in `window.location.hash` so refresh keeps the same key. The
 *      server NEVER sees this. Same model the student page uses.
 *
 *   2. Live-sync client — `createWhiteboardSyncClient` against
 *      `WHITEBOARD_SYNC_URL`. Disabled gracefully if the env var is
 *      unset (recording still works in tutor-solo mode).
 *
 *   3. `useWhiteboardRecorder` — produces the canonical event log,
 *      checkpoints to IndexedDB, surfaces resume prompts.
 *
 *   4. Lazy-loaded Excalidraw — `next/dynamic` with `ssr: false`
 *      so the >1MB Excalidraw bundle never lands on initial HTML.
 *
 *   5. End-session flow — flush final events.json, upload to Blob,
 *      call `endWhiteboardSession` (sets endedAt + revokes tokens),
 *      then redirect to the read-only review surface.
 *
 * What's intentionally NOT here yet:
 *
 *   - PDF/image upload toolbar (separate todo `phase1-pdf-upload`).
 *   - Math equation popover (`phase1-math-equations`).
 *   - Desmos embed (`phase1-graphing`).
 *   - Audio capture — one shared `useAudioRecorder` feeds
 *     `WhiteboardWorkspaceAudioBridge`, which renders `RecordingControlPanel`
 *     (same mic UI as the recorder tab) and registers Blob segments with this
 *     session alongside the toolbar Start/Pause presence gate.
 *
 * Failure-mode contract: this component NEVER lets a hook callback
 * throw into the React tree. Every async boundary maps errors to
 * banner state.
 */

import { copyTextToClipboard } from "@/lib/copy-text-to-clipboard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowScrollToTopOnMount } from "@/hooks/useWindowScrollToTopOnMount";
import { useExcalidrawThemeFromSystem } from "@/hooks/useExcalidrawThemeFromSystem";
import { useSyncTombstonedElementIds } from "@/hooks/useSyncTombstonedElementIds";
import { useRouter } from "next/navigation";
import {
  createWhiteboardSyncClient,
  type WhiteboardSyncClient,
  type WhiteboardWireFollow,
} from "@/lib/whiteboard/sync-client";
import {
  clearEncryptionKeyForSession,
  useEncryptionKeyInHash,
} from "@/lib/whiteboard/encryption-key";
import {
  ACTIVE_PING_STALE_MS,
  computeDisplayActiveMs,
} from "@/lib/whiteboard/active-time";
import {
  derivePresentation,
  evaluateLifecycle,
  TUTOR_MIC_STREAM_ID,
  type StreamHealth,
} from "@/lib/recording/lifecycle-machine";
import { useLiveAV } from "@/hooks/useLiveAV";
import { studentMicStreamId } from "@/lib/recording/remote-stream-recorder";
import { AVPermissionsPrompt } from "@/components/av/AVPermissionsPrompt";
import { AVTilesPanel } from "@/components/av/AVTilesPanel";
import { AVControls } from "@/components/av/AVControls";
import {
  useWhiteboardRecorder,
  type ResumeResult,
} from "@/hooks/useWhiteboardRecorder";
import { useTutorLiveDocumentWire } from "@/hooks/useTutorLiveDocumentWire";
import {
  uploadWhiteboardEvents,
  uploadWhiteboardSnapshot,
} from "@/lib/whiteboard/upload";
import { generateSessionSnapshotPng } from "@/lib/whiteboard/snapshot-png";
import { deriveSyncPillState } from "@/lib/whiteboard/sync-pill-presentation";
import {
  endWhiteboardSession,
  issueJoinToken,
  revokeJoinTokensForSession,
} from "@/app/admin/students/[id]/whiteboard/actions";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import {
  assembleEndSessionSegments,
  drainOutboxOrTimeout,
  finalizeOutboxAfterEnd,
  getOrCreateUploadOutbox,
  registerSessionStudentId,
} from "@/lib/recording/upload-outbox-instance";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";
import { PdfImageUploadButton } from "@/components/whiteboard/PdfImageUploadButton";
import { MathInsertButton } from "@/components/whiteboard/MathInsertButton";
import { DesmosInsertButton } from "@/components/whiteboard/DesmosInsertButton";
import { UndoRedoButtons } from "@/components/whiteboard/UndoRedoButtons";
import { ExcalidrawDynamic } from "@/components/whiteboard/ExcalidrawDynamic";
import { type ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import {
  ensureNativeImageAssetUrlsForSync,
  type BinaryFileFromExcalidraw,
} from "@/lib/whiteboard/ensure-native-image-asset-urls-for-sync";
import { hydrateRemoteImageFilesForScene } from "@/lib/whiteboard/hydrate-remote-files";
import { resolveWhiteboardAssetReadUrl } from "@/lib/whiteboard/resolve-asset-read-url";
import type {
  WhiteboardWireBroadcastExtras,
  WhiteboardWireRemoteDetails,
} from "@/lib/whiteboard/sync-client";
import { validateExcalidrawEmbeddable } from "@/lib/whiteboard/validate-embeddable";
import {
  mergeScenesReconciled,
  updateSceneMergingWithRemote,
} from "@/lib/whiteboard/apply-reconciled-remote-scene";
import type { RemoteSceneIngestLogHint } from "@/hooks/useWhiteboardRecorder";
import {
  adaptWBElementsToExcalidraw,
  restoreAndSanitizeForPaint,
} from "@/lib/whiteboard/scene-paint";
import type { WhiteboardBoardDocumentV1 } from "@/lib/whiteboard/board-document-snapshot";
import {
  clearSessionSceneDraft,
  loadTutorSessionRecoveryDraft,
  saveSessionBoardDocument,
} from "@/lib/whiteboard/session-scene-draft";
import {
  WhiteboardWorkspaceAudioBridge,
  type WhiteboardWorkspaceAudioBridgeHandle,
} from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceAudioBridge";

type Props = {
  whiteboardSessionId: string;
  studentId: string;
  studentName: string;
  adminUserId: string;
  startedAtIso: string;
  bothConnectedAtIso: string | null;
  /** Server-truth accumulated billable ms at SSR time. */
  initialActiveMs: number;
  /** Server-stamped wall-clock of the most recent positive heartbeat (ISO), or null if paused. */
  initialLastActiveAtIso: string | null;
  syncUrl: string | null;
  /**
   * Per-student "Start whiteboard recording on by default" preference.
   * Sarah's pilot ask (Apr 2026): the workspace toggle should ship in
   * the right initial position for each student so she's not unticking
   * Start every time for students who declined recording. The tutor
   * can still flip mid-session — this is the initial state only.
   */
  initialUserWantsRecording: boolean;
};

function CanvasPlaceholder({ label }: { label: string }) {
  return (
    <div
      className="card"
      style={{
        minHeight: 540,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div className="muted">{label}</div>
    </div>
  );
}

// The `useEncryptionKeyInHash` hook used to live here as an
// inline helper. It moved to `@/lib/whiteboard/encryption-key` on
// May 15 after pilot smoke exposed that a tutor opening the
// workspace via "Continue" (no hash fragment) silently minted a
// fresh key and broke decryption for every still-connected
// participant. The new module persists the key to localStorage so
// any subsequent mount of the same session recovers it. See the
// module docblock for full lifecycle + threat-model notes.

/**
 * Audio-clock surrogate. The plan calls for `MediaRecorder.getElapsedAudioMs()`
 * (blocker #2) — the audio recorder doesn't expose that yet (tracked
 * in `docs/BACKLOG.md` "Reliability gaps"). Until it lands, we drive
 * `getAudioMs` off `performance.now()` deltas, accumulating across
 * pauses. ms precision; doesn't account for iOS background-tab clock
 * throttling (the BACKLOG item covers that follow-up).
 */
function useAudioMsClock(active: boolean): () => number {
  const startedAtRef = useRef<number | null>(null);
  const accruedMsRef = useRef(0);
  useEffect(() => {
    if (active) {
      startedAtRef.current = performance.now();
    } else if (startedAtRef.current !== null) {
      accruedMsRef.current += performance.now() - startedAtRef.current;
      startedAtRef.current = null;
    }
  }, [active]);
  return useCallback(() => {
    if (startedAtRef.current === null) return Math.floor(accruedMsRef.current);
    return Math.floor(
      accruedMsRef.current + (performance.now() - startedAtRef.current)
    );
  }, []);
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function WhiteboardWorkspaceClient({
  whiteboardSessionId,
  studentId,
  studentName,
  adminUserId,
  startedAtIso,
  bothConnectedAtIso,
  initialActiveMs,
  initialLastActiveAtIso,
  syncUrl,
  initialUserWantsRecording,
}: Props) {
  const router = useRouter();
  const excalidrawTheme = useExcalidrawThemeFromSystem();
  const { onLocalElementSnapshot, shouldDropRemoteElement } =
    useSyncTombstonedElementIds();

  useWindowScrollToTopOnMount();

  // ---------------------------------------------------------------
  // Encryption key + sync client lifecycle
  // ---------------------------------------------------------------

  const encryptionKey = useEncryptionKeyInHash(whiteboardSessionId);
  const syncClientRef = useRef<WhiteboardSyncClient | null>(null);
  const [syncReady, setSyncReady] = useState(false);

  // -----------------------------------------------------------------
  // Diagnostic: mount-phase timeline
  //
  // Logs a single console line each time the workspace transitions
  // through a major mount phase, with t=Nms relative to first mount.
  // Purpose: when the pilot reports "I had to hard refresh to make
  // anything work", the console will show exactly which phase
  // stalled or fired in the wrong order (e.g. mesh built before mic
  // acquired, sync-client never reached connected, first peer
  // joined but never reached ICE-connected, etc.).
  //
  // Every line is gated on a Set so the same phase only logs once
  // per workspace mount — prevents the play-loop or AV reconciler
  // from flooding the console mid-session. Keep the format
  // consistent with the rest of the workspace logs:
  // `[wb-mount] wbsid=<id> phase=<name> t=<ms>ms`.
  // -----------------------------------------------------------------
  const mountStartMsRef = useRef<number>(0);
  const phasesLoggedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    mountStartMsRef.current = performance.now();
    console.log(
      `[wb-mount] wbsid=${whiteboardSessionId} phase=mount t=0ms`
    );
    return () => {
      console.log(
        `[wb-mount] wbsid=${whiteboardSessionId} phase=unmount t=${Math.round(
          performance.now() - mountStartMsRef.current
        )}ms`
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const logMountPhase = useCallback(
    (phase: string, extra?: string) => {
      if (phasesLoggedRef.current.has(phase)) return;
      phasesLoggedRef.current.add(phase);
      const dt = Math.round(performance.now() - mountStartMsRef.current);
      console.log(
        `[wb-mount] wbsid=${whiteboardSessionId} phase=${phase} t=${dt}ms${
          extra ? ` ${extra}` : ""
        }`
      );
    },
    [whiteboardSessionId]
  );
  useEffect(() => {
    if (encryptionKey) logMountPhase("encryption-key-ready");
  }, [encryptionKey, logMountPhase]);
  useEffect(() => {
    if (syncReady) logMountPhase("sync-client-ready");
  }, [syncReady, logMountPhase]);

  // ---------------------------------------------------------------
  // Live-A/V peer-id minting (Phase 4c)
  // ---------------------------------------------------------------
  //
  // ONE stable peer id per workspace mount. We thread it to BOTH
  // `createWhiteboardSyncClient({peerId})` AND `useLiveAV({localPeerId})`
  // so the sync-client wire envelopes carry the SAME peerId that
  // peer-mesh + signaling use for polite/impolite role + targetPeerId
  // demux. Resolves the open scoping question from PHASE-4B-STATUS:
  // we mint here (workspace = single source of truth) rather than
  // having sync-client expose its own minted id.
  //
  // `useMemo([])` is stable across renders within the same React
  // component instance. HMR remounts produce a new id along with a
  // new sync-client; both layers agree.
  const localPeerId = useMemo(() => {
    if (
      typeof globalThis.crypto !== "undefined" &&
      typeof globalThis.crypto.randomUUID === "function"
    ) {
      return globalThis.crypto.randomUUID();
    }
    return `tutor-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }, []);
  // Display label for the tutor's own presence frame. Server-side
  // doesn't pass the tutor's display name through props today; fall
  // back to "Tutor" so we don't block hook usage on the label being
  // present. Future polish: thread `adminUser.displayName` here.
  const localPeerLabel: string | undefined = "Tutor";

  // Captured from Excalidraw's `excalidrawAPI` callback — the toolbar
  // buttons (Insert PDF/image, etc.) call into this for scene mutation.
  // Stored in state (not just a ref) so children re-render when it
  // becomes available.
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawApiLike | null>(
    null
  );
  const excalidrawAPIRef = useRef<ExcalidrawApiLike | null>(null);
  const applyingRemoteToCanvasRef = useRef(false);
  /**
   * Ref-count for programmatic `updateScene` when switching/adding board tabs.
   * This is separate from `applyingRemoteToCanvasRef` (used by async remote
   * merge) so a trailing Excalidraw onChange in a microtask cannot smear the
   * *previous* tab into the new `pageDataRef` key after a fast page flip.
   * We decrement from `setTimeout(0)` (macrotask) so microtask onChange runs
   * while this count is still positive. A stack covers several clicks before the first
   * timeout runs.
   */
  const pageSwitchProgrammaticRef = useRef(0);
  /** Per-tab sessionStorage draft — see `session-scene-draft.ts`. */
  const sceneDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHydratedSessionDraftRef = useRef(false);

  useEffect(() => {
    return () => {
      if (sceneDraftTimerRef.current !== null) {
        clearTimeout(sceneDraftTimerRef.current);
        sceneDraftTimerRef.current = null;
      }
    };
  }, []);
  const loadedRemoteFileIdsForTutorRef = useRef(new Set<string>());
  const giveUpTutorFileIdsRef = useRef(new Set<string>());
  const warnDedupeTutorRef = useRef(new Set<string>());
  /** Native Excalidraw image inserts: cache fileId → blob URL after upload for sync + student hydrate. */
  const tutorNativeImageFileIdToAssetUrlRef = useRef(new Map<string, string>());
  const tutorNativeImageUploadInFlightRef = useRef(new Set<string>());
  /**
   * Populated every render after `useWhiteboardRecorder` returns — used by
   * `onNewRemotePeer` on the sync client so a student reload/new tab gets a
   * non-stale, visible-tab scene (see sync-client `new-user` handler).
   */
  const tutorResyncOnNewRemotePeerRef = useRef<() => void | Promise<void>>(
    () => undefined
  );

  const [pageList, setPageList] = useState(() => [
    { id: "p1", title: "Page 1" },
  ]);
  /**
   * Same rows as `pageList`, updated synchronously before any wire
   * `getWireBroadcastExtras` call. React state lags by one frame — using it in
   * extras after "Add page" used to send `activePageId` for the new tab but a
   * one-tab `pageList`, and a trailing p1 flush could re-follow the student
   * to page 1 after they had already switched to the new tab.
   */
  const pageListRef = useRef(pageList);
  useEffect(() => {
    pageListRef.current = pageList;
  }, [pageList]);
  const [activePageId, setActivePageId] = useState("p1");
  const activePageIdRef = useRef("p1");
  useEffect(() => {
    activePageIdRef.current = activePageId;
  }, [activePageId]);
  /** In-memory per-tab scene (Excalidraw only shows one at a time). */
  const pageDataRef = useRef<Record<string, ReadonlyArray<ExcalidrawLikeElement>>>(
    Object.create(null)
  );

  const [peerImageMaterialNotice, setPeerImageMaterialNotice] = useState<
    "none" | "load" | "missing"
  >("none");

  const applyRemoteToCanvas = useCallback(
    async (
      elements: ReadonlyArray<ExcalidrawLikeElement>,
      details?: Pick<WhiteboardWireRemoteDetails, "page" | "scenePageId">
    ): Promise<RemoteSceneIngestLogHint | void> => {
      const api = excalidrawAPIRef.current;
      if (!api) return;
      // `scenePageId` is which page this `elements` snapshot belongs to (may
      // lag the tutor’s visible tab when the wire diff is throttled).
      const targetId = details?.scenePageId ?? details?.page?.activePageId ?? "p1";
      const curActive = activePageIdRef.current;

      const result = await hydrateRemoteImageFilesForScene(
        api,
        elements,
        loadedRemoteFileIdsForTutorRef.current,
        {
          logContext: "tutor",
          giveUpFileIds: giveUpTutorFileIdsRef.current,
          warnDedupe: warnDedupeTutorRef.current,
          resolveReadUrl: (u) =>
            resolveWhiteboardAssetReadUrl(u, {
              kind: "tutor",
              whiteboardSessionId,
            }),
        }
      );
      if (result.fetchFailed.length > 0) {
        setPeerImageMaterialNotice("load");
      } else if (result.missingAssetUrlFileIds.length > 0) {
        setPeerImageMaterialNotice((prev) =>
          prev === "load" ? "load" : "missing"
        );
      }
      const appState = api.getAppState() as unknown;

      if (targetId === curActive) {
        applyingRemoteToCanvasRef.current = true;
        try {
          await updateSceneMergingWithRemote(api, elements, {
            shouldDropRemoteElement,
          });
          const merged = api.getSceneElements() as ExcalidrawLikeElement[];
          pageDataRef.current[curActive] = merged;
          return { recordScene: merged };
        } finally {
          applyingRemoteToCanvasRef.current = false;
        }
      }

      const prev =
        (pageDataRef.current[targetId] as
          | ReadonlyArray<ExcalidrawLikeElement>
          | undefined) ?? [];
      const merged = await mergeScenesReconciled(
        prev,
        elements,
        appState,
        { shouldDropRemoteElement }
      );
      pageDataRef.current[targetId] = merged;
      return { record: "skip" };
    },
    [shouldDropRemoteElement, whiteboardSessionId]
  );

  useEffect(() => {
    if (!syncUrl || !encryptionKey) return;
    const client = createWhiteboardSyncClient({
      url: syncUrl,
      roomId: whiteboardSessionId,
      encryptionKeyBase64Url: encryptionKey,
      role: "tutor",
      // Phase 4c: same peerId is threaded into useLiveAV() below so
      // the presence + signaling envelopes match the mesh's
      // polite/impolite role assignment.
      peerId: localPeerId,
      localPeerLabel,
      onNewRemotePeer: () => {
        void tutorResyncOnNewRemotePeerRef.current();
      },
    });
    syncClientRef.current = client;
    setSyncReady(true);
    return () => {
      client.disconnect();
      syncClientRef.current = null;
      setSyncReady(false);
    };
  }, [
    encryptionKey,
    syncUrl,
    whiteboardSessionId,
    localPeerId,
    localPeerLabel,
  ]);

  // ---------------------------------------------------------------
  // Recording lifecycle (audio + whiteboard composed)
  // ---------------------------------------------------------------
  //
  // The workspace "Start recording" / "Pause recording" buttons gate BOTH
  // `WhiteboardWorkspaceAudioBridge` (real mic → Blob → SessionRecording rows)
  // and `useWhiteboardRecorder` via the same `recordingActive` presence gate.
  //
  // What's wired:
  //   - `recordingActive` → useWhiteboardRecorder + audio pause/resume ✔
  //   - `getAudioMs`      → performance.now()-based surrogate (clock tracks
  //                         the same pauses as strokes; optional refinement:
  //                         read live elapsed from the audio hook).
  //   - Mic picker / meter / timer → `RecordingControlPanel` in the bridge ✔

  // `userWantsRecording` is the tutor's explicit intent (Start / Pause
  // button). The actual `recordingActive` we hand to the recorder hook
  // is the AND of intent + presence so the recorder pauses itself
  // when the student drops — see `deriveRecordingPresence` below.
  // Sarah's pilot ask (Apr 2026): "I don't think the recording needs
  // to keep going if the student isn't connected."
  //
  // The initial value comes from `Student.recordingDefaultEnabled`
  // (also Sarah's ask): students who declined recording ship the
  // toggle off so the tutor doesn't have to untick Start every time.
  // The tutor can still flip mid-session.
  const [userWantsRecording, setUserWantsRecording] = useState(
    initialUserWantsRecording
  );

  const sync = syncReady ? syncClientRef.current : null;

  // Peer count (= number of OTHER peers; >=1 means a student joined).
  const [peerCount, setPeerCount] = useState(0);

  useEffect(() => {
    if (!sync) return;
    const off = sync.onPeerCountChange((count) => {
      setPeerCount(count);
    });
    return off;
  }, [sync]);

  // Tutor's own socket state (independent of gated recording).
  const [tutorSyncConnected, setTutorSyncConnected] = useState(false);

  useEffect(() => {
    if (!sync) {
      setTutorSyncConnected(false);
      return;
    }
    const off1 = sync.onConnect(() => setTutorSyncConnected(true));
    const off2 = sync.onDisconnect(() => setTutorSyncConnected(false));
    setTutorSyncConnected(sync.isConnected());
    return () => {
      off1();
      off2();
    };
  }, [sync]);

  // We compute `bothPartiesInRoom` from sync-client peer count + tutor socket
  // state. That feeds billing pings, pills, and the session timer — not the same
  // as the **recording gate** when `NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT` lets
  // tutors rehearse with sync configured but nobody in the room yet (smoke /
  // practice only; resets once anyone has joined this session).

  const bothPartiesInRoom = tutorSyncConnected && peerCount >= 1;

  // Sticky latch: once both parties have ever met this session, we
  // know future "auto-pauses" are reconnect waits, not first-join
  // waits. Lets the banner say "we'll resume automatically" instead
  // of "we'll start when they join" after the first meet.
  const everBothPresentRef = useRef(false);
  if (bothPartiesInRoom && !everBothPresentRef.current) {
    everBothPresentRef.current = true;
  }

  const allowRecordSoloUntilStudentJoin =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT === "1";

  // Phase 1a Pillar 1: replace the Phase-0 `deriveRecordingPresence`
  // helper with the multi-stream / multi-participant lifecycle FSM.
  // Same observable behaviour for the 1:1 case Sarah uses today; the
  // FSM is structurally ready for group sessions and the Phase-1b
  // outbox. Inputs:
  //
  //  - `participants`        — synthesised peer-id Set sized by the
  //                            sync-client peerCount. Until Phase 4
  //                            wires real per-peer ids, the ids are
  //                            stable per-render placeholders; the
  //                            FSM only consumes `.size`.
  //  - `everHadParticipants` — driven by the existing
  //                            `everBothPresentRef` latch.
  //  - `soloEnabled`         — surfaces the
  //                            NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT
  //                            grace window the workspace already
  //                            honored. The FSM does the AND with
  //                            `!everHadParticipants` itself.
  //  - `inputStreams`        — for Phase 1a the only stream the
  //                            workspace knows about is the tutor
  //                            mic, and only while the tutor wants
  //                            recording. Marked `ok` because the
  //                            audio bridge owns liveness today;
  //                            Phase 1b/4 will wire real health.
  //  - `networkOk`           — kept `true` (default) so we don't
  //                            introduce new pause behaviour in
  //                            Phase 1a. Phase 1b/4 will plumb
  //                            `navigator.onLine` + sync-transport
  //                            health through here.
  //  - `endIntent`           — undefined (Phase 1b wires the End
  //                            flow through the FSM).
  const lifecycleParticipants = useMemo<ReadonlySet<string>>(() => {
    if (peerCount <= 0) return new Set();
    const ids = new Set<string>();
    for (let i = 0; i < peerCount; i += 1) ids.add(`peer-${i}`);
    return ids;
  }, [peerCount]);

  // ---------------------------------------------------------------
  // Audio recording hook (must come before liveAv so we can pass
  // localMicStream to useLiveAV to avoid double getUserMedia)
  // ---------------------------------------------------------------

  /**
   * Hand `useAudioRecorder` a callback that drops every finished
   * segment into the IndexedDB outbox. From Commit 4 on, the
   * workspace doesn't need to track in-flight Promises here — the
   * outbox owns the segment lifecycle and the audio bridge observes
   * outbox state directly to drive End-session UI copy.
   *
   * The hook already uploaded the Blob to Vercel Blob by the time it
   * calls us (see `useAudioRecorder.onstop`), so we pass `blobRemoteUrl`
   * through on enqueue. The local Blob still gets stored in IDB as
   * the recovery anchor — if the tab refreshes after the outbox row
   * lands but before End-session, the worker can re-upload from the
   * persisted Blob rather than losing the segment.
   */
  const onWorkspaceAudioRecorded = useCallback(
    async (
      audioSeg: {
        blobUrl: string;
        mimeType: string;
        sizeBytes: number;
        blob?: Blob;
      },
      _meta?: { autoRollover?: boolean }
    ) => {
      const segmentId =
        typeof globalThis.crypto?.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `seg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      try {
        const outbox = getOrCreateUploadOutbox();
        await outbox.enqueue({
          sessionId: whiteboardSessionId,
          // Phase 1b hardcodes the tutor mic stream here — Phase 4
          // will pass `studentMicStreamId(peerId)` for student
          // capture by mapping over peer connections, not by
          // adding a new code path.
          streamId: TUTOR_MIC_STREAM_ID,
          segmentId,
          blobLocalRef: audioSeg.blob ?? null,
          blobRemoteUrl: audioSeg.blobUrl,
          mimeType: audioSeg.mimeType,
          sizeBytes: audioSeg.sizeBytes,
          audioStartedAtMs: Date.now(),
        });
      } catch (err) {
        // Never throw — useAudioRecorder.onRecorded swallows the
        // return value; surfacing this as a banner would race with
        // the outbox's own "failed" state. Log + carry on.
        console.error(
          `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} outbox.enqueue failed`,
          err
        );
      }
    },
    [whiteboardSessionId]
  );

  const workspaceAudio = useAudioRecorder({
    studentId,
    onRecorded: onWorkspaceAudioRecorded,
    // Seed the displayed recording timer at the session's already-elapsed
    // time so a page refresh doesn't reset it to 0 while the session
    // timer stays at e.g. "12:34". Uses the server-truth value from SSR.
    initialElapsedSeconds: Math.floor(initialActiveMs / 1000),
  });
  const workspaceAudioRef = useRef(workspaceAudio);
  workspaceAudioRef.current = workspaceAudio;

  // ---------------------------------------------------------------
  // Live-A/V hook (Phase 4c)
  // ---------------------------------------------------------------
  //
  // Threads the same `localPeerId` as the sync-client envelope so
  // peer-mesh's polite/impolite role + signaling's targetPeerId demux
  // see one consistent id. The hook is INERT until the
  // AVPermissionsPrompt below calls `requestMic()` / `requestCam()`,
  // so workspace mount alone does NOT prompt the tutor for camera
  // access. This is a 4b realignment contract.
  //
  // externalAudioStream: we pass the recording's mic stream here so
  // useLiveAV doesn't call getUserMedia a second time. Two simultaneous
  // acquisitions from the same hardware mic trigger Chrome's shared
  // audio-processing pipeline in a way that can suppress the source
  // signal in BOTH streams via echo-cancellation cross-talk, causing the
  // tutor's voice to be missing from both the recording and the WebRTC
  // send. The hook clones the stream so live-AV mute stays independent
  // of the recording's own track.
  const liveAv = useLiveAV({
    syncClient: sync,
    localPeerId,
    sessionId: whiteboardSessionId,
    externalAudioStream: workspaceAudio.localMicStream,
  });

  // -----------------------------------------------------------------
  // Diagnostic: AV mount phases — surfaces the gap between
  // "AVPermissionsPrompt rendered" and "first peer ICE-connected"
  // so we can root-cause the "had to hard refresh to allow camera /
  // got stuck in Connecting…" pilot symptoms.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (liveAv.localAudioStream) {
      logMountPhase(
        "av-local-audio-ready",
        `tracks=${liveAv.localAudioStream.getAudioTracks().length}`
      );
    }
  }, [liveAv.localAudioStream, logMountPhase]);
  useEffect(() => {
    if (liveAv.localVideoStream) {
      logMountPhase(
        "av-local-video-ready",
        `tracks=${liveAv.localVideoStream.getVideoTracks().length}`
      );
    }
  }, [liveAv.localVideoStream, logMountPhase]);
  useEffect(() => {
    if (liveAv.participants.length > 0) {
      logMountPhase(
        "av-first-peer-joined",
        `peer=${liveAv.participants[0]!.peerId} role=${liveAv.participants[0]!.role}`
      );
      const firstConnected = liveAv.participants.find(
        (p) => p.peerConnectionState === "connected"
      );
      if (firstConnected) {
        logMountPhase(
          "av-first-peer-connected",
          `peer=${firstConnected.peerId}`
        );
      }
    }
  }, [liveAv.participants, logMountPhase]);

  // Phase 4c: per-peer "Don't record this student" moderation. State
  // is host-owned (workspace) so the recorder hook stays pure. Wire-
  // level mute (asking the remote peer to actually stop transmitting)
  // stays post-v1 and out of scope.
  const [mutedPeerIdsInRecording, setMutedPeerIdsInRecording] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const handleToggleParticipantMod = useCallback(
    (peerId: string, nextMutedInRecording: boolean) => {
      setMutedPeerIdsInRecording((prev) => {
        const next = new Set(prev);
        if (nextMutedInRecording) next.add(peerId);
        else next.delete(peerId);
        console.log(
          `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} avx=${whiteboardSessionId} peer=${peerId} moderation=${
            nextMutedInRecording ? "muted-in-recording" : "unmuted"
          }`
        );
        return next;
      });
    },
    [whiteboardSessionId]
  );

  // Phase 4c: sync-reconnect → mesh.restart(peerId) for each current
  // peer (the 4b deferral). Sync-client reconnects automatically on
  // socket-level disconnects; peer-mesh's auto-restart only fires on
  // ICE-failed (longer timeout). Restarting on sync re-connect
  // recovers in-flight negotiations that lost their SDP mid-flight.
  //
  // We track "saw a disconnect since the last connect" rather than
  // raw connected state because the FIRST `onConnect` after mount
  // is the natural socket handshake — peer-mesh is being set up for
  // the first time and there's no prior in-flight negotiation to
  // recover. Only the disconnect→reconnect transition needs
  // mesh.restart.
  const sawDisconnectSinceLastConnectRef = useRef(false);
  useEffect(() => {
    if (!sync) {
      sawDisconnectSinceLastConnectRef.current = false;
      return;
    }
    const offConnect = sync.onConnect(() => {
      const shouldRestart = sawDisconnectSinceLastConnectRef.current;
      sawDisconnectSinceLastConnectRef.current = false;
      if (!shouldRestart) return;
      const current = liveAv.participants;
      if (current.length === 0) return;
      console.log(
        `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} avx=${whiteboardSessionId} sync-reconnect peers=${current.length}`
      );
      for (const p of current) {
        try {
          liveAv.reconnectPeer(p.peerId);
        } catch (err) {
          console.warn(
            `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} mesh.restart threw peer=${p.peerId}`,
            err
          );
        }
      }
    });
    const offDisconnect = sync.onDisconnect(() => {
      sawDisconnectSinceLastConnectRef.current = true;
    });
    return () => {
      offConnect();
      offDisconnect();
    };
  }, [sync, liveAv, whiteboardSessionId]);

  const lifecycleInputStreams = useMemo<
    ReadonlyMap<string, StreamHealth>
  >(() => {
    const map = new Map<string, StreamHealth>();
    if (userWantsRecording) {
      map.set(TUTOR_MIC_STREAM_ID, "ok");
    }
    // Phase 4c: one input-stream entry per live participant audio
    // stream. The FSM's `shouldCapture(streamId)` predicate is what
    // each `remote-stream-recorder` reads to decide start/stop, so
    // the recording state and the live-A/V state stay coupled
    // through one decision point.
    for (const p of liveAv.participants) {
      if (!p.audioStream) continue;
      let health: StreamHealth;
      switch (p.peerConnectionState) {
        case "connected":
          health = "ok";
          break;
        case "new":
        case "connecting":
        case "disconnected":
          health = "degraded";
          break;
        case "failed":
        case "closed":
          health = "failed";
          break;
        default:
          health = "degraded";
      }
      map.set(studentMicStreamId(p.peerId), health);
    }
    return map;
  }, [userWantsRecording, liveAv.participants]);

  const lifecycle = evaluateLifecycle({
    tutorWantsRecording: userWantsRecording,
    participants: lifecycleParticipants,
    everHadParticipants: everBothPresentRef.current,
    soloEnabled: allowRecordSoloUntilStudentJoin,
    syncEnabled: !!syncUrl,
    inputStreams: lifecycleInputStreams,
    networkOk: true,
    audioClockMs: 0,
  });

  const presence = derivePresentation(lifecycle, {
    tutorWantsRecording: userWantsRecording,
    participants: lifecycleParticipants,
    everHadParticipants: everBothPresentRef.current,
    syncEnabled: !!syncUrl,
  });
  const recordingActive = presence.recordingActive;

  // Phase 4c (May 15 redesign): record EVERYONE into a single audio
  // mixdown rather than one MediaRecorder per peer. Why:
  //
  //   - The replay UI plays a single audio file per session (the
  //     "first audio recording by createdAt"). With per-peer recorders,
  //     whichever stream's first segment uploaded first won the race
  //     and became the replay audio, so sessions inconsistently played
  //     back EITHER the tutor's voice OR the student's voice — never
  //     both. A mixdown sidesteps the multi-stream-sync problem in the
  //     replay UI entirely.
  //   - Web Audio sums implicitly: every node connected to the same
  //     MediaStreamDestination is mixed automatically. The graph in
  //     `mic-recorder-audio.ts` already owns recordingStream; we just
  //     attach each remote participant's audioStream as an additional
  //     input.
  //   - Per-peer moderation ("Don't record this student") becomes a
  //     post-v1 backlog item — see BACKLOG.md "tutor-side per-peer
  //     audio moderation" entry. v1 falls back to the tutor verbally
  //     asking the student to mute. The UI moderation toggle still
  //     renders so it remains discoverable when we wire it back up.
  //
  // The reconcile effect below maintains a per-stream unsubscribe
  // map keyed on `MediaStream` identity. It runs whenever the
  // participants list changes OR when the audio graph transitions
  // from null → ready (workspaceAudio.localMicStream changes).
  const remoteAudioSubsRef = useRef(new Map<MediaStream, () => void>());
  const workspaceAudioAddRemoteAudio = workspaceAudio.addRemoteAudio;
  const workspaceAudioLocalMicStream = workspaceAudio.localMicStream;
  useEffect(() => {
    const subs = remoteAudioSubsRef.current;
    if (!workspaceAudioLocalMicStream) {
      // Graph not ready (mic not acquired yet) or graph just got
      // disposed. Drop any stale subs — they reference an audio
      // context that's gone — and wait. The effect will re-run when
      // the graph rebuilds (workspaceAudio.localMicStream flips
      // non-null again).
      for (const u of subs.values()) {
        try {
          u();
        } catch {
          /* ignore */
        }
      }
      subs.clear();
      return;
    }
    const seen = new Set<MediaStream>();
    for (const p of liveAv.participants) {
      if (!p.audioStream) continue;
      seen.add(p.audioStream);
      if (subs.has(p.audioStream)) continue;
      try {
        const unsub = workspaceAudioAddRemoteAudio(p.audioStream);
        subs.set(p.audioStream, unsub);
        console.log(
          `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} avx=${whiteboardSessionId} mixdown-attach peer=${p.peerId} streamId=${studentMicStreamId(p.peerId)}`
        );
      } catch (err) {
        console.warn(
          `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} mixdown-attach failed peer=${p.peerId}`,
          (err as Error)?.message ?? String(err)
        );
      }
    }
    for (const [stream, unsub] of [...subs.entries()]) {
      if (seen.has(stream)) continue;
      try {
        unsub();
      } catch {
        /* ignore */
      }
      subs.delete(stream);
    }
  }, [
    liveAv.participants,
    workspaceAudioAddRemoteAudio,
    workspaceAudioLocalMicStream,
    whiteboardSessionId,
  ]);

  // Drop every sub on unmount as a belt-and-suspenders teardown —
  // disposing the audio graph already detaches them implicitly, but
  // calling our own unsubs first keeps the bookkeeping clean if
  // useAudioRecorder's dispose order ever changes.
  useEffect(() => {
    return () => {
      const subs = remoteAudioSubsRef.current;
      for (const u of subs.values()) {
        try {
          u();
        } catch {
          /* ignore */
        }
      }
      subs.clear();
    };
  }, []);

  /**
   * Register (sessionId, studentId) with the outbox so the production
   * uploader can scope per-student Blob pathnames the same way
   * `uploadAudioDirect` does in the legacy path. Idempotent — re-mounts
   * call it again and it overwrites the same key.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    registerSessionStudentId(whiteboardSessionId, studentId);
  }, [whiteboardSessionId, studentId]);

  const getAudioMs = useAudioMsClock(recordingActive);

  const getWireBroadcastExtras = useCallback(():
    | WhiteboardWireBroadcastExtras
    | null => {
    if (!syncUrl) return null;
    const api = excalidrawAPIRef.current;
    if (!api) return null;
    const st = api.getAppState() as {
      scrollX: number;
      scrollY: number;
      zoom: { value: number };
    };
    return {
      follow: {
        scrollX: st.scrollX,
        scrollY: st.scrollY,
        zoom: st.zoom.value,
      },
      page: {
        // Ref — not React state — so rapid tab switches don’t lag one frame
        // behind the canvas (state updates async; ref updates in selectTutorPage).
        activePageId: activePageIdRef.current,
        pageList: pageListRef.current.map((p) => ({ id: p.id, title: p.title })),
      },
      // Same ref as throttled flush — immediate broadcast (e.g. native image) stays consistent.
      scenePageId: activePageIdRef.current,
    };
  }, [syncUrl]);

  const getTutorDocumentPagesSnapshot = useCallback(() => {
    const api = excalidrawAPIRef.current;
    const cur = activePageIdRef.current;
    const out: Record<string, ReadonlyArray<ExcalidrawLikeElement>> = {};
    for (const p of pageListRef.current) {
      if (p.id === cur && api) {
        // `pageDataRef` is updated from onChange; when it is defined, trust it
        // so we don’t read `getSceneElements()` one frame after a tab switch
        // and accidentally ship the previous tab’s pixels into the new tab.
        const cached = pageDataRef.current[p.id] as
          | ExcalidrawLikeElement[]
          | undefined;
        if (cached !== undefined) {
          out[p.id] = cached;
        } else {
          out[p.id] = api.getSceneElements() as ExcalidrawLikeElement[];
        }
      } else {
        out[p.id] = pageDataRef.current[p.id] ?? [];
      }
    }
    return out;
  }, []);

  /** IndexedDB checkpoint + sessionStorage: full multi-page snapshot. */
  const buildBoardDocumentForCheckpoint =
    useCallback((): WhiteboardBoardDocumentV1 | null => {
      const perTab = getTutorDocumentPagesSnapshot();
      if (Object.keys(perTab).length === 0) return null;
      const pages: Record<string, ReadonlyArray<unknown>> = {};
      for (const [id, els] of Object.entries(perTab)) {
        pages[id] = (els as ExcalidrawLikeElement[]).map(
          (e) => ({ ...e }) as ExcalidrawLikeElement
        ) as unknown as ReadonlyArray<unknown>;
      }
      return {
        v: 1,
        pageList: pageListRef.current.map((p) => ({ id: p.id, title: p.title })),
        activePageId: activePageIdRef.current,
        pages,
      };
    }, [getTutorDocumentPagesSnapshot]);

  /** W6: persist immediately on tab hide / refresh — do not rely only on the 800ms debounced `onChange` draft save. */
  const flushSessionBoardDocumentNow = useCallback(() => {
    try {
      const doc = buildBoardDocumentForCheckpoint();
      if (doc) {
        saveSessionBoardDocument(whiteboardSessionId, doc);
      }
    } catch {
      // sessionStorage quota / private mode
    }
  }, [buildBoardDocumentForCheckpoint, whiteboardSessionId]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      flushSessionBoardDocumentNow();
    };
    const onPageHide = () => {
      flushSessionBoardDocumentNow();
    };
    const onBeforeUnload = () => {
      flushSessionBoardDocumentNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flushSessionBoardDocumentNow]);

  const getTutorLiveFollow = useCallback((): WhiteboardWireFollow => {
    const api = excalidrawAPIRef.current;
    if (!api) {
      return { scrollX: 0, scrollY: 0, zoom: 1 };
    }
    const st = api.getAppState() as {
      scrollX: number;
      scrollY: number;
      zoom: { value: number };
    };
    return { scrollX: st.scrollX, scrollY: st.scrollY, zoom: st.zoom.value };
  }, []);

  const getTutorPageListAndActive = useCallback(
    () => ({
      pageList: pageListRef.current,
      activePageId: activePageIdRef.current,
    }),
    []
  );

  const { scheduleDocumentBroadcast, flushDocumentBroadcastNow } =
    useTutorLiveDocumentWire({
      enabled: Boolean(sync) && Boolean(syncUrl),
      sync,
      getPagesSnapshot: getTutorDocumentPagesSnapshot,
      getPageListAndActive: getTutorPageListAndActive,
      getFollow: getTutorLiveFollow,
    });

  const recorder = useWhiteboardRecorder({
    whiteboardSessionId,
    adminUserId,
    studentId,
    startedAtIso,
    getAudioMs,
    recordingActive,
    sync,
    applyRemoteToCanvas,
    getScenePageIdForBroadcast: () => activePageIdRef.current,
    getWireBroadcastExtras: syncUrl ? getWireBroadcastExtras : undefined,
    /** v3 full-document path owns tutor → student live bytes; v2 from recorder is off. */
    includeLiveSyncBroadcast: !sync,
    getBoardDocumentForCheckpoint: buildBoardDocumentForCheckpoint,
  });
  const { flushThrottledFrameNow, onCanvasChange: recorderOnCanvasChange } =
    recorder;
  tutorResyncOnNewRemotePeerRef.current = async () => {
    flushThrottledFrameNow();
    flushDocumentBroadcastNow();
  };

  const selectTutorPage = useCallback(
    async (nextId: string) => {
      if (nextId === activePageIdRef.current) return;
      const api = excalidrawAPIRef.current;
      if (!api) {
        activePageIdRef.current = nextId;
        setActivePageId(nextId);
        return;
      }
      // Drain the throttled onChange+event log for the old tab *before* we
      // bump `activePageIdRef`.
      flushThrottledFrameNow();
      const from = activePageIdRef.current;
      // `getSceneElements()` can still reflect the *previous* tab for a frame when
      // the user flips pages faster than Excalidraw flushes. onChange is keyed by
      // `activePageIdRef` and already mirrors the true per-tab state.
      if (pageDataRef.current[from] === undefined) {
        pageDataRef.current[from] = api.getSceneElements() as ReadonlyArray<ExcalidrawLikeElement>;
      }
      const next =
        (pageDataRef.current[nextId] as
          | ReadonlyArray<ExcalidrawLikeElement>
          | undefined) ?? [];
      // PDF / uploaded images: Excalidraw drops unreferenced `fileId` binaries
      // when the scene is replaced by another tab — re-fetch from `assetUrl`
      // before `updateScene` so we don’t show empty image frames.
      pageSwitchProgrammaticRef.current += 1;
      try {
        // Bump active only after the programmatic guard: otherwise a trailing
        // onChange can stamp the old tab’s pixels into `pageDataRef[nextId]`.
        activePageIdRef.current = nextId;
        const hydrateRes = await hydrateRemoteImageFilesForScene(
          api,
          next,
          loadedRemoteFileIdsForTutorRef.current,
          {
            logContext: "tutor",
            giveUpFileIds: giveUpTutorFileIdsRef.current,
            warnDedupe: warnDedupeTutorRef.current,
            resolveReadUrl: (u) =>
              resolveWhiteboardAssetReadUrl(u, {
                kind: "tutor",
                whiteboardSessionId,
              }),
          }
        );
        if (hydrateRes.fetchFailed.length > 0) {
          setPeerImageMaterialNotice("load");
        } else if (hydrateRes.missingAssetUrlFileIds.length > 0) {
          setPeerImageMaterialNotice((prev) => (prev === "load" ? "load" : "missing"));
        }
        api.updateScene({ elements: next as ReadonlyArray<unknown> });
      } finally {
        setTimeout(() => {
          pageSwitchProgrammaticRef.current = Math.max(
            0,
            pageSwitchProgrammaticRef.current - 1
          );
        }, 0);
      }
      setActivePageId(nextId);
      flushDocumentBroadcastNow();
    },
    [flushDocumentBroadcastNow, flushThrottledFrameNow, whiteboardSessionId]
  );

  const addTutorPage = useCallback(() => {
    const api = excalidrawAPIRef.current;
    const from = activePageIdRef.current;
    if (api) {
      if (pageDataRef.current[from] === undefined) {
        pageDataRef.current[from] = api.getSceneElements() as ReadonlyArray<ExcalidrawLikeElement>;
      }
    }
    const n = pageList.length + 1;
    const newId = `p${Date.now()}`;
    const nextList = [...pageList, { id: newId, title: `Page ${n}` }];
    pageListRef.current = nextList;
    setPageList(nextList);
    pageDataRef.current[newId] = [];
    // Still on `from`: drain the last throttled event-log frame for the leaving page.
    flushThrottledFrameNow();
    if (api) {
      pageSwitchProgrammaticRef.current += 1;
      try {
        activePageIdRef.current = newId;
        api.updateScene({ elements: [] });
      } finally {
        setTimeout(() => {
          pageSwitchProgrammaticRef.current = Math.max(
            0,
            pageSwitchProgrammaticRef.current - 1
          );
        }, 0);
      }
    } else {
      activePageIdRef.current = newId;
    }
    setActivePageId(newId);
    if (api) {
      flushDocumentBroadcastNow();
    }
  }, [flushDocumentBroadcastNow, flushThrottledFrameNow, pageList]);

  // ---------------------------------------------------------------
  // Live timer — Wyzant-style "both connected" billable clock
  // ---------------------------------------------------------------
  //
  // Sarah's expectation (Apr 2026): the timer should PAUSE whenever
  // the student isn't in the room. Wall-clock from a single anchor
  // doesn't satisfy that — a student dropping off mid-session would
  // keep the clock running.
  //
  // Implementation:
  //   1. Watch sync-client peer count + tutor's own connection state
  //      to decide "are both parties present right now?".
  //   2. While both-present, POST a heartbeat to /active-ping every
  //      ~10s. The server adds (now - lastActiveAt) to the persisted
  //      `activeMs` (with a staleness cap so a closed tab doesn't
  //      retroactively bill).
  //   3. On flip to NOT-present, fire a `false` ping immediately.
  //   4. On window unload, fire a `false` beacon so the segment
  //      closes even if the tutor closes the tab abruptly.
  //   5. Display `activeMs (server) + (now - lastActiveAt)` while
  //      we're locally active so the pill keeps ticking between
  //      heartbeats; otherwise display the server value verbatim.
  //   6. On mount and every ~30s, GET /timer-anchor to stay in sync
  //      with cross-device tutor refreshes.
  //
  // Legacy `bothConnectedAt` is still stamped (by the student page on
  // first open + by the active-ping route on first positive ping)
  // so the read-only review surface keeps showing "first overlap
  // at HH:MM" — but the displayed live timer no longer reads from it.
  void bothConnectedAtIso; // kept on the prop boundary for SSR; not used here

  // Server-truth state, refreshed by the polling effect below.
  const [serverActiveMs, setServerActiveMs] = useState<number>(initialActiveMs);
  const [serverLastActiveAtMs, setServerLastActiveAtMs] = useState<
    number | null
  >(initialLastActiveAtIso ? new Date(initialLastActiveAtIso).getTime() : null);

  // `bothPartiesInRoom` (peer count + tutor socket) drives active-ping /
  // billable anchors. Recording presence may additionally allow solo rehearsal
  // via `NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT` — see `deriveRecordingPresence`.

  // POST a single ping. Returns the server's new state on success.
  const pingActive = useCallback(
    async (active: boolean): Promise<void> => {
      try {
        const res = await fetch(
          `/api/whiteboard/${whiteboardSessionId}/active-ping`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active }),
            keepalive: true, // best-effort persist on tab close
          }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          activeMs: number;
          lastActiveAt: string | null;
        };
        setServerActiveMs(data.activeMs);
        setServerLastActiveAtMs(
          data.lastActiveAt ? new Date(data.lastActiveAt).getTime() : null
        );
      } catch {
        // Network hiccup — the next heartbeat will retry. We never
        // surface ping failures to the UI; they're an internal
        // accounting concern, not a tutor-facing error.
      }
    },
    [whiteboardSessionId]
  );

  // Fire a ping immediately whenever overlap flips, and run a
  // ~10s heartbeat while it stays true.
  useEffect(() => {
    if (!syncUrl) return; // tutor-solo mode — no billable timer
    void pingActive(bothPartiesInRoom);
    if (!bothPartiesInRoom) return;
    const HEARTBEAT_MS = 10_000;
    const id = setInterval(() => {
      void pingActive(true);
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [bothPartiesInRoom, pingActive, syncUrl]);

  // Best-effort "I'm leaving" beacon. sendBeacon is the only way to
  // get a reliable POST off during pagehide on most browsers; we fall
  // back to fetch with keepalive when sendBeacon is unavailable.
  useEffect(() => {
    if (!syncUrl) return;
    const url = `/api/whiteboard/${whiteboardSessionId}/active-ping`;
    const beacon = () => {
      const payload = JSON.stringify({ active: false });
      try {
        if (
          typeof navigator !== "undefined" &&
          typeof navigator.sendBeacon === "function"
        ) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon(url, blob);
          return;
        }
      } catch {
        // fall through to fetch
      }
      try {
        void fetch(url, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        });
      } catch {
        // best-effort only; ignore failures on unload
      }
    };
    window.addEventListener("pagehide", beacon);
    window.addEventListener("beforeunload", beacon);
    return () => {
      window.removeEventListener("pagehide", beacon);
      window.removeEventListener("beforeunload", beacon);
    };
  }, [syncUrl, whiteboardSessionId]);

  // Periodic refetch of the server-truth state. Catches: another
  // device for the same tutor wrote (cross-device sessions are
  // single-tutor in practice but the refetch is cheap insurance),
  // and any drift between the client's optimistic state and what
  // landed in the DB.
  useEffect(() => {
    if (!syncUrl) return;
    const ANCHOR_REFRESH_MS = 30_000;
    const refresh = async () => {
      try {
        const res = await fetch(
          `/api/whiteboard/${whiteboardSessionId}/timer-anchor`,
          { credentials: "same-origin" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          activeMs?: number;
          lastActiveAt?: string | null;
        };
        if (typeof data.activeMs === "number") setServerActiveMs(data.activeMs);
        if (data.lastActiveAt !== undefined) {
          setServerLastActiveAtMs(
            data.lastActiveAt ? new Date(data.lastActiveAt).getTime() : null
          );
        }
      } catch {
        // ignore — next tick will retry
      }
    };
    const id = setInterval(refresh, ANCHOR_REFRESH_MS);
    return () => clearInterval(id);
  }, [syncUrl, whiteboardSessionId]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const liveTimerMs = useMemo(
    () =>
      computeDisplayActiveMs({
        nowMs: now,
        serverActiveMs,
        serverLastActiveAtMs,
        clientActiveNow: bothPartiesInRoom,
        staleThresholdMs: ACTIVE_PING_STALE_MS,
      }),
    [now, serverActiveMs, serverLastActiveAtMs, bothPartiesInRoom]
  );

  // ---------------------------------------------------------------
  // Copy student link
  // ---------------------------------------------------------------

  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const [copyError, setCopyError] = useState<string | null>(null);

  const handleCopyStudentLink = useCallback(async () => {
    if (!encryptionKey) {
      setCopyState("error");
      setCopyError("Encryption key isn't ready yet — wait a moment and try again.");
      return;
    }
    if (!syncUrl) {
      setCopyState("error");
      setCopyError("Live student collab is disabled in this environment.");
      return;
    }
    setCopyState("copying");
    setCopyError(null);
    try {
      const { token } = await issueJoinToken(whiteboardSessionId);
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const link = `${origin}/w/${token}#k=${encryptionKey}`;
      // Clipboard API often fails after the `await issueJoinToken` above (user
      // activation / document focus). `copyTextToClipboard` falls back to
      // execCommand + prompt so we do not show a false error when copy works.
      await copyTextToClipboard(link);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 3000);
    } catch (err) {
      setCopyState("error");
      setCopyError((err as Error)?.message ?? "Could not generate the link.");
    }
  }, [encryptionKey, syncUrl, whiteboardSessionId]);

  // ---------------------------------------------------------------
  // End-session flow
  // ---------------------------------------------------------------

  const [endingState, setEndingState] = useState<
    "idle" | "finalizing" | "ending" | "error"
  >("idle");
  const [finalizingSegmentCount, setFinalizingSegmentCount] = useState(0);
  const [endingError, setEndingError] = useState<string | null>(null);
  const audioBridgeRef = useRef<WhiteboardWorkspaceAudioBridgeHandle | null>(
    null
  );

  /**
   * Live the outbox's in-flight count into `finalizingSegmentCount`
   * while the End-session flow is waiting on uploads. The button copy
   * reads "Saving last N segment(s)…" — without this subscription,
   * `drainOutboxOrTimeout` would await silently and the tutor would
   * see "Saving last 0 segments" for the entire wait.
   *
   * Scoped to `endingState === "finalizing"` so we don't pay the IDB
   * round-trip during normal recording.
   */
  useEffect(() => {
    if (endingState !== "finalizing") return;
    if (typeof window === "undefined" || !globalThis.indexedDB) return;
    const outbox = getOrCreateUploadOutbox();
    const obs = outbox.observe(whiteboardSessionId);
    setFinalizingSegmentCount(obs.getState().inFlightStreamCount);
    return obs.subscribe((next) => {
      setFinalizingSegmentCount(next.inFlightStreamCount);
    });
  }, [endingState, whiteboardSessionId]);

  const handleEndSession = useCallback(async () => {
    setEndingState("finalizing");
    setEndingError(null);
    setFinalizingSegmentCount(0);
    try {
      // Step 1 — stop the recorder. Two things have to happen here
      // synchronously, BEFORE we start awaiting anything:
      //
      //  a) Flip the FSM so any re-render (and our own visible state)
      //     stops treating recording as active.
      //  b) Trigger MediaRecorder.stop() directly. We DO NOT rely on the
      //     audio bridge's "stop on userWantsRecording=false" useEffect
      //     because that effect runs after React's render-commit pass —
      //     which means by the time the bridge calls stopAndUpload, we
      //     would already have started awaiting drainOutboxOrTimeout
      //     below. That's the Phase 1b smoke regression we hit on
      //     master: drain returned ok against an empty outbox, then the
      //     bridge stopped the recorder, then onstop fired async, then
      //     the segment finally got enqueued after end-session had
      //     already finalized. Console evidence:
      //       drainOutboxOrTimeout ok
      //       enqueued ... segmentId=26bc... hasRemoteUrl=true
      //       finalized rowsDeleted=1
      //     i.e. the segment was uploaded, enqueued, then *deleted* by
      //     finalize because nothing was waiting on it. Calling
      //     stopAndUpload here registers the pending-upload Promise
      //     synchronously, so step 2 below has something to await.
      setUserWantsRecording(false);
      const audioApi = workspaceAudioRef.current;
      if (audioApi.state === "recording" || audioApi.state === "paused") {
        audioApi.stopAndUpload("final");
      }

      // Step 2 — wait for the recorder's upload + onRecorded chain.
      // Resolves once every MediaRecorder.onstop fired by this hook has
      // finished, including the `await onRecorded(...)` inside, which
      // is where `onWorkspaceAudioRecorded` does `outbox.enqueue(...)`.
      // By the time this returns, the trailing segment (and any
      // rollover segment still in flight) is in IndexedDB with
      // `hasRemoteUrl=true`. The audio recorder already uploaded the
      // Blob to Vercel Blob; the outbox just records that fact for
      // the atomic end-session payload.
      await audioApi.flushPendingUploads();

      // Step 3 — wait for the outbox to land every pending segment.
      // The plan calls for 15s; we surface the in-flight count so
      // the End button's copy keeps updating during the wait.
      // Failed (permanent-fail) outbox state aborts immediately with
      // a copy-rich error rather than burning the full budget on
      // doomed retries — the tutor's session data is still in IDB
      // and re-clicking End will retry once the network heals.
      const drainResult = await drainOutboxOrTimeout(whiteboardSessionId);
      if (drainResult.timedOut) {
        const remaining = drainResult.remainingCount;
        setFinalizingSegmentCount(remaining);
        console.warn(
          `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} end-session aborted: outbox drain timed out remaining=${remaining} lastError=${drainResult.lastError ?? "<none>"}`
        );
        setEndingState("error");
        setEndingError(
          drainResult.lastError
            ? `Couldn't finalize — ${remaining} audio segment${remaining === 1 ? "" : "s"} still saving. Last error: ${drainResult.lastError}. Try again once your connection is healthy — your data isn't lost.`
            : `Couldn't finalize — ${remaining} audio segment${remaining === 1 ? "" : "s"} still saving. Try again in a moment, your data isn't lost.`
        );
        return;
      }

      // Step 4 — read the (now-stable) uploaded outbox into the
      // atomic end-session payload. listUploadedSegments returns a
      // deterministic order so a retried end call produces the same
      // server-side orderIndex sequence.
      const segments = await assembleEndSessionSegments(whiteboardSessionId);

      // Step 5 — upload the final events.json. We do this AFTER the
      // outbox drain (rather than in parallel) so the End button's
      // "Saving last N" copy is honest about what we're waiting on,
      // and so a flaky events upload doesn't double-bill the tutor's
      // patience clock.
      setEndingState("ending");
      const eventsJson = recorder.buildFinalEventsJson();
      const upload = await uploadWhiteboardEvents({
        whiteboardSessionId,
        studentId,
        eventsJson,
      });
      if (!upload.ok) {
        throw new Error(upload.error);
      }

      // Step 5b — best-effort snapshot PNG. Phase 1c (Pillar 4
      // follow-on, Task 5). Generation + upload are wrapped so a
      // snapshot failure NEVER blocks the atomic end-session — the
      // tutor's events + audio are already durable at this point and
      // the parent share's "open as image" link gracefully hides
      // when `snapshotBlobUrl` is null. See snapshot-png.ts header
      // for the reliability rationale.
      let snapshotBlobUrl: string | undefined;
      try {
        const snap = await generateSessionSnapshotPng(
          excalidrawAPIRef.current,
          { whiteboardSessionId }
        );
        if (snap) {
          const snapUpload = await uploadWhiteboardSnapshot({
            whiteboardSessionId,
            studentId,
            png: snap.blob,
          });
          if (snapUpload.ok) {
            snapshotBlobUrl = snapUpload.blobUrl;
            console.log(
              `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} snapshot uploaded sizeBytes=${snap.sizeBytes}`
            );
          } else {
            console.warn(
              `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} snapshot upload failed, continuing without: ${snapUpload.error}`
            );
          }
        } else {
          console.log(
            `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} snapshot generation skipped (see snapshot-png log)`
          );
        }
      } catch (snapErr) {
        console.warn(
          `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} snapshot pipeline threw, continuing without:`,
          (snapErr as Error)?.message ?? snapErr
        );
      }

      // Step 6 — one atomic server transaction: stamp endedAt, swap
      // eventsBlobUrl, register every outbox segment, revoke join
      // tokens. Plan Pillar 3. Phase 1c: now also persists
      // `snapshotBlobUrl` when the snapshot pipeline above produced
      // one — the action treats it as optional so a null value is
      // a no-op on the column.
      await endWhiteboardSession(whiteboardSessionId, upload.blobUrl, {
        segments,
        snapshotBlobUrl,
      });

      // Step 7 — drop the persisted outbox rows. Server has them; we
      // don't want the next mount of this workspace to find them
      // again and ask "are these new?".
      try {
        await finalizeOutboxAfterEnd(whiteboardSessionId);
      } catch (finalizeErr) {
        // Non-fatal: the rows will sit in IDB until the next
        // finalize sweep. Surface as a warning so a pilot session
        // with a transient IDB error doesn't escape unlogged.
        console.warn(
          `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} finalizeOutboxAfterEnd:`,
          (finalizeErr as Error)?.message ?? finalizeErr
        );
      }

      // Revoke is idempotent with the transaction above; don't block navigation.
      await revokeJoinTokensForSession(whiteboardSessionId).catch(() => undefined);

      // Drop the persisted encryption key for this session — once a
      // session is ended, a future re-open of its URL should land on
      // the read-only review surface, not a "ready to reconnect"
      // workspace state. Leaving the key in localStorage would let a
      // stale browser tab silently rejoin a dead session. Failure to
      // clear is non-fatal (it's just a cleanup step; the
      // session.endedAt server-side gate is the real guard).
      clearEncryptionKeyForSession(whiteboardSessionId);

      // Post-End-session navigation: bounce to the review page.
      //
      // Phase 1c originally tried to stay on `/workspace` so the new
      // preview-before-Start surface (Pillar 4 Task 6) would take
      // over the same tab — but that delayed the most common
      // immediate-post-session actions (AI-generate notes from the
      // session audio is THE wedge feature, plus replay, snapshot,
      // share-link copy — all on the review page) by an extra click.
      // The preview surface still serves its actual purpose for the
      // re-entry case (pinned tab, browser bookmark, manual URL),
      // because `workspace/page.tsx` no longer redirects ended
      // sessions away from `/workspace` — it just renders the
      // preview component when `detail.endedAt` is set.
      const reviewHref = `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}`;
      router.replace(reviewHref);
      router.refresh();

      try {
        await recorder.markPersisted();
      } catch (persistErr) {
        console.warn(
          `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} markPersisted after end:`,
          (persistErr as Error)?.message ?? persistErr
        );
      }
      try {
        clearSessionSceneDraft(whiteboardSessionId);
      } catch (draftErr) {
        console.warn(
          `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} clearSceneDraft after end:`,
          (draftErr as Error)?.message ?? draftErr
        );
      }
    } catch (err) {
      setEndingState("error");
      const msg = (err as Error)?.message ?? "Could not end the session.";
      setEndingError(
        `Could not end session: ${msg}. Your work is still in progress — retry "End session".`
      );
      // Don't auto-retry — the tutor decides whether to retry End or
      // keep the session open and try again.
    }
  }, [recorder, router, studentId, whiteboardSessionId]);

  // ---------------------------------------------------------------
  // After refresh: (1) auto-paint after stale-room "Resume session" when
  // the hook applied an IndexedDB snapshot to memory, (2) else restore
  // per-tab sessionStorage (strokes while "waiting for student"). Waits
  // for `checkpointMountResolved` so (1) wins over a stale session draft.
  // ---------------------------------------------------------------

  const hydrateTutorImageAssetsForElements = useCallback(
    async (
      api: ExcalidrawApiLike,
      elements: ReadonlyArray<ExcalidrawLikeElement>
    ) => {
      const hydrateRes = await hydrateRemoteImageFilesForScene(
        api,
        elements,
        loadedRemoteFileIdsForTutorRef.current,
        {
          logContext: "tutor",
          giveUpFileIds: giveUpTutorFileIdsRef.current,
          warnDedupe: warnDedupeTutorRef.current,
          resolveReadUrl: (u) =>
            resolveWhiteboardAssetReadUrl(u, {
              kind: "tutor",
              whiteboardSessionId,
            }),
        }
      );
      if (hydrateRes.fetchFailed.length > 0) {
        setPeerImageMaterialNotice("load");
      } else if (hydrateRes.missingAssetUrlFileIds.length > 0) {
        setPeerImageMaterialNotice((prev) =>
          prev === "load" ? "load" : "missing"
        );
      }
    },
    [whiteboardSessionId]
  );

  const applyBoardDocumentV1ToExcalidraw = useCallback(
    async (doc: WhiteboardBoardDocumentV1) => {
      const api = excalidrawAPIRef.current;
      if (!api) return;
      const { restoreElements } = await import("@excalidraw/excalidraw");
      const list = doc.pageList.map((p) => ({ id: p.id, title: p.title }));
      pageListRef.current = list;
      setPageList(list);
      activePageIdRef.current = doc.activePageId;
      setActivePageId(doc.activePageId);
      for (const [pid, raw] of Object.entries(doc.pages)) {
        pageDataRef.current[pid] = (raw as ReadonlyArray<unknown>).map(
          (e) => ({ ...(e as object) })
        ) as ExcalidrawLikeElement[];
      }
      const activeEls = doc.pages[doc.activePageId] ?? [];
      // Board-document elements are already Excalidraw-shaped (the
      // sender adapted from WBElement before broadcasting). Pass them
      // through the engine's restore + sanitize pipeline so the
      // workspace inherits the same theme/zoom/scroll invariants and
      // restoreElements-failure fallback as the replay player.
      const rough = (activeEls as ExcalidrawLikeElement[]).map((e) => ({
        ...e,
      }));
      let toPaint: ReadonlyArray<unknown> = restoreAndSanitizeForPaint(
        rough,
        restoreElements
      );
      await hydrateTutorImageAssetsForElements(
        api,
        toPaint as ReadonlyArray<ExcalidrawLikeElement>
      );
      applyingRemoteToCanvasRef.current = true;
      try {
        api.updateScene({ elements: toPaint });
      } finally {
        applyingRemoteToCanvasRef.current = false;
      }
      if (sync && syncUrl) {
        flushDocumentBroadcastNow();
      }
    },
    [
      flushDocumentBroadcastNow,
      hydrateTutorImageAssetsForElements,
      sync,
      syncUrl,
    ]
  );

  const paintRecoveredSceneIntoExcalidraw = useCallback(
    async (result: ResumeResult) => {
      const api = excalidrawAPIRef.current;
      if (!api) return;
      if (result.boardDocument?.v === 1) {
        await applyBoardDocumentV1ToExcalidraw(result.boardDocument);
        clearSessionSceneDraft(whiteboardSessionId);
        return;
      }
      const { restoreElements } = await import("@excalidraw/excalidraw");
      // Resume path: canonical WBElements → Excalidraw-shaped roughs
      // (`adaptWBElementsToExcalidraw`) → engine restore + sanitize. Same
      // pipeline the replay player runs on every paint, so resume can
      // never silently drift on Excalidraw-required-defaults handling.
      const { rough } = adaptWBElementsToExcalidraw(result.elements);
      let toPaint: ReadonlyArray<unknown> = restoreAndSanitizeForPaint(
        rough,
        restoreElements
      );
      if (toPaint.length === 0) {
        const recovery = loadTutorSessionRecoveryDraft(whiteboardSessionId);
        if (recovery) {
          await applyBoardDocumentV1ToExcalidraw(recovery);
          clearSessionSceneDraft(whiteboardSessionId);
          return;
        }
      }
      // IndexedDB / event log carry `customData.assetUrl` for PDF + uploads,
      // but Excalidraw has no BinaryFiles after a full navigation — same as
      // multi–board-page eviction; fetch from Blob before we paint.
      await hydrateTutorImageAssetsForElements(
        api,
        toPaint as ReadonlyArray<ExcalidrawLikeElement>
      );
      applyingRemoteToCanvasRef.current = true;
      try {
        api.updateScene({ elements: toPaint });
      } finally {
        applyingRemoteToCanvasRef.current = false;
      }
      clearSessionSceneDraft(whiteboardSessionId);
    },
    [
      applyBoardDocumentV1ToExcalidraw,
      hydrateTutorImageAssetsForElements,
      whiteboardSessionId,
    ]
  );

  useEffect(() => {
    if (!excalidrawAPI) return;
    if (!recorder.checkpointMountResolved) return;
    if (hasHydratedSessionDraftRef.current) return;

    if (recorder.postGateAutoCanvas) {
      hasHydratedSessionDraftRef.current = true;
      const payload = recorder.postGateAutoCanvas;
      void (async () => {
        try {
          await paintRecoveredSceneIntoExcalidraw(payload);
        } finally {
          recorder.acknowledgePostGateAutoCanvas();
        }
      })();
      return;
    }

    const recovery = loadTutorSessionRecoveryDraft(whiteboardSessionId);
    if (!recovery) {
      hasHydratedSessionDraftRef.current = true;
      return;
    }
    void (async () => {
      try {
        await applyBoardDocumentV1ToExcalidraw(recovery);
      } finally {
        hasHydratedSessionDraftRef.current = true;
      }
    })();
  }, [
    applyBoardDocumentV1ToExcalidraw,
    excalidrawAPI,
    paintRecoveredSceneIntoExcalidraw,
    recorder.acknowledgePostGateAutoCanvas,
    recorder.checkpointMountResolved,
    recorder.postGateAutoCanvas,
    whiteboardSessionId,
  ]);

  // ---------------------------------------------------------------
  // IndexedDB checkpoint "Resume" — the hook recovers the log, but the
  // live canvas only updates if we push elements into Excalidraw here.
  // ---------------------------------------------------------------

  const handleAcceptCheckpointResume = useCallback(async () => {
    const result = await recorder.acceptResume();
    if (!result) return;
    await paintRecoveredSceneIntoExcalidraw(result);
  }, [recorder, paintRecoveredSceneIntoExcalidraw]);

  // ---------------------------------------------------------------
  // Excalidraw onChange wiring
  // ---------------------------------------------------------------

  const handleExcalidrawChange = useCallback(
    (
      elements: ReadonlyArray<unknown>,
      _appState?: unknown,
      files?: Readonly<Record<string, BinaryFileFromExcalidraw>>
    ) => {
      if (applyingRemoteToCanvasRef.current) return;
      if (pageSwitchProgrammaticRef.current > 0) return;
      const els = elements as ReadonlyArray<ExcalidrawLikeElement>;
      pageDataRef.current[activePageIdRef.current] = [...els];
      onLocalElementSnapshot(elements);
      if (sceneDraftTimerRef.current !== null) {
        clearTimeout(sceneDraftTimerRef.current);
        sceneDraftTimerRef.current = null;
      }
      sceneDraftTimerRef.current = setTimeout(() => {
        const doc = buildBoardDocumentForCheckpoint();
        if (doc) {
          saveSessionBoardDocument(whiteboardSessionId, doc);
        }
        sceneDraftTimerRef.current = null;
      }, 800);
      // Cast through ExcalidrawLikeElement — the adapter only reads the
      // structural fields we declared. We keep the parameter typed as
      // unknown[] so a future Excalidraw upgrade with a stricter type
      // doesn't break the call site.
      recorderOnCanvasChange(elements as ReadonlyArray<ExcalidrawLikeElement>);
      if (sync && syncUrl) {
        scheduleDocumentBroadcast();
      }

      // Excalidraw's own image tool / library / drop: elements carry
      // fileId but no customData.assetUrl. Upload from local BinaryFiles
      // so the student can hydrate (our Insert PDF/image path already
      // sets assetUrl at insert time).
      const api = excalidrawAPIRef.current;
      if (api) {
        void (async () => {
          try {
            const getFiles = (): Record<string, BinaryFileFromExcalidraw> => {
              const raw = api.getFiles?.();
              return raw && typeof raw === "object"
                ? (raw as Record<string, BinaryFileFromExcalidraw>)
                : {};
            };
            const patched = await ensureNativeImageAssetUrlsForSync({
              elements,
              files: files as Record<string, BinaryFileFromExcalidraw> | undefined,
              getFiles,
              whiteboardSessionId,
              studentId,
              fileIdToAssetUrl: tutorNativeImageFileIdToAssetUrlRef.current,
              inFlight: tutorNativeImageUploadInFlightRef.current,
            });
            if (patched && excalidrawAPIRef.current) {
              // `getTutorDocumentPagesSnapshot` trusts `pageDataRef` over
              // `getSceneElements()`. `onChange` may not run before the next
              // flush, so sync the cache + recorder with the patched scene
              // (customData.assetUrl) before broadcasting — fixes native
              // drag/drop images missing URLs for the student + event log.
              const curPage = activePageIdRef.current;
              pageDataRef.current[curPage] =
                patched as ReadonlyArray<ExcalidrawLikeElement>;
              excalidrawAPIRef.current.updateScene({ elements: patched });
              recorderOnCanvasChange(
                patched as ReadonlyArray<ExcalidrawLikeElement>
              );
              flushThrottledFrameNow();
              if (sync && syncUrl) {
                flushDocumentBroadcastNow();
              }
            }
          } catch (err) {
            console.warn(
              "[WhiteboardWorkspaceClient] native image asset URL back-fill failed:",
              (err as Error)?.message ?? String(err)
            );
          }
        })();
      }
    },
    [
      buildBoardDocumentForCheckpoint,
      flushDocumentBroadcastNow,
      flushThrottledFrameNow,
      onLocalElementSnapshot,
      recorderOnCanvasChange,
      scheduleDocumentBroadcast,
      studentId,
      sync,
      syncUrl,
      whiteboardSessionId,
    ]
  );

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  const endingBusy = endingState === "ending" || endingState === "finalizing";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <WhiteboardWorkspaceAudioBridge
        ref={audioBridgeRef}
        audio={workspaceAudio}
        whiteboardSessionId={whiteboardSessionId}
        userWantsRecording={userWantsRecording}
        recordingActive={recordingActive}
        panelDisabled={endingBusy || !userWantsRecording}
      />
      {/* Phase 4c — live A/V surface */}
      <AVPermissionsPrompt
        hasMicPermission={liveAv.hasMicPermission}
        hasCamPermission={liveAv.hasCamPermission}
        hasMicStream={liveAv.localAudioStream !== null}
        hasCamStream={liveAv.localVideoStream !== null}
        error={liveAv.error}
        videoError={liveAv.videoError}
        requestMic={liveAv.requestMic}
        requestCam={liveAv.requestCam}
      />
      <div
        className="row"
        data-testid="wb-tutor-av-row"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <AVTilesPanel
          participants={liveAv.participants}
          localTile={{
            peerId: localPeerId,
            role: "tutor",
            label: localPeerLabel,
            audioStream: liveAv.localAudioStream,
            videoStream: liveAv.localVideoStream,
            isMicMuted: liveAv.isMicMuted,
            isCamMuted: liveAv.isCamMuted,
          }}
        />
        <AVControls
          isMicMuted={liveAv.isMicMuted}
          isCamMuted={liveAv.isCamMuted}
          toggleMic={liveAv.toggleMic}
          toggleCam={liveAv.toggleCam}
          disabled={endingBusy}
          // moderation prop intentionally NOT passed in v1: the
          // per-peer "Don't record this student" toggle relied on
          // useRemoteMicRecorders gating each peer's MediaRecorder
          // by mutedPeerIdsInRecording. That hook is no longer
          // mounted (May 15 mixdown redesign — every participant is
          // summed into the tutor's single recording stream), and
          // wiring per-peer attenuation into addRemoteAudio is its
          // own ~1hr build. Until then we hide the toggle so the UI
          // doesn't claim to do something it doesn't. Tutor falls
          // back to verbally asking the student to mute. See
          // BACKLOG.md "Tutor-side per-peer audio moderation" entry.
          // The `mutedPeerIdsInRecording` state + handler stay in
          // scope above so re-wiring is a one-line prop add.
        />
      </div>
      {/* Board pages — own row so it isn’t buried in the recording/toolbar cluster */}
      <div
        className="card"
        data-testid="wb-tutor-page-strip"
        style={{
          padding: "12px 14px",
          background: "rgba(37, 99, 235, 0.06)",
          border: "1px solid rgba(37, 99, 235, 0.22)",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.01em",
            color: "var(--text, inherit)",
          }}
        >
          Board pages
        </div>
        <p
          className="muted"
          style={{ margin: "6px 0 10px", fontSize: 12, lineHeight: 1.45, maxWidth: 720 }}
        >
          Switch pages like separate worksheets. Inserts (PDF, image) land on
          the page you have open. When live sync is on, the student sees which
          page you are on.
        </p>
        <div
          className="row"
          style={{
            gap: 6,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {pageList.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn"
              onClick={() => void selectTutorPage(p.id)}
              disabled={endingBusy || p.id === activePageId}
              style={
                p.id === activePageId
                  ? { fontWeight: 700, borderWidth: 2, borderColor: "var(--border-strong, #999)" }
                  : undefined
              }
            >
              {p.title}
            </button>
          ))}
          <button
            type="button"
            className="btn primary"
            onClick={addTutorPage}
            disabled={endingBusy || pageList.length >= 20}
          >
            + Add page
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div
        className="card"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {!userWantsRecording ? (
            <button
              type="button"
              className="btn primary"
              onClick={() => setUserWantsRecording(true)}
              disabled={endingBusy}
              data-testid="wb-start-recording"
            >
              Start recording
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() => setUserWantsRecording(false)}
              data-testid="wb-pause-recording"
            >
              Pause recording
            </button>
          )}
          <button
            type="button"
            className="btn danger"
            onClick={handleEndSession}
            disabled={endingBusy}
            data-testid="wb-end-session"
          >
            {endingState === "finalizing"
              ? `Saving last ${finalizingSegmentCount} segment${finalizingSegmentCount === 1 ? "" : "s"}…`
              : endingState === "ending"
                ? "Ending…"
                : "End session"}
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <StatusPill
            color={presence.pillColor}
            label={presence.pillLabel}
            testId="wb-recording-pill"
          />
          {syncUrl &&
            (() => {
              // Phase 4d dedupe: the sync-pill collapses in the
              // "awaiting student" state. The autopause banner +
              // recording-pill already convey "waiting for student"
              // in the same toolbar — a third indicator just adds
              // noise. We keep the sync-pill for the two states
              // it uniquely owns: "Student connected" (positive
              // green affirmation) and "Sync connecting…" (sync
              // layer itself unreachable, distinct from
              // awaiting-student).
              const sync = deriveSyncPillState({
                tutorSyncConnected,
                bothPartiesInRoom,
              });
              if (!sync.show) return null;
              return (
                <StatusPill
                  color={sync.color}
                  label={sync.label}
                  testId="wb-sync-pill"
                />
              );
            })()}
          <StatusPill
            color="blue"
            label={`Session: ${formatDuration(liveTimerMs)}`}
            testId="wb-timer"
          />
        </div>
        <UndoRedoButtons disabled={endingBusy} />
        <PdfImageUploadButton
          excalidrawAPI={excalidrawAPI}
          whiteboardSessionId={whiteboardSessionId}
          studentId={studentId}
          disabled={endingBusy}
        />
        <MathInsertButton
          excalidrawAPI={excalidrawAPI}
          whiteboardSessionId={whiteboardSessionId}
          studentId={studentId}
          disabled={endingBusy}
        />
        <DesmosInsertButton
          excalidrawAPI={excalidrawAPI}
          whiteboardSessionId={whiteboardSessionId}
          studentId={studentId}
          disabled={endingBusy}
        />
        <button
          type="button"
          className="btn"
          onClick={handleCopyStudentLink}
          disabled={!syncUrl || copyState === "copying"}
          data-testid="wb-copy-student-link"
        >
          {copyState === "copying"
            ? "Generating…"
            : copyState === "copied"
              ? "Link copied!"
              : "Copy student link"}
        </button>
      </div>

      {/* Banners */}
      {presence.bannerMessage && (
        <Banner tone="warning" testId="wb-recording-autopause-banner">
          {presence.bannerMessage}
        </Banner>
      )}
      {copyState === "error" && copyError && (
        <Banner tone="error" onDismiss={() => setCopyState("idle")}>
          Could not copy student link: {copyError}
        </Banner>
      )}
      {peerImageMaterialNotice !== "none" && (
        <Banner
          tone="warning"
          testId="wb-peer-material-notice"
          onDismiss={() => setPeerImageMaterialNotice("none")}
        >
          {peerImageMaterialNotice === "load" ? (
            <>
              Couldn&apos;t load a shared image (network or link). If the
              board looks wrong, check your connection or re-insert the
              worksheet with PDF/image. For pasted images, the student may need
              to re-draw or you can re-add the file from your machine.
            </>
          ) : (
            <>
              The live scene includes an image with no file link (often a
              device paste). Re-inserting from PDF/image is the most reliable
              way to put the same material on both sides.
            </>
          )}
        </Banner>
      )}
      {endingState === "error" && endingError && (
        <Banner
          tone="error"
          onDismiss={() => {
            setEndingState("idle");
            setEndingError(null);
          }}
        >
          {endingError}
        </Banner>
      )}
      {recorder.checkpointStatus === "error" && recorder.checkpointError && (
        <Banner tone="warning">
          Checkpoint save failed: {recorder.checkpointError}. The session is
          still recording in memory; we&apos;ll keep retrying.
        </Banner>
      )}
      {recorder.resumePrompt && (
        <Banner tone="info">
          <strong>Browser recovery (IndexedDB):</strong> a whiteboard
          event draft from{" "}
          {new Date(recorder.resumePrompt.startedAt).toLocaleString()} (~
          {formatDuration(recorder.resumePrompt.durationMs)} of logged
          time). This is <em>not</em> the &quot;stale session&quot; room
          dialog (that one only controls reconnecting to the live relay).{" "}
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 8 }}
            disabled={!excalidrawAPI}
            onClick={() => void handleAcceptCheckpointResume()}
          >
            Load draft into board
          </button>
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 4 }}
            onClick={() => void recorder.declineResume()}
          >
            Discard
          </button>
        </Banner>
      )}

      {/* Canvas: explicit card + height chain + fill so Excalidraw isn't 0px tall */}
      <div
        className="card"
        data-testid="tutor-whiteboard-canvas-mount"
        style={{
          marginTop: 4,
          padding: 0,
          minHeight: 480,
          height: "max(480px, calc(100vh - 300px))",
          width: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 400,
            width: "100%",
            position: "relative",
          }}
        >
          <ExcalidrawDynamic
            style={{ width: "100%", height: "100%" }}
            onChange={handleExcalidrawChange}
            excalidrawAPI={(api: unknown) => {
              // Cast through unknown so the structural ExcalidrawApiLike
              // shape (defined in insert-asset.ts) doesn't depend on the
              // upstream branded readonly types — see that file for why.
              const like = api as ExcalidrawApiLike;
              excalidrawAPIRef.current = like;
              setExcalidrawAPI(like);
            }}
            theme={excalidrawTheme}
            UIOptions={{
              canvasActions: { saveToActiveFile: false, loadScene: false },
            }}
            // Allow Desmos hosts in the embed-allowlist. The CSP
            // `frame-src` directive in `next.config.ts` is the real
            // safety boundary — this just stops Excalidraw from showing
            // its "untrusted source" warning panel for Desmos.
            validateEmbeddable={validateExcalidrawEmbeddable}
          />
        </div>
      </div>

      {/* Footer status — small text muted, helps debugging mid-session */}
      <div className="muted" style={{ fontSize: 11, textAlign: "right" }}>
        wbsid={whiteboardSessionId.slice(0, 8)} · events={recorder.eventCount} ·
        recorded={formatDuration(recorder.durationMs)} ·
        checkpoint={recorder.checkpointStatus}
        {recorder.lastCheckpointAt
          ? ` (last ${new Date(recorder.lastCheckpointAt).toLocaleTimeString()})`
          : ""}
        {" · "}student: {studentName}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Tiny presentational helpers — kept inline to avoid a sprawling
// components/ tree just for this page.
// -------------------------------------------------------------------

function StatusPill({
  color,
  label,
  testId,
}: {
  color: "red" | "green" | "amber" | "grey" | "blue";
  label: string;
  testId?: string;
}) {
  const palette: Record<typeof color, { bg: string; fg: string; dot: string }> =
    {
      red: { bg: "rgba(220,38,38,0.18)", fg: "#dc2626", dot: "#dc2626" },
      green: { bg: "rgba(34,197,94,0.18)", fg: "#16a34a", dot: "#16a34a" },
      amber: { bg: "rgba(234,179,8,0.18)", fg: "#a16207", dot: "#ca8a04" },
      grey: { bg: "rgba(100,116,139,0.18)", fg: "#475569", dot: "#64748b" },
      blue: { bg: "rgba(37,99,235,0.18)", fg: "#1d4ed8", dot: "#2563eb" },
    };
  const p = palette[color];
  return (
    <span
      data-testid={testId}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: p.bg,
        color: p.fg,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: p.dot,
        }}
      />
      {label}
    </span>
  );
}

function Banner({
  tone,
  children,
  onDismiss,
  testId,
}: {
  tone: "error" | "warning" | "info";
  children: React.ReactNode;
  onDismiss?: () => void;
  testId?: string;
}) {
  const palette = {
    error: { bg: "rgba(220,38,38,0.12)", border: "rgba(220,38,38,0.4)" },
    warning: { bg: "rgba(234,179,8,0.12)", border: "rgba(234,179,8,0.4)" },
    info: { bg: "rgba(37,99,235,0.12)", border: "rgba(37,99,235,0.4)" },
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      data-testid={testId}
      className="card"
      style={{
        padding: "10px 14px",
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 13 }}>{children}</div>
      {onDismiss && (
        <button
          type="button"
          className="btn"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          ×
        </button>
      )}
    </div>
  );
}
