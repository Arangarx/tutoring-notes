"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { formatUserFacingActionError } from "@/lib/action-correlation";
import { generateNoteFromTextAction, transcribeAndGenerateAction } from "./actions";
import AiGeneratedNoteReviewGate from "@/components/notes/AiGeneratedNoteReviewGate";
import type { NewNoteFormHandle } from "./NewNoteForm";
import AudioInputTabs, { type AudioResult } from "./AudioInputTabs";
import PendingSegmentList from "./PendingSegmentList";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Tab = "text" | "upload" | "record";

type Props = {
  studentId: string;
  formRef: React.RefObject<NewNoteFormHandle | null>;
  /** Whether the AI feature is enabled (OPENAI_API_KEY configured). */
  enabled: boolean;
  /** Whether blob storage is configured (BLOB_READ_WRITE_TOKEN present). */
  blobEnabled: boolean;
};

type PanelState = "idle" | "filled";

export default function AiAssistPanel({ studentId, formRef, enabled, blobEnabled }: Props) {
  // UX refresh quick win (2026-05-17): default to Record when Blob is configured.
  // Sarah hits Record every session; saving the click here removes one of the
  // top-5 friction points called out in docs/UX-REFRESH-PLAN.md. Falls back to
  // "text" when Blob isn't configured (Record/Upload tabs don't render at all).
  const [activeTab, setActiveTab] = useState<Tab>(blobEnabled ? "record" : "text");
  const [sessionText, setSessionText] = useState("");
  const [pendingAudios, setPendingAudios] = useState<AudioResult[]>([]);
  const pendingAudiosRef = useRef(pendingAudios);
  pendingAudiosRef.current = pendingAudios;
  /** Pending list length when the mic arms for capture — keeps "Part N" in sync after Re-record. */
  const [segmentDisplayBase, setSegmentDisplayBase] = useState(0);
  const [isRecordingActive, setIsRecordingActive] = useState(false);
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [audioTabsKey, setAudioTabsKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [warningKind, setWarningKind] = useState<"skipped-only" | "ai-fallback" | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Pre-flight check before kicking off an AI action. If the form has
   * tutor-typed content, prompts the tutor to confirm the overwrite. When
   * they confirm, **clears the form immediately** — this is critical because
   * `NewNoteForm.populate()` is now merge-into-empty (it never clobbers a
   * non-empty field). Without the clear, populate would refuse to fill any
   * already-typed fields and the tutor's "yes replace" intent would be
   * silently ignored.
   *
   * The clear-before-action behaviour ALSO preserves the race-protection
   * win: any content the tutor types DURING the (potentially-long) AI wait
   * lands in the now-empty fields, marks them dirty, and is preserved when
   * populate eventually fires.
   *
   * See `docs/BACKLOG.md` — adversarial review #6 (note save vs transcribe
   * race) and `src/__tests__/dom/AiAssistPanel.race.dom.test.tsx`.
   */
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

  function handleGenerateFromAudio() {
    if (pendingAudios.length === 0) return;
    setError(null);
    setWarning(null);
    setWarningKind(null);
    if (!checkOverwriteAndPrepare()) return;

    startTransition(async () => {
      try {
        const payload = pendingAudios.map((a) => ({ blobUrl: a.blobUrl, mimeType: a.mimeType }));
        let result = await transcribeAndGenerateAction(studentId, payload);
        if (
          !result.ok &&
          /brief database|database hiccup/i.test(result.error)
        ) {
          await new Promise((r) => setTimeout(r, 700));
          result = await transcribeAndGenerateAction(studentId, payload);
        }
        if (!result.ok) {
          setError(formatUserFacingActionError(result.error, result.debugId));
          return;
        }
        formRef.current?.populate({
          topics: result.topics,
          homework: result.homework,
          assessment: result.assessment,
          plan: result.plan,
          links: result.links,
          promptVersion: result.promptVersion,
          recordingIds: result.recordingIds,
          sessionStartedAt: result.sessionStartedAt,
          sessionEndedAt: result.sessionEndedAt,
        });
        if (result.warning) setWarning(result.warning);
        if (result.warningKind) setWarningKind(result.warningKind);
        setPanelState("filled");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[AiAssistPanel] transcribeAndGenerateAction threw:", err);
        // The Next.js framework error here ("An unexpected response was
        // received from the server") almost always means the function
        // exceeded its serverless time budget — a long single recording
        // hits Whisper N times sequentially and can run several minutes.
        // Surface that explicitly so the tutor knows why and what to try.
        setError(
          `The server stopped responding before transcription finished (${msg}). ` +
            "This usually happens with very long single recordings (~60 min+). " +
            "Try splitting the audio into two shorter files and uploading them separately. " +
            "On iPhone, try the Upload tab instead of Record, or use Wi-Fi."
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
    setPendingAudios([]);
    setSegmentDisplayBase(0);
    setIsRecordingActive(false);
    setAudioTabsKey((k) => k + 1);
    formRef.current?.clear();
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function handleAudioReady(
    audio: AudioResult,
    meta?: { keepRecorderMounted?: boolean }
  ) {
    setPendingAudios((prev) => [...prev, audio]);
    // Remount the audio tabs after a normal upload/record so the input resets.
    // Auto-rollover segments append without remounting so the mic stays hot.
    if (!meta?.keepRecorderMounted) {
      setAudioTabsKey((k) => k + 1);
    }
  }

  function handleRemoveSegment(index: number) {
    setPendingAudios((prev) => prev.filter((_, i) => i !== index));
  }

  const handleRecordingActive = useCallback((active: boolean) => {
    if (active) {
      setSegmentDisplayBase(pendingAudiosRef.current.length);
    }
    setIsRecordingActive(active);
  }, []);

  if (!enabled) {
    return (
      <AdminSectionCard title="Auto-fill from session" className="opacity-60">
        <p className="text-sm text-muted-foreground">
          AI generation is not configured on this server.
        </p>
      </AdminSectionCard>
    );
  }

  return (
    <AdminSectionCard
      title="Auto-fill from session"
      data-testid="ai-assist-panel"
      className="min-w-0 flex-1"
    >
      {panelState === "filled" ? (
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
            Paste notes, upload a recording, or record directly. AI will fill the note form — you
            can edit before saving.
          </p>
          <p className="text-xs text-muted-foreground">
            Your text/audio is sent to OpenAI to structure it.{" "}
            <a
              href="https://openai.com/enterprise-privacy"
              target="_blank"
              rel="noreferrer"
              className="text-brand underline-offset-2 hover:underline"
            >
              OpenAI does not use API data for training.
            </a>
          </p>

          <PendingSegmentList
            audios={pendingAudios}
            onRemove={handleRemoveSegment}
            disabled={isPending}
          />

          <AudioInputTabs
            key={audioTabsKey}
            studentId={studentId}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onAudioReady={handleAudioReady}
            onAudioCleared={() => {/* segments list handles removal */}}
            onRecordingActive={handleRecordingActive}
            segmentDisplayBase={segmentDisplayBase}
            disabled={isPending}
            blobEnabled={blobEnabled}
          />

          {activeTab === "text" && (
            <>
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
            </>
          )}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end pt-2">
            {activeTab === "text" ? (
              <Button
                type="button"
                disabled={isPending || !sessionText.trim()}
                onClick={handleGenerateFromText}
                data-testid="ai-generate-btn"
                className="min-h-11"
              >
                {isPending ? "Generating…" : error ? "Try again" : "Generate notes"}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={isPending || isRecordingActive || pendingAudios.length === 0}
                onClick={handleGenerateFromAudio}
                data-testid="ai-transcribe-btn"
                title={isRecordingActive ? "Stop the recording first" : undefined}
                className="min-h-11"
              >
                {isPending
                  ? `Transcribing${pendingAudios.length > 1 ? ` ${pendingAudios.length} segments` : ""}…`
                  : error
                    ? "Try again"
                    : "Transcribe & generate notes"}
              </Button>
            )}
          </div>
        </>
      )}
    </AdminSectionCard>
  );
}
