/**
 * Admin student detail — Ready to teach banner layout at mid vs wide viewports.
 *
 * Mid-width (sidebar + in-banner CTA, below lg): banner stacks so copy is not
 * crushed and the consent callout stays within banner bounds.
 * Wide (lg+): copy and CTA sit side-by-side.
 *
 * Run:
 *   npx playwright test tests/integration/admin-student-detail-ready-to-teach-banner.spec.ts --project=integration
 */

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import { seedTestAdmin } from "../visual/helpers";

const MID_VIEWPORT = { width: 900, height: 800 };
const WIDE_VIEWPORT = { width: 1280, height: 800 };
const GEOMETRY_TOLERANCE_PX = 4;

async function seedUnclaimedStudent(adminUserId: string): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const student = await prisma.student.create({
      data: {
        name: "Unclaimed Banner Student",
        adminUserId,
        parentEmail: "unclaimed-banner@test.local",
      },
      select: { id: true },
    });
    return student.id;
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("Admin student detail — Ready to teach banner", () => {
  test(
    "mid viewport stacks banner with callout contained inside banner bounds",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      await page.setViewportSize(MID_VIEWPORT);

      const adminUserId = await seedTestAdmin();
      const studentId = await seedUnclaimedStudent(adminUserId);

      await page.goto(`/admin/students/${studentId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByRole("heading", { name: "Unclaimed Banner Student" })).toBeVisible({
        timeout: 15_000,
      });

      const banner = page.getByTestId("student-ready-to-teach-banner");
      const copy = page.getByTestId("student-ready-to-teach-copy");
      const callout = banner.getByTestId("start-wb-consent-callout");

      await expect(banner).toBeVisible();
      await expect(callout).toBeVisible();

      const bannerBox = await banner.boundingBox();
      const copyBox = await copy.boundingBox();
      const calloutBox = await callout.boundingBox();

      expect(bannerBox).not.toBeNull();
      expect(copyBox).not.toBeNull();
      expect(calloutBox).not.toBeNull();

      const b = bannerBox!;
      const c = copyBox!;
      const k = calloutBox!;

      // Stacked layout: callout sits below copy (not crushed side-by-side).
      expect(k.y).toBeGreaterThanOrEqual(c.y + c.height - GEOMETRY_TOLERANCE_PX);

      // Copy uses most of the banner width when stacked (not a narrow crushed column).
      expect(c.width).toBeGreaterThanOrEqual(b.width * 0.55);

      // Callout fully within banner — no horizontal overflow past banner edges.
      expect(k.x).toBeGreaterThanOrEqual(b.x - GEOMETRY_TOLERANCE_PX);
      expect(k.x + k.width).toBeLessThanOrEqual(b.x + b.width + GEOMETRY_TOLERANCE_PX);
      expect(k.y).toBeGreaterThanOrEqual(b.y - GEOMETRY_TOLERANCE_PX);
      expect(k.y + k.height).toBeLessThanOrEqual(b.y + b.height + GEOMETRY_TOLERANCE_PX);
    }
  );

  test(
    "wide viewport places consent callout beside copy",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      await page.setViewportSize(WIDE_VIEWPORT);

      const adminUserId = await seedTestAdmin();
      const studentId = await seedUnclaimedStudent(adminUserId);

      await page.goto(`/admin/students/${studentId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByRole("heading", { name: "Unclaimed Banner Student" })).toBeVisible({
        timeout: 15_000,
      });

      const banner = page.getByTestId("student-ready-to-teach-banner");
      const copy = page.getByTestId("student-ready-to-teach-copy");
      const callout = banner.getByTestId("start-wb-consent-callout");

      await expect(callout).toBeVisible();

      const copyBox = await copy.boundingBox();
      const calloutBox = await callout.boundingBox();

      expect(copyBox).not.toBeNull();
      expect(calloutBox).not.toBeNull();

      const c = copyBox!;
      const k = calloutBox!;

      // Side-by-side: callout starts to the right of copy.
      expect(k.x).toBeGreaterThanOrEqual(c.x + c.width - GEOMETRY_TOLERANCE_PX);

      // Vertically centered in row: midlines approximately aligned.
      const copyMidY = c.y + c.height / 2;
      const calloutMidY = k.y + k.height / 2;
      expect(Math.abs(copyMidY - calloutMidY)).toBeLessThanOrEqual(24);
    }
  );

  test(
    "banner copy, blocked callout, and sidebar initials stay readable in light and dark",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      await page.setViewportSize(WIDE_VIEWPORT);
      const adminUserId = await seedTestAdmin();
      const studentId = await seedUnclaimedStudent(adminUserId);

      for (const theme of ["light", "dark"] as const) {
        await page.addInitScript((next) => {
          localStorage.setItem("mynk-theme", next);
        }, theme);
        await page.goto(`/admin/students/${studentId}?theme=${theme}`, {
          waitUntil: "networkidle",
        });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(
          page.getByTestId("student-ready-to-teach-banner").getByTestId("start-wb-consent-callout")
        ).toBeVisible();

        const ratios = await page.evaluate(() => {
          function parseRgb(value: string) {
            const match = value.match(/rgba?\(([^)]+)\)/);
            if (!match) return null;
            const parts = match[1].split(/[\s,/]+/).map(Number);
            return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
          }
          function composite(
            front: { r: number; g: number; b: number; a: number },
            back: { r: number; g: number; b: number; a: number }
          ) {
            const a = front.a;
            return {
              r: front.r * a + back.r * (1 - a),
              g: front.g * a + back.g * (1 - a),
              b: front.b * a + back.b * (1 - a),
              a: 1,
            };
          }
          function paintedBackground(el: Element) {
            const chain: Element[] = [];
            let node: Element | null = el;
            while (node) {
              chain.push(node);
              node = node.parentElement;
            }
            let bg = { r: 255, g: 255, b: 255, a: 1 };
            for (const ancestor of chain.reverse()) {
              const color = parseRgb(getComputedStyle(ancestor).backgroundColor);
              if (color && color.a > 0) bg = composite(color, bg);
            }
            return bg;
          }
          function contrast(el: Element) {
            const fg = parseRgb(getComputedStyle(el).color);
            if (!fg) return 0;
            const bg = paintedBackground(el);
            const paint = fg.a < 1 ? composite(fg, bg) : fg;
            const lin = (channel: number) => {
              const c = channel / 255;
              return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            };
            const lum = (color: { r: number; g: number; b: number }) =>
              0.2126 * lin(color.r) + 0.7152 * lin(color.g) + 0.0722 * lin(color.b);
            const hi = Math.max(lum(paint), lum(bg));
            const lo = Math.min(lum(paint), lum(bg));
            return (hi + 0.05) / (lo + 0.05);
          }
          const callout = document
            .querySelector("[data-testid='student-ready-to-teach-banner']")
            ?.querySelector("[data-testid='start-wb-consent-callout']");
          const copy = document.querySelector("[data-testid='student-ready-to-teach-copy']");
          const mark = document.querySelector("[data-testid='admin-sidebar-user-mark']");
          const title = callout?.querySelector("[data-slot='alert-title']");
          const description = callout?.querySelector("[data-slot='alert-description']");
          const link = callout?.querySelector("a");
          const eyebrow = copy?.querySelector("p");
          const body = copy?.querySelectorAll("p")[1];
          if (!title || !description || !link || !eyebrow || !body || !mark) {
            return null;
          }
          return {
            title: contrast(title),
            description: contrast(description),
            link: contrast(link),
            eyebrow: contrast(eyebrow),
            body: contrast(body),
            initials: contrast(mark),
          };
        });

        expect(ratios, theme).not.toBeNull();
        // WCAG AA for normal text. Independent of the token values.
        for (const [name, ratio] of Object.entries(ratios!)) {
          expect(ratio, `${theme} ${name}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  );
});
