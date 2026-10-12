import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { canAccessStudentRow, getStudentScope } from "@/lib/student-scope";
import { getRequestBaseUrl } from "@/lib/public-url";
import { StudentAccountSharing } from "@/components/admin/StudentAccountSharing";
import { regenerateShareLink, revokeShareLink } from "../actions";
import type { ConnectedParent } from "../ConnectedParentSection";

export const dynamic = "force-dynamic";

export default async function StudentAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  const scopedAdminUserId: string | null = scope.kind === "admin" ? scope.adminId : null;

  const student = await db.student.findUnique({
    where: { id },
    include: {
      shareLinks: { where: { revokedAt: null }, orderBy: { createdAt: "desc" } },
      learnerProfile: {
        select: {
          displayName: true,
          accountHolder: {
            select: {
              email: true,
              displayName: true,
              emailVerifiedAt: true,
            },
          },
        },
      },
      claimInvites: {
        where: {
          ...(scopedAdminUserId !== null ? { adminUserId: scopedAdminUserId } : {}),
          claimedAt: { not: null },
        },
        orderBy: { claimedAt: "desc" },
        take: 1,
        select: { claimedAt: true },
      },
    },
  });

  if (!student) notFound();
  if (!canAccessStudentRow(scope, student)) notFound();

  const holder = student.learnerProfile?.accountHolder ?? null;
  const connected = holder
    ? {
        learnerName: student.learnerProfile?.displayName ?? student.name,
        parent: {
          email: holder.email,
          displayName: holder.displayName,
          emailVerifiedAt: holder.emailVerifiedAt,
          claimedAt: student.claimInvites[0]?.claimedAt ?? null,
        } satisfies ConnectedParent,
      }
    : null;

  const activeShare = student.shareLinks[0] ?? null;
  const shareDisplayBaseUrl = activeShare ? await getRequestBaseUrl() : null;
  const shareUrl = activeShare
    ? `${shareDisplayBaseUrl ?? "http://localhost:3000"}/s/${activeShare.token}`
    : null;

  return (
    <StudentAccountSharing
      studentId={student.id}
      studentName={student.name}
      needsInviteEmail={!student.parentEmail}
      connected={connected}
      shareUrl={shareUrl}
      shareAction={regenerateShareLink.bind(null, student.id)}
      revokeAction={revokeShareLink.bind(null, student.id)}
    />
  );
}
