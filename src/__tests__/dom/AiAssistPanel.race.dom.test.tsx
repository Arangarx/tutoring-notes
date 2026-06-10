/**
 * @jest-environment jsdom
 */

/**
 * Flow-level regression tests for the note-save vs transcribe race
 * (adversarial review #6 in `docs/BACKLOG.md`).
 *
 * These tests exercise the AiAssistPanel + NewNoteForm seam — specifically:
 *   - `checkOverwriteAndPrepare()` prompts on dirty form, clears on confirm.
 *   - Once an AI action is in-flight, typing into the form is preserved
 *     when the action eventually returns and populate() fires.
 *   - The same protection applies whether the action took 1ms or "minutes."
 *
 * Form-level coverage of the merge-into-empty contract on populate() itself
 * lives in `NewNoteForm.populate.dom.test.tsx`.
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  GenerateNoteResult,
  TranscribeAndGenerateResult,
} from "@/app/admin/students/[id]/actions";

// Mock the server-action module. The real implementations talk to OpenAI +
// Postgres + Blob storage; we replace them with jest.fn()s the test fully
// controls so we can model the in-flight race deterministically.
const generateNoteFromTextActionMock = jest.fn();
const transcribeAndGenerateActionMock = jest.fn();
const createNoteMock = jest.fn();

jest.mock("@/app/admin/students/[id]/actions", () => ({
  __esModule: true,
  generateNoteFromTextAction: (...args: unknown[]) =>
    generateNoteFromTextActionMock(...args),
  transcribeAndGenerateAction: (...args: unknown[]) =>
    transcribeAndGenerateActionMock(...args),
  createNote: (...args: unknown[]) => createNoteMock(...args),
}));

// Stub AudioInputTabs so the panel renders without needing MediaRecorder.
// We model the audio-recorded flow by exposing a test button that fires
// onAudioReady with a fake AudioResult.
type AudioInputTabsStubProps = {
  activeTab: "text" | "upload" | "record";
  onTabChange: (tab: "text" | "upload" | "record") => void;
  onAudioReady: (audio: {
    blobUrl: string;
    mimeType: string;
    sizeBytes: number;
    filename: string;
  }) => void;
  disabled?: boolean;
};

jest.mock("@/app/admin/students/[id]/AudioInputTabs", () => ({
  __esModule: true,
  default: function AudioInputTabsStub({
    activeTab,
    onTabChange,
    onAudioReady,
  }: AudioInputTabsStubProps) {
    return (
      <div data-testid="stub-audio-tabs">
        <button
          type="button"
          data-testid="stub-set-tab-text"
          onClick={() => onTabChange("text")}
        >
          tab-text
        </button>
        <button
          type="button"
          data-testid="stub-set-tab-record"
          onClick={() => onTabChange("record")}
        >
          tab-record
        </button>
        <button
          type="button"
          data-testid="stub-emit-audio"
          onClick={() =>
            onAudioReady({
              blobUrl: "https://blob/x",
              mimeType: "audio/webm",
              sizeBytes: 100,
              filename: "rec.webm",
            })
          }
        >
          emit-audio
        </button>
        <span data-testid="stub-active-tab">{activeTab}</span>
      </div>
    );
  },
}));

import NoteEntrySection from "@/app/admin/students/[id]/NoteEntrySection";

// Realistic AI payloads — match TranscribeAndGenerateResult.ok=true shape.
const TEXT_AI_OK: GenerateNoteResult = {
  ok: true,
  topics: "AI topics",
  homework: "AI homework",
  assessment: "AI assessment",
  plan: "AI plan",
  links: "https://ai.example.com",
  promptVersion: "v7-test",
};

const AUDIO_AI_OK: TranscribeAndGenerateResult = {
  ok: true,
  recordingIds: ["rec-1"],
  transcript: "raw transcript",
  topics: "AI audio topics",
  homework: "AI audio homework",
  assessment: "AI audio assessment",
  plan: "AI audio plan",
  links: "",
  promptVersion: "v7-test",
};

function getField(
  name: "topics" | "homework" | "assessment" | "plan" | "links"
): HTMLTextAreaElement {
  return screen.getByLabelText(
    name === "topics"
      ? /topics covered/i
      : name === "homework"
      ? /^homework$/i
      : name === "assessment"
      ? /^assessment$/i
      : name === "plan"
      ? /^plan$/i
      : /links/i
  ) as HTMLTextAreaElement;
}

function getSessionTextarea(): HTMLTextAreaElement {
  return screen.getByTestId("ai-session-text") as HTMLTextAreaElement;
}

/**
 * Render AiAssistPanel + NewNoteForm wired together (mirrors the real
 * NoteEntrySection composition the student page uses).
 */
