/**
 * Production host canonicalization — Search Console
 * "Duplicate without user-selected canonical".
 *
 * Spec (independent of implementation):
 *   Google indexed https://tutoring-notes.vercel.app/ as the homepage
 *   and treated https://usemynk.com/ as the duplicate (2026-09-04).
 *   Production aliases must 308 to https://usemynk.com (same path/query).
 *   Preview / local hosts must never redirect (smoke + OAuth on *.vercel.app).
 */

import {
  PRODUCTION_CANONICAL_HOST,
  PRODUCTION_CANONICAL_ORIGIN,
  PUBLIC_SITEMAP_PATHS,
  canonicalUrlForPath,
  productionCanonicalMetadata,
  productionCanonicalRedirect,
  shouldNoindexHost,
} from "./canonical-host";

describe("canonical URL builder", () => {
  it("uses the branded apex origin Google should index", () => {
    expect(PRODUCTION_CANONICAL_HOST).toBe("usemynk.com");
    expect(PRODUCTION_CANONICAL_ORIGIN).toBe("https://usemynk.com");
    expect(canonicalUrlForPath("/")).toBe("https://usemynk.com/");
  });

  it("strips a trailing slash on non-root paths", () => {
    expect(canonicalUrlForPath("/privacy/")).toBe("https://usemynk.com/privacy");
    expect(canonicalUrlForPath("features")).toBe("https://usemynk.com/features");
  });

  it("exposes metadata.alternates.canonical for public pages", () => {
    expect(productionCanonicalMetadata("/privacy")).toEqual({
      alternates: { canonical: "https://usemynk.com/privacy" },
    });
  });

  it("lists only public marketing paths in the sitemap (no /admin /s /account)", () => {
    expect(PUBLIC_SITEMAP_PATHS).toContain("/");
    expect(PUBLIC_SITEMAP_PATHS).toContain("/privacy");
    expect(PUBLIC_SITEMAP_PATHS).toContain("/terms");
    expect(PUBLIC_SITEMAP_PATHS).toContain("/features");
    for (const path of PUBLIC_SITEMAP_PATHS) {
      expect(path).not.toMatch(/^\/(admin|s|account|w|join|api)\b/);
    }
  });
});

describe("productionCanonicalRedirect — production aliases", () => {
  const prod = {
    pathname: "/",
    search: "",
    proto: "https",
    vercelEnv: "production" as const,
  };

  it("308s the default Vercel host Google selected as canonical", () => {
    expect(
      productionCanonicalRedirect({
        ...prod,
        host: "tutoring-notes.vercel.app",
      })
    ).toBe("https://usemynk.com/");
  });

  it("preserves path and query on the default Vercel host", () => {
    expect(
      productionCanonicalRedirect({
        host: "tutoring-notes.vercel.app",
        pathname: "/privacy",
        search: "?utm=gsc",
        proto: "https",
        vercelEnv: "production",
      })
    ).toBe("https://usemynk.com/privacy?utm=gsc");
  });

  it("308s www to apex", () => {
    expect(
      productionCanonicalRedirect({
        ...prod,
        host: "www.usemynk.com",
      })
    ).toBe("https://usemynk.com/");
  });

  it("308s http://usemynk.com to https (Search Console referring page)", () => {
    expect(
      productionCanonicalRedirect({
        host: "usemynk.com",
        pathname: "/",
        search: "",
        proto: "http",
        vercelEnv: "production",
      })
    ).toBe("https://usemynk.com/");
  });

  it("308s a production per-deployment *.vercel.app host", () => {
    expect(
      productionCanonicalRedirect({
        ...prod,
        host: "tutoring-notes-abc123-arangarx-5209s-projects.vercel.app",
      })
    ).toBe("https://usemynk.com/");
  });

  it("reads the first x-forwarded-host and ignores a port suffix", () => {
    expect(
      productionCanonicalRedirect({
        ...prod,
        host: "tutoring-notes.vercel.app:443, usemynk.com",
      })
    ).toBe("https://usemynk.com/");
  });
});

