import type { MetadataRoute } from "next";

import {
  PUBLIC_SITEMAP_PATHS,
  canonicalUrlForPath,
} from "@/lib/seo/canonical-host";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_SITEMAP_PATHS.map((path) => ({
    url: canonicalUrlForPath(path),
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
