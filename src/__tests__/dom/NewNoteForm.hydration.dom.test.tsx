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

/** Attribute, not Tailwind's `disabled:` utility (that is `disabled:`). */
const DISABLED_ATTR = /(?:^|\s)disabled(?:=|\s|>)/;

function openTagAt(html: string, markerIndex: number): string {
  const start = html.lastIndexOf("<", markerIndex);
  if (start < 0) throw new Error("no tag start");
  let quote: '"' | "'" | null = null;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ">") return html.slice(start, i + 1);
  }
  throw new Error("unclosed tag");
}

function openTagsNamed(html: string, tagName: string): string[] {
  const out: string[] = [];
  for (const match of html.matchAll(new RegExp(`<${tagName}\\b`, "gi"))) {
    out.push(openTagAt(html, match.index ?? 0));
  }
  return out;
}

function formSlices(html: string): string[] {
  const slices: string[] = [];
  let from = 0;
  while (from < html.length) {
    const at = html.indexOf('data-testid="new-note-form"', from);
    if (at < 0) break;
    const end = html.indexOf("</form>", at);
    if (end < 0) break;
    slices.push(html.slice(html.lastIndexOf("<form", at), end));
    from = end + "</form>".length;
  }
  return slices;
}

function expectControlsDisabled(formHtml: string) {
  const textareas = openTagsNamed(formHtml, "textarea");
  const selects = openTagsNamed(formHtml, "select");
  const inputs = openTagsNamed(formHtml, "input").filter(
    (tag) => !/\btype="hidden"/.test(tag)
  );
  const buttons = openTagsNamed(formHtml, "button");
  const submits = buttons.filter((tag) => /\btype="submit"/.test(tag));

  // Date, session start, session end. Hidden provenance inputs are not tutor fields.
  expect(inputs).toHaveLength(3);
  expect(selects).toHaveLength(1);
  expect(textareas).toHaveLength(5);
  expect(submits).toHaveLength(1);
  // Clear form + Save note. Both ship disabled; Save is the submit control.
  expect(buttons).toHaveLength(2);

  for (const tag of [...textareas, ...selects, ...inputs, ...submits, ...buttons]) {
    expect(tag).toMatch(DISABLED_ATTR);
  }
}

describe("NewNoteForm server HTML", () => {
  it("disables every textarea, input, select, and the submit button until hydration", () => {
    const html = renderToString(<NewNoteForm studentId="stu_hydrate" />);
    const forms = formSlices(html);
    expect(forms).toHaveLength(1);
    expectControlsDisabled(forms[0]);
  });
});
