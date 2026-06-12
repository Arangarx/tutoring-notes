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
  {
    key: "restrictNoteSending" as const,
    label: "Always block session notes email",
    description:
      "Applies to every tutor. If checked, summary emails are not sent even when a tutor's setting above is on.",
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

      <AccountSectionCardLike title={`Always-off limits for ${learnerName}`}>
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
