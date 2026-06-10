/**
 * Regression tests for the Content-Security-Policy header.
 *
 * Background:
 *
 *   - A missing `media-src 'self' blob:` directive caused Chrome to silently
 *     block the audio preview in the AI assist panel with
 *     "MEDIA_ELEMENT_ERROR: Media Load rejected by URL safety check". The
 *     preview pulls in audio via URL.createObjectURL (a blob: URL), which
 *     falls back to default-src 'self' if media-src isn't explicitly set.
 *
 *   - A missing connect-src entry for the @vercel/blob/client upload host
 *     (B1 refactor) silently hung the audio upload with "Refused to connect
 *     because it violates the document's Content Security Policy".
 *
 *   - A missing connect-src entry for `wss://wb.mortensenapps.com` (the
 *     whiteboard live-collab relay) blocked the WebSocket so the student
 *     page sat on "Joining…" forever — the symptom that drove this file
 *     to be rewritten as a behavior test.
 *
 *   - A missing `font-src data:` entry blocked Excalidraw 0.18's bundled
 *     fonts (Cascadia/Virgil/Assistant — shipped as base64 data URIs in
 *     the package's CSS) with "Loading the font '<URL>' violates the
 *     following Content Security Policy directive: font-src 'self'".
 *     The canvas silently fell back to system fonts, so labels rendered
 *     in the wrong typeface. data: for fonts is safe (no network egress).
 *
 * If you change the CSP and break one of these, FIRST verify there's an
 * alternative directive that still permits the same thing. Don't just
 * delete the assertion — the CSP exists to prevent supply-chain attacks
 * but every directive blocks something legitimate too.
 */

import {
  buildContentSecurityPolicy,
  buildPermissionsPolicy,
  LIVE_AV_ROUTE_PATTERNS,
  whiteboardSyncOrigins,
} from "@/lib/security/csp";

