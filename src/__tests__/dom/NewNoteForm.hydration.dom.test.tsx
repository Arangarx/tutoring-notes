/**
 * @jest-environment jsdom
 */

/**
 * Server HTML for the new-note form must ship every tutor control disabled.
 * A keystroke before React hydrates changes the DOM only; the next commit
 * writes state "" back over it. renderToString does not run effects, so
 * useHydrated() is still false and the disabled attribute has to be on the
 * markup itself.
 *
 * red-proof is temporarily removing `disabled={!hydrated}` from NewNoteForm (do not actually remove it).
 */

import { renderToString } from "react-dom/server";

jest.mock("@/app/admin/students/[id]/actions", () => ({
  __esModule: true,
  createNote: jest.fn(),
}));

import NewNoteForm from "@/app/admin/students/[id]/NewNoteForm";
import {
  expectControlsDisabled,
  formSlices,
} from "@/__tests__/helpers/note-form-disabled-html";

describe("NewNoteForm server HTML", () => {
  it("disables every textarea, input, select, and the submit button until hydration", () => {
    const html = renderToString(<NewNoteForm studentId="stu_hydrate" />);
    const forms = formSlices(html);
    expect(forms).toHaveLength(1);
    // The fields are the hydration lock. The buttons being disabled is incidental.
    expectControlsDisabled(forms[0], expect);
  });
});
