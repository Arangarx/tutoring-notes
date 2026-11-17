/**
 * Operator timezone on organization create.
 * The schedule the owner sees is the oracle: week label and appointment
 * clock are computed here with Intl, not copied from the product formatter.
 */
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../../test-tags";
import { TEST_ADMIN } from "../../visual/helpers";

const OPERATOR_STATE = "tests/integration/.auth/tutor.json";
const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

const EASTERN = "America/New_York";
const DENVER = "America/Denver";
/** 12:30 AM in New York, 10:30 PM the previous evening in Denver. */
const START_AT = new Date("2026-01-12T05:30:00.000Z");
const END_AT = new Date("2026-01-12T06:30:00.000Z");

function uniqueName(): string {
  return `PW Zone ${Date.now()} ${Math.random().toString(36).slice(2, 6)}`;
}

function part(instant: Date, timeZone: string, type: Intl.DateTimeFormatPartTypes, options: Intl.DateTimeFormatOptions): string {
  const found = new Intl.DateTimeFormat("en-US", { timeZone, ...options })
    .formatToParts(instant)
    .find((entry) => entry.type === type);
  return found?.value ?? "";
}

/** Wall-clock time the owner should read, e.g. "12:30 AM". */
function expectedLocalTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  })
    .format(instant)
    .replace(/[\u202f\u00a0]/g, " ");
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/** "Week of Nov 16, 2026" for Monday of `now` in `timeZone`. */
function expectedWeekOf(now: Date, timeZone: string): string {
  const weekday = part(now, timeZone, "weekday", { weekday: "short" });
  const year = Number(part(now, timeZone, "year", { year: "numeric" }));
  const month = Number(part(now, timeZone, "month", { month: "2-digit" }));
  const day = Number(part(now, timeZone, "day", { day: "2-digit" }));
  const index = WEEKDAY_INDEX[weekday];
  if (!index) throw new Error(`Unexpected weekday ${weekday}`);
  const monday = new Date(Date.UTC(year, month - 1, day));
  monday.setUTCDate(monday.getUTCDate() - (index - 1));
  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(monday);
  return `Week of ${monthName} ${monday.getUTCDate()}, ${monday.getUTCFullYear()}`;
}

function normalizeClock(text: string): string {
  return text.replace(/[\u202f\u00a0]/g, " ");
}

async function withPrisma<T>(run: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("organization time zone", { tag: [TAG.ORG, TAG.WB_CHROME] }, () => {
  test.use({ storageState: OPERATOR_STATE });

  test("an org created in Eastern shows that zone on the schedule", async ({ page }) => {
    test.setTimeout(120_000);
    const name = uniqueName();
    let organizationId = "";
    try {
      await page.goto("/admin/orgs");
      await page.locator("#org-name").fill(name);
      await page.locator("#org-owner-email").fill(TEST_ADMIN.email);
      await page.locator("#org-timezone").selectOption(EASTERN);
      await page.getByRole("button", { name: "Create organization" }).click();
      await page.waitForURL(/\/admin\/orgs\/[0-9a-f-]{36}$/i, { timeout: 30_000 });
      organizationId = new URL(page.url()).pathname.split("/").pop() ?? "";
      await expect(page.locator("#org-timezone")).toHaveValue(EASTERN);

      const appointmentId = await withPrisma(async (prisma) => {
        const owner = await prisma.adminUser.findUniqueOrThrow({
          where: { email: TEST_ADMIN.email },
          select: { id: true },
        });
        const student = await prisma.student.create({
          data: {
            name: "Casey Learner",
            adminUserId: null,
            organizationId,
            parentEmail: null,
          },
        });
        await prisma.organizationLearner.create({
          data: {
            studentId: student.id,
            organizationId,
            givenName: "Casey",
            familyName: "Learner",
            createdByAdminUserId: owner.id,
          },
        });
        const row = await prisma.scheduledSession.create({
          data: {
            adminUserId: owner.id,
            studentId: student.id,
            date: new Date("2026-01-12T00:00:00.000Z"),
            startTime: "00:30",
            endTime: "01:30",
            startAt: START_AT,
            endAt: END_AT,
            plannedDurationMinutes: 60,
            subject: "Zone check",
          },
        });
        return row.id;
      });

      await page.goto(`/admin/organization/${organizationId}`);
      const easternNow = expectedWeekOf(new Date(), EASTERN);
      await expect(page.getByTestId("org-schedule-week")).toContainText(easternNow);
      await expect(page.getByTestId("org-schedule-week")).toContainText(EASTERN);

      const row = page.getByTestId(`org-appointment-${appointmentId}`);
      const visible = normalizeClock((await row.textContent()) ?? "");
      const easternTime = expectedLocalTime(START_AT, EASTERN);
      const denverTime = expectedLocalTime(START_AT, DENVER);
      const easternDay = `${part(START_AT, EASTERN, "month", { month: "short" })} ${part(START_AT, EASTERN, "day", { day: "numeric" })}`;
      const denverDay = `${part(START_AT, DENVER, "month", { month: "short" })} ${part(START_AT, DENVER, "day", { day: "numeric" })}`;
      expect(easternTime).not.toBe(denverTime);
      expect(easternDay).not.toBe(denverDay);
      expect(visible).toContain(easternDay);
      expect(visible).toContain(easternTime);
      expect(visible).not.toContain(denverTime);
      expect(visible).not.toContain(denverDay);
    } finally {
      if (organizationId) {
        await withPrisma(async (prisma) => {
          await prisma.student.deleteMany({ where: { organizationId } });
          await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
        });
      }
    }
  });

  test("a time zone outside the United States list is refused", async ({ page }) => {
    const name = uniqueName();
    await page.goto("/admin/orgs");
    await page.locator("#org-name").fill(name);
    await page.locator("#org-owner-email").fill(TEST_ADMIN.email);
    await page.locator("#org-timezone").evaluate((select: HTMLSelectElement) => {
      const option = document.createElement("option");
      option.value = "Europe/London";
      option.text = "London";
      select.append(option);
      select.value = "Europe/London";
    });
    await page.getByRole("button", { name: "Create organization" }).click();
    await expect(page.getByTestId("org-create-error")).toHaveText(
      "Choose a United States time zone."
    );
    await expect(page).toHaveURL(/\/admin\/orgs\?/);
    await expect(page.getByRole("link", { name })).toHaveCount(0);
  });
});
