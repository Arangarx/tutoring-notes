import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { rateLimit } from "@/lib/rate-limit";
import { apiRateBucketForPath } from "@/lib/security/api-rate-buckets";
import {
  buildContentSecurityPolicy,
  buildPermissionsPolicy,
} from "@/lib/security/csp";
import {
  getAdminSessionMode,
  isTutorExperiencePath,
  realAdminHomePath,
  tutorExperienceLandingPath,
} from "@/lib/admin-routing";

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
const AUTH_RATE_LIMIT = { max: 10, windowMs: 60_000 };       // 10 req/min (login / password-reset)
// 2FA verify/setup gets its own bucket so a legit smoke session (mistype +
// code rotation + reload) doesn't exhaust the shared login budget.
// 20/min is still strong brute-force protection: 10^6 codes ÷ 20/min = 34+ days.
const TOTP_RATE_LIMIT = { max: 20, windowMs: 60_000 };       // 20 req/min (2FA verify + setup)
const SETUP_RATE_LIMIT = { max: 5, windowMs: 60_000 };       // 5 req/min (initial onboarding setup)

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
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  // All rate-limited paths are API endpoints — return JSON so callers handle
  // the 429 inline. The round-1 standalone HTML page for page GETs is gone:
  // page GETs are no longer rate-limited (they're not the brute-force vector).
  return addSecurityHeaders(
    NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
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
  //
  // Scope: credential-submit POST endpoints ONLY — not page GETs, not CSRF
  // fetches, not session reads.  Rationale: the brute-force vector is the
  // submit, not the page load.  Blocking GET /login or GET /api/auth/csrf
  // prevents the login page from rendering the form at all, forcing a
  // standalone error card (smoke failure, 2304f9e round-1).  The CSRF token
  // endpoint (/api/auth/csrf) being blocked makes NextAuth's signIn() fail
  // unexpectedly and redirect to its default /api/auth/error "Error" card
  // instead of returning an error object the form can display inline.
  if (
    pathname === "/api/auth/callback/credentials" ||
    pathname === "/api/auth/account-holder/login"
  ) {
    const rl = rateLimit(`auth:${ip}`, AUTH_RATE_LIMIT.max, AUTH_RATE_LIMIT.windowMs);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, pathname);
  } else if (
    pathname.startsWith("/admin/settings/2fa/verify") ||
    pathname.startsWith("/admin/settings/2fa/setup") ||
    pathname.startsWith("/admin/settings/2fa")
  ) {
    const rl = rateLimit(`2fa:${ip}`, TOTP_RATE_LIMIT.max, TOTP_RATE_LIMIT.windowMs);
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

    const mode = getAdminSessionMode({
      sub: token.sub,
      isImpersonating: token.isImpersonating as boolean | undefined,
      isTestAccount: token.isTestAccount as boolean | undefined,
      role: token.role as string | undefined,
    });

    // ---------------------------------------------------------------------------
    // B1 approval gate
    //
    // WAITLISTED tutors can only see /admin/pending-approval (+ login / signout).
    // Exemptions: isTestAccount, impersonating sessions, env-only admin, pending-approval page itself.
    // approvalStatus is absent for the env-only admin (sub="admin") and legacy sessions —
    // treat absent as APPROVED (safe default: those were approved before this feature shipped).
    // ---------------------------------------------------------------------------
    const isApprovalExemptPath =
      pathname === "/admin/pending-approval" ||
      pathname.startsWith("/admin/pending-approval/") ||
      pathname.startsWith("/api/auth/");

    if (!isApprovalExemptPath) {
      const approvalStatus = token.approvalStatus as string | undefined;
      const isTestAccount = (token.isTestAccount as boolean | undefined) ?? false;
      const isImpersonating = (token.isImpersonating as boolean | undefined) ?? false;
      const isEnvAdmin = token.sub === "admin";

      if (!isTestAccount && !isImpersonating && !isEnvAdmin && approvalStatus === "WAITLISTED") {
        console.log(
          `[tap] sub=${token.sub ?? "?"} action=middleware_redirect_pending pathname=${pathname}`
        );
        const pendingUrl = req.nextUrl.clone();
        pendingUrl.pathname = "/admin/pending-approval";
        pendingUrl.search = "";
        return addSecurityHeaders(NextResponse.redirect(pendingUrl), pathname);
      }
    }

    // ---------------------------------------------------------------------------
    // 2FA gate (Identity Phase 1)
    //
    // Non-test TUTOR/ADMIN must complete 2FA before accessing /admin/*.
    // Exemptions:
    //   - isTestAccount=true accounts (impersonation targets) — always exempt
    //   - Impersonating sessions (the real admin already passed 2FA as themselves)
    //   - The 2FA setup and verify routes themselves (must be reachable unenrolled)
    //   - env-only admin (sub="admin", no DB row — no 2FA support in V1)
    // ---------------------------------------------------------------------------
    const is2faExemptPath =
      pathname.startsWith("/admin/settings/2fa/setup") ||
      pathname.startsWith("/admin/settings/2fa/verify");

    if (!is2faExemptPath) {
      const isTestAccount = token.isTestAccount as boolean | undefined;
      const isImpersonating = token.isImpersonating as boolean | undefined;
      const isEnvAdmin = token.sub === "admin";
      const twoFactorVerified = token.twoFactorVerified as boolean | undefined;

      // Real non-test, non-impersonating, non-env-admin accounts must pass 2FA.
      if (!isTestAccount && !isImpersonating && !isEnvAdmin) {
        if (!twoFactorVerified) {
          // We can't query the DB in middleware (edge-compatible), so we check twoFactorVerified
          // from the JWT. If it's false/absent, redirect to the appropriate 2FA route.
          // The 2FA setup page itself checks enrollment status and redirects to verify if enrolled.
          const setupUrl = req.nextUrl.clone();
          setupUrl.pathname = "/admin/settings/2fa/setup";
          setupUrl.search = "";
          return addSecurityHeaders(NextResponse.redirect(setupUrl), pathname);
        }
      }
    }

    // ADMIN (not impersonating) is blocked from tutor-only paths → redirect to dashboard.
    if (mode === "real-admin-home" && isTutorExperiencePath(pathname)) {
      console.log(
        `[imp] route=${realAdminHomePath()} mode=real-admin-home blocked=${pathname} role=${token.role ?? "unknown"}`
      );
      const home = req.nextUrl.clone();
      home.pathname = realAdminHomePath();
      home.search = "";
      return addSecurityHeaders(NextResponse.redirect(home), pathname);
    }

    // TUTOR sessions (real login, e.g. Sarah) landing on /admin dashboard → send to workspace.
    // Page-level redirect in page.tsx already handles this for SSR, but middleware catches it
    // early (avoids a double-render and gives Sarah a clean redirect on direct URL entry).
    if (
      mode === "tutor-experience" &&
      pathname === realAdminHomePath() &&
      !token.isImpersonating
    ) {
      // Only redirect TUTOR role — impersonating sessions get the same treatment via page.tsx
      // (the dashboard is already blocked from non-admin sessions at the panel level).
      if (token.role === "TUTOR") {
        console.log(
          `[imp] route=${tutorExperienceLandingPath()} mode=tutor-experience role=TUTOR redirected-from=${pathname}`
        );
        const students = req.nextUrl.clone();
        students.pathname = tutorExperienceLandingPath();
        students.search = "";
        return addSecurityHeaders(NextResponse.redirect(students), pathname);
      }
    }
  }

  // --- AccountHolder route protection (cookie-presence only — UX redirect) ---
  // Full DB validation happens in the route handler. This is a fast redirect
  // to avoid loading a full server component just to 401 an unauthenticated user.
  // SECURITY NOTE: the handler-level check is the authoritative gate.
  if (pathname.startsWith("/account/") && !isPublicAccountPath(pathname)) {
    const ahCookie = req.cookies.get("mynk_ah_session");
    if (!ahCookie) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/account/login";
      loginUrl.searchParams.set("returnTo", pathname);
      return addSecurityHeaders(NextResponse.redirect(loginUrl), pathname);
    }
  }

  // --- Learner (child) route protection (cookie-presence only) ---
  if (pathname.startsWith("/join/") && !isPublicLearnerPath(pathname)) {
    const learnerCookie = req.cookies.get("mynk_learner_session");
    if (!learnerCookie) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/students/login";
      loginUrl.searchParams.set("returnTo", pathname);
      return addSecurityHeaders(NextResponse.redirect(loginUrl), pathname);
    }
  }

  // --- Notes share page protection (NOTES_AUTH_WALL flag — cookie-presence only) ---
  //
  // When NOTES_AUTH_WALL=true and neither an AccountHolder nor a learner session
  // cookie is present, redirect to parent login. This is a UX fast-path; the
  // authoritative gate is assertCanAccessShareLink in each route handler.
  //
  // When NOTES_AUTH_WALL=false (default, grace window): no redirect — anonymous
  // /s/* access preserved exactly as today.
  const _notesAuthWallVal = process.env.NOTES_AUTH_WALL;
  if (pathname.startsWith("/s/") && (_notesAuthWallVal === "true" || _notesAuthWallVal === "1")) {
    const ahCookie = req.cookies.get("mynk_ah_session");
    const learnerCookie = req.cookies.get("mynk_learner_session");
    if (!ahCookie && !learnerCookie) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/account/login";
      loginUrl.searchParams.set("returnTo", pathname);
      loginUrl.searchParams.set("source", "notes_email");
      return addSecurityHeaders(NextResponse.redirect(loginUrl), pathname);
    }
  }

  // --- All other routes: pass through with security headers ---
  return addSecurityHeaders(NextResponse.next(), pathname);
}

// Paths that are publicly accessible under /account/* without a session cookie.
function isPublicAccountPath(pathname: string): boolean {
  const publicPaths = [
    "/account/login",
    "/account/signup",
    "/account/forgot-password",
    "/account/reset-password",
  ];
  // /claim/* and /verify-email are at the root, not under /account/
  return publicPaths.some((p) => pathname === p || pathname.startsWith(p + "?"));
}

// Paths that are publicly accessible under /join/* without a learner cookie.
function isPublicLearnerPath(pathname: string): boolean {
  return pathname === "/students/login" || pathname.startsWith("/students/login?");
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
