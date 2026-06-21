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
 *   - JSXGraph embed (`phase1-graphing`).
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
import { useTheme } from "@/components/ThemeProvider";
import { useSyncTombstonedElementIds } from "@/hooks/useSyncTombstonedElementIds";
import { useRouter, useParams } from "next/navigation";
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
import { useAudioFlowConfirmation } from "@/hooks/useAudioFlowConfirmation";
import { useCollaboratorPointers } from "@/hooks/useCollaboratorPointers";
import { useLiveAV } from "@/hooks/useLiveAV";
import { useStudentWhiteboardCanvas } from "@/hooks/useStudentWhiteboardCanvas";
import { useExcalidrawLoadingGuard, excalidrawBoardBgHex } from "@/hooks/useExcalidrawLoadingGuard";
import { studentMicStreamId } from "@/lib/recording/remote-stream-recorder";
import { WbTopBarMicControl } from "@/components/whiteboard/chrome/WbTopBarMicControl";
import { WbTopBarMicControlLive } from "@/components/whiteboard/chrome/WbTopBarMicControlLive";
import { WbToolBtn } from "@/components/whiteboard/chrome/WbToolBtn";
import { WbTopBarCamControl } from "@/components/whiteboard/chrome/WbTopBarCamControl";
import { WbThemeToggle } from "@/components/whiteboard/chrome/WbThemeToggle";
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
import { resolveParticipantLabel } from "@/lib/whiteboard/participant-label";
import { deriveSyncPillState } from "@/lib/whiteboard/sync-pill-presentation";
import { getOrCreateLocalPeerId } from "@/lib/whiteboard/local-peer-id";
import {
  endWhiteboardSession,
  enqueueChunkTranscriptionAction,
  issueJoinToken,
  revokeJoinTokensForSession,
} from "@/app/admin/students/[id]/whiteboard/actions";
import {
  kickSessionChunksAction,
  triggerNotesGenerationAction,
} from "@/app/admin/students/[id]/whiteboard/notes-actions";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import {
  assembleEndSessionSegments,
  drainOutboxOrTimeout,
  finalizeOutboxAfterEnd,
  getOrCreateUploadOutbox,
  registerSessionStudentId,
} from "@/lib/recording/upload-outbox-instance";
import {
  getOrCreateRecordingDraftStore,
  type DraftSegmentRow,
} from "@/lib/recording/recording-draft-store";
import {
  audioRecoveryBannerHeadline,
  draftHasRecoverableAudio,
  estimatedDurationSecFromDraft,
} from "@/lib/recording/recording-draft-recovery";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";
import { PdfImageUploadButton } from "@/components/whiteboard/PdfImageUploadButton";
import { type PageStripRow } from "@/components/whiteboard/PageStrip";
import { MathInsertButton } from "@/components/whiteboard/MathInsertButton";
import {
  GraphEmbeddable,
  warmJsxGraphModule,
} from "@/components/whiteboard/GraphEmbeddable";
import { GraphInsertButton } from "@/components/whiteboard/GraphInsertButton";
import { BoardTabStrip } from "@/components/whiteboard/chrome/BoardTabStrip";
import { WbAVCluster } from "@/components/whiteboard/chrome/WbAVCluster";
import {
  WbActionSheet,
  WbActionSheetBackdrop,
} from "@/components/whiteboard/chrome/WbActionSheet";
import { WbChromeErrorBoundary } from "@/components/whiteboard/chrome/WbChromeErrorBoundary";
import {
  WbStrokePropsPanel,
  RoughnessIcon,
  SharpnessIcon,
} from "@/components/whiteboard/chrome/WbStrokePropsPanel";
import {
  isTouchLayout,
  useWbLayoutMode,
} from "@/components/whiteboard/chrome/useWbLayoutMode";
import { LiveBoardChrome } from "@/components/whiteboard/chrome/LiveBoardChrome";
import { WbRoleProvider, type WbParticipantRole } from "@/components/whiteboard/chrome/wb-role";
import {
  shapeIconFor,
  WbIconCamera,
  WbIconCollapse,
  WbIconEndSession,
  WbIconEraser,
  WbIconFollowSync,
  WbIconGrid,
  WbIconMatchView,
  WbIconMore,
  WbIconPencil,
  WbIconRedo,
  WbIconSelect,
  WbIconShare,
  WbIconStyles,
  WbIconText,
  WbIconUndo,
  WbIconWand,
  WB_SHAPE_TOOLS,
  type WbShapeToolType,
} from "@/components/whiteboard/chrome/wb-icons";
import { triggerRedo, triggerUndo } from "@/lib/whiteboard/undo-redo";
import {
  triggerSendToBack,
  triggerSendBackward,
  triggerBringForward,
  triggerBringToFront,
  triggerDeleteSelected,
} from "@/lib/whiteboard/undo-redo";
import {
  EXCALIDRAW_STROKE_HEX,
  EXCALIDRAW_STROKE_DARK_HEX,
  inkDisplayHex,
  WB_STROKE_WIDTHS,
} from "@/styles/token-values";
import { laserColorForRole } from "@/lib/whiteboard/laser-colors";
import { StrokeWidthIcon } from "@/components/whiteboard/chrome/wb-icons";
import "./whiteboard-chrome.css";
import { ExcalidrawDynamic } from "@/components/whiteboard/ExcalidrawDynamic";
import { WhiteboardDebugHud } from "@/components/whiteboard/WhiteboardDebugHud";
import {
  GRAPH_EMBED_LINK,
  type ExcalidrawApiLike,
  type InsertPdfBoardPagesIntegrate,
} from "@/lib/whiteboard/insert-asset";
import {
  ensureNativeImageAssetUrlsForSync,
  type BinaryFileFromExcalidraw,
} from "@/lib/whiteboard/ensure-native-image-asset-urls-for-sync";
import { hydrateRemoteImageFilesForScene } from "@/lib/whiteboard/hydrate-remote-files";
import type { HydrateRemoteImageFilesResult } from "@/lib/whiteboard/hydrate-remote-files";
import {
  joinUnavailableCopy,
  type JoinUnavailableReason,
} from "@/lib/whiteboard/join-unavailable-copy";
import { resolveWhiteboardAssetReadUrl } from "@/lib/whiteboard/resolve-asset-read-url";
import type {
  WhiteboardWireBroadcastExtras,
  WhiteboardWireRemoteDetails,
} from "@/lib/whiteboard/sync-client";
import { validateExcalidrawEmbeddable } from "@/lib/whiteboard/validate-embeddable";
import {
  registerWbE2eSceneBridge,
  registerWbE2eSceneMutationHook,
} from "@/lib/whiteboard/wb-e2e-scene-bridge";
import { mergeScenesReconciled } from "@/lib/whiteboard/apply-reconciled-remote-scene";
import { followWireFromTutorAppState } from "@/lib/whiteboard/viewport-align";
import {
  createWbFollowDebugTelemetry,
  inferBroadcastTrigger,
} from "@/lib/whiteboard/wb-follow-debug-telemetry";
import { useWbChromeDebugOverlayVisible } from "@/lib/whiteboard/use-wb-chrome-debug-overlay";
import type { RemoteSceneIngestLogHint } from "@/hooks/useWhiteboardRecorder";
import {
  adaptWBElementsToExcalidraw,
  computeResizeScroll,
  restoreAndSanitizeForPaint,
} from "@/lib/whiteboard/scene-paint";
import type { PageViewState, WhiteboardBoardDocumentV1 } from "@/lib/whiteboard/board-document-snapshot";
import { enrichPageStripRow } from "@/lib/whiteboard/page-strip-pdf";
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
  /** Student display name — required for tutor role, not used for student role. */
  studentName?: string;
  /** Admin user ID — required for tutor role, not used for student role. */
  adminUserId?: string;
  /** Session start ISO — required for tutor role, not used for student role. */
  startedAtIso?: string;
  bothConnectedAtIso?: string | null;
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
   * Not required for student role.
   */
  initialUserWantsRecording?: boolean;
  /**
   * A3 in-shell review: called in place of router.replace/refresh once
   * the atomic end-session pipeline completes. The shell's handler sets
   * mode="review", unmounting this client subtree (which fires all the
   * existing cleanup effects: sync disconnect, useLiveAV mesh/signaling
   * dispose, active-ping clear). When undefined, falls back to the
   * legacy router.replace navigation (safe for any future callers that
   * don't use the shell wrapper).
   */
  onSessionEnded?: () => void;
  /**
   * Participant role for chrome capabilities (Wave 1b+ student routing).
   * Defaults to tutor — current callers unchanged.
   */
  role?: WbParticipantRole;
  /** Student join token — reserved for Wave 1b+ student routing. */
  joinToken?: string;
  /** Tutor display name for student chrome — reserved for Wave 1b+. */
  tutorName?: string;
};

// Phase 4d Commit 6: stable empty Set so the FSM's
// `participantsWithFlowingAudio` input stays referentially equal
// when there are no participants — avoids unnecessary re-evaluations.
const EMPTY_FLOW_SET: ReadonlySet<string> = new Set<string>();

function upsertPageStripViewState(
  list: PageStripRow[],
  pageId: string,
  vs: PageViewState
): PageStripRow[] {
  return list.map((p) => (p.id === pageId ? { ...p, viewState: vs } : p));
}

// Smoke-4 (May 17, 2026): hard timeout on the audio-flow gate. If both
// parties are present but neither has produced detectable audio-flow
// within this window, release the gate anyway so the session does
// record. Bound = max billing/audit-loss window. Sized to cover the
// long tail of WebRTC negotiation while staying short enough that
// the tutor will likely still be in their greeting / setup chatter
// when the recording finally flips on. Decreasing this is a UX
// trade-off (more dead air at the top of replays) — see
// `docs/PHASE-PDF-SMOKE-1.md` smoke-4 section.
const AUDIO_FLOW_GATE_TIMEOUT_MS = 10_000;
// Debounce window for the "both parties reachable" loss transition.
// When reachableParticipants drops to 0 (WebRTC dies), we wait this
// long before reporting the loss to the billing timer. Avoids a
// momentary 1-2s ICE reconnect blip briefly pausing the timer.
const REACHABLE_LOSS_DEBOUNCE_MS = 8_000;

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

/**
 * Student-only: reads the encryption key from the URL fragment.
 * The key is never sent to the server (HTTP spec: fragments stay client-side).
 */
function readStudentKeyFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return null;
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const k = params.get("k");
  return k && k.length >= 16 ? k : null;
}

