import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth-options";
import {
  getAccountHolderSessionFromHeaders,
  getLearnerSessionFromHeaders,
} from "@/lib/server-session";
import { productionCanonicalMetadata } from "@/lib/seo/canonical-host";
import { LandingPageContent } from "./LandingPageContent";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return productionCanonicalMetadata("/");
}

type HomePageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const { view } = await searchParams;
  const showMarketingHome = view === "home";

  if (!showMarketingHome) {
    const operatorSession = await getServerSession(authOptions);
    if (operatorSession?.user) {
      redirect("/admin");
    }

    const learnerSession = await getLearnerSessionFromHeaders();
    if (learnerSession) {
      redirect("/join");
    }

    const accountHolderSession = await getAccountHolderSessionFromHeaders();
    if (accountHolderSession) {
      redirect("/account/dashboard");
    }
  }

  return <LandingPageContent />;
}
