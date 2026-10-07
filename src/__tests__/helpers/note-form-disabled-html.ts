/**
 * Server-HTML checks for the new-note form. The Jest hydration test and the
 * Playwright hydration spec both import this module. Each passes its own
 * `expect` so a failure is reported by that runner.
 */

/** Attribute, not Tailwind's `disabled:` utility (that is `disabled:`). */
export const DISABLED_ATTR = /(?:^|\s)disabled(?:=|\s|>)/;

type NoteFormExpect = (actual: string | string[]) => {
  toHaveLength(length: number): unknown;
  toMatch(pattern: RegExp): unknown;
};

export function openTagAt(html: string, markerIndex: number): string {
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

export function openTagsNamed(html: string, tagName: string): string[] {
  const out: string[] = [];
  for (const match of html.matchAll(new RegExp(`<${tagName}\\b`, "gi"))) {
    out.push(openTagAt(html, match.index ?? 0));
  }
  return out;
}

export function formSlices(html: string): string[] {
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

export function expectControlsDisabled<E>(formHtml: string, expect: E): void {
  // Jest and Playwright export different `expect` types. Both implement
  // toHaveLength and toMatch; the cast keeps those calls on the caller's expect.
  const check = expect as NoteFormExpect;
  const textareas = openTagsNamed(formHtml, "textarea");
  const selects = openTagsNamed(formHtml, "select");
  const inputs = openTagsNamed(formHtml, "input").filter(
    (tag) => !/\btype="hidden"/.test(tag)
  );
  const buttons = openTagsNamed(formHtml, "button");
  const submits = buttons.filter((tag) => /\btype="submit"/.test(tag));

  // Date, session start, session end. Hidden provenance inputs are not tutor fields.
  // The fields are the hydration lock.
  check(inputs).toHaveLength(3);
  check(selects).toHaveLength(1);
  check(textareas).toHaveLength(5);
  check(submits).toHaveLength(1);
  // Clear form + Save note. Save is the submit control. The buttons being
  // disabled is incidental: NewNoteForm also disables them on !hasContent,
  // which is true in SSR.
  check(buttons).toHaveLength(2);

  for (const tag of [...textareas, ...selects, ...inputs, ...submits, ...buttons]) {
    check(tag).toMatch(DISABLED_ATTR);
  }
}
