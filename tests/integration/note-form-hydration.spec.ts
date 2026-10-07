/**
 * Student-detail note form, not whiteboard chrome.
 * note-outbox-share.spec.ts is integration-only, so this file stays out of
 * the wb-regression project. Tag is @notes — there is no @wb-* domain for it.
 *
 * The disabled check reads the navigation response body (server HTML), not a
 * DOM snapshot, so it is the document from before any client script runs.
 */
import { PrismaClient } from "@prisma/client";

import { expect, test } from "./fixtures";
import { seedTestAdmin } from "../visual/helpers";

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

  expect(inputs).toHaveLength(3);
  expect(selects).toHaveLength(1);
  expect(textareas).toHaveLength(5);
  expect(submits).toHaveLength(1);
  expect(buttons).toHaveLength(2);

  for (const tag of [...textareas, ...selects, ...inputs, ...submits, ...buttons]) {
    expect(tag).toMatch(DISABLED_ATTR);
  }
}

test.describe("new note form hydration", { tag: "@notes" }, () => {
  test("note form controls are disabled in the initial document, then keep typed text", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const suffix = `${Date.now()}`;
    const studentName = `Note Hydrate ${suffix}`;
    const typed = `Hydration hold ${suffix}`;

    const adminUserId = await seedTestAdmin();
    const prisma = new PrismaClient();
    let studentId = "";
    try {
      const student = await prisma.student.create({
        data: {
          name: studentName,
          adminUserId,
          parentEmail: `note-hydrate-${suffix}@test.local`,
        },
        select: { id: true },
      });
      studentId = student.id;
    } finally {
      await prisma.$disconnect();
    }

    const response = await page.goto(`/admin/students/${studentId}`, {
      waitUntil: "commit",
    });
    expect(response, "student detail document").not.toBeNull();
    expect(response!.status()).toBe(200);
    const html = await response!.text();
    const forms = formSlices(html);
    // Desktop shell and mobile shell each SSR the same form.
    expect(forms.length).toBeGreaterThanOrEqual(1);
    for (const formHtml of forms) {
      expectControlsDisabled(formHtml);
    }

    await expect(page.getByRole("heading", { name: studentName })).toBeVisible({
      timeout: 15_000,
    });
    const notes = page.locator("#student-section-notes");
    await notes.scrollIntoViewIfNeeded();
    const form = notes.getByTestId("new-note-form");
    for (const selector of [
      "#note-date",
      "#note-template",
      "#note-start-time",
      "#note-end-time",
      "#note-topics",
      "#note-homework",
      "#note-assessment",
      "#note-plan",
      "#note-links",
    ]) {
      await expect(form.locator(selector)).toBeEnabled({ timeout: 15_000 });
    }

    const topics = form.locator("#note-topics");
    await topics.fill(typed);
    await expect(topics).toHaveValue(typed);
    await expect(form.getByRole("button", { name: "Save note" })).toBeEnabled();
  });
});
