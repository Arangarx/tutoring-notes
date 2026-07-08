import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { KnownIssuesRoadmapView } from "@/components/admin/KnownIssuesRoadmapView";
import { SettingsSubNav } from "@/components/admin/SettingsSubNav";
import { KNOWN_ISSUES_ROADMAP_PAGE_TITLE } from "@/lib/known-issues-roadmap-content";

export const dynamic = "force-dynamic";

export default async function KnownIssuesRoadmapPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return (
      <AdminPageShell title={KNOWN_ISSUES_ROADMAP_PAGE_TITLE}>
        <p className="text-sm text-muted-foreground">
          Sign in to view known issues and the roadmap.{" "}
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            Login
          </Link>
        </p>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell
      title={KNOWN_ISSUES_ROADMAP_PAGE_TITLE}
      description="Recent improvements, honest known issues, and what's coming next."
      eyebrow={
        <Link
          href="/admin/settings"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground md:hidden"
        >
          ← Settings
        </Link>
      }
      sidebar={<SettingsSubNav />}
      sidebarWidth="narrow"
    >
      <KnownIssuesRoadmapView />
    </AdminPageShell>
  );
}
