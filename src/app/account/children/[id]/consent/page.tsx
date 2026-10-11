import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/PageShell";
import { SectionCard } from "@/components/SectionCard";
import { db } from "@/lib/db";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";
import { requireAccountHolderSession } from "@/lib/server-session";

import { SubNav } from "@/components/SubNav";
import {
  ParentConsentEditor,
  type ConsentRestrictionState,
  type OrgConsentState,
  type TutorConsentState,
} from "./ParentConsentEditor";
import { SelfLearnerConsentSettings } from "@/components/consent/SelfLearnerConsentSettings";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  void id;
  return {
    title: "Privacy preferences",
    robots: { index: false, follow: false },
  };
}

export default async function LearnerConsentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: learnerId } = await params;

  const session = await requireAccountHolderSession(
    `/account/children/${learnerId}/consent`
  );

  const accountHolder = await db.accountHolder.findUnique({
    where: { id: session.accountHolderId },
    select: { email: true },
  });

  await assertOwnsLearnerProfile(session.accountHolderId, learnerId);

  const learnerProfile = await db.learnerProfile.findUnique({
    where: { id: learnerId },
    select: {
      displayName: true,
      isSelfLearner: true,
      consentRestriction: {
        select: {
          restrictAudioRecording: true,
          restrictWhiteboardRecording: true,
          restrictNoteSending: true,
        },
      },
      students: {
        select: {
          adminUserId: true,
          organizationId: true,
          adminUser: {
            select: {
              displayName: true,
              email: true,
            },
          },
          organization: { select: { name: true } },
        },
      },
    },
  });

  if (!learnerProfile) notFound();

  const tutorMap = new Map<
    string,
    { adminUserId: string; tutorLabel: string }
  >();
  for (const student of learnerProfile.students) {
    if (!student.adminUserId || !student.adminUser) continue;
    if (!tutorMap.has(student.adminUserId)) {
      const label =
        student.adminUser.displayName?.trim() ||
        student.adminUser.email ||
        "Tutor";
      tutorMap.set(student.adminUserId, {
        adminUserId: student.adminUserId,
        tutorLabel: label,
      });
    }
  }

  const orgMap = new Map<string, { organizationId: string; organizationName: string }>();
  for (const student of learnerProfile.students) {
    if (!student.organizationId || !student.organization) continue;
    if (!orgMap.has(student.organizationId)) {
      orgMap.set(student.organizationId, {
        organizationId: student.organizationId,
        organizationName: student.organization.name,
      });
    }
  }

  const tutorIds = [...tutorMap.keys()];
  const orgIds = [...orgMap.keys()];
  const latestRecords = await Promise.all([
    ...tutorIds.map((adminUserId) =>
      db.consentRecord.findFirst({
        where: { learnerProfileId: learnerId, adminUserId },
        orderBy: { version: "desc" },
        select: {
          adminUserId: true,
          organizationId: true,
          version: true,
          allowLiveSession: true,
          allowAudioRecording: true,
          allowWhiteboardRecording: true,
          allowNoteSending: true,
        },
      })
    ),
    ...orgIds.map((organizationId) =>
      db.consentRecord.findFirst({
        where: { learnerProfileId: learnerId, organizationId },
        orderBy: { version: "desc" },
        select: {
          adminUserId: true,
          organizationId: true,
          version: true,
          allowLiveSession: true,
          allowAudioRecording: true,
          allowWhiteboardRecording: true,
          allowNoteSending: true,
        },
      })
    ),
  ]);

  const tutors: TutorConsentState[] = tutorIds.map((adminUserId) => {
    const meta = tutorMap.get(adminUserId)!;
    const record = latestRecords.find((r) => r?.adminUserId === adminUserId);
    return {
      adminUserId,
      tutorLabel: meta.tutorLabel,
      version: record?.version ?? null,
      allowLiveSession: record?.allowLiveSession ?? false,
      allowAudioRecording: record?.allowAudioRecording ?? false,
      allowWhiteboardRecording: record?.allowWhiteboardRecording ?? false,
      allowNoteSending: record?.allowNoteSending ?? false,
    };
  });

  const organizations: OrgConsentState[] = orgIds.map((organizationId) => {
    const meta = orgMap.get(organizationId)!;
    const record = latestRecords.find((r) => r?.organizationId === organizationId);
    return {
      organizationId,
      organizationName: meta.organizationName,
      version: record?.version ?? null,
      allowLiveSession: record?.allowLiveSession ?? false,
      allowAudioRecording: record?.allowAudioRecording ?? false,
      allowWhiteboardRecording: record?.allowWhiteboardRecording ?? false,
      allowNoteSending: record?.allowNoteSending ?? false,
    };
  });

  const restrictions: ConsentRestrictionState = {
    restrictAudioRecording:
      learnerProfile.consentRestriction?.restrictAudioRecording ?? false,
    restrictWhiteboardRecording:
      learnerProfile.consentRestriction?.restrictWhiteboardRecording ?? false,
    restrictNoteSending:
      learnerProfile.consentRestriction?.restrictNoteSending ?? false,
  };

  const learnerName = learnerProfile.displayName;

  return (
    <PageShell realm="account"
      title={`${learnerName} — Privacy`}
      description="Choose what each tutor may do, and optional limits that always apply to your child."
      userEmail={accountHolder?.email}
      eyebrow={
        <div className="space-y-2">
          <Link
            href="/account/dashboard"
            className="inline-flex min-h-11 items-center text-brand underline-offset-2 hover:underline"
          >
            {"\u2190"} Dashboard
          </Link>
          <p className="label-mono m-0 text-accent-text">Privacy & consent</p>
        </div>
      }
    >
      <SubNav realm="account-child" learnerId={learnerId} />

      {learnerProfile.isSelfLearner ? (
        <SelfLearnerConsentSettings
          learnerProfileId={learnerId}
          tutors={tutors}
          organizations={organizations}
          showAgreement={
            !tutors.some((tutor) => tutor.version != null) &&
            !organizations.some((org) => org.version != null)
          }
        />
      ) : (
        <SectionCard realm="account"
          title="Privacy preferences"
          description="Per-tutor permissions you grant, plus optional hard limits your child cannot override."
          className="rounded-[10px] border-border bg-accent-soft/30"
        >
          <ParentConsentEditor
            learnerProfileId={learnerId}
            learnerName={learnerName}
            tutors={tutors}
            organizations={organizations}
            restrictions={restrictions}
          />
        </SectionCard>
      )}
    </PageShell>
  );
}
