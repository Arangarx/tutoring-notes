"use client";

import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/SectionCard";
import { CONSENT_SWITCHES } from "@/lib/consent-toggle-copy";
import { ConsentSwitches, type ConsentSwitchKey } from "@/components/consent/ConsentSwitches";
import { saveParentConsentAction } from "./actions";

export type TutorConsentState = {
  adminUserId: string;
  tutorLabel: string;
  version: number | null;
  allowLiveSession: boolean;
  allowAudioRecording: boolean;
  allowWhiteboardRecording: boolean;
  /** Dormant — retained in schema; hidden from UI pending WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME. */
  allowNoteSending: boolean;
};

export type ConsentRestrictionState = {
  restrictAudioRecording: boolean;
  restrictWhiteboardRecording: boolean;
  /** Dormant — paired with allowNoteSending; hidden pending WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME. */
  restrictNoteSending: boolean;
};

export type OrgConsentState = {
  organizationId: string;
  organizationName: string;
  version: number | null;
  allowLiveSession: boolean;
  allowAudioRecording: boolean;
  allowWhiteboardRecording: boolean;
  allowNoteSending: boolean;
};

const RESTRICTION_TOGGLES = [
  {
    key: "restrictAudioRecording" as const,
    label: "Always block audio recording",
    description:
      "Applies to every tutor. If checked, session audio cannot be recorded even when a tutor's setting above is on.",
  },
  {
    key: "restrictWhiteboardRecording" as const,
    label: "Always block whiteboard replay",
    description:
      "Applies to every tutor. If checked, you cannot replay saved whiteboard sessions even when a tutor's setting above is on.",
  },
] satisfies ReadonlyArray<{
  key: keyof ConsentRestrictionState;
  label: string;
  description: string;
}>;

type ParentConsentEditorProps = {
  learnerProfileId: string;
  learnerName: string;
  tutors: TutorConsentState[];
  organizations?: OrgConsentState[];
  restrictions: ConsentRestrictionState;
};

