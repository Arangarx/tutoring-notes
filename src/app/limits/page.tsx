import type { Metadata } from "next";

import { KnownIssuesRoadmapView } from "@/components/admin/KnownIssuesRoadmapView";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import {
  PRODUCT_TODAY_PAGE_TITLE,
  PRODUCT_TODAY_PATH,
} from "@/lib/known-issues-roadmap-content";
import { productionCanonicalMetadata } from "@/lib/seo/canonical-host";

export const metadata: Metadata = {
  title: `${PRODUCT_TODAY_PAGE_TITLE} — Mynk`,
  description:
    "What Mynk does in the pilot: English-only notes and transcription, account approval, privacy settings before the first session, and where live video works best.",
  ...productionCanonicalMetadata(PRODUCT_TODAY_PATH),
};

export default function ProductTodayPage() {
  return (
    <>
      <MarketingHeader />
      <main id="main-content" className="mx-auto max-w-3xl px-6 pb-16 pt-[72px]">
        <p className="label-mono mb-4 block text-accent-text">Pilot</p>
        <h1 className="heading text-balance mb-8 mt-0 text-[clamp(1.8rem,4vw,2.8rem)]">
          {PRODUCT_TODAY_PAGE_TITLE}
        </h1>
        <KnownIssuesRoadmapView />
      </main>
    </>
  );
}
