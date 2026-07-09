/**
 * Lightweight tunables for the notes reduce pipeline.
 * Recording re-arch Phase 1 — Slice 3 (notes worker).
 *
 * Kept in a separate file with NO heavy dependencies so that
 * anything importing this constant (e.g. server actions called
 * from WhiteboardWorkspaceClient) does NOT transitively pull in
 * the OpenAI SDK or other server-only modules, which would break
 * the workspace DOM tests (jsdom TextEncoder constraint).
 */

/** Prompt version for auto-generated structured notes. Increment when the reduce prompt changes. */
export const REDUCE_PROMPT_VERSION = "2026-07-09-v3-dedup-assessment";