export function ParentConsentEditor({
  learnerProfileId,
  learnerName,
  tutors,
  organizations = [],
  restrictions: initialRestrictions,
}: ParentConsentEditorProps) {
  const [tutorStates, setTutorStates] = useState(tutors);
  const [orgStates, setOrgStates] = useState(organizations);
  const [restrictions, setRestrictions] = useState(initialRestrictions);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateTutorToggle(
    adminUserId: string,
    key: ConsentSwitchKey,
    checked: boolean
  ) {
    setTutorStates((prev) =>
      prev.map((t) => (t.adminUserId === adminUserId ? { ...t, [key]: checked } : t))
    );
    setSaved(false);
  }

  function updateOrgToggle(organizationId: string, key: ConsentSwitchKey, checked: boolean) {
    setOrgStates((prev) =>
      prev.map((org) => (org.organizationId === organizationId ? { ...org, [key]: checked } : org))
    );
    setSaved(false);
  }

  function updateRestriction(
    key: keyof ConsentRestrictionState,
    checked: boolean
  ) {
    setRestrictions((prev) => ({ ...prev, [key]: checked }));
    setSaved(false);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const result = await saveParentConsentAction(learnerProfileId, {
        tutors: tutorStates.map(
          ({
            adminUserId,
            allowLiveSession,
            allowAudioRecording,
            allowWhiteboardRecording,
            allowNoteSending,
          }) => ({
            adminUserId,
            allowLiveSession,
            allowAudioRecording,
            allowWhiteboardRecording,
            allowNoteSending,
          })
        ),
        restrictions,
        organizations: orgStates.map(
          ({
            organizationId,
            allowLiveSession,
            allowAudioRecording,
            allowWhiteboardRecording,
            allowNoteSending,
          }) => ({
            organizationId,
            allowLiveSession,
            allowAudioRecording,
            allowWhiteboardRecording,
            allowNoteSending,
          })
        ),
      });

      if (!result.ok) {
        setError(result.error ?? "save_failed");
        return;
      }

      if (result.tutorVersions) {
        setTutorStates((prev) =>
          prev.map((tutor) => ({
            ...tutor,
            version: result.tutorVersions![tutor.adminUserId] ?? tutor.version,
          }))
        );
      }
      setSaved(true);
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  if (tutors.length === 0 && organizations.length === 0) {
    return (
      <div className="rounded-[10px] border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
        <p>
          {`${learnerName} isn't connected to a tutor yet. Privacy preferences are set when you claim a tutor's invite link, or will appear here once a tutor is linked.`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert className="rounded-[10px] border-accent/30 bg-accent-soft">
        <AlertTitle className="text-accent-text">How privacy settings work</AlertTitle>
        <AlertDescription className="text-foreground">
          <p>
            {`You control privacy in two layers for ${learnerName}. First, choose what each tutor may do — those choices are separate per tutor. Second, you can optionally set hard limits that apply to every tutor and that ${learnerName} cannot change.`}
          </p>
          <p className="mt-2">
            {`What actually happens in a session: a tutor may only do something when you have turned it on for that tutor and you have not blocked it in the hard limits below.`}
          </p>
        </AlertDescription>
      </Alert>

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">What each tutor may do</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Turn on only what you are comfortable with for each tutor. Allowing something for one tutor does not affect another.
          </p>
        </div>

        <Accordion
          type="multiple"
          defaultValue={tutorStates.map((t) => t.adminUserId)}
          className="rounded-[10px] border border-border bg-card px-4"
        >
          {tutorStates.map((tutor) => (
            <AccordionItem key={tutor.adminUserId} value={tutor.adminUserId}>
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex flex-1 items-center gap-3 pr-2 text-left">
                  <span className="font-medium text-foreground">{tutor.tutorLabel}</span>
                  {tutor.version ? (
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      v{tutor.version}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="bg-accent-soft text-accent-text font-mono text-[10px] uppercase"
                    >
                      Not set
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="space-y-3">
                  {!tutor.allowLiveSession ? (
                    <div className="rounded-[8px] border border-warning/30 bg-warning/10 px-3 py-2">
                      <p className="text-sm font-medium text-warning">
                        Limited to scheduling without live sessions
                      </p>
                    </div>
                  ) : null}
                  <ConsentSwitches
                    idPrefix={tutor.adminUserId}
                    testIdPrefix="parent-consent-toggle"
                    switches={CONSENT_SWITCHES}
                    values={tutor}
                    onToggle={(key, checked) =>
                      updateTutorToggle(tutor.adminUserId, key, checked)
                    }
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {orgStates.length > 0 ? (
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">What each organization may do</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These choices are for the organization, not for an individual tutor.
            </p>
          </div>
          <Accordion
            type="multiple"
            defaultValue={orgStates.map((org) => org.organizationId)}
            className="rounded-[10px] border border-border bg-card px-4"
          >
            {orgStates.map((org) => (
              <AccordionItem key={org.organizationId} value={org.organizationId}>
                <AccordionTrigger className="py-4 hover:no-underline">
                  <span className="font-medium text-foreground">{org.organizationName}</span>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <ConsentSwitches
                    idPrefix={org.organizationId}
                    switches={CONSENT_SWITCHES}
                    values={org}
                    onToggle={(key, checked) => updateOrgToggle(org.organizationId, key, checked)}
                  />
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      data-testid={`org-consent-withdraw-${org.organizationId}`}
                      onClick={() => {
                        (["allowLiveSession", "allowAudioRecording", "allowWhiteboardRecording", "allowNoteSending"] as const).forEach(
                          (key) => updateOrgToggle(org.organizationId, key, false)
                        );
                      }}
                    >
                      Withdraw consent
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ) : null}

      <SectionCard realm="account" title={`Always-off limits for ${learnerName}`}>
        <p className="mb-4 text-sm text-muted-foreground">
          Optional. Check a box to block that activity for every tutor, even if you turned it on above. Your child cannot change these. All unchecked by default — nothing extra is blocked.
        </p>
        <div className="space-y-3">
          {RESTRICTION_TOGGLES.map((item) => (
            <div
              key={item.key}
              className="flex items-start gap-3 rounded-[10px] border border-border bg-background p-3"
            >
              <Checkbox
                id={`restriction-${item.key}`}
                checked={restrictions[item.key]}
                onCheckedChange={(checked) =>
                  updateRestriction(item.key, checked === true)
                }
                aria-label={item.label}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <Label
                  htmlFor={`restriction-${item.key}`}
                  className="cursor-pointer text-sm font-medium"
                >
                  {item.label}
                </Label>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="space-y-3 border-t border-border pt-4">
        <Button
          type="button"
          data-testid="parent-consent-save-btn"
          variant="accent"
          className="w-full min-h-11 sm:w-auto"
          onClick={() => void handleSave()}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "Saving…" : "Save privacy preferences"}
        </Button>

        {saved ? (
          <Alert
            data-testid="parent-consent-saved-alert"
            className="rounded-[10px] border-accent/30 bg-accent-soft"
          >
            <AlertTitle>Preferences saved</AlertTitle>
            <AlertDescription>
              Your privacy choices are saved. New tutoring sessions will use
              these settings.
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert className="rounded-[10px] border-destructive/30" role="alert">
            <AlertTitle>Could not save</AlertTitle>
            <AlertDescription>
              {error === "network"
                ? "Network error — please try again."
                : error === "consent_already_saved"
                  ? "Preferences were already saved. Refresh the page and try again."
                  : "Something went wrong saving your preferences. Please try again."}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
