import type { MetadataRoute } from "next";

import { PRODUCTION_CANONICAL_ORIGIN } from "@/lib/seo/canonical-host";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/account/", "/api/", "/s/", "/w/", "/join/", "/claim/"],
    },
    sitemap: `${PRODUCTION_CANONICAL_ORIGIN}/sitemap.xml`,
    host: PRODUCTION_CANONICAL_ORIGIN,
  };
}