function getDirective(csp: string, name: string): string | null {
  for (const part of csp.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name} `) || trimmed === name) {
      return trimmed.slice(name.length).trim();
    }
  }
  return null;
}

describe("buildContentSecurityPolicy — directive guards", () => {
  const csp = buildContentSecurityPolicy({});

  test("media-src includes blob: (audio preview regression guard)", () => {
    expect(getDirective(csp, "media-src")).toMatch(/\bblob:/);
  });

  test("media-src includes 'self' (in-app audio playback)", () => {
    expect(getDirective(csp, "media-src")).toMatch(/'self'/);
  });

  test("media-src allows the Vercel Blob CDN host (saved recording playback)", () => {
    expect(getDirective(csp, "media-src")).toMatch(
      /https:\/\/\*\.public\.blob\.vercel-storage\.com/
    );
  });

  test("img-src includes blob: and data:", () => {
    const directive = getDirective(csp, "img-src") ?? "";
    expect(directive).toMatch(/\bblob:/);
    expect(directive).toMatch(/\bdata:/);
  });

  test("img-src allows Vercel Blob public CDN (whiteboard images)", () => {
    expect(getDirective(csp, "img-src")).toMatch(
      /https:\/\/\*\.public\.blob\.vercel-storage\.com/
    );
  });

  test("img-src allows Vercel Blob private CDN (signed whiteboard image URLs)", () => {
    // Whiteboard images inserted via the tutor toolbar are stored as
    // private Blob assets and served from *.private.blob.vercel-storage.com.
    // Without this, Chrome blocks <img> on the workspace and student page
    // with "violates img-src … blob:".
    expect(getDirective(csp, "img-src")).toMatch(
      /https:\/\/\*\.private\.blob\.vercel-storage\.com/
    );
  });

  test("connect-src allows Vercel Blob private CDN (fetch() by replay + student page)", () => {
    // The whiteboard replay and student page fetch() private Blob URLs to load
    // image assets. Without this the fetch is blocked by connect-src and
    // [WhiteboardReplay] logs "Could not load asset … Failed to fetch".
    expect(getDirective(csp, "connect-src")).toMatch(
      /https:\/\/\*\.private\.blob\.vercel-storage\.com/
    );
  });

  test("font-src includes data: (Excalidraw 0.18 bundled-font regression guard)", () => {
    // Excalidraw 0.18 inlines its custom fonts as base64 data URIs.
    // Without `data:` here the canvas silently falls back to system
    // fonts; tutors see strokes in the wrong typeface and Chrome logs
    // "Loading the font '<URL>' violates the following CSP directive:
    // font-src 'self'".
    expect(getDirective(csp, "font-src")).toMatch(/\bdata:/);
  });

  test("font-src includes blob: (Excalidraw / canvas @font-face via object URL)", () => {
    // Some code paths use blob: URLs for font faces, not just data:.
    expect(getDirective(csp, "font-src")).toMatch(/\bblob:/);
  });

  test("font-src still includes 'self' (our own /_next/static fonts)", () => {
    expect(getDirective(csp, "font-src")).toMatch(/'self'/);
  });

  test("font-src includes https: (dependency CDN webfonts; dual CSP headers)", () => {
    expect(getDirective(csp, "font-src")).toMatch(/\bhttps:/);
  });

  test("frame-ancestors 'none' is preserved (clickjacking protection)", () => {
    expect(getDirective(csp, "frame-ancestors")).toBe("'none'");
  });

  test("frame-src allows Desmos calculator iframes (Insert Desmos smoke regression)", () => {
    // The whiteboard 'Insert Desmos' button uses Excalidraw's embeddable
    // element with https://www.desmos.com/calculator. When middleware emits
    // a CSP without frame-src, the browser falls back to default-src 'self'
    // (because both CSP headers are combined and the stricter wins), blocking
    // the iframe and rendering a frowny-face placeholder. This directive must
    // match next.config.ts frame-src — keep in sync.
    const frameSrc = getDirective(csp, "frame-src") ?? "";
    expect(frameSrc).toMatch(/https:\/\/www\.desmos\.com/);
    expect(frameSrc).toMatch(/https:\/\/desmos\.com/);
    expect(frameSrc).toMatch(/'self'/);
  });

  test("connect-src allows the Vercel Blob upload endpoint (B1 regression)", () => {
    expect(getDirective(csp, "connect-src")).toMatch(/\bhttps:\/\/vercel\.com\b/);
  });

  test("connect-src allows the Vercel Blob CDN host (saved recording fetch)", () => {
    expect(getDirective(csp, "connect-src")).toMatch(
      /https:\/\/\*\.public\.blob\.vercel-storage\.com/
    );
  });

  test("connect-src allows 'self' (our own /api routes)", () => {
    expect(getDirective(csp, "connect-src")).toMatch(/'self'/);
  });
});

describe("buildContentSecurityPolicy — whiteboard sync URL handling", () => {
  test("appends wss:// AND https:// origin for a wss whiteboard URL", () => {
    const csp = buildContentSecurityPolicy({
      whiteboardSyncUrl: "wss://wb.mortensenapps.com",
    });
    const connect = getDirective(csp, "connect-src") ?? "";
    expect(connect).toContain("wss://wb.mortensenapps.com");
    expect(connect).toContain("https://wb.mortensenapps.com");
  });

  test("appends ws:// AND http:// origin for a ws localhost URL", () => {
    const csp = buildContentSecurityPolicy({
      whiteboardSyncUrl: "ws://localhost:3002",
    });
    const connect = getDirective(csp, "connect-src") ?? "";
    expect(connect).toContain("ws://localhost:3002");
    expect(connect).toContain("http://localhost:3002");
  });

  test("does NOT add anything when whiteboard URL is missing", () => {
    const csp = buildContentSecurityPolicy({});
    expect(getDirective(csp, "connect-src")).not.toMatch(/wss?:|wb\./);
  });
});

describe("whiteboardSyncOrigins — input shapes", () => {
  test("returns wss + https for a wss URL", () => {
    expect(whiteboardSyncOrigins("wss://wb.mortensenapps.com")).toEqual([
      "wss://wb.mortensenapps.com",
      "https://wb.mortensenapps.com",
    ]);
  });

  test("returns ws + http for a ws URL with port", () => {
    expect(whiteboardSyncOrigins("ws://localhost:3002")).toEqual([
      "ws://localhost:3002",
      "http://localhost:3002",
    ]);
  });

  test("preserves non-default port in the host (avoids cross-port CSP miss)", () => {
    expect(whiteboardSyncOrigins("wss://relay.example.com:8443")).toEqual([
      "wss://relay.example.com:8443",
      "https://relay.example.com:8443",
    ]);
  });

  test("returns empty array for undefined / empty / non-string input", () => {
    expect(whiteboardSyncOrigins(undefined)).toEqual([]);
    expect(whiteboardSyncOrigins("")).toEqual([]);
    // @ts-expect-error — guarding against non-string at runtime
    expect(whiteboardSyncOrigins(42)).toEqual([]);
  });

  test("returns empty array for malformed URL", () => {
    expect(whiteboardSyncOrigins("not a url")).toEqual([]);
  });

  test("returns empty array for non-websocket scheme (https / http)", () => {
    // We deliberately reject https/http because the env validator only
    // accepts wss:// or ws://; if the env flips to https://, that's a
    // misconfiguration, not something CSP should silently paper over.
    expect(whiteboardSyncOrigins("https://wb.mortensenapps.com")).toEqual([]);
    expect(whiteboardSyncOrigins("http://localhost:3002")).toEqual([]);
  });
});

/**
 * Permissions-Policy regression tests.
 *
 * Background:
 *
 *   Phase 4c (Pillar 6) originally shipped a per-pathname
 *   Permissions-Policy: workspace + student-join routes got the
 *   widened `camera=(self), microphone=(self)`; everything else
 *   stayed `camera=(), microphone=(self)`. The intent was
 *   defense-in-depth.
 *
 *   **May 15 2026: widened to site-wide.** Pilot smoke proved the
 *   per-path design was fundamentally incompatible with the Next.js
 *   App Router server-action `redirect()` flow: `createWhiteboardSession`
 *   redirects to the workspace URL, but the redirect is a CLIENT-SIDE
 *   navigation that reuses the existing document. `Permissions-Policy`
 *   is a per-document header, so the workspace inherits whatever
 *   policy the source page (the student-detail page,
 *   `camera=()`) set. The browser then blocks `getUserMedia({video:true})`
 *   with "camera is not allowed in this document" until the user
 *   does a full hard refresh — which Sarah hit every single session.
 *
 *   See the `buildPermissionsPolicy` JSDoc in `csp.ts` for the full
 *   reasoning and the three options that were considered. The
 *   threat model now relies on (i) the browser's per-origin
 *   permission prompts and (ii) `frame-ancestors 'none'` +
 *   `frame-src` allowlist for third-party-embed protection — both
 *   stronger boundaries than per-route Permissions-Policy ever was.
 *
 *   Do NOT add a second `Permissions-Policy` header in `next.config.ts`
 *   (or Vercel project settings): the browser merges multiple policy
 *   headers and the strictest value of each feature wins, which would
 *   silently re-introduce the camera-blocked bug. The middleware
 *   emitter (`buildPermissionsPolicy`) is the single source of truth.
 */
describe("buildPermissionsPolicy — site-wide camera + microphone widening", () => {
  function parsePolicy(value: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const part of value.split(",")) {
      const trimmed = part.trim();
      if (trimmed === "") continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return out;
  }

  // The widened policy must apply to EVERY pathname, regardless of
  // route shape, because Next.js server-action redirects perform a
  // client-side navigation and the workspace can be entered from any
  // page that links to it. Pinning the symmetry here so a future
  // "let's tighten back up" refactor immediately fails CI with a clear
  // message rather than re-introducing the camera-blocked bug.
  describe("EVERY route gets camera=(self) microphone=(self)", () => {
    test.each([
      // live-A/V routes (always needed)
      "/admin/students/abc123/whiteboard/sess-456/workspace",
      "/admin/students/abc123/whiteboard/sess-456/workspace/",
      "/admin/students/abc123/whiteboard/sess-456/workspace/some-nested",
      "/w/abcd-1234",
      "/w/abcd-1234/",
      "/w/abcd-1234/nested-path",
      // pages that redirect to the workspace via Next.js server-action
      // soft nav — these MUST share the wide policy or the workspace
      // inherits the wrong one on the destination document. (May 15
      // regression class.)
      "/admin/students/abc123",
      "/admin/students/abc123/whiteboard/sess-456",
      // landing + auth + admin siblings — kept wide too so any future
      // entry point that uses `<Link>` or `router.push` to /workspace
      // doesn't silently re-introduce the bug.
      "/",
      "/login",
      "/setup",
      "/forgot-password",
      "/admin/students/abc123/whiteboard",
      "/admin/students/abc123/whiteboard/sess-456/review",
      "/api/whiteboard/sess-456/join-timer",
      "/api/audio/upload",
      // lookalike paths — these get the wide policy too. Harmless: the
      // browser permission prompt still gates the actual getUserMedia
      // call, so a route that has no AV UI cannot silently use the
      // camera even with the wide policy.
      "/admin/students/abc123/workspace",
      "/admin/workspace/w/something",
      "/w",
    ])("widens camera=(self) microphone=(self) on %s", (pathname) => {
      const parsed = parsePolicy(buildPermissionsPolicy(pathname));
      expect(parsed.camera).toBe("(self)");
      expect(parsed.microphone).toBe("(self)");
      expect(parsed.geolocation).toBe("()");
    });
  });

  test("zero-arg call returns the same wide policy", () => {
    // pathname is now optional / ignored — callers that don't have a
    // pathname handy (e.g. error response paths in middleware) must
    // still get the correct widened policy.
    const parsed = parsePolicy(buildPermissionsPolicy());
    expect(parsed.camera).toBe("(self)");
    expect(parsed.microphone).toBe("(self)");
    expect(parsed.geolocation).toBe("()");
  });

  test("returned header is a comma-separated list with no trailing comma", () => {
    // Defensive: Permissions-Policy syntax is comma-separated and a
    // trailing comma is invalid per the structured-headers RFC. Browsers
    // mostly tolerate it, but our regression test pins the exact shape so
    // a future serializer change doesn't drift.
    const sample = buildPermissionsPolicy("/");
    expect(sample).not.toMatch(/,\s*$/);
    expect(sample.split(",").length).toBeGreaterThanOrEqual(3);
  });
});

describe("LIVE_AV_ROUTE_PATTERNS — anchor invariants", () => {
  test("every pattern is anchored at both ends", () => {
    for (const re of LIVE_AV_ROUTE_PATTERNS) {
      const src = re.source;
      expect(src.startsWith("^")).toBe(true);
      expect(src.endsWith("$")).toBe(true);
    }
  });

  test("workspace pattern does NOT match a /workspace path without /admin/students prefix", () => {
    const ok = LIVE_AV_ROUTE_PATTERNS.some((re) =>
      re.test("/foo/bar/workspace")
    );
    expect(ok).toBe(false);
  });

  test("student-join pattern requires a non-empty token segment", () => {
    const ok = LIVE_AV_ROUTE_PATTERNS.some((re) => re.test("/w/"));
    // "/w/" matches `^/w/[^/]+...` only if the token is non-empty.
    expect(ok).toBe(false);
  });

  test("workspace pattern matches the canonical shape exactly", () => {
    const ok = LIVE_AV_ROUTE_PATTERNS.some((re) =>
      re.test("/admin/students/s_123/whiteboard/wb_456/workspace")
    );
    expect(ok).toBe(true);
  });
});