function renderPanel(opts?: { blobEnabled?: boolean }) {
  render(
    <NoteEntrySection
      studentId="student-1"
      aiEnabled={true}
      blobEnabled={opts?.blobEnabled ?? false}
    />
  );
}

/**
 * Create a manually-resolvable promise so a test can put a server action
 * "in flight" and resolve it on demand — letting the test type into the
 * form between dispatch and response.
 */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  generateNoteFromTextActionMock.mockReset();
  transcribeAndGenerateActionMock.mockReset();
  createNoteMock.mockReset();
  // jsdom doesn't define window.confirm by default; install a default that
  // each test can override before triggering the prompt path.
  window.confirm = jest.fn().mockReturnValue(true);
});

describe("AiAssistPanel — checkOverwriteAndPrepare (clear-on-confirm)", () => {
  it("does NOT prompt when the form is empty; fires action and populates", async () => {
    const user = userEvent.setup();
    generateNoteFromTextActionMock.mockResolvedValue(TEXT_AI_OK);
    renderPanel();

    await user.type(getSessionTextarea(), "session summary");
    await user.click(screen.getByTestId("ai-generate-btn"));

    expect(window.confirm).not.toHaveBeenCalled();
    expect(generateNoteFromTextActionMock).toHaveBeenCalledTimes(1);
    await screen.findByTestId("ai-filled-hint");
    expect(getField("topics").value).toBe("AI topics");
  });

  it("declines confirm → no action fires, tutor's typed content stays untouched", async () => {
    const user = userEvent.setup();
    window.confirm = jest.fn().mockReturnValue(false);
    generateNoteFromTextActionMock.mockResolvedValue(TEXT_AI_OK);
    renderPanel();

    await user.type(getField("topics"), "tutor topics");
    await user.type(getSessionTextarea(), "session summary");
    await user.click(screen.getByTestId("ai-generate-btn"));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(generateNoteFromTextActionMock).not.toHaveBeenCalled();
    expect(getField("topics").value).toBe("tutor topics");
  });

  it("confirms overwrite → form is CLEARED before the action fires", async () => {
    const user = userEvent.setup();
    const dfd = deferred<GenerateNoteResult>();
    generateNoteFromTextActionMock.mockReturnValue(dfd.promise);
    renderPanel();

    await user.type(getField("topics"), "tutor topics");
    await user.type(getField("homework"), "tutor homework");
    await user.type(getSessionTextarea(), "session summary");
    await user.click(screen.getByTestId("ai-generate-btn"));

    // Confirm was called, action is in-flight, AND the form is already empty
    // (clear-on-confirm ran synchronously, BEFORE the action started).
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(generateNoteFromTextActionMock).toHaveBeenCalledTimes(1);
    expect(getField("topics").value).toBe("");
    expect(getField("homework").value).toBe("");

    await act(async () => {
      dfd.resolve(TEXT_AI_OK);
    });
    await screen.findByTestId("ai-filled-hint");
    expect(getField("topics").value).toBe("AI topics");
    expect(getField("homework").value).toBe("AI homework");
  });
});

