/**
 * @jest-environment jsdom
 */

/**
 * Regression tests for `NewNoteForm.populate()` merge-into-empty contract.
 *
 * Adversarial review #6 in `docs/BACKLOG.md` (note save vs transcribe race):
 * if a tutor types into the form while a transcribe/generate action is
 * in-flight, populate() must NOT clobber what they typed when the AI
 * response eventually arrives. This file pins the form-level guarantee.
 *
 * Flow-level coverage of the checkOverwriteAndPrepare clear-on-confirm
 * interaction lives in `AiAssistPanel.race.dom.test.tsx`.
 */

import { createRef } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// NewNoteForm imports `createNote` from "./actions". Mock it so the test
// doesn't drag the server-action module into a jsdom run. We never submit
// in these tests; the mock just satisfies the import.
jest.mock("@/app/admin/students/[id]/actions", () => ({
  __esModule: true,
  createNote: jest.fn(),
}));

import NewNoteForm, {
  type NewNoteFormHandle,
  type PopulatePayload,
} from "@/app/admin/students/[id]/NewNoteForm";

const FULL_AI_PAYLOAD: PopulatePayload = {
  topics: "AI topics",
  homework: "AI homework",
  assessment: "AI assessment",
  plan: "AI plan",
  links: "https://ai.example.com",
  promptVersion: "v7-test",
  recordingIds: ["rec-1", "rec-2"],
};

type FieldName = "topics" | "homework" | "assessment" | "plan" | "links";

