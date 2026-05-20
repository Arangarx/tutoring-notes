"use client";

import {
  useTransition,
  useState,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from "react";
import { createNote } from "./actions";
import { formatLocalTimeSnapped, TIME_INPUT_STEP_SECONDS } from "@/lib/time/snap";

export type PopulatePayload = {
  topics: string;
  homework: string;
  /** New in B4 — where the student stands on what was covered. */
  assessment: string;
  /** UI-facing name; mapped to legacy `nextSteps` DB column server-side. */
  plan: string;
  links: string;
  promptVersion: string;
  /** `YYYY-MM-DD` — e.g. whiteboard session day on the replay page. */
  noteDate?: string;
  /** Set when the note was generated from one or more audio recordings. */
  recordingIds?: string[];
  /**
   * UTC ISO timestamps derived server-side from the recordings' createdAt /
   * durationSeconds. We format them as local-time HH:MM here so the time
   * inputs show what the server would otherwise auto-fill at save time.
   * Only set when the note was generated from audio.
   */
  sessionStartedAt?: string;
  sessionEndedAt?: string;
};

/**
 * Format a UTC ISO timestamp as `HH:MM` in the browser's local timezone,
 * snapped to the nearest 5-minute grid (matches `step={300}` on the
 * inputs below — see lib/time/snap.ts for the full rationale).
 */
function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatLocalTimeSnapped(d);
}

export type NewNoteFormHandle = {
  populate: (payload: PopulatePayload) => void;
  /** Clears all AI-filled fields and recording state. */
  clear: () => void;
  /** Returns true if any of the AI-fillable fields have content the user typed. */
  hasUserContent: () => boolean;
};

type Props = {
  studentId: string;
  /** Called after a note is successfully saved, so parent can reset dependent panels. */
  onSaved?: () => void;
  /** When set, initializes the `<input type="date">`; still editable. */
  initialNoteDate?: string;
};

const TEMPLATES = [
  { value: "", label: "None" },
  { value: "Math session", label: "Math session" },
  { value: "Reading session", label: "Reading session" },
  { value: "Test prep", label: "Test prep" },
];

