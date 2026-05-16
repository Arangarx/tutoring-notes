import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { rateLimit } from "@/lib/rate-limit";
import { apiRateBucketForPath } from "@/lib/security/api-rate-buckets";
import {
  buildContentSecurityPolicy,
  buildPermissionsPolicy,
} from "@/lib/security/csp";

// ---------------------------------------------------------------------------
// Security headers — applied to every response
// ---------------------------------------------------------------------------
//
// CSP is built once at module load from WHITEBOARD_SYNC_URL so dev / preview
// / production each emit the right `connect-src` for the live whiteboard
// relay without code edits. See `src/lib/security/csp.ts` for per-directive
// rationale (script-src/media-src/connect-src history lives there).
//
// `Permissions-Policy` is widened **site-wide** to
// `camera=(self), microphone=(self), geolocation=()`. We previously
// emitted a per-pathname policy (tight on non-AV routes, wide on
// workspace + student-join), but Next.js App Router server-action
// redirects perform a CLIENT-SIDE navigation that reuses the existing
// document — and Permissions-Policy is per-document, so the workspace
// would inherit whichever policy the source page (e.g. student-detail
// page, `camera=()`) had set, blocking `getUserMedia({video:true})`
// until the user did a hard refresh. See `buildPermissionsPolicy`
// JSDoc in `src/lib/security/csp.ts` for the full reasoning. The
// regression is pinned in `src/__tests__/regressions/csp-headers.test.ts`.
const CONTENT_SECURITY_POLICY = buildContentSecurityPolicy({
  whiteboardSyncUrl: process.env.WHITEBOARD_SYNC_URL,
});

const staticSecurityHeaders: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-DNS-Prefetch-Control": "on",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
};

function addSecurityHeaders(
  response: NextResponse,
  pathname: string
): NextResponse {
  for (const [key, value] of Object.entries(staticSecurityHeaders)) {
    response.headers.set(key, value);
  }
  response.headers.set(
    "Permissions-Policy",
    buildPermissionsPolicy(pathname)
  );
  return response;
}

// ---------------------------------------------------------------------------
// Rate-limit configurations per route group
// ---------------------------------------------------------------------------
const AUTH_RATE_LIMIT = { max: 10, windowMs: 60_000 };  // 10 req/min
const SETUP_RATE_LIMIT = { max: 5, windowMs: 60_000 };  // 5 req/min

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function rateLimitResponse(
  retryAfterMs: number,
  pathname: string
): NextResponse {
  return addSecurityHeaders(
    NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      }
    ),
    pathname
  );
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = getClientIp(req);

  // --- Rate limiting on sensitive endpoints ---
  if (
    pathname.startsWith("/api/auth/") ||
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password"
  ) {
    const rl = rateLimit(`auth:${ip}`, AUTH_RATE_LIMIT.max, AUTH_RATE_LIMIT.windowMs);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, pathname);
  } else if (pathname.startsWith("/api/")) {
    const bucket = apiRateBucketForPath(pathname);
    const rl = rateLimit(`${bucket.prefix}:${ip}`, bucket.max, bucket.windowMs);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, pathname);
  } else if (pathname === "/setup") {
    const rl = rateLimit(`setup:${ip}`, SETUP_RATE_LIMIT.max, SETUP_RATE_LIMIT.windowMs);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, pathname);
  }

  // --- Admin route protection ---
  if (pathname.startsWith("/admin")) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("callbackUrl", pathname);
      return addSecurityHeaders(NextResponse.redirect(loginUrl), pathname);
    }
  }

  // --- All other routes: pass through with security headers ---
  return addSecurityHeaders(NextResponse.next(), pathname);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt).*)",
  ],
};