function getField(name: FieldName): HTMLTextAreaElement {
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

function renderForm() {
  const ref = createRef<NewNoteFormHandle>();
  render(<NewNoteForm ref={ref} studentId="student-1" />);
  if (!ref.current) throw new Error("ref not attached after mount");
  return ref as { current: NewNoteFormHandle };
}

/**
 * Wraps an imperative ref call in act() so React flushes the resulting
 * state updates BEFORE the assertion runs. Without this, the useImperative-
 * Handle closure captured at the previous render keeps reading stale state.
 */
async function populate(
  ref: { current: NewNoteFormHandle },
  payload: PopulatePayload
): Promise<void> {
  await act(async () => {
    ref.current.populate(payload);
  });
}

async function clearForm(ref: { current: NewNoteFormHandle }): Promise<void> {
  await act(async () => {
    ref.current.clear();
  });
}

describe("NewNoteForm.populate() — merge-into-empty contract", () => {
  describe("happy paths (no tutor typing)", () => {
    it("fills every AI-fillable field when the form starts empty", async () => {
      const ref = renderForm();
      await populate(ref, FULL_AI_PAYLOAD);
      expect(getField("topics").value).toBe("AI topics");
      expect(getField("homework").value).toBe("AI homework");
      expect(getField("assessment").value).toBe("AI assessment");
      expect(getField("plan").value).toBe("AI plan");
      expect(getField("links").value).toBe("https://ai.example.com");
    });

    it("leaves empty fields empty when the AI payload omits those values", async () => {
      const ref = renderForm();
      await populate(ref, {
        ...FULL_AI_PAYLOAD,
        homework: "",
        plan: "",
        links: "",
      });
      expect(getField("topics").value).toBe("AI topics");
      expect(getField("homework").value).toBe("");
      expect(getField("assessment").value).toBe("AI assessment");
      expect(getField("plan").value).toBe("");
      expect(getField("links").value).toBe("");
    });
  });

  describe("race protection — tutor typed before populate", () => {
    it("preserves a tutor-typed topics value when populate would overwrite", async () => {
      const user = userEvent.setup();
      const ref = renderForm();
      await user.type(getField("topics"), "tutor-typed topics");
      await populate(ref, FULL_AI_PAYLOAD);
      expect(getField("topics").value).toBe("tutor-typed topics");
      expect(getField("homework").value).toBe("AI homework");
      expect(getField("assessment").value).toBe("AI assessment");
      expect(getField("plan").value).toBe("AI plan");
      expect(getField("links").value).toBe("https://ai.example.com");
    });

    it("preserves typed content across MULTIPLE dirty fields, fills the rest", async () => {
      const user = userEvent.setup();
      const ref = renderForm();
      await user.type(getField("homework"), "tutor homework");
      await user.type(getField("plan"), "tutor plan");
      await populate(ref, FULL_AI_PAYLOAD);
      expect(getField("topics").value).toBe("AI topics");
      expect(getField("homework").value).toBe("tutor homework");
      expect(getField("assessment").value).toBe("AI assessment");
      expect(getField("plan").value).toBe("tutor plan");
      expect(getField("links").value).toBe("https://ai.example.com");
    });

    it("preserves ALL tutor-typed content when every field is dirty (zero AI clobber)", async () => {
      const user = userEvent.setup();
      const ref = renderForm();
      await user.type(getField("topics"), "T");
      await user.type(getField("homework"), "H");
      await user.type(getField("assessment"), "A");
      await user.type(getField("plan"), "P");
      await user.type(getField("links"), "L");
      await populate(ref, FULL_AI_PAYLOAD);
      expect(getField("topics").value).toBe("T");
      expect(getField("homework").value).toBe("H");
      expect(getField("assessment").value).toBe("A");
      expect(getField("plan").value).toBe("P");
      expect(getField("links").value).toBe("L");
    });

    it("treats whitespace-only content as empty (AI fills as if blank)", async () => {
      const user = userEvent.setup();
      const ref = renderForm();
      await user.type(getField("topics"), "   ");
      await user.type(getField("homework"), "\t\n");
      await populate(ref, FULL_AI_PAYLOAD);
      expect(getField("topics").value).toBe("AI topics");
      expect(getField("homework").value).toBe("AI homework");
    });

    it("preserves the links field when the tutor typed there but everything else was blank", async () => {
      const user = userEvent.setup();
      const ref = renderForm();
      await user.type(getField("links"), "https://tutor-link.example.com");
      await populate(ref, FULL_AI_PAYLOAD);
      expect(getField("links").value).toBe("https://tutor-link.example.com");
      expect(getField("topics").value).toBe("AI topics");
    });
  });

  describe("time fields — existing merge-into-empty (regression coverage)", () => {
    it("preserves a tutor-typed startTime when payload would overwrite", async () => {
      const user = userEvent.setup();
      const ref = renderForm();
      const startInput = screen.getByLabelText(/session start/i) as HTMLInputElement;
      await user.type(startInput, "14:30");
      await populate(ref, {
        ...FULL_AI_PAYLOAD,
        sessionStartedAt: new Date("2026-05-19T20:00:00.000Z").toISOString(),
      });
      expect(startInput.value).toBe("14:30");
    });

    it("fills startTime / endTime when both were blank", async () => {
      const ref = renderForm();
      const startInput = screen.getByLabelText(/session start/i) as HTMLInputElement;
      const endInput = screen.getByLabelText(/session end/i) as HTMLInputElement;
      // Build a deterministic local-timezone date so the assertion is stable
      // across TZ (formatLocalTimeSnapped uses the runtime TZ).
      const local = new Date();
      local.setHours(10, 30, 0, 0);
      const localIso = local.toISOString();
      await populate(ref, {
        ...FULL_AI_PAYLOAD,
        sessionStartedAt: localIso,
        sessionEndedAt: localIso,
      });
      expect(startInput.value).toBe("10:30");
      expect(endInput.value).toBe("10:30");
    });
  });

  describe("AI provenance fields — always set (NOT subject to merge-into-empty)", () => {
    it("flips the hidden aiGenerated input to 'true' on populate", async () => {
      const ref = renderForm();
      const aiFlag = document.querySelector('input[name="aiGenerated"]') as HTMLInputElement;
      expect(aiFlag.value).toBe("false");
      await populate(ref, FULL_AI_PAYLOAD);
      expect(aiFlag.value).toBe("true");
    });

    it("records the AI prompt version even when all text fields are dirty", async () => {
      const user = userEvent.setup();
      const ref = renderForm();
      await user.type(getField("topics"), "tutor only");
      await populate(ref, FULL_AI_PAYLOAD);
      const promptVersionField = document.querySelector(
        'input[name="aiPromptVersion"]'
      ) as HTMLInputElement;
      expect(promptVersionField.value).toBe("v7-test");
    });

    it("attaches recording IDs as hidden inputs (one per id)", async () => {
      const ref = renderForm();
      await populate(ref, FULL_AI_PAYLOAD);
      const recordingFields = document.querySelectorAll(
        'input[name="recordingId"]'
      ) as NodeListOf<HTMLInputElement>;
      expect(recordingFields).toHaveLength(2);
      expect(Array.from(recordingFields).map((el) => el.value)).toEqual([
        "rec-1",
        "rec-2",
      ]);
    });
  });

  describe("clear() then populate() — discard-and-refill flow", () => {
    it("after clear, populate fills all fields fresh (the discard-mine-use-AI path)", async () => {
      const user = userEvent.setup();
      const ref = renderForm();
      await user.type(getField("topics"), "original tutor content");
      await user.type(getField("homework"), "tutor hw");
      // checkOverwriteAndPrepare in AiAssistPanel does this on confirm.
      await clearForm(ref);
      expect(getField("topics").value).toBe("");
      expect(getField("homework").value).toBe("");
      await populate(ref, FULL_AI_PAYLOAD);
      expect(getField("topics").value).toBe("AI topics");
      expect(getField("homework").value).toBe("AI homework");
      expect(getField("assessment").value).toBe("AI assessment");
      expect(getField("plan").value).toBe("AI plan");
      expect(getField("links").value).toBe("https://ai.example.com");
    });

    it("after clear + tutor-types-during-wait, populate preserves the new typing", async () => {
      const user = userEvent.setup();
      const ref = renderForm();
      // 1. Tutor had typed something earlier.
      await user.type(getField("topics"), "stale tutor content");
      // 2. checkOverwriteAndPrepare's clear() runs (simulating user confirm).
      await clearForm(ref);
      // 3. AI is in-flight. Tutor types fresh content.
      await user.type(getField("homework"), "fresh homework typed during AI wait");
      // 4. AI returns, populate fires.
      await populate(ref, FULL_AI_PAYLOAD);
      // Fresh content preserved; cleared fields get AI values.
      expect(getField("homework").value).toBe("fresh homework typed during AI wait");
      expect(getField("topics").value).toBe("AI topics");
      expect(getField("assessment").value).toBe("AI assessment");
      expect(getField("plan").value).toBe("AI plan");
      expect(getField("links").value).toBe("https://ai.example.com");
    });
  });

  describe("hasUserContent()", () => {
    it("returns false on a fresh form", () => {
      const ref = renderForm();
      expect(ref.current.hasUserContent()).toBe(false);
    });

    it("returns true once the tutor types into any of topics/homework/assessment/plan", async () => {
      const user = userEvent.setup();
      const ref = renderForm();
      await user.type(getField("plan"), "x");
      expect(ref.current.hasUserContent()).toBe(true);
    });

    it("returns true after AI populate fills the form", async () => {
      const ref = renderForm();
      await populate(ref, FULL_AI_PAYLOAD);
      expect(ref.current.hasUserContent()).toBe(true);
    });

    it("returns false after clear() — even if AI populate happened first", async () => {
      const ref = renderForm();
      await populate(ref, FULL_AI_PAYLOAD);
      await clearForm(ref);
      expect(ref.current.hasUserContent()).toBe(false);
    });

    it("treats whitespace-only typed content as empty", async () => {
      const user = userEvent.setup();
      const ref = renderForm();
      await user.type(getField("topics"), "    ");
      expect(ref.current.hasUserContent()).toBe(false);
    });
  });
});