describe("AiAssistPanel — in-flight race (the actual #6 bug)", () => {
  it("empty form → click Generate → type during wait → populate preserves the typing", async () => {
    const user = userEvent.setup();
    const dfd = deferred<GenerateNoteResult>();
    generateNoteFromTextActionMock.mockReturnValue(dfd.promise);
    renderPanel();

    // Form starts empty; no confirm should fire.
    await user.type(getSessionTextarea(), "session summary");
    await user.click(screen.getByTestId("ai-generate-btn"));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(generateNoteFromTextActionMock).toHaveBeenCalledTimes(1);

    // Action is in-flight. Tutor remembers something and types into the form.
    await user.type(getField("assessment"), "tutor jotted this while AI worked");

    // Now the action returns.
    await act(async () => {
      dfd.resolve(TEXT_AI_OK);
    });
    await screen.findByTestId("ai-filled-hint");

    // Tutor's wait-time typing is preserved.
    expect(getField("assessment").value).toBe("tutor jotted this while AI worked");
    // Untouched fields still get AI values.
    expect(getField("topics").value).toBe("AI topics");
    expect(getField("homework").value).toBe("AI homework");
    expect(getField("plan").value).toBe("AI plan");
    expect(getField("links").value).toBe("https://ai.example.com");
  });

  it("pre-typed → confirm overwrite → type during wait → populate preserves the NEW typing", async () => {
    const user = userEvent.setup();
    const dfd = deferred<GenerateNoteResult>();
    generateNoteFromTextActionMock.mockReturnValue(dfd.promise);
    renderPanel();

    // 1. Pre-typed content.
    await user.type(getField("topics"), "STALE tutor content");
    // 2. Click Generate, confirm overwrite (default: confirm returns true).
    await user.type(getSessionTextarea(), "session summary");
    await user.click(screen.getByTestId("ai-generate-btn"));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    // Form is now cleared (clear-on-confirm).
    expect(getField("topics").value).toBe("");
    // 3. Tutor types fresh content during the AI wait.
    await user.type(getField("homework"), "FRESH content typed during wait");

    // 4. AI returns.
    await act(async () => {
      dfd.resolve(TEXT_AI_OK);
    });
    await screen.findByTestId("ai-filled-hint");

    // Fresh wait-typed content preserved; stale content stayed gone (cleared).
    expect(getField("homework").value).toBe("FRESH content typed during wait");
    expect(getField("topics").value).toBe("AI topics");
    expect(getField("assessment").value).toBe("AI assessment");
    expect(getField("plan").value).toBe("AI plan");
  });

  it("audio path: empty form → click Transcribe → type during wait → populate preserves typing", async () => {
    const user = userEvent.setup();
    const dfd = deferred<TranscribeAndGenerateResult>();
    transcribeAndGenerateActionMock.mockReturnValue(dfd.promise);
    renderPanel({ blobEnabled: true });

    // Switch to record tab + emit a fake audio via the AudioInputTabs stub.
    await user.click(screen.getByTestId("stub-set-tab-record"));
    await user.click(screen.getByTestId("stub-emit-audio"));

    // Click Transcribe & generate.
    await user.click(screen.getByTestId("ai-transcribe-btn"));
    expect(transcribeAndGenerateActionMock).toHaveBeenCalledTimes(1);

    // Tutor types during the long transcribe wait.
    await user.type(getField("plan"), "tutor wrote a plan from memory");

    // Transcribe returns.
    await act(async () => {
      dfd.resolve(AUDIO_AI_OK);
    });
    await screen.findByTestId("ai-filled-hint");

    // Tutor's typed plan is preserved.
    expect(getField("plan").value).toBe("tutor wrote a plan from memory");
    // Other fields filled from AI.
    expect(getField("topics").value).toBe("AI audio topics");
    expect(getField("homework").value).toBe("AI audio homework");
    expect(getField("assessment").value).toBe("AI audio assessment");
  });

  it("multiple wait-time edits all survive populate (every dirty field is preserved)", async () => {
    const user = userEvent.setup();
    const dfd = deferred<GenerateNoteResult>();
    generateNoteFromTextActionMock.mockReturnValue(dfd.promise);
    renderPanel();

    await user.type(getSessionTextarea(), "session summary");
    await user.click(screen.getByTestId("ai-generate-btn"));

    // Tutor edits multiple fields during the wait.
    await user.type(getField("topics"), "tutor topics");
    await user.type(getField("plan"), "tutor plan");

    await act(async () => {
      dfd.resolve(TEXT_AI_OK);
    });
    await screen.findByTestId("ai-filled-hint");

    expect(getField("topics").value).toBe("tutor topics");
    expect(getField("plan").value).toBe("tutor plan");
    expect(getField("homework").value).toBe("AI homework");
    expect(getField("assessment").value).toBe("AI assessment");
  });
});

