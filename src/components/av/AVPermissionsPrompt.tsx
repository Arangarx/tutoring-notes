"use client";

/**
 * Permissions prompt — Phase 4c (Pillar 6).
 *
 * Reads `hasMicPermission` / `hasCamPermission` + `error` /
 * `videoError` + `localAudioStream` / `localVideoStream` from
 * `useLiveAV()` and surfaces two INDEPENDENT request affordances:
 * one for the mic, one for the cam. The independence is required —
 * Phase 4d's graceful-degradation paths need the mic-granted +
 * cam-denied state to be representable, which a single "Allow Both"
 * button can't express.
 *
 * Visibility:
 *   - The prompt shows iff EITHER mic or cam is "not granted yet".
 *     For each row:
 *       - `prompt` / `unknown` (and never attempted) → "Allow ..."
 *         button.
 *       - in-flight → "Requesting…" disabled button.
 *       - `granted` → tick + "Microphone allowed" line. (We keep
 *         the line visible while the OTHER row is still pending so
 *         the user can see what's been granted.)
 *       - `denied` → error copy + "Try again" button (the 4b
 *         deferral). 4d will polish this copy.
 *   - When BOTH rows reach a terminal state of `granted`, the prompt
 *     auto-hides.
 *   - When one is denied, the prompt stays visible with the "Try
 *     again" affordance until the user grants OR dismisses (dismiss
 *     is 4d polish — for now the row just stays).
 *
 * Copy is intentionally short and friendly in 4c. The polished
 * mic-denied + cam-denied placeholder copy lands in Phase 4d per
 * the master plan partitioning.
 */

import { useCallback, useState } from "react";

import type {
  AvAcquireError,
  AvPermissionState,
} from "@/hooks/useLiveAV";

export type AVPermissionsPromptProps = {
  hasMicPermission: AvPermissionState;
  hasCamPermission: AvPermissionState;
  /** Set when `localAudioStream` is non-null on the hook. */
  hasMicStream: boolean;
  /** Set when `localVideoStream` is non-null on the hook. */
  hasCamStream: boolean;
  error: AvAcquireError | null;
  videoError: AvAcquireError | null;
  requestMic: () => Promise<void>;
  requestCam: () => Promise<void>;
  /**
   * Optional copy override for the heading. Defaults to a
   * tutoring-flavored line. Components above can pass a more
   * specific message ("Set up your tutor session...") when mounted
   * inside the workspace.
   */
  heading?: string;
  testId?: string;
};

type RowStatus = "request" | "requesting" | "granted" | "denied";

function micRowStatus(
  has: AvPermissionState,
  hasStream: boolean,
  hasError: boolean,
  inFlight: boolean
): RowStatus {
  if (hasStream) return "granted";
  if (inFlight) return "requesting";
  if (has === "denied" || hasError) return "denied";
  return "request";
}

export function AVPermissionsPrompt({
  hasMicPermission,
  hasCamPermission,
  hasMicStream,
  hasCamStream,
  error,
  videoError,
  requestMic,
  requestCam,
  heading,
  testId,
}: AVPermissionsPromptProps) {
  // Track per-button "in flight" locally so each row's spinner is
  // independent (`useLiveAV.isAcquiring` is a single combined flag).
  const [micRequesting, setMicRequesting] = useState(false);
  const [camRequesting, setCamRequesting] = useState(false);

  const handleMic = useCallback(async () => {
    if (micRequesting) return;
    setMicRequesting(true);
    try {
      await requestMic();
    } finally {
      setMicRequesting(false);
    }
  }, [micRequesting, requestMic]);

  const handleCam = useCallback(async () => {
    if (camRequesting) return;
    setCamRequesting(true);
    try {
      await requestCam();
    } finally {
      setCamRequesting(false);
    }
  }, [camRequesting, requestCam]);

  const micStatus = micRowStatus(
    hasMicPermission,
    hasMicStream,
    !!error,
    micRequesting
  );
  const camStatus = micRowStatus(
    hasCamPermission,
    hasCamStream,
    !!videoError,
    camRequesting
  );

  // Hide the prompt when both rows are terminally granted.
  if (micStatus === "granted" && camStatus === "granted") {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-labelledby="av-permissions-prompt-heading"
      data-testid={testId ?? "av-permissions-prompt"}
      className="card"
      style={{
        padding: "12px 14px",
        background: "rgba(37, 99, 235, 0.06)",
        border: "1px solid rgba(37, 99, 235, 0.22)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 720,
      }}
    >
      <h2
        id="av-permissions-prompt-heading"
        style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 700,
        }}
      >
        {heading ??
          "Allow your microphone and camera so you can talk and see each other during the lesson."}
      </h2>
      <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
        You can allow them one at a time. If you change your mind later, use
        your browser&apos;s site settings (the icon next to the address bar).
      </p>
      <PermissionRow
        kind="microphone"
        status={micStatus}
        error={error}
        onAllow={handleMic}
        testIdSuffix="mic"
      />
      <PermissionRow
        kind="camera"
        status={camStatus}
        error={videoError}
        onAllow={handleCam}
        testIdSuffix="cam"
      />
    </div>
  );
}

