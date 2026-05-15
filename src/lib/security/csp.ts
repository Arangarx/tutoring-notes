/**
 * Content-Security-Policy builder for the Tutoring Notes app.
 *
 * Centralized so both `src/middleware.ts` (the runtime emitter) and the
 * regression tests (`src/__tests__/regressions/csp-headers.test.ts`)
 * compute the exact same string. Any directive change MUST update tests
 * — see file-level comment in csp-headers.test.ts for rationale.
 *
 * The whiteboard live-collab relay origin is sourced from
 * `WHITEBOARD_SYNC_URL` (validated in `src/lib/env.ts`) so dev /
 * preview / production each emit the right CSP without code edits.
 */

/**
 * Convert a configured `WHITEBOARD_SYNC_URL` (e.g. `wss://wb.mortensenapps.com`)
 * into the CSP `connect-src` origins the browser needs.
 *
 * Returns BOTH the websocket scheme AND the http(s) scheme of the same
 * host because socket.io performs an HTTP polling fallback in addition
 * to the WebSocket upgrade — the CSP must allow both or the polling
 * transport is silently blocked.
 *
 * Returns an empty array if the URL is missing or doesn't use a
 * websocket scheme (matches the env validator's accepted set).
 */
export function whiteboardSyncOrigins(rawUrl: string | undefined): string[] {
  if (!rawUrl || typeof rawUrl !== "string") return [];
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return [];
  }
  if (parsed.protocol !== "wss:" && parsed.protocol !== "ws:") return [];
  const wsScheme = parsed.protocol === "wss:" ? "wss" : "ws";
  const httpScheme = parsed.protocol === "wss:" ? "https" : "http";
  return [
    `${wsScheme}://${parsed.host}`,
    `${httpScheme}://${parsed.host}`,
  ];
}

export type CspOptions = {
  /** Value of process.env.WHITEBOARD_SYNC_URL (or equivalent). */
  whiteboardSyncUrl?: string;
};

/**
 * Build the full Content-Security-Policy header value.
 *
 * Directive notes (kept here, not at the call site, so reviewers see
 * intent + history when changing a single line):
 *
 *   - `script-src 'unsafe-inline' 'unsafe-eval'` — required by Next.js
 *     hydration + the Excalidraw runtime. Tightening this would break
 *     SSR hydration silently.
 *
 *   - `media-src blob: + Vercel Blob CDN` — the AI assist panel
 *     previews newly recorded audio via URL.createObjectURL (blob:),
 *     and saved recordings replay from the Vercel Blob CDN. Without
 *     either, Chrome blocks <audio> with "Media Load rejected by URL
 *     safety check".
 *
 *   - `connect-src https://vercel.com` — `@vercel/blob/client.upload()`
 *     PUTs audio bytes from the browser straight to vercel.com (B1
 *     refactor). Removing this silently hangs the upload.
 *
 *   - `connect-src wss://<relay> + https://<relay>` — derived from
 *     WHITEBOARD_SYNC_URL. socket.io tries websocket then falls back
 *     to https long-polling, so both schemes must be allowed.
 *
 *   - `font-src 'self' data: blob: https:` — Excalidraw 0.18 bundles custom
 *     fonts (Cascadia, Virgil, Assistant, etc.) as base64 `data:` URIs
 *     in its CSS, and some paths / runtime paths register `@font-face`
 *     with `blob:` URLs (e.g. after fetch + object URL). Without `data:`
 *     and `blob:` the browser blocks them — Chrome still logs
 *     "font-src 'self' data:" when the request is a third category
 *     (e.g. blob:) — and the canvas falls back to system fonts.
 *     `https:` matches `img-src` / other deps that load webfont files from
 *     CDNs (e.g. MathJax / bundled tooling) — required when two CSP headers
 *     combine with the stricter policy from `next.config.ts`.
 *
 *   - `frame-ancestors 'none'` — clickjacking protection. Don't relax.
 */
/**
 * Per-request `Permissions-Policy` builder. Defense-in-depth: only
 * routes that actually need camera/microphone get the widened policy.
 *
 * Phase 4c (Pillar 6, live A/V): the tutor workspace route and the
 * student-join route need `camera=(self)` + `microphone=(self)` so
 * `navigator.mediaDevices.getUserMedia(...)` is allowed in the
 * browser. Every other route keeps the tighter
 * `camera=(), microphone=(self)` policy that shipped pre-4c
 * (microphone=self was already needed for the tutor mic recorder).
 *
 * We deliberately do NOT widen `geolocation`; nothing in the app
 * uses it, so it stays empty everywhere.
 *
 * Why route-scoped (vs. site-wide):
 *
 *   - The site has many admin + landing routes that should never be
 *     able to silently call `getUserMedia`. A compromised dev page
 *     under `/admin/students/[id]` (e.g. the student detail view)
 *     should not inherit camera permission just because the workspace
 *     two URL segments deeper needs it.
 *
 *   - Permissions-Policy is enforced by the browser per-document, so
 *     a tab navigated to `/admin/students/X` reading the tight policy
 *     cannot later "leak" widened permission to a workspace tab even
 *     if both share the origin.
 *
 * The matchers are deliberately strict (regex anchored on the exact
 * shape) so adding a sibling route doesn't accidentally inherit the
 * widened policy. If a new route truly needs live A/V, add it
 * explicitly here and document the expansion in the feature's
 * STATUS doc per the AGENTS.md CSP-discipline convention.
 *
 * @param pathname  The request URL pathname (no querystring, no hash).
 * @returns A complete `Permissions-Policy` header value.
 */
export function buildPermissionsPolicy(pathname: string): string {
  if (LIVE_AV_ROUTE_PATTERNS.some((re) => re.test(pathname))) {
    return "camera=(self), microphone=(self), geolocation=()";
  }
  return "camera=(), microphone=(self), geolocation=()";
}

/**
 * Pathname patterns that need access to `camera` and `microphone`
 * for live A/V (`getUserMedia`). Anchored with `^` and `$` so a
 * trailing or leading typo doesn't silently widen the policy on
 * unrelated routes.
 *
 *   - Tutor workspace:
 *     `/admin/students/<id>/whiteboard/<wbsid>/workspace[/...]`
 *
 *   - Student join (encrypted whiteboard + A/V link Sarah shares):
 *     `/w/<joinToken>[/...]`
 *
 * Exported for testability — `src/__tests__/regressions/csp-headers.test.ts`
 * asserts both the widened-and-tight match sets so a future regex
 * tightening can't silently lock out a route that needs A/V.
 */
export const LIVE_AV_ROUTE_PATTERNS: ReadonlyArray<RegExp> = [
  /^\/admin\/students\/[^/]+\/whiteboard\/[^/]+\/workspace(?:\/.*)?$/,
  /^\/w\/[^/]+(?:\/.*)?$/,
];

export function buildContentSecurityPolicy(opts: CspOptions = {}): string {
  const connectSrc = [
    "'self'",
    "https://vercel.com",
    "https://*.public.blob.vercel-storage.com",
    ...whiteboardSyncOrigins(opts.whiteboardSyncUrl),
  ].join(" ");

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
    "font-src 'self' data: blob: https:",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
  ].join("; ");
}
