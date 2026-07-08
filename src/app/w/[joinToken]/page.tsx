import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { JoinTokenRedirect } from "./JoinTokenRedirect";

/**
 * /w/[joinToken] — legacy student entry point, now a client redirect bridge.
 *
 * Old links (from "Copy student link" before full-retirement) land here.
 * The server validates the token (revoked/expired/missing → 404 as before),
 * then renders a tiny client component that preserves the #k= fragment and
 * calls window.location.replace("/join/<sessionId>#k=...").
 *
 * The authenticated /join/[sessionId] page is the canonical entry point;
 * this page exists only so old in-flight links continue to work.
 *
 * Note: we no longer check endedAt here — the /join page handles that gracefully.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Whiteboard session",
    robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  };
}

type RouteParams = { joinToken: string };

export default async function StudentWhiteboardPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { joinToken } = await params;

  const tokenRow = await db.whiteboardJoinToken.findUnique({
    where: { token: joinToken },
    select: {
      whiteboardSessionId: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  if (!tokenRow) notFound();
  const now = new Date();
  if (tokenRow.revokedAt) notFound();
  if (tokenRow.expiresAt.getTime() <= now.getTime()) notFound();

  return <JoinTokenRedirect sessionId={tokenRow.whiteboardSessionId} />;
}