/**
 * Phase 4d polish — friendly, short denied-state copy decoupled
 * from the raw classifier `error.message`. The classifier's
 * verbose "Microphone access denied. Click the icon next to the
 * address bar, set Microphone to Allow, then retry." is too dense
 * for a busy tutor mid-session; this surface gets a tight
 * 1-line phrase + an explicit Retry button so the user can act
 * without having to read instructions.
 *
 * The "camera icon" reference is intentional — every major
 * browser surfaces a SINGLE site-permissions icon in the address
 * bar (Chrome's camera-with-slash, Safari's video badge, Firefox's
 * camera) regardless of which permission was denied, so calling
 * it "the camera icon" is correct enough for the typical user
 * who has not memorised the per-browser glyph nuance.
 */
function deniedCopyFor(kind: "microphone" | "camera"): string {
  if (kind === "microphone") {
    return "Microphone blocked — click the camera icon in your browser address bar to allow.";
  }
  return "Camera blocked — click the camera icon in your browser address bar to allow.";
}

function PermissionRow({
  kind,
  status,
  error,
  onAllow,
  testIdSuffix,
}: {
  kind: "microphone" | "camera";
  status: RowStatus;
  error: AvAcquireError | null;
  onAllow: () => void;
  testIdSuffix: "mic" | "cam";
}) {
  // Non-permission errors (no-device / device-in-use / etc.) keep
  // the classifier's verbose message — they're rarer and the
  // verbose copy actually helps in those cases. The polish
  // exclusively targets the permission-denied path which is the
  // overwhelming majority of real "Try again" surfaces.
  const friendlyDenied =
    !error || error.type === "permission-denied"
      ? deniedCopyFor(kind)
      : error.message;
  const labelByStatus: Record<RowStatus, string> = {
    request: `Allow ${kind}`,
    requesting: "Requesting…",
    granted: `${kind === "microphone" ? "Microphone" : "Camera"} allowed`,
    denied: friendlyDenied,
  };
  return (
    <div
      data-testid={`av-permissions-row-${testIdSuffix}`}
      data-status={status}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      {status === "granted" ? (
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 18,
            height: 18,
            lineHeight: "18px",
            textAlign: "center",
            borderRadius: 9,
            background: "rgba(34,197,94,0.18)",
            color: "#16a34a",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          ✓
        </span>
      ) : null}
      <span
        style={{
          fontSize: 13,
          flex: 1,
          minWidth: 200,
          color: status === "denied" ? "#a16207" : undefined,
        }}
      >
        {labelByStatus[status]}
      </span>
      {status === "request" && (
        <button
          type="button"
          className="btn primary"
          onClick={onAllow}
          data-testid={`av-permissions-allow-${testIdSuffix}`}
        >
          Allow {kind}
        </button>
      )}
      {status === "requesting" && (
        <button
          type="button"
          className="btn"
          disabled
          data-testid={`av-permissions-requesting-${testIdSuffix}`}
        >
          Requesting…
        </button>
      )}
      {status === "denied" && (
        <button
          type="button"
          className="btn"
          onClick={onAllow}
          data-testid={`av-permissions-retry-${testIdSuffix}`}
        >
          Try again
        </button>
      )}
    </div>
  );
}
