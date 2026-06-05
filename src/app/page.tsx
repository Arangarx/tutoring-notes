import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth-options";
import { getAccountHolderSessionFromHeaders } from "@/lib/server-session";
import { LandingPageContent } from "./LandingPageContent";

export const dynamic = "force-dynamic";

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

    const accountHolderSession = await getAccountHolderSessionFromHeaders();
    if (accountHolderSession) {
      redirect("/account/dashboard");
    }
  }

  return <LandingPageContent />;
}
