import { ClaimInviteSection } from "@/app/admin/students/[id]/ClaimInviteSection";
import {
  ConnectedParentSection,
  type ConnectedParent,
} from "@/app/admin/students/[id]/ConnectedParentSection";
import {
  CreateShareLinkForm,
  RegenerateShareLinkForm,
  RevokeShareLinkForm,
} from "@/app/admin/students/[id]/ShareLinkControls";
import { ShareLinkRow } from "@/app/admin/students/[id]/ShareLinkRow";
import { SectionCard } from "@/components/SectionCard";

const SHARE_DESCRIPTION =
  "The family signs in to open this link. You can revoke or regenerate it anytime.";

/**
 * Account & sharing for one personal student. Connected family, or the claim
 * invite, plus the share link. Not a second student page.
 */
export function StudentAccountSharing({
  studentId,
  studentName,
  needsInviteEmail,
  connected,
  shareUrl,
  shareAction,
  revokeAction,
}: {
  studentId: string;
  studentName: string;
  needsInviteEmail: boolean;
  connected: { learnerName: string; parent: ConnectedParent } | null;
  shareUrl: string | null;
  shareAction: () => void;
  revokeAction: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <SectionCard
        realm="admin"
        title="Account"
        description={
          connected
            ? "A family account is connected to this student."
            : "Send an invite so the family can sign in."
        }
      >
        {connected ? (
          <ConnectedParentSection
            studentId={studentId}
            learnerName={connected.learnerName}
            connectedParent={connected.parent}
          />
        ) : (
          <ClaimInviteSection
            studentId={studentId}
            studentName={studentName}
            alreadyClaimed={false}
            needsInviteEmail={needsInviteEmail}
            prominent
          />
        )}
      </SectionCard>
      <SectionCard realm="admin" title="Share link" description={SHARE_DESCRIPTION}>
        {shareUrl ? (
          <>
            <ShareLinkRow url={shareUrl} />
            <div className="mt-4 flex flex-wrap gap-2">
              <RegenerateShareLinkForm action={shareAction} />
              <RevokeShareLinkForm action={revokeAction} />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">No active share link yet.</p>
            <CreateShareLinkForm action={shareAction} />
          </div>
        )}
      </SectionCard>
    </div>
  );
}
