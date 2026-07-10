# Phase: Live A/V device management (camera + mic picker + hotswap)

> **Archive (2026-05-19):** ✅ **SHIPPED to master** merge `ac92137` 2026-05-17.

Handoff for the `live-av-device-management` branch — camera enumeration,
`setVideoDevice` / `setMicDevice`, `peer-mesh.replaceLocalTrackOnAllPeers`,
and `mic-recorder-audio.swapLocalMicSource`.

## Summary

- **Camera**: `VideoControls` (tutor workspace + student join page), device list
  from `useLiveAV` (`enumerateDevices` + `devicechange`), persisted
  `tn-cam-device-id` in localStorage, `setVideoDevice` uses `replaceTrack` on
  peers.
- **Mic (tutor)**: `lockDevice` only during segment upload; mid-recording
  picker calls `useLiveAV.setMicDevice` → `useAudioRecorder.swapMicDevice` → Web
  Audio source swap → `replaceTrack` on outbound audio.
- **Logging**: `avx=` session id; sub-events include `set-video-device`,
  `set-mic-device`, `replace-track` (peer-mesh), `swap-local-source`
  (mic-recorder-audio).

## Smoke checklist

Use the branch **Vercel Preview URL** (not production). Full matrix lives in the
executor bootstrapper (`live-av-device-management-bootstrapper`): camera picker,
plug/unplug, mic hotswap mid-recording, segment-upload lock, Phase 4d
regressions, PDF quick smoke, `npx jest` / `tsc` / `eslint`.

## Known limitations

- **Mic swap glitch**: Brief (&lt;50ms) audio artifact on Web Audio source swap is
  expected (documented in `docs/LIVE-AV.md` invariant 12).
- **Safari / iOS**: `devicechange` and stored `deviceId` constraints vary; if a
  stored id is stale, acquisition fails — user re-picks from the dropdown or
  clears site data.
- **Graph-less recorder**: Mid-session `swapMicDevice` requires a real
  `MicAudioGraph` (normal Chrome/Edge/Firefox desktop path).

## Follow-ups

- None required for pilot Monday if smoke passes; consider TURN only if field
  reports NAT failures unrelated to device swap.