describe("productionCanonicalRedirect — must not redirect", () => {
  it("leaves https://usemynk.com/ alone", () => {
    expect(
      productionCanonicalRedirect({
        host: "usemynk.com",
        pathname: "/",
        search: "",
        proto: "https",
        vercelEnv: "production",
      })
    ).toBeNull();
  });

  it("does not redirect preview deployments (smoke / OAuth stay on the alias)", () => {
    expect(
      productionCanonicalRedirect({
        host: "tutoring-notes.vercel.app",
        pathname: "/",
        search: "",
        proto: "https",
        vercelEnv: "preview",
      })
    ).toBeNull();
    expect(
      productionCanonicalRedirect({
        host: "tutoring-notes-git-feat-seo-canonical-host-abc-arangarx-5209s-projects.vercel.app",
        pathname: "/",
        search: "",
        proto: "https",
        vercelEnv: "preview",
      })
    ).toBeNull();
  });

  it("does not redirect local dev", () => {
    expect(
      productionCanonicalRedirect({
        host: "localhost:3100",
        pathname: "/",
        search: "",
        proto: "http",
        vercelEnv: undefined,
      })
    ).toBeNull();
  });
});

describe("public page metadata + sitemap/robots", () => {
  it("privacy/terms/features/signup declare the branded canonical", async () => {
    const privacy = await import("@/app/privacy/page");
    const terms = await import("@/app/terms/page");
    const features = await import("@/app/features/page");
    const signup = await import("@/app/signup/page");
    const login = await import("@/app/login/page");
    const feedback = await import("@/app/feedback/layout");

    expect(privacy.metadata.alternates?.canonical).toBe(
      "https://usemynk.com/privacy"
    );
    expect(terms.metadata.alternates?.canonical).toBe(
      "https://usemynk.com/terms"
    );
    expect(features.metadata.alternates?.canonical).toBe(
      "https://usemynk.com/features"
    );
    expect(signup.metadata.alternates?.canonical).toBe(
      "https://usemynk.com/signup"
    );
    expect(login.metadata.alternates?.canonical).toBe(
      "https://usemynk.com/login"
    );
    expect(feedback.metadata.alternates?.canonical).toBe(
      "https://usemynk.com/feedback"
    );
  });

  it("homepage generateMetadata canonicalizes /?view=home to /", async () => {
    const home = await import("@/app/page");
    expect(home.generateMetadata()).toEqual({
      alternates: { canonical: "https://usemynk.com/" },
    });
  });

  it("sitemap lists only branded usemynk.com URLs", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const entries = sitemap();
    expect(entries.map((e) => e.url)).toEqual(
      PUBLIC_SITEMAP_PATHS.map((path) => canonicalUrlForPath(path))
    );
  });

  it("robots.txt points Google at the branded sitemap and host", async () => {
    const { default: robots } = await import("@/app/robots");
    const doc = robots();
    expect(doc.sitemap).toBe("https://usemynk.com/sitemap.xml");
    expect(doc.host).toBe("https://usemynk.com");
    expect(doc.rules).toEqual(
      expect.objectContaining({
        disallow: expect.arrayContaining([
          "/admin/",
          "/account/",
          "/s/",
          "/w/",
          "/join/",
        ]),
      })
    );
  });
});

describe("shouldNoindexHost", () => {
  it("noindexes every vercel.app host so Google stops preferring the default domain", () => {
    expect(shouldNoindexHost("tutoring-notes.vercel.app")).toBe(true);
    expect(
      shouldNoindexHost(
        "tutoring-notes-git-feat-x-arangarx-5209s-projects.vercel.app"
      )
    ).toBe(true);
  });

  it("does not noindex the branded hosts or localhost", () => {
    expect(shouldNoindexHost("usemynk.com")).toBe(false);
    expect(shouldNoindexHost("www.usemynk.com")).toBe(false);
    expect(shouldNoindexHost("localhost:3100")).toBe(false);
  });
});
