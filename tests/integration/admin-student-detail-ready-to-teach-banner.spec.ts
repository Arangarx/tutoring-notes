/**
 * Admin student detail — Ready to teach banner layout at mid vs wide viewports.
 *
 * The blocked card stays inside the page column at mid and wide widths, stacked
 * under the header rather than beside another column. Light and dark text
 * stays readable.
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

      const column = page.getByTestId("student-detail-column");
      const card = page.getByTestId("student-critical-card");
      const session = page.getByTestId("student-session-card");

      await expect(column).toBeVisible();
      await expect(card).toBeVisible();

      const columnBox = await column.boundingBox();
      const cardBox = await card.boundingBox();
      const sessionBox = await session.boundingBox();

      expect(columnBox).not.toBeNull();
      expect(cardBox).not.toBeNull();
      expect(sessionBox).not.toBeNull();

      const columnBounds = columnBox!;
      const blocked = cardBox!;
      const below = sessionBox!;

      // The card is inside the page column.
      expect(blocked.x).toBeGreaterThanOrEqual(columnBounds.x - GEOMETRY_TOLERANCE_PX);
      expect(blocked.x + blocked.width).toBeLessThanOrEqual(
        columnBounds.x + columnBounds.width + GEOMETRY_TOLERANCE_PX
      );
      // Stacked: the session card sits below the blocked card, sharing its left edge.
      expect(below.y).toBeGreaterThanOrEqual(blocked.y + blocked.height - GEOMETRY_TOLERANCE_PX);
      expect(Math.abs(below.x - blocked.x)).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
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

      const column = page.getByTestId("student-detail-column");
      const card = page.getByTestId("student-critical-card");
      const session = page.getByTestId("student-session-card");
      await expect(card).toBeVisible();

      const columnBox = await column.boundingBox();
      const cardBox = await card.boundingBox();
      const sessionBox = await session.boundingBox();
      expect(columnBox).not.toBeNull();
      expect(cardBox).not.toBeNull();
      expect(sessionBox).not.toBeNull();

      const columnBounds = columnBox!;
      const blocked = cardBox!;
      const below = sessionBox!;

      expect(blocked.x).toBeGreaterThanOrEqual(columnBounds.x - GEOMETRY_TOLERANCE_PX);
      expect(blocked.x + blocked.width).toBeLessThanOrEqual(
        columnBounds.x + columnBounds.width + GEOMETRY_TOLERANCE_PX
      );
      expect(below.y).toBeGreaterThanOrEqual(blocked.y + blocked.height - GEOMETRY_TOLERANCE_PX);
      expect(Math.abs(below.x - blocked.x)).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
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
        await expect(page.getByTestId("student-critical-card")).toBeVisible();

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
          const card = document.querySelector("[data-testid='student-critical-card']");
          const body = card?.querySelector("p");
          const mark = document.querySelector("[data-testid='admin-sidebar-user-mark']");
          if (!body || !mark) {
            return null;
          }
          return {
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