/** Session timer — minutes only per design spec (Sarah rounds to 5/15 min). */
function formatTimerMinutesOnly(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60000);
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${m}m`;
  }
  return `${totalMin}m`;
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
  studentName = "",
  adminUserId = "",
  startedAtIso = "",
  bothConnectedAtIso = null,
  initialActiveMs,
  initialLastActiveAtIso,
  syncUrl,
  initialUserWantsRecording = false,
  onSessionEnded,
  role = "tutor",
  joinToken,
  tutorName = "your tutor",
}: Props) {
  const router = useRouter();
  // TU-12: Excalidraw theme follows app-selected theme (not OS-only)
  const { resolvedTheme: excalidrawTheme, mode: themeMode, setMode: setThemeMode } =
    useTheme();
  const { onLocalElementSnapshot, shouldDropRemoteElement } =
    useSyncTombstonedElementIds();

  useWindowScrollToTopOnMount();

  const jsxGraphWarmedRef = useRef(false);
  useEffect(() => {
    if (jsxGraphWarmedRef.current) return;
    jsxGraphWarmedRef.current = true;
    warmJsxGraphModule();
  }, []);

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
  // ONE stable peer id per workspace mount, persisted in
  // `sessionStorage[wb-peer-id:<sessionId>]` (Phase 4d Commit 4)
  // so a tab reload reuses the SAME id and the peer-mesh idempotency
  // path (`event=add-skip reason=already-present`) handles the
  // rejoin as a normal re-establish rather than a fresh peer. We
  // thread it to BOTH `createWhiteboardSyncClient({peerId})` AND
  // `useLiveAV({localPeerId})` so the sync-client wire envelopes
  // carry the SAME peerId that peer-mesh + signaling use for
  // polite/impolite role + targetPeerId
  // demux. Resolves the open scoping question from PHASE-4B-STATUS:
  // we mint here (workspace = single source of truth) rather than
  // having sync-client expose its own minted id.
  //
  // `useMemo([])` is stable across renders within the same React
  // component instance. HMR remounts produce a new id along with a
  // new sync-client; both layers agree.
  const localPeerId = useMemo(
    () => getOrCreateLocalPeerId(whiteboardSessionId, role),
    // role is stable per-mount (prop default "tutor"); including for completeness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [whiteboardSessionId, role]
  );
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
  /**
   * Ref for the .mynk-wb-canvas wrapper div, used by the center-preserving
   * resize ResizeObserver. Additive — no existing logic uses this ref.
   */
  const wbCanvasRef = useRef<HTMLDivElement | null>(null);
  /** Student desktop top bar — clip-driven compaction (Wave 4 round 3). */
  const studentTopbarRef = useRef<HTMLElement | null>(null);
  /**
   * Frame-to-frame container dimensions tracked by the resize ResizeObserver.
   * See the resize useEffect below (search "Center-preserving viewport resize").
   */
  const prevWbWidthRef = useRef<number | null>(null);
  const prevWbHeightRef = useRef<number | null>(null);
  const followDebugTelemetry = useMemo(() => createWbFollowDebugTelemetry(), []);
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
  const tutorApplyIdRef = useRef(0);
  /** Skips debounced viewport flush while applying stored/programmatic camera. */
  const isApplyingViewportProgrammaticRef = useRef(false);
  const viewportPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  /**
   * Phase 5 task 8 (replay viewport tier-c-lite). Captured below the
   * recorder hook call — let viewport-flush + page-switch handlers
   * (defined earlier in this component) reach `recorder.recordViewport`
   * without re-ordering the entire file. Refs are React's escape hatch
   * for exactly this "callback owns a stale closure" shape.
   */
  const recorderRecordViewportRef = useRef<
    ((panX: number, panY: number, zoom: number) => void) | null
  >(null);
  /** `flushViewportPersistNow` is declared before `useTutorLiveDocumentWire`. */
  const scheduleDocumentBroadcastRef = useRef<() => void>(() => undefined);
  /**
   * Monotonic switch token — smoke-2 root cause.
   *
   * `selectTutorPage` awaits `hydrateRemoteImageFilesForScene` BEFORE
   * actually swapping the scene. Pre-fix that await window was a race:
   *   1. Switch P1 → P2 starts; `activePageIdRef` was bumped to P2;
   *      hydrate fetches assets; scene STILL shows P1.
   *   2. User clicks P3 before hydrate finishes.
   *   3. Second `selectTutorPage` reads `activePageIdRef = P2` as `from`,
   *      calls `getSceneElements()` which still returns P1 elements,
   *      writes `pageDataRef[P2] = P1's elements`. Page swap! That was
   *      the smoke-1 #3/#6/#7 and smoke-2 #1/#2 leak.
   *
   * Fix shape:
   *   - Every `selectTutorPage` / `addTutorPage` increments this token.
   *   - `selectTutorPage` checks `myToken === current` AFTER hydrate;
   *     if newer call won, it abandons without bumping
   *     `activePageIdRef` or touching the scene.
   *   - `activePageIdRef.current = nextId` now happens AFTER hydrate,
   *     immediately before `updateScene` — atomic swap, no window.
   *   - `addTutorPage` also bumps the token so an in-flight select
   *     abandons (otherwise the late select would clobber Add Page's
   *     new-page navigation).
   */
  const tutorSwitchTokenRef = useRef(0);
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

  // ---------------------------------------------------------------
  // Student-role state (dead branch for role="tutor")
  // All state vars are always declared (rules of hooks); gated in effects.
  // ---------------------------------------------------------------
  const params = useParams<{ joinToken: string }>();
  const pathJoinToken =
    (role === "student"
      ? typeof params?.joinToken === "string"
        ? params.joinToken
        : (joinToken ?? "")
      : (joinToken ?? ""));
  const studentWjgId = pathJoinToken.slice(0, 8);

  const [studentEncryptionKey, setStudentEncryptionKey] = useState<string | null>(null);
  const [studentKeyMissing, setStudentKeyMissing] = useState(false);
  const [hasLeft, setHasLeft] = useState(false);
  const [joinUnavailableReason, setJoinUnavailableReason] =
    useState<JoinUnavailableReason | null>(null);
  const [studentSyncClient, setStudentSyncClient] =
    useState<WhiteboardSyncClient | null>(null);
  const [studentConnected, setStudentConnected] = useState(false);
  const [studentOtherPeerCount, setStudentOtherPeerCount] = useState(0);
  const hasAutoRequestedAvRef = useRef(false);

  // Student server-side timer state (mirrors tutor's timer for student chrome)
  const [studentServerActiveMs, setStudentServerActiveMs] = useState(
    role === "student" ? Math.max(0, initialActiveMs) : 0
  );
  const [studentServerLastActiveAtMs, setStudentServerLastActiveAtMs] =
    useState<number | null>(
      role === "student" && initialLastActiveAtIso
        ? new Date(initialLastActiveAtIso).getTime()
        : null
    );
  const [studentNow, setStudentNow] = useState(() => Date.now());
  const [independentView, setIndependentView] = useState(false);
  const [boardWaitElapsed, setBoardWaitElapsed] = useState(false);
  const [dismissedBoardWaitNotice, setDismissedBoardWaitNotice] = useState(false);
  const [studentMaterialNotice, setStudentMaterialNotice] = useState<"none" | "load" | "missing">("none");
  const [dismissedStudentMaterialNotice, setDismissedStudentMaterialNotice] = useState(false);
  const studentNativeImageFileIdToAssetUrlRef = useRef(new Map<string, string>());
  const studentNativeImageUploadInFlightRef = useRef(new Set<string>());

  // wjg logger (student join-gate lifecycle — only emits for role="student")
  const wjgLog = useCallback(
    (action: string, extra?: Record<string, string | number>) => {
      if (role !== "student") return;
      const tail = extra
        ? ` ${Object.entries(extra)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ")}`
        : "";
      console.info(
        `[wjg] wjg=${studentWjgId} wbsid=${whiteboardSessionId} action=${action}${tail}`
      );
    },
    [role, studentWjgId, whiteboardSessionId]
  );

  const [pageList, setPageList] = useState<PageStripRow[]>(() => [
    { id: "p1", title: "Page 1" },
  ]);
  const sectionsRegistryRef = useRef<Record<string, { label: string }>>({});
  const [sectionsRegistry, setSectionsRegistry] = useState<
    Record<string, { label: string }>
  >({});
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
  /**
   * Monotonically-incrementing counter bumped on every committed board switch
   * (selectTutorPage atomic swap + addTutorPage). Guards the onChange async
   * image-URL back-fill path against the A→B→A page-id collision: two switches
   * that land back on the same pageId would pass the `activePageIdRef ===
   * onChangePageId` check but carry a stale generation number, preventing them
   * from writing old-page elements into the newly-active same-named page.
   */
  const boardGenerationRef = useRef(0);
  /** In-memory per-tab scene (Excalidraw only shows one at a time). */
  const pageDataRef = useRef<Record<string, ReadonlyArray<ExcalidrawLikeElement>>>(
    Object.create(null)
  );

  /**
   * Image asset URL cache — maps pageId → elementId → {assetUrl, altText?}.
   *
   * PR-01 / Option A: `handleExcalidrawChange` stores raw Excalidraw elements
   * in `pageDataRef` (no clone per pointer-move) to eliminate the O(N)
   * `preserveImageAssetUrlsOnSceneWrite` clone on every paint. This cache
   * carries the last-known `assetUrl` for each image element so the
   * preservation can be applied lazily at wire/checkpoint build time.
   */
  const imageUrlCacheRef = useRef<
    Record<string, Record<string, { assetUrl: string; altText?: string }>>
  >({});

  const [peerImageMaterialNotice, setPeerImageMaterialNotice] = useState<
    "none" | "load" | "missing"
  >("none");

  // â”€â”€â”€ Mynk chrome UI state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [activeToolType, setActiveToolType] = useState<string>("selection");
  const activeToolTypeRef = useRef<string>("selection");
  /**
   * True while a pointer is pressed on the Excalidraw canvas. Used to defer
   * remote `updateScene` calls when the eraser is active — a mid-gesture
   * scene replace can corrupt Excalidraw's `elementsPendingErasure` appState,
   * causing the eraser to silently fail. Buffer the update in `pageDataRef`
   * and skip the live canvas write; the correct scene surfaces on pointer-up.
   */
  const isCanvasPointerDownRef = useRef(false);
  const [stripCollapsed, setStripCollapsed] = useState(false);
  const [moreStylesOpen, setMoreStylesOpen] = useState(false);
  const [selectedShapeTool, setSelectedShapeTool] =
    useState<WbShapeToolType>("line");
  // Single-open menu state — only one chrome popover/dropdown is open at a time.
  // Opening any menu closes all others; outside-click/Esc handled per-menu.
  const [openMenu, setOpenMenu] = useState<
    | "share"
    | "shapes"
    | "more"
    | "props"
    | "theme"
    | "topbar-more"
    | null
  >(null);
  const shareMenuOpen = openMenu === "share";
  const shapesDropdownOpen = openMenu === "shapes";
  const morePopoverOpen = openMenu === "more";
  const propsCompactOpen = openMenu === "props";
  const themeMenuOpen = openMenu === "theme";
  const topbarMoreOpen = openMenu === "topbar-more";
  const toggleMenu = (
    menu:
      | "share"
      | "shapes"
      | "more"
      | "props"
      | "theme"
      | "topbar-more"
  ) => setOpenMenu((p) => (p === menu ? null : menu));
  const dismissTouchSheets = useCallback(() => {
    setOpenMenu(null);
  }, []);
  const touchSheetOpen =
    openMenu === "props" ||
    openMenu === "shapes" ||
    openMenu === "more";
  const [gridEnabled, setGridEnabled] = useState(false);
  const [roughness, setRoughness] = useState(0);
  const [roundness, setRoundness] = useState<"sharp" | "round">("sharp");
  const { layoutMode, orientation } = useWbLayoutMode();
  const touchLayout = isTouchLayout(layoutMode);
  const [toolbarHidden, setToolbarHidden] = useState(false);
  // Stroke props — tracked from Excalidraw onChange (appState).
  // Always initialize to EXCALIDRAW_STROKE_HEX (#1e293b) in both themes.
  // Excalidraw's dark-mode canvas filter (invert+hue-rotate) automatically
  // renders this near-black hex as white on the dark canvas — no white
  // override needed. Storing #ffffff in dark mode would invert to black.
  const initialWbStrokeColor = EXCALIDRAW_STROKE_HEX;
  const [strokeColor, setStrokeColor] = useState<string>(initialWbStrokeColor);
  const strokeColorRef = useRef<string>(initialWbStrokeColor);

  const [strokeWidth, setStrokeWidth] = useState<number>(0.5);
  const strokeWidthRef = useRef<number>(0.5);
  const [opacity, setOpacity] = useState<number>(100);
  const opacityRef = useRef<number>(100);

  // Smoke-4 (May 17, 2026): WB-activity latch for the audio-flow gate.
  // Declared up here (before `applyRemoteToCanvas`) so the temporal
  // dead-zone doesn't throw when `applyRemoteToCanvas`'s closure
  // captures `markWbActivity` in its dep array. We carry the latch
  // through a ref (cheap to read), and bump a small state to force
  // a re-render so the FSM evaluation re-reads the gate boolean.
  // The full release predicate is computed further down where
  // `everHadAudioFlowRef` and friends are in scope; here we only
  // own the WB-activity sub-latch + the marker callback.
  const everHadWbActivityRef = useRef(false);
  const [, bumpWbActivityRerender] = useState(0);
  const markWbActivity = useCallback(() => {
    if (everHadWbActivityRef.current) return;
    everHadWbActivityRef.current = true;
    bumpWbActivityRerender((n) => n + 1);
  }, []);

  const applyRemoteToCanvas = useCallback(
    async (
      elements: ReadonlyArray<ExcalidrawLikeElement>,
      details?: Pick<WhiteboardWireRemoteDetails, "page" | "scenePageId">
    ): Promise<RemoteSceneIngestLogHint | void> => {
      const api = excalidrawAPIRef.current;
      if (!api) return;
      // `scenePageId` is which page this `elements` snapshot belongs to (may
      // lag the tutor's visible tab when the wire diff is throttled).
      const targetId = details?.scenePageId ?? details?.page?.activePageId ?? "p1";
      const applyId = String((tutorApplyIdRef.current += 1));
      console.info(
        `[tutor-apply] wbsid=${whiteboardSessionId} wba=${applyId} author=student action=apply-v2-start page=${targetId} elements=${elements.length}`
      );

      // Smoke-3 root cause: this used to capture `curActive` BEFORE the
      // hydrate await and use it as the bucket key. During the await the
      // tutor could click another page; `activePageIdRef.current` would
      // move but the stale capture still pointed at the old page,
      // sending the merged peer scene into the WRONG `pageDataRef` slot
      // AND into the live scene of a now-different page (see
      // `docs/PHASE-PDF-STATUS.md` for the full trace). The bilateral
      // leakage the pilot saw — "p.1 and pdf p.1 already bled" — was
      // exactly this race firing on every page switch where a student
      // broadcast was in flight.
      //
      // The new contract:
      //   1. Read all "live" state AFTER the hydrate await (no captures).
      //   2. Use `pageDataRef[targetId]` as the merge local — never the
      //      live scene, because the live scene may belong to a different
      //      page right now.
      //   3. Only touch the live scene when we're STILL on `targetId` AND
      //      no programmatic page switch is mid-flight. Otherwise just
      //      update the bucket and let the next page-switch hydrate
      //      surface the change visually.
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

      // Read local at this exact tick:
      //   - If we're STILL on `targetId` and no page-switch swap is
      //     mid-flight, use the live canvas as the freshest source
      //     (captures tutor's in-flight stroke not yet committed via
      //     `onChange`). MUST use `getSceneElementsIncludingDeleted` —
      //     `getSceneElements` returns only non-deleted elements, so
      //     erased/undone elements (isDeleted:true) are absent from the
      //     local baseline. When a stale student broadcast then carries
      //     that element as non-deleted, `reconcileElements` second pass
      //     adds it back from remote → resurrection on tutor canvas.
      //   - Off-target: the live scene belongs to a different page; use
      //     `pageDataRef` (which contains isDeleted:true tombstones via
      //     the `onChange` → `getElementsIncludingDeleted` path).
      const onTargetReadTime =
        activePageIdRef.current === targetId &&
        pageSwitchProgrammaticRef.current === 0;
      const localForMerge: ReadonlyArray<ExcalidrawLikeElement> =
        onTargetReadTime
          ? (((api.getSceneElementsIncludingDeleted?.() ?? api.getSceneElements()) as ReadonlyArray<ExcalidrawLikeElement>))
          : ((pageDataRef.current[targetId] as
              | ReadonlyArray<ExcalidrawLikeElement>
              | undefined) ?? []);
      const appState = api.getAppState() as unknown;
      const merged = await mergeScenesReconciled(
        localForMerge,
        elements,
        appState,
        { shouldDropRemoteElement }
      );
      pageDataRef.current[targetId] = merged;

      // Re-check at write time. `mergeScenesReconciled` has a tiny
      // microtask await (dynamic import of `reconcileElements`); in
      // theory another microtask could have moved the active page, so
      // we don't reuse `onTargetReadTime`.
      const stillOnTargetWriteTime =
        activePageIdRef.current === targetId &&
        pageSwitchProgrammaticRef.current === 0;
      // Defer the live canvas write when the eraser tool is active and a
      // pointer gesture is in flight. A mid-gesture `updateScene` can corrupt
      // Excalidraw's internal `elementsPendingErasure` appState, causing the
      // erase to silently fail. The merged data is already buffered in
      // `pageDataRef[targetId]`; the correct scene surfaces on the next
      // onChange (pointer-up) which flushes the completed erase.
      const eraserActive =
        role === "tutor" &&
        activeToolTypeRef.current === "eraser" &&
        isCanvasPointerDownRef.current;
      if (stillOnTargetWriteTime && !eraserActive) {
        applyingRemoteToCanvasRef.current = true;
        try {
          // captureUpdate: "NEVER" — remote-origin scene merges must not
          // enter the local undo/redo stack. Without this, pressing undo
          // replays a student stroke rather than the tutor's own action,
          // and the eraser can appear to "undo" itself on the next remote
          // apply (the remote re-adds elements the eraser just deleted).
          (api as typeof api & {
            updateScene: (s: { elements: ReadonlyArray<unknown>; captureUpdate?: string }) => void;
          }).updateScene({ elements: merged as ReadonlyArray<unknown>, captureUpdate: "NEVER" });
        } finally {
          applyingRemoteToCanvasRef.current = false;
        }
        // Smoke-4 (May 17, 2026): on-target remote activity is
        // also proof-of-session — releases the audio-flow gate
        // even if both mics are silent / muted.
        markWbActivity();
        console.info(
          `[tutor-apply] wbsid=${whiteboardSessionId} wba=${applyId} author=student action=apply-v2-complete page=${targetId} mergedCount=${merged.length} writeToCanvas=true`
        );
        return { recordScene: merged };
      }
      const skipReason = eraserActive ? "eraser-deferred" : "off-target";
      console.info(
        `[tutor-apply] wbsid=${whiteboardSessionId} wba=${applyId} author=student action=apply-v2-complete page=${targetId} mergedCount=${merged.length} writeToCanvas=false reason=${skipReason}`
      );
      return { record: "skip" };
    },
    [markWbActivity, role, shouldDropRemoteElement, whiteboardSessionId]
  );

  useEffect(() => {
    if (role !== "tutor") return;
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
    role,
    encryptionKey,
    syncUrl,
    whiteboardSessionId,
    localPeerId,
    localPeerLabel,
  ]);

  // ---------------------------------------------------------------
  // Student sync client lifecycle (role="student" only)
  // ---------------------------------------------------------------

  // Step 1: read encryption key from URL hash (student-only; tutor uses useEncryptionKeyInHash)
  useEffect(() => {
    if (role !== "student") return;
    const k = readStudentKeyFromHash();
    if (!k) {
      setStudentKeyMissing(true);
      wjgLog("key_missing");
      return;
    }
    setStudentEncryptionKey(k);
    wjgLog("key_ok");
  }, [role, wjgLog]);

  useEffect(() => {
    if (role !== "student") return;
    wjgLog("mount", { role: "student" });
  }, [role, wjgLog]);

  // Step 2: create sync client once key + conditions are met
  useEffect(() => {
    if (role !== "student") return;
    if (!studentEncryptionKey) return;
    if (joinUnavailableReason !== null) return;
    if (hasLeft) return;
    if (!syncUrl) return;
    const syncPresenceLabel = `Student · ${localPeerId.replace(/-/g, "").slice(0, 6)}`;
    const client = createWhiteboardSyncClient({
      url: syncUrl,
      roomId: whiteboardSessionId,
      encryptionKeyBase64Url: studentEncryptionKey,
      role: "student",
      peerId: localPeerId,
      localPeerLabel: syncPresenceLabel,
    });
    setStudentSyncClient(client);
    setStudentConnected(client.isConnected());
    wjgLog("sync_connect");
    const offConnect = client.onConnect(() => {
      setStudentConnected(true);
      wjgLog("sync_connect");
    });
    const offDisconnect = client.onDisconnect(() => {
      setStudentConnected(false);
      wjgLog("sync_disconnect");
    });
    const offPeers = client.onPeerCountChange((n) => setStudentOtherPeerCount(n));
    return () => {
      offConnect();
      offDisconnect();
      offPeers();
      client.disconnect();
      setStudentSyncClient(null);
      setStudentConnected(false);
      wjgLog("sync_disconnect");
    };
  }, [
    role,
    studentEncryptionKey,
    syncUrl,
    whiteboardSessionId,
    localPeerId,
    joinUnavailableReason,
    hasLeft,
    wjgLog,
  ]);

  // Student clock tick (drives student timer display)
  useEffect(() => {
    if (role !== "student") return;
    const id = setInterval(() => setStudentNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [role]);

  // Student join-timer poll
  useEffect(() => {
    if (role !== "student") return;
    if (!pathJoinToken) return;
    if (joinUnavailableReason !== null) return;
    const refresh = async () => {
      try {
        const res = await fetch(
          `/api/whiteboard/${encodeURIComponent(whiteboardSessionId)}/join-timer?token=${encodeURIComponent(pathJoinToken)}`,
          { cache: "no-store", credentials: "same-origin" }
        );
        if (!res.ok) {
          if (res.status === 404) {
            setJoinUnavailableReason((prev) => prev ?? "link_invalid");
          }
          return;
        }
        const data = (await res.json()) as {
          live?: boolean;
          reason?: string;
          activeMs?: number;
          lastActiveAt?: string | null;
        };
        if (data.live === false) {
          const r = data.reason;
          const mapped: JoinUnavailableReason =
            r === "token_expired"
              ? "token_expired"
              : r === "token_revoked"
                ? "token_revoked"
                : r === "session_ended"
                  ? "session_ended"
                  : "link_invalid";
          setJoinUnavailableReason(mapped);
          wjgLog("session_ended", { reason: mapped });
          return;
        }
        const treatAsLive =
          data.live === true ||
          (data.live === undefined && typeof data.activeMs === "number");
        if (!treatAsLive) return;
        if (typeof data.activeMs === "number") setStudentServerActiveMs(data.activeMs);
        if (data.lastActiveAt !== undefined) {
          setStudentServerLastActiveAtMs(
            data.lastActiveAt ? new Date(data.lastActiveAt).getTime() : null
          );
        }
      } catch {
        //
      }
    };
    void refresh();
    const t = setInterval(() => void refresh(), 3_500);
    return () => clearInterval(t);
  }, [role, pathJoinToken, whiteboardSessionId, joinUnavailableReason, wjgLog]);

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
  // ---------------------------------------------------------------
  // Student canvas sync + loading guard (role="student")
  // Hooks called unconditionally; gated via arguments per rules-of-hooks.
  // ---------------------------------------------------------------

  const onStudentRemoteHydrateResult = useCallback(
    (result: HydrateRemoteImageFilesResult) => {
      if (result.fetchFailed.length > 0) {
        setStudentMaterialNotice("load");
        setDismissedStudentMaterialNotice(false);
        return;
      }
      if (result.missingAssetUrlFileIds.length > 0) {
        setStudentMaterialNotice((prev) => (prev === "load" ? "load" : "missing"));
        setDismissedStudentMaterialNotice(false);
      }
    },
    []
  );

  // Loading guard (student). wjgLog is a no-op for role="tutor" so safe to call always.
  const {
    initialData: studentInitialData,
    stuckLoading,
    showLoadingGuardBanner,
    dismissStuckLoading,
    reloadFromGuard,
    markLoadingCleared,
  } = useExcalidrawLoadingGuard({ excalidrawAPI, wjgLog });

  const {
    onCanvasChange: studentOnCanvasChange,
    syncActivePageElements,
    snapToTutorView,
    getPageBroadcastExtras: getStudentPageBroadcastExtras,
    pageList: studentPageList,
    activePageId: studentActivePageId,
    activePageIdRef: studentActivePageIdRef,
    applyingRemoteRef: studentApplyingRemoteRef,
    tutorStreamReady,
  } = useStudentWhiteboardCanvas(
    // For role="tutor", null keeps this hook inert (mutually exclusive with recorder sync-ingest)
    role === "student" ? studentSyncClient : null,
    excalidrawAPI,
    role === "student" ? onStudentRemoteHydrateResult : undefined,
    role === "student"
      ? {
          joinToken: pathJoinToken,
          whiteboardSessionId,
          followTutorView: !independentView,
          followDebugTelemetry,
        }
      : undefined
  );

  // Board-wait banner: student connected but no tutor stream after 8s
  useEffect(() => {
    if (role !== "student") return;
    if (!studentConnected || studentOtherPeerCount < 1) {
      setBoardWaitElapsed(false);
      return;
    }
    if (tutorStreamReady) {
      setBoardWaitElapsed(false);
      return;
    }
    const t = window.setTimeout(() => setBoardWaitElapsed(true), 8000);
    return () => clearTimeout(t);
  }, [role, studentConnected, studentOtherPeerCount, tutorStreamReady]);

  // Gate laser pointer origin by role (tutor uses tutor refs; student uses student refs)
  useCollaboratorPointers(
    role === "student" ? studentSyncClient : sync,
    excalidrawAPI,
    role === "student" ? studentApplyingRemoteRef : applyingRemoteToCanvasRef,
    role === "student" ? studentActivePageIdRef : activePageIdRef
  );
  //
  //   bothPartiesInRoomSync  — sync-socket presence only (peerCount ≥ 1).
  //                            Drives: board-syncing UX, split-brain
  //                            detection, gate-timeout trigger.
  //
  //   bothPartiesInRoom      — WebRTC reachable (peerConnectionState=connected
  //                            AND iceConnectionState âˆˆ {connected,completed}).
  //                            Drives: billing pings and session timer. Debounced
  //                            on loss to avoid timer flicker on brief ICE blips.
  //                            lifecycleParticipants (FSM/recording gate) has its
  //                            own parallel debounce effect declared below liveAv.
  //
  // The split-brain scenario: bothPartiesInRoomSync=true but bothPartiesInRoom=false.
  // In that case the UI shows a warning banner and recording pauses.
  const bothPartiesInRoomSync = tutorSyncConnected && peerCount >= 1;

  const [bothPartiesInRoom, setBothPartiesInRoom] = useState(false);
  // Timer ref for debouncing the loss of WebRTC reachability.
  // The useEffect that drives setBothPartiesInRoom lives below liveAv
  // (after `const liveAv = useLiveAV(...)`) because it reads
  // liveAv.reachableParticipants. React rules allow the state + ref to
  // be declared here; only the effect must follow the dep's declaration.
  const reachableLossTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sticky latch: once both parties have truly established a WebRTC call
  // this session, future "auto-pauses" are reconnect waits, not first-join
  // waits. Latched on WebRTC reachability (NOT sync-join) so the initial
  // connecting window (sync socket up, ICE not yet established) does NOT
  // trigger the "Student disconnected — recording paused" state.
  //
  // The latch itself lives here; the write happens below (after liveAv is
  // declared) because it reads liveAv.reachableParticipants. Placing the
  // ref declaration here keeps the render-order constraints visible.
  const everBothPresentRef = useRef(false);

  // UI-honesty: "Student connected — syncing board…" for a brief window
  // after a student joins. The relay socket being up does NOT mean the
  // student has received and applied the welcome push yet. After 5 s the
  // pill graduates to the positive green "Student connected" label. This is
  // a conservative bound — the actual welcome push completes in < 2 s on
  // a healthy connection; the extra time covers slow devices and mobile.
  // Uses sync presence (not WebRTC) — board sync is relay-level, not WebRTC.
  const [boardSyncing, setBoardSyncing] = useState(false);
  const boardSyncingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (bothPartiesInRoomSync) {
      setBoardSyncing(true);
      if (boardSyncingTimerRef.current !== null) {
        clearTimeout(boardSyncingTimerRef.current);
      }
      boardSyncingTimerRef.current = setTimeout(() => {
        boardSyncingTimerRef.current = null;
        setBoardSyncing(false);
      }, 5000);
    } else {
      // Student disconnected (sync): reset so the next join shows the syncing state.
      if (boardSyncingTimerRef.current !== null) {
        clearTimeout(boardSyncingTimerRef.current);
        boardSyncingTimerRef.current = null;
      }
      setBoardSyncing(false);
    }
    return () => {
      if (boardSyncingTimerRef.current !== null) {
        clearTimeout(boardSyncingTimerRef.current);
        boardSyncingTimerRef.current = null;
      }
    };
  }, [bothPartiesInRoomSync]);

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
  // ---------------------------------------------------------------
  // Audio recording hook (must come before liveAv so we can pass
  // localMicStream to useLiveAV to avoid double getUserMedia)
  // ---------------------------------------------------------------
  // NOTE: lifecycleParticipants (FSM input from reachableParticipants)
  // lives below the `const liveAv = useLiveAV(...)` declaration because
  // it reads liveAv.reachableParticipants in its dependency array.

  const [audioDraftRecovery, setAudioDraftRecovery] =
    useState<DraftSegmentRow | null>(null);
  const [audioDraftRecoveryBusy, setAudioDraftRecoveryBusy] = useState(false);

  /**
   * Wall-clock ms when the first audio segment was handed off to the outbox.
   * Used to compute a Phase 1 approximate recording-time offset for the
   * slice 2b transcription producer.
   *
   * // Phase 1 approx — D3/D4 monotonic clock supersedes
   */
  const firstSegmentWallClockMsRef = useRef<number | null>(null);

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
        try {
          const draftStore = getOrCreateRecordingDraftStore();
          await draftStore.clear(whiteboardSessionId, TUTOR_MIC_STREAM_ID);
        } catch (clearErr) {
          console.warn(
            `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} draft clear after enqueue failed`,
            clearErr
          );
        }

        // Slice 2b — producer wedge: trigger the backend transcription
        // pipeline now that the segment blob is confirmed uploaded.
        //
        // MUST be fire-and-forget: a transcription-enqueue failure must
        // never block or disrupt the recording/upload UX.
        //
        // Offset approximation (Phase 1 approx — D3/D4 monotonic clock supersedes):
        // We track the wall-clock ms of the first segment and derive
        // subsequent offsets as delta from that anchor. This is approximate
        // because wall-clock advances during pauses (D4 collapses them);
        // the worker's derived-from-durationMs fallback is equivalent quality.
        const nowMs = Date.now();
        if (firstSegmentWallClockMsRef.current === null) {
          firstSegmentWallClockMsRef.current = nowMs;
        }
        // Phase 1 approx — D3/D4 monotonic clock supersedes
        const recordingTimeOffsetMs = nowMs - firstSegmentWallClockMsRef.current;
        Promise.resolve(
          enqueueChunkTranscriptionAction(whiteboardSessionId, {
            chunkBlobUrl: audioSeg.blobUrl,
            recordingTimeOffsetMs,
          })
        ).catch((txcErr: unknown) => {
          console.warn(
            `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} txc enqueue failed (non-blocking)`,
            txcErr
          );
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
    avLogSessionId: whiteboardSessionId,
    recordingDraft: {
      sessionId: whiteboardSessionId,
      streamId: TUTOR_MIC_STREAM_ID,
    },
    // Seed the displayed recording timer at the session's already-elapsed
    // time so a page refresh doesn't reset it to 0 while the session
    // timer stays at e.g. "12:34". Uses the server-truth value from SSR.
    initialElapsedSeconds: Math.floor(initialActiveMs / 1000),
  });
  const workspaceAudioRef = useRef(workspaceAudio);
  workspaceAudioRef.current = workspaceAudio;

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    void (async () => {
      try {
        const draftStore = getOrCreateRecordingDraftStore();
        const row = await draftStore.findInProgress(
          whiteboardSessionId,
          TUTOR_MIC_STREAM_ID
        );
        if (!cancelled && draftHasRecoverableAudio(row)) {
          setAudioDraftRecovery(row);
        }
      } catch (err) {
        console.warn(
          `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} audio draft recovery scan failed`,
          err
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [whiteboardSessionId]);

  const handleAudioDraftKeep = useCallback(async () => {
    if (!audioDraftRecovery) return;
    setAudioDraftRecoveryBusy(true);
    const dft = Math.random().toString(36).slice(2, 7);
    try {
      const draftStore = getOrCreateRecordingDraftStore();
      const blob = draftStore.assemble(audioDraftRecovery);
      const outbox = getOrCreateUploadOutbox();
      await outbox.enqueue({
        sessionId: whiteboardSessionId,
        streamId: TUTOR_MIC_STREAM_ID,
        segmentId: audioDraftRecovery.segmentId,
        blobLocalRef: blob,
        blobRemoteUrl: null,
        mimeType: audioDraftRecovery.mimeType,
        sizeBytes: blob.size,
        audioStartedAtMs: audioDraftRecovery.firstChunkMs,
      });
      await draftStore.clear(whiteboardSessionId, TUTOR_MIC_STREAM_ID);
      console.log(
        `[WhiteboardWorkspaceClient] dft=${dft} keep-and-enqueue wbsid=${whiteboardSessionId} streamId=${TUTOR_MIC_STREAM_ID} segmentId=${audioDraftRecovery.segmentId} sizeBytes=${blob.size}`
      );
      setAudioDraftRecovery(null);
    } catch (err) {
      console.error(
        `[WhiteboardWorkspaceClient] dft=${dft} keep-and-enqueue failed wbsid=${whiteboardSessionId}`,
        err
      );
    } finally {
      setAudioDraftRecoveryBusy(false);
    }
  }, [audioDraftRecovery, whiteboardSessionId]);

  const handleAudioDraftDiscard = useCallback(async () => {
    if (!audioDraftRecovery) return;
    setAudioDraftRecoveryBusy(true);
    const dft = Math.random().toString(36).slice(2, 7);
    try {
      const draftStore = getOrCreateRecordingDraftStore();
      await draftStore.clear(whiteboardSessionId, TUTOR_MIC_STREAM_ID);
      console.log(
        `[WhiteboardWorkspaceClient] dft=${dft} discard wbsid=${whiteboardSessionId} streamId=${TUTOR_MIC_STREAM_ID}`
      );
      setAudioDraftRecovery(null);
    } catch (err) {
      console.error(
        `[WhiteboardWorkspaceClient] dft=${dft} discard failed wbsid=${whiteboardSessionId}`,
        err
      );
    } finally {
      setAudioDraftRecoveryBusy(false);
    }
  }, [audioDraftRecovery, whiteboardSessionId]);

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
    syncClient: role === "student" ? studentSyncClient : sync,
    localPeerId,
    sessionId: whiteboardSessionId,
    // externalAudioStream: tutor shares the recording mic to avoid two getUserMedia calls.
    // Student does not record, so no external stream needed.
    externalAudioStream: role === "tutor" ? workspaceAudio.localMicStream : undefined,
    swapMicDevice: role === "tutor" ? workspaceAudio.swapMicDevice : undefined,
  });

  // Student A/V auto-request (role="student" only; tutor uses explicit UI).
  // Fix 2.5: gate on studentSyncClient being ready so cam/mic acquisition does
  // not race the mesh attach on cold start. Serialize mic → cam (mic first)
  // to avoid concurrent getUserMedia calls on iOS/mobile.
  useEffect(() => {
    if (role !== "student") return;
    if (!studentSyncClient) return;  // wait for sync client before acquiring media
    if (hasAutoRequestedAvRef.current) return;
    hasAutoRequestedAvRef.current = true;
    // Serialize: mic first so the mesh can be built (hasEverHadLocalMedia latches
    // on first stream), then cam once mic is settled.
    void liveAv.requestMic().then(() => void liveAv.requestCam());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, studentSyncClient]);

  useEffect(() => {
    if (role !== "student") return;
    if (liveAv.hasCamPermission !== "granted") return;
    if (liveAv.localVideoStream) return;
    void liveAv.requestCam();
  }, [role, liveAv.hasCamPermission, liveAv.localVideoStream, liveAv]);

  // Student reconnect: replay ICE for all peers after sync reconnect
  const sawStudentDisconnectRef = useRef(false);
  useEffect(() => {
    if (role !== "student" || !studentSyncClient) {
      sawStudentDisconnectRef.current = false;
      return;
    }
    const offConnect = studentSyncClient.onConnect(() => {
      const shouldRestart = sawStudentDisconnectRef.current;
      sawStudentDisconnectRef.current = false;
      if (!shouldRestart) return;
      for (const p of liveAv.participants) {
        try {
          liveAv.reconnectPeer(p.peerId);
        } catch {
          //
        }
      }
    });
    const offDisconnect = studentSyncClient.onDisconnect(() => {
      sawStudentDisconnectRef.current = true;
    });
    return () => {
      offConnect();
      offDisconnect();
    };
  }, [role, studentSyncClient, liveAv]);

  // Fix 2 (A4 adversarial item): latch everBothPresentRef on first WebRTC
  // reachability rather than sync-join. This prevents the false
  // "Student disconnected — recording paused" banner that appeared for
  // 1–3s every session start (between sync-join and ICE connected).
  if (liveAv.reachableParticipants.length >= 1 && !everBothPresentRef.current) {
    everBothPresentRef.current = true;
  }

  // Use WebRTC-reachable participants (not raw sync peerCount) as the
  // FSM input. This is the core split-brain fix: the FSM now sees
  // participants.size=0 when sync says "connected" but WebRTC is dead,
  // causing it to transition to paused(all_participants_disconnected)
  // → recording pauses rather than silently capturing tutor-only audio.
  //
  // Fix 1 (A4 adversarial item): the original useMemo emptied immediately
  // on any ICE `disconnected` event, pausing recording on transient blips.
  // Replaced with a useState+useEffect that mirrors adding peers immediately
  // (recovery is prompt) but debounces peer *removal* by
  // REACHABLE_LOSS_DEBOUNCE_MS (~8s — long enough to survive normal ICE
  // keepalive hysteresis; short enough that a true drop loses only bounded
  // audio, not a whole silent session). A sustained drop beyond the window
  // DOES pause recording and is the correct behaviour.
  const [lifecycleParticipants, setLifecycleParticipants] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  const lifecycleParticipantsRef = useRef<Set<string>>(new Set<string>());
  const lcpRemovalTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lcpDisposedRef = useRef(false);

  useEffect(() => {
    lcpDisposedRef.current = false;
    const timers = lcpRemovalTimersRef.current;
    return () => {
      lcpDisposedRef.current = true;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const reachablePeerIdsKey = useMemo(
    () =>
      liveAv.reachableParticipants
        .map((p) => p.peerId)
        .sort()
        .join("|"),
    [liveAv.reachableParticipants]
  );

  useEffect(() => {
    if (lcpDisposedRef.current) return;
    const timers = lcpRemovalTimersRef.current;
    const nowReachableIds = new Set(liveAv.reachableParticipants.map((p) => p.peerId));
    for (const [id, timer] of [...timers]) {
      if (nowReachableIds.has(id)) {
        clearTimeout(timer);
        timers.delete(id);
      }
    }
    const current = lifecycleParticipantsRef.current;
    const next = new Set(current);
    let addedAny = false;
    for (const id of nowReachableIds) {
      if (!next.has(id)) {
        next.add(id);
        addedAny = true;
        console.log(
          `[WhiteboardWorkspaceClient] avx=${whiteboardSessionId} wbsid=${whiteboardSessionId}` +
            ` event=lifecycle-participant-added peer=${id}`
        );
      }
    }
    if (addedAny) {
      lifecycleParticipantsRef.current = next;
      setLifecycleParticipants(next);
    }
    for (const id of next) {
      if (!nowReachableIds.has(id) && !timers.has(id)) {
        timers.set(
          id,
          setTimeout(() => {
            if (lcpDisposedRef.current) return;
            timers.delete(id);
            lifecycleParticipantsRef.current.delete(id);
            setLifecycleParticipants(new Set(lifecycleParticipantsRef.current));
            console.log(
              `[WhiteboardWorkspaceClient] avx=${whiteboardSessionId} wbsid=${whiteboardSessionId}` +
                ` event=lifecycle-participant-drop-debounced peer=${id} windowMs=${REACHABLE_LOSS_DEBOUNCE_MS}`
            );
          }, REACHABLE_LOSS_DEBOUNCE_MS)
        );
        console.log(
          `[WhiteboardWorkspaceClient] avx=${whiteboardSessionId} wbsid=${whiteboardSessionId}` +
            ` event=lifecycle-participant-removal-scheduled peer=${id} delayMs=${REACHABLE_LOSS_DEBOUNCE_MS}`
        );
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reachablePeerIdsKey is a stable useMemo of liveAv.reachableParticipants; whiteboardSessionId is session-lifetime stable
  }, [reachablePeerIdsKey]);

  // bothPartiesInRoom — WebRTC-reachable gate (split-brain fix).
  useEffect(() => {
    const nowReachable = tutorSyncConnected && liveAv.reachableParticipants.length >= 1;
    if (nowReachable) {
      if (reachableLossTimerRef.current !== null) {
        clearTimeout(reachableLossTimerRef.current);
        reachableLossTimerRef.current = null;
      }
      setBothPartiesInRoom(true);
    } else {
      if (reachableLossTimerRef.current === null) {
        reachableLossTimerRef.current = setTimeout(() => {
          reachableLossTimerRef.current = null;
          setBothPartiesInRoom(false);
        }, REACHABLE_LOSS_DEBOUNCE_MS);
      }
    }
    return () => {
      if (reachableLossTimerRef.current !== null) {
        clearTimeout(reachableLossTimerRef.current);
        reachableLossTimerRef.current = null;
      }
    };
  }, [tutorSyncConnected, liveAv.reachableParticipants.length]);

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

  // Phase 4d Commit 6: audio-flow gate. Detects per-peer whether the
  // remote audio track is actually carrying frames (not just
  // negotiated). Threaded into the FSM so the MediaRecorder doesn't
  // start until the student's audio is live — fixes the pilot bug
  // where the first 200-2000ms of student speech was lost to silence.
  //
  // We map the real WebRTC peer ids back into the synthetic `peer-N`
  // namespace `lifecycleParticipants` already uses (legacy contract
  // from Phase 1a — only `.size` matters to the FSM in the
  // pre-gate path). Mapping is by index in `liveAv.participants`:
  // synthetic `peer-i` is flowing iff `liveAv.participants[i]` is in
  // the audio-flow set. For 1:1 sessions (the pilot's only shape)
  // this is exact; for groups it's a permissive heuristic (any
  // flowing peer unblocks recording), which is the intended FSM
  // semantics — see `evaluateLifecycle()` step 4b.
  const audioFlowingPeerIds = useAudioFlowConfirmation(liveAv.participants);
  // Use real peerId strings to match lifecycleParticipants (which now
  // also uses real peerId strings). The FSM only checks intersection
  // size, so the namespace just needs to be consistent.
  const participantsWithFlowingAudio = useMemo<ReadonlySet<string>>(() => {
    if (liveAv.participants.length === 0) return EMPTY_FLOW_SET;
    const flowing = new Set<string>();
    for (const p of liveAv.participants) {
      if (audioFlowingPeerIds.has(p.peerId)) {
        flowing.add(p.peerId);
      }
    }
    return flowing;
  }, [liveAv.participants, audioFlowingPeerIds]);

  // Sticky latch — once we've seen audio flow this session, we stay
  // committed to the "recording" path. Same pattern as
  // `everBothPresentRef`. Prevents a mid-session audio-flow blip
  // (network hiccup, peer's mic glitches) from causing
  // record-stop/restart churn inside the FSM.
  const everHadAudioFlowRef = useRef(false);
  if (audioFlowingPeerIds.size > 0 && !everHadAudioFlowRef.current) {
    everHadAudioFlowRef.current = true;
  }

  // Smoke-4 (May 17, 2026): the audio-flow gate as-shipped relied
  // exclusively on REMOTE peer flow. If both parties mute mics at
  // session start (Andrew's exact scenario: phone joined → "we
  // muted to stop the feedback" → audio-flow latch never flipped →
  // FSM held in armed/awaiting_audio_flow → no recording, no audio,
  // no event log, empty replay). That's a billing/audit hole and
  // a real abuse vector — a tutor could mute both ends, deliver
  // the session, and have no recording to bill against. We layer
  // THREE additional release conditions on top of the existing
  // peer-flow latch; ANY of them releases the gate, all sticky:
  //
  //   1. Tutor's OWN local mic flow detected (their device is
  //      producing audio frames). Matches Sarah's mental model
  //      ("session starts as soon as someone is talking") and
  //      is robust to the remote peer being muted at start.
  //   2. Any whiteboard activity (tutor stroke / image insert /
  //      PDF insert; or on-target peer stroke via
  //      `applyRemoteToCanvas`'s recordScene return). A real
  //      session has WB activity within seconds.
  //   3. A 10 s hard timeout after both parties are in the room —
  //      bounded worst case of dead-air-no-recording.
  //
  // Together these make "silent-loss of the entire recording"
  // extremely difficult to trigger by accident or design. The
  // 10 s timeout is the floor; if all other signals fail we still
  // capture the session after at most a 10 s gap.

  // Sub-latch 1 — tutor's own mic flow. Reuses the same
  // `track.muted === false && readyState === "live"` heuristic
  // as `useAudioFlowConfirmation`, applied to the local stream.
  const [everHadTutorAudioFlow, setEverHadTutorAudioFlow] = useState(false);
  useEffect(() => {
    if (everHadTutorAudioFlow) return;
    const stream = liveAv.localAudioStream;
    if (!stream) return;
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) return;
    let cancelled = false;
    const check = (): void => {
      if (cancelled || everHadTutorAudioFlow) return;
      if (tracks.some((t) => !t.muted && t.readyState === "live")) {
        setEverHadTutorAudioFlow(true);
      }
    };
    check();
    const cleanups: Array<() => void> = [];
    for (const t of tracks) {
      const onAny = () => check();
      try {
        t.addEventListener("unmute", onAny);
        t.addEventListener("mute", onAny);
        t.addEventListener("ended", onAny);
        cleanups.push(() => {
          try {
            t.removeEventListener("unmute", onAny);
            t.removeEventListener("mute", onAny);
            t.removeEventListener("ended", onAny);
          } catch {
            // ignore
          }
        });
      } catch {
        (t as MediaStreamTrack).onunmute = onAny;
        (t as MediaStreamTrack).onmute = onAny;
        (t as MediaStreamTrack).onended = onAny;
        cleanups.push(() => {
          (t as MediaStreamTrack).onunmute = null;
          (t as MediaStreamTrack).onmute = null;
          (t as MediaStreamTrack).onended = null;
        });
      }
    }
    return () => {
      cancelled = true;
      for (const c of cleanups) c();
    };
  }, [liveAv.localAudioStream, everHadTutorAudioFlow]);

  // Sub-latch 2 — any whiteboard activity. The `everHadWbActivityRef`
  // ref + `markWbActivity` callback are declared higher up in the
  // component (above `applyRemoteToCanvas`) because both that
  // function and `handleExcalidrawChange` capture `markWbActivity`
  // in their dep arrays; the ref pattern dodges the temporal
  // dead-zone we'd hit if the latch lived only here. Re-render is
  // forced by `bumpWbActivityRerender` so the FSM evaluation below
  // re-reads `everHadWbActivityRef.current`.

  // Sub-latch 3 — 10 s hard timeout once both parties are present.
  // Restarts on disconnect, fires once, sticky thereafter.
  // Uses sync presence (bothPartiesInRoomSync) so the fallback fires
  // even when WebRTC hasn't converged yet (e.g. TURN not deployed,
  // NAT traversal failed). This bounds the worst-case dead-air window.
  const [gateTimeoutFired, setGateTimeoutFired] = useState(false);
  useEffect(() => {
    if (gateTimeoutFired) return;
    if (!bothPartiesInRoomSync) return;
    const t = setTimeout(
      () => setGateTimeoutFired(true),
      AUDIO_FLOW_GATE_TIMEOUT_MS
    );
    return () => clearTimeout(t);
  }, [bothPartiesInRoomSync, gateTimeoutFired]);

  // Combined gate-release boolean. We pass this in place of the raw
  // peer-flow latch so the existing FSM signature is preserved.
  // Renaming `everHadAudioFlow` → `everHadSessionActivity` is a
  // follow-up; the FSM tests + Phase-4d Commit-6 documentation
  // still refer to the old name. The OR is sticky — any sub-latch
  // flipping permanently releases the gate.
  const sessionGateReleased =
    everHadAudioFlowRef.current ||
    everHadTutorAudioFlow ||
    everHadWbActivityRef.current ||
    gateTimeoutFired;

  const lifecycle = evaluateLifecycle({
    tutorWantsRecording: userWantsRecording,
    participants: lifecycleParticipants,
    everHadParticipants: everBothPresentRef.current,
    soloEnabled: allowRecordSoloUntilStudentJoin,
    syncEnabled: !!syncUrl,
    inputStreams: lifecycleInputStreams,
    networkOk: true,
    audioClockMs: 0,
    participantsWithFlowingAudio,
    everHadAudioFlow: sessionGateReleased,
  });

  const presence = derivePresentation(lifecycle, {
    tutorWantsRecording: userWantsRecording,
    participants: lifecycleParticipants,
    everHadParticipants: everBothPresentRef.current,
    syncEnabled: !!syncUrl,
  });
  const recordingActive = presence.recordingActive;

  // Split-brain detection: sync says the student is present (peerCount ≥ 1)
  // but WebRTC reachability is 0 (media path dead). After the first real
  // session connection this is a reliability issue requiring a banner.
  // Only shown when the tutor is actively recording (otherwise the FSM
  // already shows the appropriate armed/paused banner).
  const splitBrainActive =
    bothPartiesInRoomSync &&
    liveAv.reachableParticipants.length === 0 &&
    everBothPresentRef.current;

  // Mandatory log: emit avx=/wbsid= log when recording pauses due to
  // split-brain (sync present + WebRTC dead). This gives prod debugging
  // the transition point. Only fires on the specific paused reason.
  const prevRecordingActiveRef = useRef(false);
  useEffect(() => {
    const prevActive = prevRecordingActiveRef.current;
    prevRecordingActiveRef.current = recordingActive;
    if (!prevActive || recordingActive) return;
    if (lifecycle.pausedReason !== "all_participants_disconnected") return;
    if (!splitBrainActive) return;
    console.log(
      `[WhiteboardWorkspaceClient] avx=${whiteboardSessionId} wbsid=${whiteboardSessionId}` +
      ` event=recording-paused-split-brain sync_peers=${peerCount}` +
      ` reachable_peers=0 reason=webrtc_link_dead`
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- whiteboardSessionId is stable for session lifetime
  }, [recordingActive, splitBrainActive, lifecycle.pausedReason, peerCount]);

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

  // Phase 4d Commit 7: per-peer recording-mute reconcile. After the
  // attach effect above ensures every participant's audioStream is
  // wired into the graph, this effect flips each stream's GainNode
  // to 0 (muted) or 1 (live) based on `mutedPeerIdsInRecording`.
  // Replay sees a clean silence during the muted window (not a gap)
  // because the source stays connected — important for the single-
  // blob / single-row replay pipeline.
  //
  // Wire-level mute (asking the remote peer to stop transmitting)
  // stays out of scope — the student's voice is still audible in
  // the tutor's live A/V playback (the `<audio>` element on the
  // AVTile is independent of the recording graph). Only the
  // recording mixdown is affected.
  const workspaceAudioSetRemoteGain = workspaceAudio.setRemoteRecordingGain;
  useEffect(() => {
    if (!workspaceAudioLocalMicStream) return;
    for (const p of liveAv.participants) {
      if (!p.audioStream) continue;
      const muted = mutedPeerIdsInRecording.has(p.peerId);
      try {
        workspaceAudioSetRemoteGain(p.audioStream, muted ? 0 : 1);
      } catch (err) {
        console.warn(
          `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} setRemoteRecordingGain failed peer=${p.peerId}`,
          (err as Error)?.message ?? String(err)
        );
      }
    }
  }, [
    liveAv.participants,
    mutedPeerIdsInRecording,
    workspaceAudioSetRemoteGain,
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
      width?: number;
      height?: number;
      offsetLeft?: number;
      offsetTop?: number;
    };
    const follow =
      followWireFromTutorAppState(st) ?? {
        centerSceneX: 0,
        centerSceneY: 0,
        zoom: st.zoom.value,
        scrollX: st.scrollX,
        scrollY: st.scrollY,
      };
    return {
      follow,
      page: {
        // Ref — not React state — so rapid tab switches don’t lag one frame
        // behind the canvas (state updates async; ref updates in selectTutorPage).
        activePageId: activePageIdRef.current,
        pageList: pageListRef.current.map((p) => ({
          id: p.id,
          title: p.title,
          ...(p.section ? { section: p.section } : {}),
          ...(p.viewState ? { viewState: { ...p.viewState } } : {}),
        })),
        ...(Object.keys(sectionsRegistryRef.current).length > 0
          ? { sections: { ...sectionsRegistryRef.current } }
          : {}),
      },
      // Same ref as throttled flush — immediate broadcast (e.g. native image) stays consistent.
      scenePageId: activePageIdRef.current,
    };
  }, [syncUrl]);

  /**
   * PR-01 Option A: apply the image URL cache to snapshot elements.
   * Called only at wire/checkpoint build time, never per pointer-move.
   * Invariant P5: assetUrl preserved before any peer-visible snapshot/v3 send.
   */
  const applyImageUrlCacheToElements = useCallback(
    (
      elements: ReadonlyArray<ExcalidrawLikeElement>,
      pageCache: Record<string, { assetUrl: string; altText?: string }> | undefined
    ): ExcalidrawLikeElement[] => {
      if (!pageCache || Object.keys(pageCache).length === 0) {
        return elements.map((e) => ({ ...e }) as ExcalidrawLikeElement);
      }
      return elements.map((el) => {
        if (el.type !== "image") return { ...el } as ExcalidrawLikeElement;
        const cached = pageCache[el.id];
        if (!cached) return { ...el } as ExcalidrawLikeElement;
        const url = el.customData?.assetUrl;
        if (typeof url === "string" && url.length >= 8) {
          return { ...el } as ExcalidrawLikeElement;
        }
        return {
          ...el,
          customData: {
            ...(el.customData ?? {}),
            assetUrl: cached.assetUrl,
            ...(cached.altText && !el.customData?.altText
              ? { altText: cached.altText }
              : {}),
          },
        } as ExcalidrawLikeElement;
      });
    },
    []
  );

  const getTutorDocumentPagesSnapshot = useCallback(() => {
    const api = excalidrawAPIRef.current;
    const cur = activePageIdRef.current;
    const out: Record<string, ReadonlyArray<ExcalidrawLikeElement>> = {};
    for (const p of pageListRef.current) {
      // PR-01 Option A: apply image URL cache at snapshot/wire build time (not per-move)
      const pageCache = imageUrlCacheRef.current[p.id];
      if (p.id === cur && api) {
        // `pageDataRef` is updated from onChange; trust it over getSceneElements()
        // to avoid shipping the previous tab on a fast page flip.
        const cached = pageDataRef.current[p.id] as
          | ExcalidrawLikeElement[]
          | undefined;
        if (cached !== undefined) {
          out[p.id] = applyImageUrlCacheToElements(cached, pageCache);
        } else {
          const live = api.getSceneElements() as ExcalidrawLikeElement[];
          out[p.id] = applyImageUrlCacheToElements(live, pageCache);
        }
      } else {
        const stored = (pageDataRef.current[p.id] ?? []) as ExcalidrawLikeElement[];
        out[p.id] = applyImageUrlCacheToElements(stored, pageCache);
      }
    }
    return out;
  }, [applyImageUrlCacheToElements]);

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
        pageList: pageListRef.current.map((p) => ({
          id: p.id,
          title: p.title,
          ...(p.section ? { section: p.section } : {}),
          ...(p.viewState ? { viewState: { ...p.viewState } } : {}),
        })),
        activePageId: activePageIdRef.current,
        pages,
        ...(Object.keys(sectionsRegistryRef.current).length > 0
          ? { sections: { ...sectionsRegistryRef.current } }
          : {}),
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

  const clearViewportPersistTimer = useCallback(() => {
    if (viewportPersistTimerRef.current !== null) {
      clearTimeout(viewportPersistTimerRef.current);
      viewportPersistTimerRef.current = null;
    }
  }, []);

  const flushViewportPersistNow = useCallback(
    (source: "debounced" | "page-switch-preflush" | "visibility") => {
      clearViewportPersistTimer();
      const api = excalidrawAPIRef.current;
      if (!api) return;
      if (isApplyingViewportProgrammaticRef.current) return;
      if (source === "debounced" && pageSwitchProgrammaticRef.current > 0) return;
      const pid = activePageIdRef.current;
      const st = api.getAppState() as {
        scrollX: number;
        scrollY: number;
        zoom: { value: number };
      };
      const vs: PageViewState = {
        panX: st.scrollX,
        panY: st.scrollY,
        zoom: st.zoom.value,
      };
      const nextList = upsertPageStripViewState(pageListRef.current, pid, vs);
      pageListRef.current = nextList;
      setPageList(nextList);
      const srcTag =
        source === "debounced"
          ? "debounced-flush"
          : source === "page-switch-preflush"
            ? "page-switch"
            : "visibility";
      console.info(
        `[pvs] pvs=${pid} action=flush source=${srcTag} panX=${vs.panX} panY=${vs.panY} zoom=${vs.zoom}`
      );
      if (sync && syncUrl) {
        sync.broadcastPageViewState({
          pageId: pid,
          panX: vs.panX,
          panY: vs.panY,
          zoom: vs.zoom,
        });
        console.info(
          `[pvs] pvs=${pid} action=wire-emit source=${srcTag} panX=${vs.panX} panY=${vs.panY} zoom=${vs.zoom}`
        );
        // v3 document carries `follow` + per-row viewState; pageViewState alone
        // is not enough for first-time origin-aligned follow on the student.
        scheduleDocumentBroadcastRef.current();
      }
      // Phase 5 task 8 (replay tier-c-lite): also append to the event log
      // so replay's camera tracks the same cadence as live. No-op when
      // recording isn't active (gated inside recorder.recordViewport).
      recorderRecordViewportRef.current?.(vs.panX, vs.panY, vs.zoom);
      flushSessionBoardDocumentNow();
    },
    [
      clearViewportPersistTimer,
      flushSessionBoardDocumentNow,
      sync,
      syncUrl,
    ]
  );

  const scheduleViewportPersist = useCallback(() => {
    if (isApplyingViewportProgrammaticRef.current) return;
    if (pageSwitchProgrammaticRef.current > 0) return;
    if (viewportPersistTimerRef.current !== null) {
      clearTimeout(viewportPersistTimerRef.current);
    }
    viewportPersistTimerRef.current = setTimeout(() => {
      viewportPersistTimerRef.current = null;
      flushViewportPersistNow("debounced");
    }, 200);
  }, [flushViewportPersistNow]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      flushViewportPersistNow("visibility");
    };
    const onPageHide = () => {
      flushViewportPersistNow("visibility");
    };
    const onBeforeUnload = () => {
      flushViewportPersistNow("visibility");
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flushViewportPersistNow]);

  useEffect(() => {
    return () => clearViewportPersistTimer();
  }, [clearViewportPersistTimer]);

  const getTutorLiveFollow = useCallback((): WhiteboardWireFollow => {
    const api = excalidrawAPIRef.current;
    if (!api) {
      return { centerSceneX: 0, centerSceneY: 0, zoom: 1 };
    }
    const st = api.getAppState() as {
      scrollX: number;
      scrollY: number;
      zoom: { value: number };
      width?: number;
      height?: number;
      offsetLeft?: number;
      offsetTop?: number;
    };
    return (
      followWireFromTutorAppState(st) ?? {
        centerSceneX: 0,
        centerSceneY: 0,
        zoom: st.zoom.value,
        scrollX: st.scrollX,
        scrollY: st.scrollY,
      }
    );
  }, []);

  const getTutorPageListAndActive = useCallback(
    () => ({
      pageList: pageListRef.current,
      activePageId: activePageIdRef.current,
      sections:
        Object.keys(sectionsRegistryRef.current).length > 0
          ? { ...sectionsRegistryRef.current }
          : undefined,
    }),
    []
  );

  const onFollowDocumentEmitted = useCallback(
    (follow: WhiteboardWireFollow) => {
      const prev = followDebugTelemetry.lastSentFollow.current;
      followDebugTelemetry.lastSentTrigger.current = inferBroadcastTrigger(
        prev,
        follow
      );
      followDebugTelemetry.lastSentFollow.current = follow;
      followDebugTelemetry.lastSentAt.current = Date.now();
    },
    [followDebugTelemetry]
  );

  const { scheduleDocumentBroadcast, flushDocumentBroadcastNow } =
    useTutorLiveDocumentWire({
      enabled: Boolean(sync) && Boolean(syncUrl),
      sync,
      getPagesSnapshot: getTutorDocumentPagesSnapshot,
      getPageListAndActive: getTutorPageListAndActive,
      getFollow: getTutorLiveFollow,
      onDocumentEmitted: onFollowDocumentEmitted,
    });
  scheduleDocumentBroadcastRef.current = scheduleDocumentBroadcast;

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_WB_E2E_SCENE_HOOK !== "1") return;
    registerWbE2eSceneMutationHook("tutor", () => {
      const api = excalidrawAPIRef.current;
      if (!api) return;
      pageDataRef.current[activePageIdRef.current] = [
        ...(api.getSceneElements() as ExcalidrawLikeElement[]),
      ];
      // Drive the REAL production cadence: a tutor scene change schedules a
      // throttled/debounced document broadcast exactly as `handleExcalidrawChange`
      // does on every onChange. NO manual `flushDocumentBroadcastNow()` — that
      // force-flush is the page-swap equivalent that masked the live-sync bug.
      scheduleDocumentBroadcast();
    });
  }, [scheduleDocumentBroadcast]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_WB_E2E_SCENE_HOOK !== "1") return;
    if (role !== "student") return;
    registerWbE2eSceneMutationHook("student", () => {
      const api = excalidrawAPIRef.current;
      if (!api) return;
      studentOnCanvasChange(api.getSceneElements());
    });
  }, [role, studentOnCanvasChange]);

  const recorder = useWhiteboardRecorder({
    whiteboardSessionId,
    adminUserId,
    studentId,
    startedAtIso,
    getAudioMs,
    // Student role: recording is never active; sync-ingest is off (student uses useStudentWhiteboardCanvas)
    recordingActive: role === "student" ? false : recordingActive,
    sync: role === "student" ? null : sync,
    applyRemoteToCanvas,
    getScenePageIdForBroadcast: () => activePageIdRef.current,
    getWireBroadcastExtras: syncUrl ? getWireBroadcastExtras : undefined,
    /** v3 full-document path owns tutor → student live bytes; v2 from recorder is off. */
    includeLiveSyncBroadcast: !sync,
    getBoardDocumentForCheckpoint: buildBoardDocumentForCheckpoint,
  });
  const { flushThrottledFrameNow, onCanvasChange: recorderOnCanvasChange } =
    recorder;
  // Phase 5 task 8 — keep the recorderRecordViewportRef pointed at the
  // current recorder instance so earlier-in-file callbacks
  // (flushViewportPersistNow, selectTutorPage) can append viewport
  // events without circular hook-ordering.
  recorderRecordViewportRef.current = recorder.recordViewport;
  tutorResyncOnNewRemotePeerRef.current = async () => {
    flushThrottledFrameNow();
    flushDocumentBroadcastNow();
  };

  // Phase 5 task 8 — anchor replay's camera at t≈0 by emitting one
  // viewport event when recording becomes active. Without this, replay's
  // first frames have no viewport event ≤ currentTime and fall back to
  // camera-fit, which would jump on the first tutor pan/zoom afterwards.
  useEffect(() => {
    if (!recordingActive) return;
    const api = excalidrawAPIRef.current;
    if (!api) return;
    try {
      const st = api.getAppState() as {
        scrollX?: number;
        scrollY?: number;
        zoom?: { value?: number };
      };
      if (
        typeof st.scrollX === "number" &&
        typeof st.scrollY === "number" &&
        typeof st.zoom?.value === "number"
      ) {
        recorder.recordViewport(st.scrollX, st.scrollY, st.zoom.value);
        console.info(
          `[pvs] pvs=${activePageIdRef.current} action=anchor source=recording-start panX=${st.scrollX} panY=${st.scrollY} zoom=${st.zoom.value}`
        );
      }
    } catch (err) {
      console.warn(
        `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} viewport-anchor at recording-start failed (replay first frames will auto-fit):`,
        (err as Error)?.message ?? err
      );
    }
  }, [recordingActive, recorder, whiteboardSessionId]);

  const selectTutorPage = useCallback(
    async (nextId: string) => {
      // Bump the token FIRST so any in-flight switch abandons even when
      // the user re-clicks the page they're already on (cancel pattern).
      const myToken = ++tutorSwitchTokenRef.current;
      if (nextId === activePageIdRef.current) return;
      const api = excalidrawAPIRef.current;
      if (!api) {
        activePageIdRef.current = nextId;
        setActivePageId(nextId);
        return;
      }
      // Drain the throttled onChange+event log for the old tab *before* we
      // capture its scene.
      flushThrottledFrameNow();
      flushViewportPersistNow("page-switch-preflush");
      const from = activePageIdRef.current;
      if (api) {
        const st = api.getAppState() as {
          scrollX: number;
          scrollY: number;
          zoom: { value: number };
        };
        const vs: PageViewState = {
          panX: st.scrollX,
          panY: st.scrollY,
          zoom: st.zoom.value,
        };
        console.info(
          `[pvs] pvs=${from} action=capture source=page-switch panX=${vs.panX} panY=${vs.panY} zoom=${vs.zoom}`
        );
        const capturedList = upsertPageStripViewState(pageListRef.current, from, vs);
        pageListRef.current = capturedList;
        setPageList(capturedList);
      }
      // Freeze the leaving scene. Safe because activePageIdRef has NOT
      // moved yet — any prior in-flight switch is still hydrating and
      // hasn't bumped activePageIdRef either (see atomic swap below).
      pageDataRef.current[from] = api.getSceneElements() as ReadonlyArray<ExcalidrawLikeElement>;
      const next =
        (pageDataRef.current[nextId] as
          | ReadonlyArray<ExcalidrawLikeElement>
          | undefined) ?? [];

      // Hold the programmatic-switch guard across the entire hydrate.
      // onChange events during this window are dropped (any user input
      // mid-switch is intentionally lost — they just clicked away).
      pageSwitchProgrammaticRef.current += 1;
      let committed = false;
      try {
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
        // ABANDON: a newer selectTutorPage / addTutorPage call won the
        // race during our hydrate. Do NOT bump activePageIdRef, do NOT
        // touch the scene. The newer call's atomic swap owns the
        // final state. (Guard is still released in finally.)
        if (myToken !== tutorSwitchTokenRef.current) return;
        if (hydrateRes.fetchFailed.length > 0) {
          setPeerImageMaterialNotice("load");
        } else if (hydrateRes.missingAssetUrlFileIds.length > 0) {
          setPeerImageMaterialNotice((prev) => (prev === "load" ? "load" : "missing"));
        }
        // Atomic swap: activePageIdRef and the rendered scene move
        // together in the same synchronous block. NO async gap exists
        // between them, so a parallel selectTutorPage cannot read a
        // stale (activePageIdRef = new, scene = old) state.
        activePageIdRef.current = nextId;
        // Bump generation so the onChange async image-URL back-fill
        // rejects stale patched elements from a previous page (the
        // A→B→A same-pageId collision guard).
        boardGenerationRef.current += 1;
        const vsNext = pageListRef.current.find((p) => p.id === nextId)?.viewState;
        // captureUpdate: "NEVER" — board-switch element replacement must never
        // be recorded in Excalidraw's undo/redo stack. Without this, undo on
        // Board N would replay the switch in reverse and inject Board (N-1)
        // elements into the current scene.
        const aDual = api as ExcalidrawApiLike & {
          updateScene: (s: {
            appState?: unknown;
            elements?: unknown;
            captureUpdate?: string;
          }) => void;
          history?: { clear: () => void };
        };
        // Single updateScene so we never paint new tab elements under the old
        // tab's camera (avoids a one-frame misalignment Sarah saw after reload).
        if (vsNext) {
          isApplyingViewportProgrammaticRef.current = true;
          try {
            // Spread prevState here (page switch, canvas fully laid out) so
            // Excalidraw keeps its live width/height for pointer→scene mapping.
            // Without it strokes land above/below the cursor because coordinate
            // transform uses stale dimensions. Contrast with applyBoardDocumentV1
            // (initial mount, canvas may still be 0×0) where we must NOT spread.
            const prevState = api.getAppState() as Record<string, unknown>;
            aDual.updateScene({
              elements: next as ReadonlyArray<unknown>,
              appState: {
                ...prevState,
                scrollX: vsNext.panX,
                scrollY: vsNext.panY,
                zoom: { value: vsNext.zoom },
              },
              captureUpdate: "NEVER",
            });
            console.info(
              `[pvs] pvs=${nextId} action=restore source=page-switch panX=${vsNext.panX} panY=${vsNext.panY} zoom=${vsNext.zoom}`
            );
            // Phase 5 task 8 (replay tier-c-lite): replay sees the
            // camera-jump on page-switch as a viewport event. The
            // page-switch-preflush above already captured the OUTGOING
            // page's final viewport; this captures the INCOMING page's
            // restored viewport so replay knows to move the camera.
            recorderRecordViewportRef.current?.(
              vsNext.panX,
              vsNext.panY,
              vsNext.zoom
            );
          } finally {
            queueMicrotask(() => {
              isApplyingViewportProgrammaticRef.current = false;
            });
          }
        } else {
          aDual.updateScene({ elements: next as ReadonlyArray<unknown>, captureUpdate: "NEVER" });
          console.info(
            `[pvs] pvs=${nextId} action=restore source=page-switch viewState=absent`
          );
        }
        // Scope undo/redo history to the current board. Excalidraw's history
        // stack is global to the single instance — without clearing it on every
        // board switch, undo on Board 2 can replay Board 1 operations and inject
        // Board 1 elements into the Board 2 scene (P0 cross-board contamination).
        aDual.history?.clear();
        committed = true;
      } finally {
        // Hold the guard across two animation frames + a microtask tail
        // so Excalidraw's debounced onChange (which fires on the next
        // frame) is still dropped if it carries stale elements.
        const releaseGuard = () => {
          pageSwitchProgrammaticRef.current = Math.max(
            0,
            pageSwitchProgrammaticRef.current - 1
          );
        };
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(() =>
            window.requestAnimationFrame(() => {
              window.setTimeout(releaseGuard, 0);
            })
          );
        } else {
          setTimeout(releaseGuard, 32);
        }
      }
      if (!committed) return;
      setActivePageId(nextId);
      flushDocumentBroadcastNow();
    },
    [flushDocumentBroadcastNow, flushThrottledFrameNow, flushViewportPersistNow, whiteboardSessionId]
  );

  const addTutorPage = useCallback(() => {
    // Bump the switch token: any in-flight selectTutorPage will abandon
    // when its hydrate finishes (otherwise that late select would
    // clobber Add Page's navigation + scene, reintroducing the leak).
    tutorSwitchTokenRef.current += 1;
    const api = excalidrawAPIRef.current;
    const from = activePageIdRef.current;
    flushThrottledFrameNow();
    flushViewportPersistNow("page-switch-preflush");
    if (api) {
      const st = api.getAppState() as {
        scrollX: number;
        scrollY: number;
        zoom: { value: number };
      };
      const vs: PageViewState = {
        panX: st.scrollX,
        panY: st.scrollY,
        zoom: st.zoom.value,
      };
      console.info(
        `[pvs] pvs=${from} action=capture source=page-switch panX=${vs.panX} panY=${vs.panY} zoom=${vs.zoom}`
      );
      const capList = upsertPageStripViewState(pageListRef.current, from, vs);
      pageListRef.current = capList;
      setPageList(capList);
      // Freeze the leaving scene unconditionally — see selectTutorPage
      // comment for the same guard rationale.
      pageDataRef.current[from] = api.getSceneElements() as ReadonlyArray<ExcalidrawLikeElement>;
    }
    // Smoke-1 #5: pick the smallest unused "Page N" label so adding a
    // page after a PDF section produces a sensible "Page 2", not "Page 9".
    const usedNumbers = new Set<number>();
    for (const p of pageListRef.current) {
      const m = /^Page (\d+)$/.exec(p.title);
      if (m) usedNumbers.add(Number(m[1]));
    }
    let nextN = 2;
    while (usedNumbers.has(nextN)) nextN += 1;
    // New pages append at the end of the strip; navigation jumps to the new tab.
    const newId = `p${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextList = [
      ...pageListRef.current,
      { id: newId, title: `Page ${nextN}` },
    ];
    pageListRef.current = nextList;
    setPageList(nextList);
    pageDataRef.current[newId] = [];
    if (api) {
      pageSwitchProgrammaticRef.current += 1;
      const apiH = api as typeof api & {
        updateScene: (s: { elements?: ReadonlyArray<unknown>; captureUpdate?: string }) => void;
        history?: { clear: () => void };
      };
      try {
        activePageIdRef.current = newId;
        boardGenerationRef.current += 1;
        // captureUpdate: "NEVER" — same reason as selectTutorPage: the new-board
        // element wipe must not create a history entry, and history must be
        // cleared so undo cannot reach across boards.
        apiH.updateScene({ elements: [], captureUpdate: "NEVER" });
        apiH.history?.clear();
      } finally {
        const releaseGuard = () => {
          pageSwitchProgrammaticRef.current = Math.max(
            0,
            pageSwitchProgrammaticRef.current - 1
          );
        };
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(() =>
            window.requestAnimationFrame(() => {
              window.setTimeout(releaseGuard, 0);
            })
          );
        } else {
          setTimeout(releaseGuard, 32);
        }
      }
    } else {
      activePageIdRef.current = newId;
    }
    setActivePageId(newId);
    if (api) {
      flushDocumentBroadcastNow();
    }
  }, [flushDocumentBroadcastNow, flushThrottledFrameNow, flushViewportPersistNow]);

  const removeTutorPage = useCallback(
    (pageId: string) => {
      if (pageListRef.current.length <= 1) return;
      const idx = pageListRef.current.findIndex((p) => p.id === pageId);
      if (idx < 0) return;
      const api = excalidrawAPIRef.current;
      const curActive = activePageIdRef.current;
      if (api && curActive === pageId) {
        flushThrottledFrameNow();
      }
      const nextList = pageListRef.current.filter((p) => p.id !== pageId);
      pageListRef.current = nextList;
      setPageList(nextList);
      const nextData = { ...pageDataRef.current };
      delete nextData[pageId];
      pageDataRef.current = nextData;

      const referenced = new Set<string>();
      for (const p of nextList) {
        if (p.section) referenced.add(p.section);
      }
      const nextSecs: Record<string, { label: string }> = {};
      for (const [sid, meta] of Object.entries(sectionsRegistryRef.current)) {
        if (referenced.has(sid)) nextSecs[sid] = meta;
      }
      sectionsRegistryRef.current = nextSecs;
      setSectionsRegistry(nextSecs);

      if (curActive === pageId) {
        const fallback =
          nextList[Math.max(0, idx - 1)]?.id ??
          nextList[0]?.id ??
          curActive;
        void selectTutorPage(fallback);
      } else {
        flushThrottledFrameNow();
        flushDocumentBroadcastNow();
      }
    },
    [flushDocumentBroadcastNow, flushThrottledFrameNow, selectTutorPage]
  );

  const pdfBoardIntegrate = useMemo<InsertPdfBoardPagesIntegrate>(
    () => ({
      getActivePageId: () => activePageIdRef.current,
      // Atomic batch commit — see InsertPdfBoardPagesIntegrate JSDoc.
      // Before this redesign (smoke-1), each PDF page mutated pageListRef
      // and pageDataRef incrementally, and intermediate `setPageList`
      // re-renders + Excalidraw onChange races could leak the leaving
      // page's elements into the new PDF pages. The single commit closes
      // the window: freeze anchor scene → append rows → register files →
      // navigate, all before the next React tick or v3 broadcast fires.
      commitPdfBatch: ({
        sectionId,
        sectionLabel,
        anchorActivePageId,
        rows,
        firstPageId,
      }) => {
        if (rows.length === 0) return;
        // 1. Freeze the anchor page's scene so its drawings can't be
        // overwritten by any onChange that arrives during the commit.
        const api = excalidrawAPIRef.current;
        if (api) {
          pageDataRef.current[anchorActivePageId] = api.getSceneElements() as
            ReadonlyArray<ExcalidrawLikeElement>;
        }
        // 2. Seed the section registry.
        sectionsRegistryRef.current = {
          ...sectionsRegistryRef.current,
          [sectionId]: { label: sectionLabel },
        };
        setSectionsRegistry({ ...sectionsRegistryRef.current });
        // 3. Write per-page elements BEFORE appending to pageList — so
        // any intermediate `getTutorDocumentPagesSnapshot` read sees
        // populated data rather than `[]`.
        for (const row of rows) {
          pageDataRef.current[row.pageId] =
            row.elements as ReadonlyArray<ExcalidrawLikeElement>;
        }
        // 4. Append all new page rows to the list in one shot. Carry
        // through any per-row `viewState` (Phase 5 task 8 — PDF auto-
        // fit) so `selectTutorPage(firstPageId)` below restores the
        // camera centered on the PDF instead of inheriting the anchor
        // page's pan/zoom.
        const nextList = [
          ...pageListRef.current,
          ...rows.map((r) =>
            enrichPageStripRow({
              id: r.pageId,
              title: r.title,
              section: sectionId,
              isPdf: true,
              ...(r.viewState ? { viewState: r.viewState } : {}),
            })
          ),
        ];
        pageListRef.current = nextList;
        setPageList(nextList);
        // 5. Register BinaryFiles in one addFiles call (still on anchor
        // tab; we navigate next).
        if (api) {
          api.addFiles(rows.map((r) => r.file));
        }
        // 6. Log per-page inserts AFTER state is settled.
        for (const row of rows) {
          console.info(
            `[whiteboard] wbsid=${whiteboardSessionId} pdf-page-insert pageId=${row.pageId} sectionId=${sectionId}`
          );
        }
        // 7. Navigate to first imported page IF tutor still on anchor.
        // Hold the bleed guard from entry through the full tail of
        // selectTutorPage (including its 2×rAF+timeout release) so any
        // remote apply arriving between commitPdfBatch steps and
        // selectTutorPage's own guard increment cannot write to the
        // live scene mid-switch. selectTutorPage adds its own +1 on
        // top; total is 2 during hydrate, drops to 1 after selectTutorPage
        // inner release, then to 0 after our outer release.
        pageSwitchProgrammaticRef.current += 1;
        flushThrottledFrameNow();
        const releasePdfBatchGuard = () => {
          pageSwitchProgrammaticRef.current = Math.max(
            0,
            pageSwitchProgrammaticRef.current - 1
          );
        };
        if (activePageIdRef.current === anchorActivePageId) {
          void selectTutorPage(firstPageId).finally(releasePdfBatchGuard);
        } else {
          flushDocumentBroadcastNow();
          releasePdfBatchGuard();
        }
      },
    }),
    [
      flushDocumentBroadcastNow,
      flushThrottledFrameNow,
      selectTutorPage,
      whiteboardSessionId,
    ]
  );

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
  const [finalizingOutboxState, setFinalizingOutboxState] = useState<
    "idle" | "uploading" | "registering" | "failed"
  >("idle");
  const [endingError, setEndingError] = useState<string | null>(null);
  const audioBridgeRef = useRef<WhiteboardWorkspaceAudioBridgeHandle | null>(
    null
  );

  /**
   * Live outbox observer state while End-session is in the upload/drain
   * phase. Copy uses `inFlightStreamCount` only when `state ===
   * "uploading"` (meaningful N); otherwise "Finalizing…" so we never
   * show a bare "0 segments" after uploads finish-before-enqueue.
   *
   * Scoped to `endingState === "finalizing"` so we don't pay the IDB
   * round-trip during normal recording.
   */
  useEffect(() => {
    if (endingState !== "finalizing") return;
    if (typeof window === "undefined" || !globalThis.indexedDB) return;
    const outbox = getOrCreateUploadOutbox();
    const obs = outbox.observe(whiteboardSessionId);
    const initial = obs.getState();
    setFinalizingSegmentCount(initial.inFlightStreamCount);
    setFinalizingOutboxState(initial.state);
    return obs.subscribe((next) => {
      setFinalizingSegmentCount(next.inFlightStreamCount);
      setFinalizingOutboxState(next.state);
    });
  }, [endingState, whiteboardSessionId]);

  const handleEndSession = useCallback(async () => {
    setEndingState("finalizing");
    setEndingError(null);
    setFinalizingSegmentCount(0);
    setFinalizingOutboxState("idle");
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

      // Slice 3 — post-end notes pipeline (fire-and-forget, never blocks navigation).
      // (a) Kick any straggler non-done chunks so transcription completes before reduce.
      void kickSessionChunksAction(whiteboardSessionId).catch((sweepErr: unknown) => {
        console.warn(
          `[txc] wbsid=${whiteboardSessionId} action=session_sweep_fire_error err=${(sweepErr as Error)?.message ?? sweepErr}`
        );
      });
      // (c) Trigger notes generation — upserts pending TutorNote + fires reduce.
      void triggerNotesGenerationAction(whiteboardSessionId).catch((notesErr: unknown) => {
        console.warn(
          `[tnt] wbsid=${whiteboardSessionId} action=trigger_fire_error err=${(notesErr as Error)?.message ?? notesErr}`
        );
      });

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

      // A3 in-shell review (Phase A): flip the shell to review mode rather
      // than navigating away. The shell's onSessionEnded sets mode="review",
      // which unmounts this client subtree — firing all existing cleanup
      // effects (sync disconnect, useLiveAV mesh/signaling dispose,
      // active-ping interval clear). markPersisted + clearSessionSceneDraft
      // below still run because onSessionEnded() is a synchronous React
      // state-update dispatch; React schedules the unmount for the next
      // render, so this async function continues before the subtree tears down.
      //
      // Fallback: if onSessionEnded is not provided (e.g. a future caller
      // that doesn't use WhiteboardSessionShell), use the legacy router
      // navigation so behaviour is unchanged for those paths.
      if (onSessionEnded) {
        onSessionEnded();
      } else {
        const reviewHref = `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}`;
        router.replace(reviewHref);
        router.refresh();
      }

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
  }, [onSessionEnded, recorder, router, studentId, whiteboardSessionId]);

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
      const list = doc.pageList.map((p) =>
        enrichPageStripRow({
          id: p.id,
          title: p.title,
          ...(p.section ? { section: p.section } : {}),
          ...(p.viewState ? { viewState: { ...p.viewState } } : {}),
        })
      );
      pageListRef.current = list;
      setPageList(list);
      const secs =
        doc.sections && typeof doc.sections === "object"
          ? { ...doc.sections }
          : {};
      sectionsRegistryRef.current = secs;
      setSectionsRegistry(secs);
      activePageIdRef.current = doc.activePageId;
      setActivePageId(doc.activePageId);

      // Replace per-tab buckets wholesale. Merging into pageDataRef leaves
      // orphan keys when a second hydrate (browser draft → IndexedDB "Load
      // draft") narrows or changes ids — that matched strokes from one tab
      // appearing under another tab's viewport.
      const nextBucket: Record<string, ReadonlyArray<ExcalidrawLikeElement>> =
        Object.create(null);
      for (const row of doc.pageList) {
        const raw = doc.pages[row.id];
        nextBucket[row.id] =
          raw !== undefined
            ? ((raw as ReadonlyArray<unknown>).map(
                (e) => ({ ...(e as object) })
              ) as ExcalidrawLikeElement[])
            : [];
      }
      pageDataRef.current = nextBucket;

      const activeEls = nextBucket[doc.activePageId] ?? [];
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
      const vs0 = doc.pageList.find((p) => p.id === doc.activePageId)?.viewState;
      const aDual = api as ExcalidrawApiLike & {
        updateScene: (s: {
          appState?: unknown;
          elements?: unknown;
        }) => void;
      };

      applyingRemoteToCanvasRef.current = true;
      try {
        if (vs0) {
          isApplyingViewportProgrammaticRef.current = true;
          try {
            aDual.updateScene({
              elements: toPaint,
              appState: {
                scrollX: vs0.panX,
                scrollY: vs0.panY,
                zoom: { value: vs0.zoom },
              },
            });
            console.info(
              `[pvs] pvs=${doc.activePageId} action=restore source=reload-restore panX=${vs0.panX} panY=${vs0.panY} zoom=${vs0.zoom}`
            );
          } finally {
            queueMicrotask(() => {
              isApplyingViewportProgrammaticRef.current = false;
            });
          }
        } else {
          api.updateScene({ elements: toPaint });
          console.info(
            `[pvs] pvs=${doc.activePageId} action=restore source=reload-restore viewState=absent`
          );
        }
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
  // Excalidraw onPointerUpdate wiring — laser sync (B9 pilot fix)
  // ---------------------------------------------------------------

  // Throttle pointer broadcasts to ~16ms max cadence (≈60fps ceiling).
  // This is entirely separate from the 50ms document throttle; the laser
  // path NEVER enters handleExcalidrawChange / scheduleDocumentBroadcast.
  const pointerThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointerEmitRef = useRef<number>(0);

  const handlePointerUpdate = useCallback(
    (payload: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" };
      button: "down" | "up";
    }) => {
      // Role-discriminated: tutor uses tutor sync client + page ref; student uses student client.
      const effectiveSync = role === "student" ? studentSyncClient : sync;
      if (!effectiveSync) return;
      if (role === "tutor" && !syncUrl) return;
      if (activeToolTypeRef.current !== "laser") return;
      if (payload.pointer.tool !== "laser") return;

      const now = Date.now();
      const elapsed = now - lastPointerEmitRef.current;
      const MIN_INTERVAL_MS = 16;

      const emit = () => {
        lastPointerEmitRef.current = Date.now();
        effectiveSync.broadcastPointer({
          pageId:
            role === "student"
              ? studentActivePageIdRef.current
              : activePageIdRef.current,
          x: payload.pointer.x,
          y: payload.pointer.y,
          tool: "laser",
          button: payload.button,
          color: laserColorForRole(role),
        });
      };

      if (elapsed >= MIN_INTERVAL_MS) {
        if (pointerThrottleRef.current !== null) {
          clearTimeout(pointerThrottleRef.current);
          pointerThrottleRef.current = null;
        }
        emit();
      } else {
        if (pointerThrottleRef.current === null) {
          pointerThrottleRef.current = setTimeout(() => {
            pointerThrottleRef.current = null;
            emit();
          }, MIN_INTERVAL_MS - elapsed);
        }
      }
    },
    [role, sync, syncUrl, studentSyncClient, studentActivePageIdRef]
  );

  // ---------------------------------------------------------------
  // Excalidraw onChange wiring
  // ---------------------------------------------------------------

  // PR-01 Option E: pointer-up flush — ensures last stroke segment is never dropped
  // when the throttled frame and document broadcast are deferred. Guards respected.
  // Also tracks pointer-down/up so applyRemoteToCanvas can defer canvas writes
  // while an eraser gesture is in progress (prevents mid-gesture scene clobber).
  useEffect(() => {
    const handlePointerDown = () => {
      isCanvasPointerDownRef.current = true;
    };
    const handlePointerUp = () => {
      isCanvasPointerDownRef.current = false;
      if (applyingRemoteToCanvasRef.current) return;
      if (pageSwitchProgrammaticRef.current > 0) return;
      flushThrottledFrameNow();
      if (sync && syncUrl) {
        flushDocumentBroadcastNow();
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [flushThrottledFrameNow, flushDocumentBroadcastNow, sync, syncUrl]);

  const handleExcalidrawChange = useCallback(
    (
      elements: ReadonlyArray<unknown>,
      _appState?: unknown,
      files?: Readonly<Record<string, BinaryFileFromExcalidraw>>
    ) => {
      // ---- Student path (role="student"): student canvas sync ----
      if (role === "student") {
        if (studentApplyingRemoteRef.current) return;
        studentOnCanvasChange(elements, _appState, files);
        markLoadingCleared("remote_scene");
        if (!pathJoinToken) return;
        const api = excalidrawAPIRef.current;
        if (api) {
          const onChangePageId = studentActivePageIdRef.current;
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
                joinToken: pathJoinToken,
                fileIdToAssetUrl: studentNativeImageFileIdToAssetUrlRef.current,
                inFlight: studentNativeImageUploadInFlightRef.current,
              });
              if (patched) {
                const live = excalidrawAPIRef.current;
                if (live) {
                  syncActivePageElements(patched as ReadonlyArray<ExcalidrawLikeElement>);
                  // captureUpdate: "NEVER" — asset-URL back-fill is a
                  // background patch, not a user action; must not pollute
                  // the student's undo/redo stack.
                  (live as typeof live & {
                    updateScene: (s: { elements: ReadonlyArray<unknown>; captureUpdate?: string }) => void;
                  }).updateScene({ elements: patched, captureUpdate: "NEVER" });
                  studentSyncClient?.broadcastScene(
                    patched as ReadonlyArray<ExcalidrawLikeElement>,
                    getStudentPageBroadcastExtras()
                  );
                }
              }
            } catch {
              //
            }
          })();
        }
        return;
      }
      // ---- Tutor path (role="tutor"): unchanged engine logic ----
      if (applyingRemoteToCanvasRef.current) return;
      if (pageSwitchProgrammaticRef.current > 0) return;
      const els = elements as ReadonlyArray<ExcalidrawLikeElement>;
      const pageId = activePageIdRef.current;
      // PR-01 Option A: store raw elements ref — no per-move clone.
      // preserveImageAssetUrlsOnSceneWrite now runs only at wire/checkpoint build time.
      pageDataRef.current[pageId] = els as ExcalidrawLikeElement[];
      // Update image URL cache (lightweight: only scans image-type elements).
      // This preserves assetUrl across the deferred window (invariant P5).
      for (const el of els) {
        const e = el as ExcalidrawLikeElement;
        if (
          e.type === "image" &&
          typeof e.customData?.assetUrl === "string" &&
          e.customData.assetUrl.length >= 8
        ) {
          (imageUrlCacheRef.current[pageId] ??= {})[e.id] = {
            assetUrl: e.customData.assetUrl,
            ...(typeof e.customData?.altText === "string"
              ? { altText: e.customData.altText }
              : {}),
          };
        }
      }
      onLocalElementSnapshot(elements);
      // Smoke-4 (May 17, 2026): real local activity counts as
      // proof-of-session for the audio-flow gate (see
      // `sessionGateReleased`). We hit this branch only AFTER the
      // `applyingRemoteToCanvasRef` and `pageSwitchProgrammaticRef`
      // early-returns, so programmatic scene swaps don't fire it
      // (which is correct — a page switch isn't user activity).
      markWbActivity();
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
      if (!isApplyingViewportProgrammaticRef.current) {
        scheduleViewportPersist();
      }

      // Excalidraw's own image tool / library / drop: elements carry
      // fileId but no customData.assetUrl. Upload from local BinaryFiles
      // so the student can hydrate (our Insert PDF/image path already
      // sets assetUrl at insert time).
      const api = excalidrawAPIRef.current;
      if (api) {
        // smoke-1 #6: capture the page the onChange fired on. If the
        // tutor switches pages while this async upload is in flight,
        // we must NOT write the (page A) patched elements into
        // (page B)'s pageDataRef — that's how Page 1 â†” Page 9 leaked.
        const onChangePageId = activePageIdRef.current;
        // boardGenerationRef guards the A→B→A same-pageId collision:
        // two page switches back to the same id would pass the
        // activePageIdRef check but carry a stale generation number.
        const onChangeGeneration = boardGenerationRef.current;
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
              // smoke-1 #6 guard: tutor may have switched pages while
              // ensureNativeImageAssetUrlsForSync was awaiting the upload.
              // If so, the patched elements belong to the page the
              // onChange originated on, not the current one. Stamp into
              // pageDataRef[onChangePageId] unconditionally, but only
              // hot-swap the live scene if we're still ON that page.
              pageDataRef.current[onChangePageId] =
                patched as ReadonlyArray<ExcalidrawLikeElement>;
              if (
                activePageIdRef.current === onChangePageId &&
                boardGenerationRef.current === onChangeGeneration
              ) {
                excalidrawAPIRef.current.updateScene({ elements: patched });
                recorderOnCanvasChange(
                  patched as ReadonlyArray<ExcalidrawLikeElement>
                );
                flushThrottledFrameNow();
              }
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
      markLoadingCleared,
      markWbActivity,
      onLocalElementSnapshot,
      pathJoinToken,
      recorderOnCanvasChange,
      role,
      scheduleDocumentBroadcast,
      scheduleViewportPersist,
      studentActivePageIdRef,
      studentApplyingRemoteRef,
      studentOnCanvasChange,
      studentSyncClient,
      syncActivePageElements,
      getStudentPageBroadcastExtras,
      studentId,
      sync,
      syncUrl,
      whiteboardSessionId,
    ]
  );

  const renderGraphEmbeddable = useCallback((element: unknown) => {
    const el = element as {
      link?: string;
      customData?: { wbType?: string };
    };
    if (el.link === GRAPH_EMBED_LINK || el.customData?.wbType === "graph") {
      return (
        <GraphEmbeddable
          element={element as { id?: string; width?: number; height?: number; customData?: Record<string, unknown> }}
          excalidrawAPI={role === "student" ? undefined : excalidrawAPIRef.current}
          readOnly={role === "student"}
        />
      );
    }
    return undefined;
  }, [role]);

  const handleExcalidrawLinkOpen = useCallback(
    (
      element: { link?: string | null; customData?: { wbType?: string } },
      event: { preventDefault: () => void }
    ) => {
      if (
        element.link === GRAPH_EMBED_LINK ||
        element.customData?.wbType === "graph"
      ) {
        event.preventDefault();
      }
    },
    []
  );

  // â”€â”€â”€ Chrome: selectTool + updateStrokeStyle callbacks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  type WbChromeApiExt = ExcalidrawApiLike & {
    setActiveTool?: (tool: { type: string; locked?: boolean }) => void;
    updateScene?: (data: { elements?: ReadonlyArray<unknown>; appState?: Record<string, unknown> }) => void;
  };

  const selectTool = useCallback((type: string) => {
    const api = excalidrawAPIRef.current as WbChromeApiExt | null;
    if (!api) return;
    api.setActiveTool?.({ type, locked: type !== "selection" });
    activeToolTypeRef.current = type;
    setActiveToolType(type);
    if (WB_SHAPE_TOOLS.some((s) => s.type === type)) {
      setSelectedShapeTool(type as WbShapeToolType);
    }
    setOpenMenu(null);
  }, []);

  const updateStrokeStyle = useCallback((
    updates: { color?: string; width?: number; opacity?: number; roughness?: number }
  ) => {
    const api = excalidrawAPIRef.current as WbChromeApiExt | null;
    if (!api) return;
    const appState: Record<string, unknown> = {};
    if (updates.color !== undefined) {
      appState.currentItemStrokeColor = updates.color;
      strokeColorRef.current = updates.color;
      setStrokeColor(updates.color);
    }
    if (updates.width !== undefined) {
      appState.currentItemStrokeWidth = updates.width;
      strokeWidthRef.current = updates.width;
      setStrokeWidth(updates.width);
    }
    if (updates.opacity !== undefined) {
      appState.currentItemOpacity = updates.opacity;
      opacityRef.current = updates.opacity;
      setOpacity(updates.opacity);
    }
    if (updates.roughness !== undefined) {
      appState.currentItemRoughness = updates.roughness;
      setRoughness(updates.roughness);
    }
    api.updateScene?.({ appState });
  }, []);

  const updateRoundness = useCallback((value: "sharp" | "round") => {
    const api = excalidrawAPIRef.current as WbChromeApiExt | null;
    if (!api) return;
    api.updateScene?.({ appState: { currentItemRoundness: value } });
    setRoundness(value);
  }, []);

  const toggleGrid = useCallback((enabled: boolean) => {
    setGridEnabled(enabled);
    const api = excalidrawAPIRef.current as WbChromeApiExt | null;
    api?.updateScene?.({ appState: { gridModeEnabled: enabled } });
  }, []);

  const handleAcquireMic = useCallback(async () => {
    if (!workspaceAudio.localMicStream && !liveAv.localAudioStream) {
      await liveAv.requestMic();
    }
  }, [workspaceAudio.localMicStream, liveAv]);

  const handleTopBarCam = useCallback(async () => {
    if (!liveAv.localVideoStream) {
      // requestCam() already sets isCamMuted=false on success.
      // Do NOT call toggleCam() after — that would immediately re-mute.
      await liveAv.requestCam();
      return;
    }
    liveAv.toggleCam();
  }, [liveAv]);

  // Camera-on-by-default: auto-enable the camera when the browser
  // Permissions API confirms it was already granted (e.g. on a
  // subsequent session in the same browser). Runs at most once per
  // mount. Does NOT nag if permission is denied or unknown.
  const hasAutoRequestedCamRef = useRef(false);
  useEffect(() => {
    if (liveAv.hasCamPermission !== "granted") return;
    if (liveAv.localVideoStream) return;
    if (hasAutoRequestedCamRef.current) return;
    hasAutoRequestedCamRef.current = true;
    void liveAv.requestCam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveAv.hasCamPermission]);

  const roughnessLabel =
    roughness === 0 ? "Architect" : roughness === 1 ? "Artist" : "Cartoon";
  const roundnessLabel = roundness === "sharp" ? "Sharp" : "Round";

  const showPropsChrome =
    activeToolType !== "selection" &&
    activeToolType !== "hand" &&
    activeToolType !== "laser";

  // ---------------------------------------------------------------
  // Render helpers — chrome
  // ---------------------------------------------------------------

  const renderSidebarPropsCompact = () => (
    <div
      className={`mynk-wb-props-sidebar mynk-wb-props-compact${propsCompactOpen ? " mynk-wb-props-compact--open" : ""}`}
      data-testid="wb-props-popover"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="mynk-wb-props-compact__summary"
        aria-label="Stroke properties — click to expand"
        aria-expanded={propsCompactOpen}
        data-testid="wb-props-compact-trigger"
        onClick={(e) => {
          e.stopPropagation();
          toggleMenu("props");
        }}
      >
        <span
          className="mynk-wb-summary-swatch"
          style={{
            backgroundColor: inkDisplayHex(strokeColor, excalidrawTheme),
          }}
        />
        <span className="mynk-wb-summary-stroke" aria-hidden>
          <StrokeWidthIcon
            lineH={
              WB_STROKE_WIDTHS.find((w) => w.value === strokeWidth)?.lineH ?? 2
            }
          />
        </span>
        <span
          className="mynk-wb-summary-chip"
          title={roughnessLabel}
          aria-label={roughnessLabel}
          style={{ padding: "2px 4px", background: "transparent" }}
        >
          <RoughnessIcon level={roughness as 0 | 1 | 2} />
        </span>
        <span
          className="mynk-wb-summary-chip"
          title={roundnessLabel}
          aria-label={roundnessLabel}
          style={{ padding: "2px 4px", background: "transparent" }}
        >
          <SharpnessIcon type={roundness} />
        </span>
      </button>
      <div
        className="mynk-wb-props-compact__panel"
        role="dialog"
        aria-label="Stroke properties"
        data-testid="wb-props-panel"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <WbStrokePropsPanel
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          opacity={opacity}
          roughness={roughness}
          roundness={roundness}
          moreStylesOpen={moreStylesOpen}
          inkHex={excalidrawTheme === "dark" ? EXCALIDRAW_STROKE_DARK_HEX : EXCALIDRAW_STROKE_HEX}
          onStrokeChange={updateStrokeStyle}
          onMoreStylesToggle={() => setMoreStylesOpen((p) => !p)}
          onRoughnessChange={(r) => updateStrokeStyle({ roughness: r })}
          onRoundnessChange={updateRoundness}
        />
      </div>
    </div>
  );

  const renderOverflowMenuItems = (closeAfterAction: boolean) => (
    <>
      {touchLayout && (
        <>
          <button
            type="button"
            className="mynk-wb-menu-item"
            onClick={() => {
              selectTool("text");
              if (closeAfterAction) setOpenMenu(null);
            }}
          >
            <span>Text</span>
            <span className="mynk-wb-menu-item__kbd">T</span>
          </button>
          <div className="mynk-wb-popover-sep" />
        </>
      )}
      <button
        type="button"
        className="mynk-wb-menu-item"
        onClick={() => {
          triggerSendToBack();
          if (closeAfterAction) setOpenMenu(null);
        }}
      >
        <span>Send to back</span>
        <span className="mynk-wb-menu-item__kbd">Ctrl+Shift+[</span>
      </button>
      <button
        type="button"
        className="mynk-wb-menu-item"
        onClick={() => {
          triggerSendBackward();
          if (closeAfterAction) setOpenMenu(null);
        }}
      >
        <span>↓ Send backward</span>
        <span className="mynk-wb-menu-item__kbd">Ctrl+[</span>
      </button>
      <button
        type="button"
        className="mynk-wb-menu-item"
        onClick={() => {
          triggerBringForward();
          if (closeAfterAction) setOpenMenu(null);
        }}
      >
        <span>↑ Bring forward</span>
        <span className="mynk-wb-menu-item__kbd">Ctrl+]</span>
      </button>
      <button
        type="button"
        className="mynk-wb-menu-item"
        onClick={() => {
          triggerBringToFront();
          if (closeAfterAction) setOpenMenu(null);
        }}
      >
        <span>Bring to front</span>
        <span className="mynk-wb-menu-item__kbd">Ctrl+Shift+]</span>
      </button>
      <div className="mynk-wb-popover-sep" />
      <button
        type="button"
        className="mynk-wb-menu-item mynk-wb-menu-item--destructive"
        onClick={() => {
          triggerDeleteSelected();
          setOpenMenu(null);
        }}
        aria-label="Delete selected elements"
      >
        <span>Delete selected</span>
        <span className="mynk-wb-menu-item__kbd">Delete</span>
      </button>
      <div className="mynk-wb-popover-sep" />
      <button
        type="button"
        className="mynk-wb-menu-item"
        onClick={() => {
          selectTool("hand");
          setOpenMenu(null);
        }}
      >
        <span>Hand / pan</span>
        <span className="mynk-wb-menu-item__kbd">H</span>
      </button>
      <div className="mynk-wb-popover-sep" />
      <p className="mynk-wb-info-note">
        PDF pages are always below your drawing.
      </p>
    </>
  );

  // Student render-time computed values (used by top bar + overflow helpers)
  const studentCallConnected = liveAv.reachableParticipants.length >= 1;
  const studentConnectionPillLabel = !studentConnected
    ? "Joining…"
    : liveAv.participants.length > 0 && !studentCallConnected
      ? "Call reconnecting…"
      : "Connected";
  const studentConnectionPillOk =
    studentConnected &&
    (liveAv.participants.length === 0 || studentCallConnected);
  const studentBothPresentForTimer = studentConnected && studentCallConnected;
  const studentLiveTimerMs = computeDisplayActiveMs({
    nowMs: studentNow,
    serverActiveMs: studentServerActiveMs,
    serverLastActiveAtMs: studentServerLastActiveAtMs,
    clientActiveNow: studentBothPresentForTimer,
    staleThresholdMs: ACTIVE_PING_STALE_MS,
  });
  const studentShowWaitingForOther =
    studentServerActiveMs === 0 && !studentBothPresentForTimer && studentConnected;

  const renderGridToggleButton = (extraClassName = "mynk-wb-topbar__desktop-only") => (
    <button
      type="button"
      className={`mynk-wb-tb-btn mynk-wb-tb-btn--icon${gridEnabled ? " mynk-wb-tb-btn--grid-on" : ""}${extraClassName ? ` ${extraClassName}` : ""}`}
      title={gridEnabled ? "Hide canvas grid" : "Show canvas grid"}
      aria-label={gridEnabled ? "Hide canvas grid" : "Show canvas grid"}
      aria-pressed={gridEnabled}
      data-testid="wb-grid-toggle"
      onClick={(e) => {
        e.stopPropagation();
        toggleGrid(!gridEnabled);
      }}
    >
      <WbIconGrid size={14} />
    </button>
  );

  const renderGridOverflowMenuItem = () => (
    <button
      type="button"
      className={`mynk-wb-menu-item${gridEnabled ? " mynk-wb-menu-item--active" : ""}`}
      aria-pressed={gridEnabled}
      data-testid="wb-overflow-grid-toggle"
      onClick={() => toggleGrid(!gridEnabled)}
    >
      <span className="mynk-wb-menu-item__icon" aria-hidden>
        <WbIconGrid size={14} />
      </span>
      <span>{gridEnabled ? "Hide canvas grid" : "Show canvas grid"}</span>
    </button>
  );

  const renderTopbarOverflowControl = (testId: string) => (
    <div className="mynk-wb-topbar-overflow-wrap" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="mynk-wb-tb-btn mynk-wb-tb-btn--icon mynk-wb-topbar__overflow-btn"
        title="More session options"
        aria-label="More session options"
        aria-expanded={topbarMoreOpen}
        onClick={(e) => {
          e.stopPropagation();
          toggleMenu("topbar-more");
        }}
        data-testid={testId}
      >
        <WbIconMore size={14} />
      </button>
      {topbarMoreOpen && (
        <div
          className="mynk-wb-topbar-overflow-dropdown"
          role="dialog"
          aria-label="More session options"
          data-testid="wb-topbar-overflow-dropdown"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mynk-wb-topbar-overflow-dropdown__scroll">
            {renderTopBarOverflowItems()}
          </div>
        </div>
      )}
    </div>
  );

  const renderTopBarOverflowItems = () => {
    const undoRedoDisabled = role === "student" ? !studentConnected : endingBusy;
    const camDisabled =
      role === "student"
        ? !studentConnected ||
          liveAv.hasCamPermission === "denied" ||
          (liveAv.videoDevices?.length ?? 1) === 0
        : endingBusy ||
          liveAv.hasCamPermission === "denied" ||
          (liveAv.videoDevices?.length ?? 1) === 0;

    return (
    <div className="mynk-wb-action-sheet__menu-list">
      {role === "student" && touchLayout && (
        <>
          <p className="mynk-wb-info-note" style={{ margin: "0 0 8px" }}>
            This session is being recorded by your tutor. What you draw is visible
            live.
          </p>
          <div className="mynk-wb-popover-sep" />
          <p className="mynk-wb-info-note" style={{ margin: "0 0 8px" }}>
            {studentConnectionPillLabel}
            {" · "}
            {studentShowWaitingForOther
              ? `${formatTimerMinutesOnly(studentLiveTimerMs)} (waiting)`
              : formatTimerMinutesOnly(studentLiveTimerMs)}
          </p>
          <div className="mynk-wb-popover-sep" />
        </>
      )}
      {role === "student" && !touchLayout && (
        <>
          <p className="mynk-wb-info-note" style={{ margin: "0 0 8px" }}>
            This session is being recorded by your tutor. What you draw is visible
            live.
          </p>
          <div className="mynk-wb-popover-sep" />
          <label className="mynk-wb-view-item mynk-wb-menu-item">
            <input
              type="checkbox"
              checked={!independentView}
              onChange={(e) => setIndependentView(!e.target.checked)}
            />
            <span className="mynk-wb-menu-item__icon" aria-hidden>
              <WbIconFollowSync size={14} />
            </span>
            <span>Follow tutor view</span>
          </label>
          <button
            type="button"
            className="mynk-wb-menu-item"
            disabled={!studentConnected}
            onClick={() => snapToTutorView()}
            data-testid="wb-overflow-match-view"
          >
            <span className="mynk-wb-menu-item__icon" aria-hidden>
              <WbIconMatchView size={14} />
            </span>
            <span>Match tutor&apos;s view</span>
          </button>
          <div className="mynk-wb-popover-sep" />
        </>
      )}
      {role === "tutor" && (
        <>
          <button
            type="button"
            className="mynk-wb-menu-item"
            disabled={!syncUrl || copyState === "copying"}
            onClick={() => {
              void handleCopyStudentLink();
              setOpenMenu(null);
            }}
            data-testid="wb-overflow-copy-link"
          >
            <WbIconShare />
            <span>
              {copyState === "copying"
                ? "Copying…"
                : copyState === "copied"
                  ? "Copied!"
                  : "Copy student join link"}
            </span>
          </button>
          <div className="mynk-wb-popover-sep" />
        </>
      )}
      <button
        type="button"
        className="mynk-wb-menu-item"
        disabled={undoRedoDisabled}
        onClick={() => {
          triggerUndo();
        }}
        data-testid="wb-overflow-undo"
      >
        <WbIconUndo />
        <span>Undo</span>
      </button>
      <button
        type="button"
        className="mynk-wb-menu-item"
        disabled={undoRedoDisabled}
        onClick={() => {
          triggerRedo();
        }}
        data-testid="wb-overflow-redo"
      >
        <WbIconRedo />
        <span>Redo</span>
      </button>
      <button
        type="button"
        className="mynk-wb-menu-item"
        disabled={camDisabled}
        onClick={() => {
          void handleTopBarCam();
        }}
        data-testid="wb-overflow-cam"
      >
        <WbIconCamera size={14} />
        <span>
          {liveAv.isCamMuted ? "Turn camera on" : "Turn camera off"}
        </span>
      </button>
      {role === "student" && touchLayout && (
        <>
          <div className="mynk-wb-popover-sep" />
          <label className="mynk-wb-view-item mynk-wb-menu-item">
            <input
              type="checkbox"
              checked={!independentView}
              onChange={(e) => setIndependentView(!e.target.checked)}
            />
            <span className="mynk-wb-menu-item__icon" aria-hidden>
              <WbIconFollowSync size={14} />
            </span>
            <span>Follow tutor view</span>
          </label>
          <button
            type="button"
            className="mynk-wb-menu-item"
            disabled={!studentConnected}
            onClick={() => snapToTutorView()}
            data-testid="wb-overflow-match-view"
          >
            <span className="mynk-wb-menu-item__icon" aria-hidden>
              <WbIconMatchView size={14} />
            </span>
            <span>Match tutor&apos;s view</span>
          </button>
        </>
      )}
      <div className="mynk-wb-popover-sep" />
      {renderGridOverflowMenuItem()}
      <div className="mynk-wb-popover-sep" />
      <div className="mynk-wb-topbar-overflow-theme" role="group" aria-label="Theme">
        {(
          [
            { mode: "light" as const, label: "Light theme" },
            { mode: "dark" as const, label: "Dark theme" },
            { mode: "system" as const, label: "System theme" },
          ] as const
        ).map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            className={`mynk-wb-menu-item${themeMode === mode ? " mynk-wb-menu-item--active" : ""}`}
            aria-pressed={themeMode === mode}
            onClick={() => setThemeMode(mode)}
          >
            <span>{label}</span>
          </button>
        ))}
      </div>
      {role === "tutor" && (
        <>
          <div className="mynk-wb-popover-sep" />
          <div className="mynk-wb-topbar-overflow-inserts">
            <PdfImageUploadButton
              excalidrawAPI={excalidrawAPI}
              whiteboardSessionId={whiteboardSessionId}
              studentId={studentId}
              disabled={endingBusy}
              integrate={pdfBoardIntegrate}
              chrome
            />
            <MathInsertButton
              excalidrawAPI={excalidrawAPI}
              whiteboardSessionId={whiteboardSessionId}
              studentId={studentId}
              disabled={endingBusy}
              chrome
            />
            <GraphInsertButton
              excalidrawAPI={excalidrawAPI}
              whiteboardSessionId={whiteboardSessionId}
              studentId={studentId}
              disabled={endingBusy}
              chrome
            />
          </div>
        </>
      )}
    </div>
    );
  };

  const renderMoreOverflowMenu = (iconSize = 16) => (
    <>
      <div className="mynk-wb-more-menu">
        <WbToolBtn
          icon={<WbIconMore size={iconSize} />}
          label="More — z-order, delete, hand"
          active={morePopoverOpen}
          onClick={() => {
            toggleMenu("more");
          }}
        />
        {!touchLayout && morePopoverOpen && (
          <div
            className="mynk-wb-more-popover"
            role="dialog"
            aria-label="More drawing options"
            data-testid="wb-more-popover"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {renderOverflowMenuItems(false)}
          </div>
        )}
      </div>
    </>
  );

  const renderShapesSheetItems = () => (
    <div className="mynk-wb-action-sheet__shapes-list" role="menu">
      {WB_SHAPE_TOOLS.map(({ type, label, Icon }) => (
        <button
          key={type}
          type="button"
          role="menuitem"
          className={`mynk-wb-shapes-item${
            (activeToolType === type || selectedShapeTool === type) &&
            WB_SHAPE_TOOLS.some((s) => s.type === activeToolType)
              ? " mynk-wb-shapes-item--active"
              : selectedShapeTool === type
                ? " mynk-wb-shapes-item--active"
                : ""
          }`}
          onClick={() => selectTool(type)}
        >
          <Icon size={16} />
          {label}
        </button>
      ))}
    </div>
  );

  const renderShapesMenu = (iconSize: number) => (
    <div className="mynk-wb-shapes-menu">
      <WbToolBtn
        icon={shapeIconFor(
          WB_SHAPE_TOOLS.some((s) => s.type === activeToolType)
            ? activeToolType
            : selectedShapeTool,
          iconSize
        )}
        label="Shapes"
        active={WB_SHAPE_TOOLS.some((s) => s.type === activeToolType)}
        onClick={() => {
          selectTool(
            WB_SHAPE_TOOLS.some((s) => s.type === activeToolType)
              ? activeToolType
              : selectedShapeTool
          );
        }}
        pulldown
        onPulldown={() => toggleMenu("shapes")}
      />
      {!touchLayout && shapesDropdownOpen && (
        <div className="mynk-wb-shapes-dropdown" role="menu">
          {WB_SHAPE_TOOLS.map(({ type, label, Icon }) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              className={`mynk-wb-shapes-item${
                (activeToolType === type || selectedShapeTool === type) &&
                WB_SHAPE_TOOLS.some((s) => s.type === activeToolType)
                  ? " mynk-wb-shapes-item--active"
                  : selectedShapeTool === type
                    ? " mynk-wb-shapes-item--active"
                    : ""
              }`}
              onClick={() => selectTool(type)}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const renderToolStripButtons = (large = false) => {
    const iconSize = large ? 18 : 16;
    const coreTools = (
      <>
        <WbToolBtn
          icon={<WbIconSelect size={iconSize} />}
          label="Select (V)"
          active={activeToolType === "selection"}
          onClick={() => selectTool("selection")}
        />
        <WbToolBtn
          icon={<WbIconPencil size={iconSize} />}
          label="Pencil (P)"
          active={activeToolType === "freedraw"}
          onClick={() => selectTool("freedraw")}
        />
        <WbToolBtn
          icon={<WbIconEraser size={iconSize} />}
          label="Eraser (E)"
          active={activeToolType === "eraser"}
          onClick={() => selectTool("eraser")}
        />
      </>
    );
    const textTool = (
      <WbToolBtn
        icon={<WbIconText size={iconSize} />}
        label="Text (T)"
        active={activeToolType === "text"}
        onClick={() => selectTool("text")}
      />
    );
    const stylesTool = (
      <WbToolBtn
        icon={<WbIconStyles size={iconSize} />}
        label="Styles"
        active={openMenu === "props"}
        onClick={() => toggleMenu("props")}
      />
    );
    const wandTool = (
      <WbToolBtn
        icon={<WbIconWand size={iconSize} />}
        label="Pointer wand (K)"
        active={activeToolType === "laser"}
        onClick={() => selectTool("laser")}
        accent
      />
    );

    if (touchLayout) {
      // TB-12 touch tier-1: Select · Pencil · Eraser · Shapes▾ · Styles · Wand · ⋮
      return (
        <>
          {coreTools}
          {renderShapesMenu(iconSize)}
          {stylesTool}
          {wandTool}
          {renderMoreOverflowMenu(iconSize)}
        </>
      );
    }

    // Desktop left strip — unchanged order
    return (
      <>
        {coreTools}
        {textTool}
        {wandTool}
        {renderShapesMenu(iconSize)}
        {renderMoreOverflowMenu(iconSize)}
      </>
    );
  };

  // ---------------------------------------------------------------
  // Center-preserving viewport resize (additive — does not touch
  // page-switch, student-follow, recording FSM, or pvs logic).
  // ---------------------------------------------------------------
  //
  // Uses the same frame-to-frame formula as the replay surface:
  //   scrollX_new = scrollX_old + (newWidth - oldWidth) / (2 * zoom)
  // scrollX_old is read live from api.getAppState() at resize time so it
  // always reflects the tutor's current pan (no snapshot race).
  // prevWbWidthRef tracks the previous observed container width so oldWidth
  // is independent of Excalidraw's appState.width (which updates before our
  // observer fires). The viewport change naturally flows through onChange →
  // scheduleViewportPersist → broadcast, which is the correct behavior
  // (students following the tutor re-center to match).
  useEffect(() => {
    const container = wbCanvasRef.current;
    if (!container) return;

    prevWbWidthRef.current = null;
    prevWbHeightRef.current = null;

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) return;

      const prevW = prevWbWidthRef.current;
      const prevH = prevWbHeightRef.current;

      if (
        prevW !== null &&
        prevH !== null &&
        prevW > 0 &&
        prevH > 0 &&
        (rect.width !== prevW || rect.height !== prevH)
      ) {
        const api = excalidrawAPIRef.current as (ExcalidrawApiLike & {
            updateScene?: (data: { appState?: Record<string, unknown> }) => void;
          }) | null;
        try {
          if (api) {
            const st = api.getAppState() as {
              scrollX?: number;
              scrollY?: number;
              zoom?: { value?: number };
            };
            const z =
              typeof st.zoom?.value === "number" ? st.zoom.value : 1;
            const scrollX =
              typeof st.scrollX === "number" ? st.scrollX : 0;
            const scrollY =
              typeof st.scrollY === "number" ? st.scrollY : 0;
            const newScroll = computeResizeScroll({
              scrollX,
              scrollY,
              zoom: z,
              oldWidth: prevW,
              oldHeight: prevH,
              newWidth: rect.width,
              newHeight: rect.height,
            });
            api.updateScene?.({
              appState: {
                scrollX: newScroll.scrollX,
                scrollY: newScroll.scrollY,
                zoom: { value: z },
              },
            });
          }
        } catch {
          // best-effort — never crash the live board
        }
      }

      prevWbWidthRef.current = rect.width;
      prevWbHeightRef.current = rect.height;
    };

    // ResizeObserver is a browser API not available in jsdom test environments.
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []); // wbCanvasRef and excalidrawAPIRef are stable refs — no deps needed

  // ---------------------------------------------------------------
  // Render — Mynk whiteboard chrome
  // ---------------------------------------------------------------

  const endingBusy = endingState === "ending" || endingState === "finalizing";
  const debugOverlayVisible = useWbChromeDebugOverlayVisible();
  const syncPill = deriveSyncPillState({
    tutorSyncConnected,
    // Use sync presence for the board-syncing pill — board sync is
    // relay-level, not WebRTC. The pill shows "Student connected"
    // based on sync roster, not WebRTC reachability.
    bothPartiesInRoom: bothPartiesInRoomSync,
    boardSyncing,
  });

  // ---------------------------------------------------------------
  // Student early-return gates (Slice 5: join gate states)
  // Must be AFTER all hooks; conditional returns are only allowed here.
  // ---------------------------------------------------------------
  if (role === "student" && hasLeft) {
    return (
      <WbRoleProvider role={role}>
        <div className="container" style={{ maxWidth: 720, padding: 24 }}>
          <div className="card" role="status">
            <h1 style={{ marginTop: 0 }}>You left the session</h1>
            <p style={{ marginBottom: 0 }}>
              You can close this tab. If you need to rejoin, ask {tutorName} for
              the link again.
            </p>
          </div>
        </div>
      </WbRoleProvider>
    );
  }

  if (role === "student" && studentKeyMissing) {
    return (
      <WbRoleProvider role={role}>
        <div className="container" style={{ maxWidth: 720, padding: 24 }}>
          <div className="card">
            <h1 style={{ marginTop: 0 }}>Whiteboard link is incomplete</h1>
            <p>
              This link is missing the encryption key. Please ask {tutorName} for
              a fresh link.
            </p>
          </div>
        </div>
      </WbRoleProvider>
    );
  }

  if (role === "student" && joinUnavailableReason) {
    const { title, body } = joinUnavailableCopy(joinUnavailableReason, tutorName);
    return (
      <WbRoleProvider role={role}>
        <div className="container" style={{ maxWidth: 720, padding: 24 }}>
          <div className="card" role="status">
            <h1 style={{ marginTop: 0 }}>{title}</h1>
            <p style={{ marginBottom: 0 }}>{body}</p>
          </div>
        </div>
      </WbRoleProvider>
    );
  }

  const showBoardWaitBanner =
    boardWaitElapsed && !dismissedBoardWaitNotice && !stuckLoading;
  const chromeLocalTileLabel = role === "student" ? "You" : localPeerLabel;
  const chromePageList = role === "student" ? studentPageList : pageList;

  return (
    <WbRoleProvider role={role}>
    <LiveBoardChrome
      layoutMode={layoutMode}
      orientation={orientation}
      role={role}
      toolbarHidden={toolbarHidden}
      onChromeClick={() => setOpenMenu(null)}
      nonVisualMounts={
      <WhiteboardWorkspaceAudioBridge
        ref={audioBridgeRef}
        audio={workspaceAudio}
        whiteboardSessionId={whiteboardSessionId}
        userWantsRecording={userWantsRecording}
        recordingActive={recordingActive}
        panelDisabled={endingBusy || !userWantsRecording || audioDraftRecovery !== null}
        onMicDeviceChange={(deviceId) => void liveAv.setMicDevice(deviceId)}
        showPanel={false}
      />
      }
      topBar={
      role === "student" ? (
      <header
        ref={studentTopbarRef}
        className="mynk-wb-topbar bg-card border-b border-border"
        role="toolbar"
        aria-label="Session controls"
        onClick={(e) => e.stopPropagation()}
        data-testid="wb-student-topbar"
      >
        <span className="mynk-wb-wordmark" aria-label="Mynk">
          Mynk<span className="mynk-wb-wordmark__dot">·</span>
        </span>
        {tutorName && (
          <span className="mynk-wb-student-tutor-name">{tutorName}</span>
        )}
        <span className="mynk-wb-topbar__sep" aria-hidden />

        {/* Zone 2: Connected pill + timer + disclosure (disclosure hides on touch via desktop-only) */}
        <div className="mynk-wb-topbar__zone">
          <span
            className={`mynk-wb-status-pill${studentConnectionPillOk ? " mynk-wb-status-pill--ok" : " mynk-wb-status-pill--warn"}`}
            data-testid="wb-student-sync-pill"
          >
            {studentConnectionPillLabel}
          </span>
          <span className="mynk-wb-timer" data-testid="wb-student-timer">
            {studentShowWaitingForOther
              ? `${formatTimerMinutesOnly(studentLiveTimerMs)} (waiting)`
              : formatTimerMinutesOnly(studentLiveTimerMs)}
          </span>
          <span
            className="mynk-wb-student-disclosure mynk-wb-topbar__desktop-only"
            data-testid="wb-student-recording-disclosure"
          >
            This session is being recorded by your tutor. What you draw is visible
            live.
          </span>
        </div>

        <button
          type="button"
          className="mynk-wb-toolbar-toggle"
          data-testid="wb-student-toolbar-toggle"
          aria-pressed={toolbarHidden}
          title={toolbarHidden ? "Show tools" : "Hide tools"}
          onClick={(e) => {
            e.stopPropagation();
            setToolbarHidden((hidden) => !hidden);
          }}
        >
          <span className="mynk-wb-toolbar-toggle__label">
            {toolbarHidden ? "Show tools" : "Hide tools"}
          </span>
          <span className="mynk-wb-toolbar-toggle__chev" aria-hidden>
            {toolbarHidden ? "▴" : "▾"}
          </span>
        </button>

        <div style={{ flex: 1, minWidth: 0 }} />

        <div className="mynk-wb-topbar__zone" onClick={(e) => e.stopPropagation()}>
          {/* Follow toggle — desktop-only (overflow sheet on touch via renderTopBarOverflowItems) */}
          <div className="mynk-wb-student-follow mynk-wb-topbar__desktop-only">
            <label
              className={`mynk-wb-follow-toggle mynk-wb-chip${!independentView ? " mynk-wb-follow-toggle--synced" : ""}`}
            >
              <input
                type="checkbox"
                checked={!independentView}
                aria-label="Follow tutor view"
                data-testid="wb-student-follow-toggle"
                onChange={(e) => setIndependentView(!e.target.checked)}
              />
              <span className="mynk-wb-menu-item__icon" aria-hidden>
                <WbIconFollowSync size={12} />
              </span>
              <span className="mynk-wb-follow-toggle__label">Follow tutor view</span>
            </label>
            <button
              type="button"
              className="mynk-wb-tb-btn mynk-wb-tb-btn--icon mynk-wb-tb-btn--match-view"
              data-testid="wb-student-match-view"
              aria-label="Match tutor's view"
              title="Match tutor's view"
              disabled={!studentConnected}
              onClick={() => snapToTutorView()}
            >
              <WbIconMatchView size={14} />
            </button>
          </div>

          <span className="mynk-wb-topbar__sep mynk-wb-topbar__desktop-only" aria-hidden />

          <WbTopBarMicControlLive
            isMicMuted={liveAv.isMicMuted}
            hasMicPermission={liveAv.hasMicPermission}
            hasMicStream={liveAv.localAudioStream !== null}
            onToggleMute={liveAv.toggleMic}
            onAcquireMic={handleAcquireMic}
            onMicDeviceChange={(deviceId) => void liveAv.setMicDevice(deviceId)}
            disabled={!studentConnected}
          />
          <WbTopBarCamControl
            isCamMuted={liveAv.isCamMuted}
            hasCamPermission={liveAv.hasCamPermission}
            onToggleCam={() => void handleTopBarCam()}
            videoDevices={liveAv.videoDevices ?? []}
            selectedPickerSlot={liveAv.pickedVideoCameraSlot}
            onPickCameraSlot={(slot) => void liveAv.setVideoCameraBySlot(slot)}
            isLive={!liveAv.isCamMuted && !!liveAv.localVideoStream}
            disabled={!studentConnected}
          />

          <span className="mynk-wb-topbar__sep mynk-wb-topbar__desktop-only" aria-hidden />

          <button
            type="button"
            className="mynk-wb-tb-btn mynk-wb-tb-btn--icon mynk-wb-topbar__desktop-only"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            disabled={!studentConnected}
            data-testid="wb-student-undo"
            onClick={() => triggerUndo()}
          >
            <WbIconUndo />
          </button>
          <button
            type="button"
            className="mynk-wb-tb-btn mynk-wb-tb-btn--icon mynk-wb-topbar__desktop-only"
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            disabled={!studentConnected}
            data-testid="wb-student-redo"
            onClick={() => triggerRedo()}
          >
            <WbIconRedo />
          </button>

          <span className="mynk-wb-topbar__sep mynk-wb-topbar__desktop-only" aria-hidden />

          {renderGridToggleButton()}

          <div className="mynk-wb-topbar__desktop-only">
            <WbThemeToggle
              open={openMenu === "theme"}
              onOpenChange={(open) => setOpenMenu(open ? "theme" : null)}
            />
          </div>
        </div>

        <div className="mynk-wb-topbar__zone mynk-wb-topbar__zone--trailing">
          {renderTopbarOverflowControl("wb-student-topbar-overflow")}
          <button
            type="button"
            className="mynk-wb-tb-btn mynk-wb-tb-btn--exit"
            data-testid="wb-student-exit"
            aria-label="Exit"
            title="Exit"
            onClick={() => {
              wjgLog("student_exit");
              setHasLeft(true);
            }}
          >
            <WbIconEndSession size={14} />
            <span className="mynk-wb-sr-only">Exit</span>
          </button>
        </div>
      </header>
      ) : (
      <header
        className="mynk-wb-topbar bg-card border-b border-border"
        role="toolbar"
        aria-label="Session controls"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mynk-wb-wordmark" aria-label="Mynk">
          Mynk<span className="mynk-wb-wordmark__dot">·</span>
        </span>
        <span className="mynk-wb-topbar__sep" aria-hidden />

        <div className="mynk-wb-topbar__zone">
          <div className="mynk-wb-live-badge" data-testid="wb-recording-pill">
            <span className="mynk-wb-live-badge__dot" aria-hidden />
            LIVE
          </div>
          <span className="mynk-wb-timer" data-testid="wb-timer">
            {formatTimerMinutesOnly(liveTimerMs)}
          </span>
          {syncPill.show && (
            <span
              className="mynk-wb-sr-only"
              data-testid="wb-sync-pill"
              aria-live="polite"
            >
              {syncPill.label}
            </span>
          )}
        </div>

        <button
          type="button"
          className="mynk-wb-toolbar-toggle"
          data-testid="wb-toolbar-toggle"
          aria-pressed={toolbarHidden}
          title={toolbarHidden ? "Show tools" : "Hide tools"}
          onClick={(e) => {
            e.stopPropagation();
            setToolbarHidden((hidden) => !hidden);
          }}
        >
          <span className="mynk-wb-toolbar-toggle__label">
            {toolbarHidden ? "Show tools" : "Hide tools"}
          </span>
          <span className="mynk-wb-toolbar-toggle__chev" aria-hidden>
            {toolbarHidden ? "▴" : "▾"}
          </span>
        </button>

        <div style={{ flex: 1, minWidth: 0 }} />

        <div className="mynk-wb-topbar__zone" onClick={(e) => e.stopPropagation()}>
          {/* Share + Copied — desktop top bar; touch uses overflow sheet */}
          <div className="mynk-wb-share-wrap mynk-wb-topbar__desktop-only">
            <button
              type="button"
              className={`mynk-wb-tb-btn${copyState === "copied" ? " mynk-wb-tb-btn--copied" : ""}`}
              title="Copy session link"
              onClick={handleCopyStudentLink}
              disabled={!syncUrl || copyState === "copying"}
              data-testid="wb-copy-student-link"
            >
              <WbIconShare />
              <span>{copyState === "copying" ? "…" : copyState === "copied" ? "Copied" : "Share"}</span>
            </button>
            <button
              type="button"
              className="mynk-wb-tb-btn mynk-wb-tb-btn--icon mynk-wb-share-caret"
              title="Share options"
              aria-label="Share options"
              aria-expanded={shareMenuOpen}
              disabled={!syncUrl}
              onClick={(e) => {
                e.stopPropagation();
                toggleMenu("share");
              }}
              data-testid="wb-share-options"
            >
              <span className="mynk-wb-share-chevron">▾</span>
            </button>
            {shareMenuOpen && (
              <div
                className="mynk-wb-share-dropdown"
                role="menu"
                aria-label="Share options"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="mynk-wb-menu-item"
                  disabled={copyState === "copying"}
                  onClick={() => {
                    void handleCopyStudentLink();
                    setOpenMenu(null);
                  }}
                >
                  <span>Copy student join link</span>
                </button>
              </div>
            )}
          </div>

          <span className="mynk-wb-topbar__sep mynk-wb-topbar__desktop-only" aria-hidden />

          <WbTopBarMicControl
            audio={workspaceAudio}
            isMicMuted={liveAv.isMicMuted}
            onToggleMute={liveAv.toggleMic}
            onAcquireMic={handleAcquireMic}
            onMicDeviceChange={(deviceId) => void liveAv.setMicDevice(deviceId)}
            disabled={endingBusy}
          />
          <WbTopBarCamControl
            isCamMuted={liveAv.isCamMuted}
            hasCamPermission={liveAv.hasCamPermission}
            onToggleCam={() => void handleTopBarCam()}
            videoDevices={liveAv.videoDevices ?? []}
            selectedPickerSlot={liveAv.pickedVideoCameraSlot}
            onPickCameraSlot={(slot) => void liveAv.setVideoCameraBySlot(slot)}
            isLive={!liveAv.isCamMuted && !!liveAv.localVideoStream}
            disabled={endingBusy}
          />

          <span className="mynk-wb-topbar__sep mynk-wb-topbar__desktop-only" aria-hidden />

          <button
            type="button"
            className="mynk-wb-tb-btn mynk-wb-tb-btn--icon mynk-wb-topbar__desktop-only"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            disabled={endingBusy}
            data-testid="wb-undo"
            onClick={() => triggerUndo()}
          >
            <WbIconUndo />
          </button>
          <button
            type="button"
            className="mynk-wb-tb-btn mynk-wb-tb-btn--icon mynk-wb-topbar__desktop-only"
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            disabled={endingBusy}
            data-testid="wb-redo"
            onClick={() => triggerRedo()}
          >
            <WbIconRedo />
          </button>

          <span
            className="mynk-wb-topbar__sep mynk-wb-topbar__inserts mynk-wb-topbar__desktop-only"
            aria-hidden
          />

          <div className="mynk-wb-topbar__zone mynk-wb-topbar__inserts mynk-wb-topbar__desktop-only">
            <PdfImageUploadButton
              excalidrawAPI={excalidrawAPI}
              whiteboardSessionId={whiteboardSessionId}
              studentId={studentId}
              disabled={endingBusy}
              integrate={pdfBoardIntegrate}
              chrome
            />
            <MathInsertButton
              excalidrawAPI={excalidrawAPI}
              whiteboardSessionId={whiteboardSessionId}
              studentId={studentId}
              disabled={endingBusy}
              chrome
            />
            <GraphInsertButton
              excalidrawAPI={excalidrawAPI}
              whiteboardSessionId={whiteboardSessionId}
              studentId={studentId}
              disabled={endingBusy}
              chrome
            />
          </div>

          <span className="mynk-wb-topbar__sep mynk-wb-topbar__desktop-only" aria-hidden />

          {renderGridToggleButton()}

          <div className="mynk-wb-topbar__desktop-only">
            <WbThemeToggle
              open={themeMenuOpen}
              onOpenChange={(v) => setOpenMenu(v ? "theme" : null)}
            />
          </div>
        </div>

        <div className="mynk-wb-topbar__zone mynk-wb-topbar__zone--trailing">
          {renderTopbarOverflowControl("wb-topbar-overflow")}
          {(() => {
            const endSessionLabel =
              endingState === "finalizing"
                ? finalizingOutboxState === "uploading" &&
                  finalizingSegmentCount > 0
                  ? `Saving ${finalizingSegmentCount} segment${finalizingSegmentCount === 1 ? "" : "s"}…`
                  : "Finalizing…"
                : endingState === "ending"
                  ? "Finalizing…"
                  : "End session";
            return (
              <button
                type="button"
                className={`mynk-wb-tb-btn mynk-wb-tb-btn--primary${touchLayout ? " mynk-wb-tb-btn--end-touch" : ""}`}
                onClick={handleEndSession}
                disabled={endingBusy}
                data-testid="wb-end-session"
                aria-label={endSessionLabel}
                title={endSessionLabel}
              >
                {touchLayout ? (
                  <>
                    <WbIconEndSession size={14} />
                    <span className="mynk-wb-sr-only">{endSessionLabel}</span>
                  </>
                ) : (
                  endSessionLabel
                )}
              </button>
            );
          })()}
        </div>
      </header>
      )
      }
      toolStrip={
        <nav
          className={`mynk-wb-strip bg-card border-r border-border${stripCollapsed ? " mynk-wb-strip--collapsed" : ""}`}
          aria-label={stripCollapsed ? "Drawing tools (collapsed)" : "Drawing tools"}
          data-testid={
            role === "student"
              ? (stripCollapsed ? "wb-student-tool-strip-collapsed" : "wb-student-tool-strip")
              : (stripCollapsed ? "wb-tool-strip-collapsed" : "wb-tool-strip")
          }
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mynk-wb-strip__tools">
            {renderToolStripButtons()}
            {showPropsChrome && !touchLayout && renderSidebarPropsCompact()}
          </div>
          <div className="mynk-wb-strip__spacer" />
          <div className="mynk-wb-strip__sep" aria-hidden />
          <WbToolBtn
            icon={
              <span
                className="mynk-wb-strip__collapse-icon"
                style={{ display: "inline-flex", transform: stripCollapsed ? "rotate(180deg)" : undefined }}
              >
                <WbIconCollapse size={14} />
              </span>
            }
            label={stripCollapsed ? "Expand tools" : "Collapse tools"}
            active={false}
            collapseControl
            onClick={() => setStripCollapsed((c) => !c)}
          />
        </nav>
      }
      canvas={
        <div
          ref={wbCanvasRef}
          className="mynk-wb-canvas"
          data-testid={role === "student" ? "student-whiteboard-canvas-mount" : "tutor-whiteboard-canvas-mount"}
          onClick={() => {
            setOpenMenu(null);
          }}
          onContextMenuCapture={(event) => {
            // Right-click during multi-point line/arrow drawing finalizes the
            // stroke (same as Esc). Applies to both tutor and student roles.
            const api = excalidrawAPIRef.current;
            if (!api) return;
            const st = api.getAppState() as { multiElement?: unknown };
            if (st.multiElement == null) return;
            event.preventDefault();
            event.stopPropagation();
            const target =
              (event.currentTarget as HTMLElement).querySelector(".excalidraw") ??
              event.currentTarget;
            target.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "Escape",
                code: "Escape",
                bubbles: true,
              })
            );
            console.debug(
              `[whiteboard] wbsid=${whiteboardSessionId} action=finalize-multipoint-line`
            );
          }}
        >
          {/* Banners overlay */}
          <div className="mynk-wb-banners">
            {role === "student" && showLoadingGuardBanner && (
              <div
                role="alert"
                className="mynk-wb-canvas-banner"
                data-testid="student-excalidraw-loading-guard"
              >
                <p style={{ margin: 0 }}>Board is taking too long to load.</p>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button type="button" className="btn" onClick={reloadFromGuard}>
                    Reload
                  </button>
                  <button type="button" className="btn" onClick={dismissStuckLoading}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            {role === "student" && showBoardWaitBanner && (
              <div
                role="status"
                className="mynk-wb-canvas-banner"
                data-testid="student-board-sync-wait-banner"
              >
                <p style={{ margin: 0 }}>
                  The board is still empty after several seconds. Try reload — or ask
                  your tutor to draw or switch a page.
                </p>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => window.location.reload()}
                  >
                    Reload
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setDismissedBoardWaitNotice(true)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            {role === "student" &&
              studentMaterialNotice !== "none" &&
              !dismissedStudentMaterialNotice && (
                <div
                  role="status"
                  className="mynk-wb-canvas-banner mynk-wb-canvas-banner--warn"
                  data-testid="student-material-safeguards-banner"
                >
                  <p style={{ margin: 0 }}>
                    {studentMaterialNotice === "load"
                      ? "We couldn't load a worksheet or image. Check your network or ask your tutor to re-insert the file."
                      : "A drawing on the board can't be shared with a file link. Ask your tutor to add the material using the insert buttons."}
                  </p>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setDismissedStudentMaterialNotice(true)}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            {audioDraftRecovery && (
              <Banner tone="warning" testId="wb-audio-draft-recovery-banner">
                <span>
                  {audioRecoveryBannerHeadline(
                    estimatedDurationSecFromDraft(audioDraftRecovery)
                  )}
                </span>
                <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={audioDraftRecoveryBusy}
                    data-testid="wb-audio-draft-keep"
                    onClick={() => void handleAudioDraftKeep()}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={audioDraftRecoveryBusy}
                    data-testid="wb-audio-draft-discard"
                    onClick={() => void handleAudioDraftDiscard()}
                  >
                    Discard
                  </button>
                </span>
              </Banner>
            )}
            {presence.bannerMessage && (
              <Banner tone="warning" testId="wb-recording-autopause-banner">
                {presence.bannerMessage}
              </Banner>
            )}
            {splitBrainActive && !presence.bannerMessage && (
              <Banner tone="warning" testId="wb-split-brain-banner">
                {recordingActive
                  ? "Student's video connection lost — recording paused until the call reconnects."
                  : "Student's video connection lost — waiting for WebRTC to reconnect."}
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
                    Couldn&apos;t load a shared image. Re-insert the worksheet
                    with PDF/image if the board looks wrong.
                  </>
                ) : (
                  <>
                    A pasted image has no file link. Re-inserting from PDF/image
                    is more reliable for shared viewing.
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
                Checkpoint save failed: {recorder.checkpointError}. Still recording in memory; retrying.
              </Banner>
            )}
            {role === "tutor" && recorder.resumePrompt && (
              <Banner tone="info">
                <strong>Browser recovery (IndexedDB):</strong> a whiteboard
                event draft from{" "}
                {new Date(recorder.resumePrompt.startedAt).toLocaleString()} (~
                {formatDuration(recorder.resumePrompt.durationMs)} of logged time).{" "}
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
          </div>

          {/* Excalidraw canvas — zenModeEnabled hides native chrome */}
          <ExcalidrawDynamic
            style={{ width: "100%", height: "100%" }}
            zenModeEnabled
            onChange={handleExcalidrawChange}
            excalidrawAPI={(api: unknown) => {
              const like = api as ExcalidrawApiLike;
              excalidrawAPIRef.current = like;
              setExcalidrawAPI(like);
              registerWbE2eSceneBridge(role, like);
            }}
            theme={excalidrawTheme}
            UIOptions={{
              canvasActions: { saveToActiveFile: false, loadScene: false },
            }}
            validateEmbeddable={validateExcalidrawEmbeddable}
            renderEmbeddable={renderGraphEmbeddable}
            onLinkOpen={handleExcalidrawLinkOpen}
            isCollaborating={Boolean(sync && syncUrl)}
            onPointerUpdate={handlePointerUpdate}
            initialData={{
              appState: {
                currentItemRoughness: 0,
                currentItemRoundness: "sharp",
                currentItemStrokeWidth: 0.5,
                currentItemStrokeColor: initialWbStrokeColor,
                gridModeEnabled: false,
              },
            }}
          />

          <WhiteboardDebugHud
            role={role}
            syncOn={role === "student" ? !independentView : Boolean(syncUrl)}
            activePageId={role === "student" ? studentActivePageId : activePageId}
            excalidrawAPI={excalidrawAPI}
            telemetry={followDebugTelemetry}
          />

          {role === "tutor" && (
          <div
            className="mynk-wb-ghost-label"
            data-testid="wb-ghost-viewport-label"
            aria-hidden
          >
            Student view
          </div>
          )}

          {/* SR-04 — AV cluster */}
          <WbAVCluster
            layoutMode={layoutMode}
            isMicMuted={liveAv.isMicMuted}
            isCamMuted={liveAv.isCamMuted}
            onToggleMic={liveAv.toggleMic}
            onToggleCam={() => void handleTopBarCam()}
            disabled={role === "student" ? !studentConnected : endingBusy}
            camDisabled={liveAv.hasCamPermission === "denied" || (liveAv.videoDevices?.length ?? 1) === 0}
            participants={liveAv.participants}
            localTile={{
              peerId: localPeerId,
              role,
              label: chromeLocalTileLabel,
              audioStream: liveAv.localAudioStream,
              videoStream: liveAv.localVideoStream,
              isMicMuted: liveAv.isMicMuted,
              isCamMuted: liveAv.isCamMuted,
            }}
            onReconnect={liveAv.reconnectPeer}
            testId={role === "student" ? "wb-student-av-row" : "wb-tutor-av-row"}
            resolveLabel={(participant) =>
              resolveParticipantLabel(participant, {
                studentName,
                totalRemotePeers: liveAv.participants.length,
              })
            }
          />

          {/* Touch props bottom sheet — moved to chrome root (TM-13) */}

          {role === "tutor" && debugOverlayVisible && (
            <div className="mynk-wb-debug-footer" aria-hidden>
              wbsid={whiteboardSessionId.slice(0, 8)} · events={recorder.eventCount} ·
              rec={formatDuration(recorder.durationMs)} · {recorder.checkpointStatus}
              {recorder.lastCheckpointAt
                ? ` (${new Date(recorder.lastCheckpointAt).toLocaleTimeString()})`
                : ""}
            </div>
          )}
        </div>
      }
      propsMobileBar={touchLayout && showPropsChrome ? (
        <div className="mynk-wb-props-mobile-bar">
          <button
            type="button"
            className="mynk-wb-props-mobile-btn"
            onClick={(e) => {
              e.stopPropagation();
              toggleMenu("props");
            }}
            aria-label="Stroke properties — tap to expand"
          >
            <span
              className="mynk-wb-summary-swatch"
              style={{
                backgroundColor: inkDisplayHex(strokeColor, excalidrawTheme),
              }}
            />
            <span className="mynk-wb-summary-stroke" aria-hidden>
              <StrokeWidthIcon
                lineH={
                  WB_STROKE_WIDTHS.find((w) => w.value === strokeWidth)?.lineH ?? 2
                }
              />
            </span>
            <span
              className="mynk-wb-summary-chip"
              title={roughnessLabel}
              aria-label={roughnessLabel}
              style={{ padding: "2px 4px", background: "transparent" }}
            >
              <RoughnessIcon level={roughness as 0 | 1 | 2} />
            </span>
            <span
              className="mynk-wb-summary-chip"
              title={roundnessLabel}
              aria-label={roundnessLabel}
              style={{ padding: "2px 4px", background: "transparent" }}
            >
              <SharpnessIcon type={roundness} />
            </span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
              Colors &amp; styles
            </span>
          </button>
        </div>
      ) : null}
      bottomToolbar={
      <nav
        className="mynk-wb-bottom-toolbar"
        aria-label="Drawing tools (mobile)"
        data-testid="wb-bottom-toolbar"
        onClick={(e) => e.stopPropagation()}
      >
        {renderToolStripButtons(true)}
      </nav>
      }
      boardTabStrip={
      <footer
        className="mynk-wb-pagestrip bg-card border-t border-border"
        aria-label="Boards"
      >
        <BoardTabStrip
          pageList={chromePageList}
          activePageId={role === "student" ? (studentActivePageIdRef.current ?? activePageId) : activePageId}
          disabled={endingBusy}
          readOnly={role === "student"}
          maxPages={20}
          onSelectPage={role === "student" ? undefined : (id) => void selectTutorPage(id)}
          onAddPage={role === "student" ? undefined : addTutorPage}
          onDeletePage={role === "student" ? undefined : removeTutorPage}
          testId={role === "student" ? "wb-student-page-strip" : undefined}
        />
      </footer>
      }
      actionSheets={touchLayout ? (
        <WbChromeErrorBoundary>
          <>
            <WbActionSheetBackdrop open={touchSheetOpen} onDismiss={dismissTouchSheets} />
            <WbActionSheet
              open={openMenu === "props"}
              onDismiss={dismissTouchSheets}
              ariaLabel="Stroke properties"
              testId="wb-props-sheet"
            >
              <WbStrokePropsPanel
                strokeColor={strokeColor}
                strokeWidth={strokeWidth}
                opacity={opacity}
                roughness={roughness}
                roundness={roundness}
                moreStylesOpen={moreStylesOpen}
                inkHex={excalidrawTheme === "dark" ? EXCALIDRAW_STROKE_DARK_HEX : EXCALIDRAW_STROKE_HEX}
                onStrokeChange={updateStrokeStyle}
                onMoreStylesToggle={() => setMoreStylesOpen((p) => !p)}
                onRoughnessChange={(r) => updateStrokeStyle({ roughness: r })}
                onRoundnessChange={updateRoundness}
              />
            </WbActionSheet>
            <WbActionSheet
              open={openMenu === "shapes"}
              onDismiss={dismissTouchSheets}
              ariaLabel="Shape tools"
              testId="wb-shapes-sheet"
            >
              {renderShapesSheetItems()}
            </WbActionSheet>
            <WbActionSheet
              open={openMenu === "more"}
              onDismiss={dismissTouchSheets}
              ariaLabel="More drawing options"
              testId="wb-more-sheet"
            >
              <div className="mynk-wb-action-sheet__menu-list">{renderOverflowMenuItems(true)}</div>
            </WbActionSheet>
          </>
        </WbChromeErrorBoundary>
      ) : null}
    />
    </WbRoleProvider>
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
    error: { bg: "var(--error-soft)", border: "var(--error-border)" },
    warning: { bg: "var(--warning-soft)", border: "var(--warning-border)" },
    info: { bg: "var(--info-soft)", border: "var(--info-border)" },
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
