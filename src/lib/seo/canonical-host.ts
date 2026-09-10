/**
 * Production SEO host — the URL Google should index.
 *
 * Search Console (2026-09-04) treated https://usemynk.com/ as
 * "Duplicate without user-selected canonical" and selected
 * https://tutoring-notes.vercel.app/ instead. This module is the
 * single source for: (1) <link rel="canonical"> on public pages,
 * (2) production 308s off Vercel default / www / http aliases,
 * (3) X-Robots-Tag: noindex on *.vercel.app (including previews).
 *
 * Preview (VERCEL_ENV=preview) and local dev must NOT 308 — those
 * hosts are how we smoke and how OAuth callbacks land on a branch.
 */

export const PRODUCTION_CANONICAL_HOST = "usemynk.com";
export const PRODUCTION_CANONICAL_ORIGIN = "https://usemynk.com";

/** Public marketing paths submitted in sitemap.xml. Keep /admin /s /account out. */
export const PUBLIC_SITEMAP_PATHS = [
  "/",
  "/features",
  "/privacy",
  "/terms",
  "/login",
  "/signup",
  "/feedback",
] as const;

export type CanonicalRedirectInput = {
  host: string;
  pathname: string;
  search: string;
  proto: string;
  vercelEnv: string | undefined;
};

export function normalizeRequestHost(host: string): string {
  const first = host.split(",")[0]?.trim() ?? "";
  return first.replace(/\.$/, "").toLowerCase().replace(/:\d+$/, "");
}

export function isVercelAppHost(host: string): boolean {
  const normalized = normalizeRequestHost(host);
  return normalized === "vercel.app" || normalized.endsWith(".vercel.app");
}

export function shouldNoindexHost(host: string): boolean {
  return isVercelAppHost(host);
}

export function canonicalUrlForPath(pathname: string): string {
  const withSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (withSlash === "/") return `${PRODUCTION_CANONICAL_ORIGIN}/`;
  return `${PRODUCTION_CANONICAL_ORIGIN}${withSlash.replace(/\/$/, "")}`;
}

export function productionCanonicalMetadata(pathname: string): {
  alternates: { canonical: string };
} {
  return { alternates: { canonical: canonicalUrlForPath(pathname) } };
}

/**
 * Absolute 308 target for a production alias, or null if this request
 * should be served as-is.
 */
export function productionCanonicalRedirect(
  input: CanonicalRedirectInput
): string | null {
  if (input.vercelEnv !== "production") return null;

  const host = normalizeRequestHost(input.host);
  if (!host) return null;

  const proto = (input.proto.split(",")[0]?.trim() ?? "https").toLowerCase();
  const pathname = input.pathname || "/";
  const search = input.search && input.search !== "?" ? input.search : "";
  const target = `${PRODUCTION_CANONICAL_ORIGIN}${pathname}${search}`;

  const hostIsCanonical = host === PRODUCTION_CANONICAL_HOST;
  const hostNeedsMove =
    host === `www.${PRODUCTION_CANONICAL_HOST}` || isVercelAppHost(host);
  const needsHttps = proto === "http" && (hostIsCanonical || hostNeedsMove);

  if (hostIsCanonical && proto === "https") return null;
  if (hostNeedsMove || needsHttps) return target;
  return null;
}
