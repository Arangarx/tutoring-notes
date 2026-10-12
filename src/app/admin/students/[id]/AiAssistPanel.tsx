"use client";

import { useRef, useState, useTransition } from "react";
import { generateNoteFromTextAction } from "./actions";
import AiGeneratedNoteReviewGate from "@/components/notes/AiGeneratedNoteReviewGate";
import type { NewNoteFormHandle } from "./NewNoteForm";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  studentId: string;
  formRef: React.RefObject<NewNoteFormHandle | null>;
  /** Whether the AI feature is enabled (OPENAI_API_KEY configured). */
  enabled: boolean;
  /** Kept so callers stay the same. Record and Upload are not offered. */
  blobEnabled: boolean;
};

type PanelState = "idle" | "filled";

const COMING_SOON =
  "Recording and uploading audio here is coming soon. For now, record during a whiteboard session.";

export default function AiAssistPanel({ studentId, formRef, enabled }: Props) {
  const [sessionText, setSessionText] = useState("");
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [warningKind, setWarningKind] = useState<"skipped-only" | "ai-fallback" | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function checkOverwriteAndPrepare(): boolean {
    const hasContent = formRef.current?.hasUserContent() ?? false;
    if (hasContent) {
      const ok = window.confirm(
        "Replace your edits with AI suggestions?\n\nYour current entries will be cleared first."
      );
      if (!ok) return false;
      formRef.current?.clear();
    }
    return true;
  }

  function handleGenerateFromText() {
    setError(null);
    setWarning(null);
    setWarningKind(null);
    if (!checkOverwriteAndPrepare()) return;

    startTransition(async () => {
      try {
        const result = await generateNoteFromTextAction(studentId, sessionText);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        formRef.current?.populate({
          topics: result.topics,
          homework: result.homework,
          assessment: result.assessment,
          plan: result.plan,
          links: result.links,
          promptVersion: result.promptVersion,
          recordingIds: [],
        });
        setPanelState("filled");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[AiAssistPanel] generateNoteFromTextAction threw:", err);
        setError(
          `Request failed before the server finished (${msg}). Check your connection and try again.`
        );
      }
    });
  }

  function handleRegenerate() {
    setPanelState("idle");
    setSessionText("");
    setError(null);
    setWarning(null);
    setWarningKind(null);
    formRef.current?.clear();
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  return (
    <SectionCard
      realm="admin"
      title="Auto-fill from session"
      data-testid="ai-assist-panel"
      className={cn("min-w-0 flex-1", !enabled && "opacity-60")}
    >
      <p className="text-sm text-foreground" data-testid="audio-coming-soon">
        {COMING_SOON}
      </p>
      {!enabled ? (
        <p className="text-sm text-muted-foreground">
          AI generation is not configured on this server.
        </p>
      ) : panelState === "filled" ? (
        <div data-testid="ai-filled-hint">
          <AiGeneratedNoteReviewGate
            warning={warning}
            warningKind={warningKind}
            onDismiss={handleRegenerate}
          />
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Paste notes. AI will fill the note form — you can edit before saving.
          </p>
          <p className="text-xs text-muted-foreground">
            Your text is sent to OpenAI to structure it.{" "}
            <a
              href="https://openai.com/enterprise-privacy"
              target="_blank"
              rel="noreferrer"
              className="text-brand underline-offset-2 hover:underline"
            >
              OpenAI does not use API data for training.
            </a>
          </p>
          <Label htmlFor="ai-session-text" className="text-muted-foreground">
            Session notes
          </Label>
          <textarea
            id="ai-session-text"
            ref={textareaRef}
            value={sessionText}
            onChange={(e) => setSessionText(e.target.value)}
            rows={4}
            placeholder="e.g. We worked on quadratic equations, factoring practice with worksheet pg 4-6, she struggled with negative coefficients..."
            className={cn(
              "mt-2 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs",
              "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            )}
            data-testid="ai-session-text"
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              disabled={isPending || !sessionText.trim()}
              onClick={handleGenerateFromText}
              data-testid="ai-generate-btn"
              className="min-h-11"
            >
              {isPending ? "Generating…" : error ? "Try again" : "Generate notes"}
            </Button>
          </div>
        </>
      )}
    </SectionCard>
  );
}
