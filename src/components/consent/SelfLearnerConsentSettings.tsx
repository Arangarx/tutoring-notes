"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/SectionCard";
import { CONSENT_SWITCHES, SELF_LEARNER_AUDIO_HELP } from "@/lib/consent-toggle-copy";
import { saveSelfLearnerConsentAction } from "@/app/account/children/[id]/consent/actions";

import { ConsentSwitches, type ConsentSwitchKey } from "./ConsentSwitches";
import { SelfLearnerAgreement } from "./SelfLearnerAgreement";

type ConsentFlags = {
  allowLiveSession: boolean;
  allowAudioRecording: boolean;
  allowWhiteboardRecording: boolean;
  allowNoteSending: boolean;
};

type TutorConsentInput = ConsentFlags & {
  adminUserId: string;
  tutorLabel: string;
};

type OrgConsentInput = ConsentFlags & {
  organizationId: string;
  organizationName: string;
};

export function SelfLearnerConsentSettings({
  learnerProfileId,
  tutors,
  organizations,
  showAgreement = false,
  onSaved,
}: {
  learnerProfileId: string;
  tutors: TutorConsentInput[];
  organizations: OrgConsentInput[];
  /** True until a ConsentRecord exists. Settings for a backfilled account pass false. */
  showAgreement?: boolean;
  onSaved?: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const [tutorStates, setTutorStates] = useState(
    tutors.map((tutor) => ({
      ...tutor,
      id: tutor.adminUserId,
      name: tutor.tutorLabel,
    }))
  );
  const [orgStates, setOrgStates] = useState(
    organizations.map((org) => ({
      ...org,
      id: org.organizationId,
      name: org.organizationName,
    }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setFlag(
    list: "tutor" | "org",
    id: string,
    key: ConsentSwitchKey,
    checked: boolean
  ) {
    const apply = <T extends { id: string }>(rows: T[]): T[] =>
      rows.map((row) => (row.id === id ? { ...row, [key]: checked } : row));
    if (list === "tutor") setTutorStates(apply);
    else setOrgStates(apply);
  }

  async function save() {
    if (showAgreement && !agreed) {
      setError("agreement_required");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await saveSelfLearnerConsentAction(learnerProfileId, {
      tutors: tutorStates.map((t) => ({
        adminUserId: t.id,
        allowLiveSession: t.allowLiveSession,
        allowAudioRecording: t.allowAudioRecording,
        allowWhiteboardRecording: t.allowWhiteboardRecording,
        allowNoteSending: t.allowNoteSending,
      })),
      organizations: orgStates.map((o) => ({
        organizationId: o.id,
        allowLiveSession: o.allowLiveSession,
        allowAudioRecording: o.allowAudioRecording,
        allowWhiteboardRecording: o.allowWhiteboardRecording,
        allowNoteSending: o.allowNoteSending,
      })),
      restrictions: {
        restrictAudioRecording: false,
        restrictWhiteboardRecording: false,
        restrictNoteSending: false,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "save_failed");
      return;
    }
    onSaved?.();
  }

  return (
    <SectionCard realm="account" title="Session recording" className="rounded-[10px]">
      <div className="space-y-4">
        {showAgreement ? (
          <SelfLearnerAgreement checked={agreed} onCheckedChange={setAgreed} />
        ) : null}
        <p className="text-sm text-muted-foreground">{SELF_LEARNER_AUDIO_HELP}</p>
        {tutorStates.map((tutor) => (
          <div key={tutor.id} className="space-y-2">
            <p className="text-sm font-medium text-foreground">{tutor.name}</p>
            <ConsentSwitches
              idPrefix={tutor.id}
              switches={CONSENT_SWITCHES}
              values={tutor}
              onToggle={(key, checked) => setFlag("tutor", tutor.id, key, checked)}
            />
          </div>
        ))}
        {orgStates.map((org) => (
          <div key={org.id} className="space-y-2">
            <p className="text-sm font-medium text-foreground">{org.name}</p>
            <ConsentSwitches
              idPrefix={org.id}
              switches={CONSENT_SWITCHES}
              values={org}
              onToggle={(key, checked) => setFlag("org", org.id, key, checked)}
            />
          </div>
        ))}
        {error === "agreement_required" ? (
          <p className="text-sm text-destructive" role="alert">
            Check the agreement before saving.
          </p>
        ) : error ? (
          <p className="text-sm text-destructive" role="alert">
            Something went wrong saving your preferences. Please try again.
          </p>
        ) : null}
        <Button type="button" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </SectionCard>
  );
}