function formatDateInput(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const NewNoteForm = forwardRef<NewNoteFormHandle, Props>(function NewNoteForm(
  { studentId, onSaved, initialNoteDate },
  ref
) {
  const baselineNoteDate = useMemo(
    () => initialNoteDate ?? formatDateInput(new Date()),
    [initialNoteDate]
  );
  const [noteDate, setNoteDate] = useState(() => baselineNoteDate);
  const [template, setTemplate] = useState("");
  const [topics, setTopics] = useState("");
  const [homework, setHomework] = useState("");
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  const [links, setLinks] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  // Capture browser timezone offset once at mount so the server can localise
  // auto-filled recording timestamps (new Date().getTimezoneOffset() returns
  // minutes west of UTC — positive for UTC-N timezones).
  const [tzOffset] = useState(() => new Date().getTimezoneOffset());
  const [aiGenerated, setAiGenerated] = useState(false);
  const [aiPromptVersion, setAiPromptVersion] = useState("");
  const [recordingIds, setRecordingIds] = useState<string[]>([]);
  const [shareRecordingInEmail, setShareRecordingInEmail] = useState(false);
  const [, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  useImperativeHandle(ref, () => ({
    populate(payload: PopulatePayload) {
      // Merge-into-empty contract: NEVER clobber a field the tutor has typed
      // into. Protects against the in-flight race where the AI generation
      // action takes minutes (transcribe + LLM) and the tutor types into the
      // form during the wait. When the action returns, populate() fires and
      // would otherwise silently overwrite their typed content.
      //
      // If the tutor wants to discard their edits and let AI take over, the
      // call site (e.g. AiAssistPanel.checkOverwriteAndPrepare) calls clear()
      // BEFORE triggering the action. By the time populate runs, the explicitly-
      // cleared fields are empty again and AI fills them — while any content
      // typed DURING the wait is still preserved by the same merge rule.
      //
      // See `docs/BACKLOG.md` — adversarial review #6 (note save vs transcribe
      // race) and `src/__tests__/dom/NewNoteForm.populate.dom.test.tsx`.
      if (!topics.trim() && payload.topics) setTopics(payload.topics);
      if (!homework.trim() && payload.homework) setHomework(payload.homework);
      if (!assessment.trim() && payload.assessment) setAssessment(payload.assessment);
      if (!plan.trim() && payload.plan) setPlan(payload.plan);
      if (!links.trim() && payload.links) setLinks(payload.links);
      if (payload.noteDate) setNoteDate(payload.noteDate);
      // AI provenance + recording-attach flags are NOT tutor-typed content;
      // populate always sets them so the saved note records "this draft came
      // from the AI / from these recordings" even if the tutor edited every
      // text field. shareRecordingInEmail defaults to true on first attach
      // and stays whatever the tutor toggles thereafter.
      setAiGenerated(true);
      setAiPromptVersion(payload.promptVersion);
      if (payload.recordingIds && payload.recordingIds.length > 0) {
        setRecordingIds(payload.recordingIds);
        setShareRecordingInEmail(true);
      }
      // Time fields: existing merge-into-empty (predates this fix). Server
      // still auto-fills missing times at save (see createNote).
      if (payload.sessionStartedAt && !startTime) {
        const formatted = formatLocalTime(payload.sessionStartedAt);
        if (formatted) setStartTime(formatted);
      }
      if (payload.sessionEndedAt && !endTime) {
        const formatted = formatLocalTime(payload.sessionEndedAt);
        if (formatted) setEndTime(formatted);
      }
    },
    clear() {
      setTopics("");
      setHomework("");
      setAssessment("");
      setPlan("");
      setLinks("");
      setNoteDate(baselineNoteDate);
      setStartTime("");
      setEndTime("");
      setAiGenerated(false);
      setAiPromptVersion("");
      setRecordingIds([]);
      setShareRecordingInEmail(false);
    },
    hasUserContent() {
      return !!(topics.trim() || homework.trim() || assessment.trim() || plan.trim());
    },
  }), [baselineNoteDate, startTime, endTime, topics, homework, assessment, plan, links]);

  const hasContent = !!(topics.trim() || homework.trim() || assessment.trim() || plan.trim() || links.trim());

  function handleClear() {
    setTopics("");
    setHomework("");
    setAssessment("");
    setPlan("");
    setLinks("");
    setNoteDate(baselineNoteDate);
    setStartTime("");
    setEndTime("");
    setAiGenerated(false);
    setAiPromptVersion("");
    setRecordingIds([]);
    setShareRecordingInEmail(false);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setSubmitting(true);
    startTransition(async () => {
      try {
        await createNote(studentId, formData);
        // Reset form state on success
        setTemplate("");
        setTopics("");
        setHomework("");
        setAssessment("");
        setPlan("");
        setLinks("");
        setStartTime("");
        setEndTime("");
        setAiGenerated(false);
        setAiPromptVersion("");
        setRecordingIds([]);
        setShareRecordingInEmail(false);
        setNoteDate(baselineNoteDate);
        onSaved?.();
      } finally {
        setSubmitting(false);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} data-testid="new-note-form" autoComplete="off">
      {/* Hidden AI provenance fields */}
      <input type="hidden" name="aiGenerated" value={String(aiGenerated)} />
      <input type="hidden" name="aiPromptVersion" value={aiPromptVersion} />
      <input type="hidden" name="timezoneOffsetMinutes" value={String(tzOffset)} />
      {recordingIds.map((id) => (
        <input key={id} type="hidden" name="recordingId" value={id} />
      ))}
      <input type="hidden" name="shareRecordingInEmail" value={String(shareRecordingInEmail)} />

      <div className="row">
        <div style={{ flex: 1, minWidth: 200 }}>
          <label htmlFor="note-date">Date</label>
        <input
          id="note-date"
          name="date"
          type="date"
          value={noteDate}
          onChange={(e) => setNoteDate(e.target.value)}
        />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label htmlFor="note-template">Template (optional)</label>
          <select
            id="note-template"
            name="template"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            {TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label htmlFor="note-start-time">Session start (optional)</label>
          <input
            id="note-start-time"
            name="startTime"
            type="time"
            // 5-minute increments — Sarah's explicit ask. Matches Wyzant's
            // time picker and her own habit of rounding to the nearest 5.
            // Pairs with the formatLocalTime() snap above so AI-prefilled
            // times don't land off-grid and trigger HTML5 step validation
            // on submit.
            step={TIME_INPUT_STEP_SECONDS}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label htmlFor="note-end-time">Session end (optional)</label>
          <input
            id="note-end-time"
            name="endTime"
            type="time"
            step={TIME_INPUT_STEP_SECONDS}
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label htmlFor="note-topics">Topics covered</label>
        <textarea
          id="note-topics"
          name="topics"
          rows={3}
          placeholder="What did you work on today?"
          value={topics}
          onChange={(e) => setTopics(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label htmlFor="note-homework">Homework</label>
        <textarea
          id="note-homework"
          name="homework"
          rows={3}
          placeholder="What should they do before next time?"
          value={homework}
          onChange={(e) => setHomework(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label htmlFor="note-assessment">Assessment</label>
        <textarea
          id="note-assessment"
          name="assessment"
          rows={3}
          placeholder="Where does the student stand on what was covered? Strengths, struggles."
          value={assessment}
          onChange={(e) => setAssessment(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label htmlFor="note-plan">Plan</label>
        <textarea
          id="note-plan"
          name="plan"
          rows={3}
          placeholder="What's the plan for next session?"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label htmlFor="note-links">Links (optional, one per line)</label>
        <textarea
          id="note-links"
          name="links"
          rows={3}
          placeholder="https://..."
          value={links}
          onChange={(e) => setLinks(e.target.value)}
        />
      </div>

      {/* Recording section — only shown when one or more recordings were attached via AI panel */}
      {recordingIds.length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: "12px 14px",
            borderRadius: 6,
            border: "1px solid var(--color-border, #d1d5db)",
            borderLeft: "3px solid var(--color-primary, #2563eb)",
            minWidth: 0,
            overflow: "hidden",
          }}
          data-testid="recording-section"
        >
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              cursor: "pointer",
              fontSize: 13,
            }}
            data-testid="share-recording-label"
          >
            <input
              type="checkbox"
              checked={shareRecordingInEmail}
              onChange={(e) => setShareRecordingInEmail(e.target.checked)}
              style={{ marginTop: 2, flexShrink: 0 }}
              data-testid="share-recording-checkbox"
            />
            <span>
              <span style={{ fontWeight: 600 }}>🎙 Attach recording{recordingIds.length > 1 ? "s" : ""} to share link</span>
              <span style={{ display: "block", fontSize: 11, color: "var(--color-muted, #6b7280)", marginTop: 2, overflowWrap: "break-word", wordBreak: "break-word" }}>
                Confirm student consent before sharing with parents/guardians.
              </span>
            </span>
          </label>
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 12, gap: 8 }}>
        <button
          type="button"
          className="btn"
          disabled={!hasContent || submitting}
          onClick={handleClear}
        >
          Clear form
        </button>
        <button className="btn primary" type="submit" disabled={submitting || !hasContent}>
          {submitting ? "Saving…" : "Save note"}
        </button>
      </div>
    </form>
  );
});

export default NewNoteForm;
