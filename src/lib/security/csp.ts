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
 * `Permissions-Policy` builder.
 *
 * **May 15 2026 (Andrew, evening pilot smoke): widened to site-wide.**
 *
 * Previously this function returned a per-pathname policy: workspace +
 * student-join routes got `camera=(self), microphone=(self)`, every
 * other route got the tighter `camera=(), microphone=(self)`. The
 * intent was defense-in-depth — a compromised non-AV admin page
 * should not be able to silently call `getUserMedia`.
 *
 * The pilot symptom that killed this design: the tutor clicks
 * "Start whiteboard session" on the student detail page. The server
 * action calls `redirect(workspaceUrl)`. Next.js App Router server-
 * action redirects perform a **client-side navigation** — the
 * existing document is reused and only the RSC tree is swapped.
 * `Permissions-Policy` is a per-DOCUMENT header set on the original
 * HTTP response, so the workspace inherits the student-detail
 * page's tight `camera=()` policy. The browser then blocks
 * `getUserMedia({ video: true })` with "camera is not allowed in
 * this document" no matter what middleware emits for the workspace
 * URL — middleware only runs on document loads (and on RSC
 * payload requests, but those don't change the document policy).
 *
 * Three fixes were on the table:
 *
 *   A. Force a hard navigation to the workspace (replace the
 *      server-action redirect with a client-side
 *      `window.location.assign`). Brittle — any future entry point
 *      to /workspace that uses `<Link>` or `router.push` would
 *      silently re-introduce the bug.
 *
 *   B. Detect the mismatch in the workspace and auto-reload. Works
 *      but adds complexity, can race, and relies on the patchy
 *      browser support for `document.permissionsPolicy.allowsFeature`.
 *
 *   C. Widen site-wide. Loses the documented defense-in-depth, but
 *      the actual threat model already broke before camera mattered:
 *      an XSS on an admin page can read the tutor's session cookie
 *      and exfiltrate every student note, recording URL, and
 *      transcript. The marginal capability "also access the camera"
 *      is icing on a disaster, and Permissions-Policy was never
 *      preventing the bigger problem.
 *
 * Picked (C). Every camera-using SaaS we benchmarked (Meet, Zoom,
 * Slack web client) ships a site-wide widened Permissions-Policy
 * for the same reason. The two genuine security boundaries that
 * remain are (i) browser permission prompts (the user still has to
 * grant camera/mic per-origin), and (ii) `frame-ancestors 'none'` +
 * CSP `frame-src` allowlist, which prevent any third party from
 * embedding our pages and inheriting access.
 *
 * `geolocation=()` stays empty everywhere; nothing in the app uses
 * geolocation and there's no symmetric pilot pain story.
 *
 * The `pathname` parameter is kept for backward compatibility with
 * existing callers (and for a future re-tightening if we ever ship
 * untrusted user content on a non-AV path). It is currently
 * ignored. The exported `LIVE_AV_ROUTE_PATTERNS` is also kept —
 * other code (analytics, testing harnesses) may consult it as the
 * canonical set of "this path renders camera/mic UI".
 *
 * @param pathname  Kept for backwards compatibility; currently unused.
 * @returns A complete `Permissions-Policy` header value.
 */
export function buildPermissionsPolicy(_pathname?: string): string {
  void _pathname;
  return "camera=(self), microphone=(self), geolocation=()";
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
    // Private Blob URLs are fetched by the replay + student page to load
    // whiteboard images/PDFs. Without this, fetch() is blocked by connect-src.
    "https://*.private.blob.vercel-storage.com",
    ...whiteboardSyncOrigins(opts.whiteboardSyncUrl),
  ].join(" ");

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    // Desmos embeddable iframes are sandboxed without allow-same-origin
    // (null origin) — the parent CSP governs their asset loads; Chrome
    // needs the explicit origin, not just https:, for font/img/style.
    "style-src 'self' 'unsafe-inline' https://www.desmos.com",
    // *.private.blob.vercel-storage.com — Vercel Blob private-access URLs
    // used for whiteboard images/PDFs inserted via the tutor toolbar and
    // displayed on the student page. The private CDN hostname differs from
    // the public one; without this Chrome blocks <img> loaded from signed
    // private Blob URLs with "violates img-src 'self' data: blob:".
    "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.private.blob.vercel-storage.com https://www.desmos.com",
    "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
    "font-src 'self' data: blob: https: https://www.desmos.com",
    `connect-src ${connectSrc}`,
    // Desmos calculator iframes — the whiteboard "Insert Desmos" button
    // embeds https://www.desmos.com/calculator as an Excalidraw embeddable.
    // Must match next.config.ts `frame-src`. When both CSP headers are
    // emitted (middleware + next.config.ts headers()), the browser enforces
    // the INTERSECTION; without this directive the middleware's default-src
    // 'self' fallback blocks Desmos iframes with a "frowny face" placeholder.
    "frame-src 'self' https://www.desmos.com https://desmos.com",
    "frame-ancestors 'none'",
  ].join("; ");
}
