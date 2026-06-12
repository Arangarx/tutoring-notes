"use client";

import { useState, type ReactNode } from "react";

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
import { Switch } from "@/components/ui/switch";

export type TutorConsentState = {
  adminUserId: string;
  tutorLabel: string;
  version: number | null;
  allowLiveSession: boolean;
  allowAudioRecording: boolean;
  allowWhiteboardRecording: boolean;
  allowNoteSending: boolean;
};

export type ConsentRestrictionState = {
  restrictAudioRecording: boolean;
  restrictWhiteboardRecording: boolean;
  restrictNoteSending: boolean;
};

const PERMISSION_TOGGLES = [
  {
    key: "allowLiveSession" as const,
    label: "Allow live sessions",
    description:
      "Your child can join real-time whiteboard tutoring sessions with this tutor.",
  },
  {
    key: "allowAudioRecording" as const,
    label: "Allow audio recording",
    description:
      "Session audio may be recorded for note generation and tutor review.",
  },
  {
    key: "allowWhiteboardRecording" as const,
    label: "Allow whiteboard replay",
    description:
      "Whiteboard strokes are saved so you can replay sessions — this controls parent-facing access, not the tutor's own session data.",
  },
  {
    key: "allowNoteSending" as const,
    label: "Allow session notes email",
    description:
      "Session summary notes can be emailed to you after each session.",
  },
] satisfies ReadonlyArray<{
  key: keyof Omit<
    TutorConsentState,
    "adminUserId" | "tutorLabel" | "version"
  >;
  label: string;
  description: string;
}>;

const RESTRICTION_TOGGLES = [
  {
    key: "restrictAudioRecording" as const,
    label: "Never allow audio recording",
    description:
      "Child-narrowing floor — even if you enable audio above, this blocks it for your child.",
  },
  {
    key: "restrictWhiteboardRecording" as const,
    label: "Never allow whiteboard replay",
    description: "Blocks parent-facing whiteboard replay access for your child.",
  },
  {
    key: "restrictNoteSending" as const,
    label: "Never allow notes email",
    description: "Blocks session summary emails for your child.",
  },
] satisfies ReadonlyArray<{
  key: keyof ConsentRestrictionState;
  label: string;
  description: string;
}>;

type ParentConsentEditorProps = {
  learnerName: string;
  tutors: TutorConsentState[];
  restrictions: ConsentRestrictionState;
};

export function ParentConsentEditor({
  learnerName,
  tutors,
  restrictions: initialRestrictions,
}: ParentConsentEditorProps) {
  const [tutorStates, setTutorStates] = useState(tutors);
  const [restrictions, setRestrictions] = useState(initialRestrictions);
  const [previewSaved, setPreviewSaved] = useState(false);

  function updateTutorToggle(
    adminUserId: string,
    key: (typeof PERMISSION_TOGGLES)[number]["key"],
    checked: boolean
  ) {
    setTutorStates((prev) =>
      prev.map((t) => (t.adminUserId === adminUserId ? { ...t, [key]: checked } : t))
    );
    setPreviewSaved(false);
  }

  function updateRestriction(
    key: keyof ConsentRestrictionState,
    checked: boolean
  ) {
    setRestrictions((prev) => ({ ...prev, [key]: checked }));
    setPreviewSaved(false);
  }

  function handlePreviewSave() {
    setPreviewSaved(true);
  }

  if (tutors.length === 0) {
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
        <AlertTitle className="text-accent-text">What this controls</AlertTitle>
        <AlertDescription className="text-foreground">
          <p>
            {`These settings decide what ${learnerName}'s tutors can capture and share with you. Each tutor has separate preferences — consent for one tutor does not apply to another.`}
          </p>
          <p className="mt-2">
            Effective permissions are the parent ceiling minus any child restrictions below.
          </p>
        </AlertDescription>
      </Alert>

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Per-tutor preferences</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enable only what you are comfortable with for each tutor.
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
                  {PERMISSION_TOGGLES.map((perm) => (
                    <div
                      key={perm.key}
                      className="flex items-start justify-between gap-4 rounded-[10px] border border-border bg-background p-3"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <Label
                          htmlFor={`${tutor.adminUserId}-${perm.key}`}
                          className="cursor-pointer text-sm font-medium"
                        >
                          {perm.label}
                        </Label>
                        <p className="text-xs text-muted-foreground">{perm.description}</p>
                      </div>
                      <Switch
                        id={`${tutor.adminUserId}-${perm.key}`}
                        checked={tutor[perm.key]}
                        onCheckedChange={(checked) =>
                          updateTutorToggle(tutor.adminUserId, perm.key, checked)
                        }
                        aria-label={perm.label}
                      />
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <AccountSectionCardLike title="Child restrictions (floor)">
        <p className="mb-4 text-sm text-muted-foreground">
          Optional narrowing — your child cannot override these. All off by default.
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
      </AccountSectionCardLike>

      <div className="space-y-3 border-t border-border pt-4">
        <Button
          type="button"
          variant="accent"
          className="w-full min-h-11 sm:w-auto"
          onClick={handlePreviewSave}
        >
          Save privacy preferences
        </Button>

        <Alert className="rounded-[10px] border-dashed">
          <AlertTitle>Preview only</AlertTitle>
          <AlertDescription>
            {previewSaved
              ? "Changes were not saved — this page is visual-first. Wire to POST /api/account/children/[id]/consent when ready."
              : "Saving is not wired yet. Toggles reflect loaded data for review; backend route is deferred (B2 Step 6)."}
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}

function AccountSectionCardLike({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[10px] border border-border bg-card p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
