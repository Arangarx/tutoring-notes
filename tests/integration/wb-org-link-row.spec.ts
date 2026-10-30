/**
 * W2 — org list rows are the same full-width card links as student roster rows.
 * Oracles are the row the user sees: role=link, href, width vs its list,
 * a trailing chevron centered on the row, and a click on the row's right edge.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import { TEST_ADMIN } from "../visual/helpers";

const { applyWbRegressionLocalDatabaseEnv } = require("../../scripts/wb-regression-local-db.cjs");
applyWbRegressionLocalDatabaseEnv();

const prisma = new PrismaClient();

function uniq(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function playwrightAdminId(): Promise<string> {
  const admin = await prisma.adminUser.findUnique({
    where: { email: TEST_ADMIN.email },
    select: { id: true },
  });
  if (!admin) throw new Error("Playwright admin is missing from the local database.");
  return admin.id;
}

/**
 * The whole row is the click target, and it fills its list.
 * `list` is the ul that contains the row, not the surrounding card.
 */
async function expectFullWidthCardLink(
  page: Page,
  list: Locator,
  row: Locator,
  expectedHref: string,
  title: string
) {
  await expect(row).toBeVisible();
  await expect(row).toHaveRole("link");
  await expect(row).toHaveAttribute("href", expectedHref);

  const radius = await row.evaluate((el) =>
    parseFloat(getComputedStyle(el).borderTopLeftRadius)
  );
  const border = await row.evaluate((el) =>
    parseFloat(getComputedStyle(el).borderTopWidth)
  );
  expect(radius, "card row is rounded").toBeGreaterThan(0);
  expect(border, "card row has a border").toBeGreaterThan(0);

  await row.scrollIntoViewIfNeeded();
  const listBox = await list.boundingBox();
  const rowBox = await row.boundingBox();
  expect(listBox, "list box").not.toBeNull();
  expect(rowBox, "row box").not.toBeNull();
  // Row fills the list (equal width), not a shrink-wrapped text link.
  expect(Math.abs(rowBox!.width - listBox!.width)).toBeLessThanOrEqual(4);

  const chevron = row.locator("svg");
  await expect(chevron).toHaveCount(1);
  const chevronBox = await chevron.boundingBox();
  const titleBox = await row.getByText(title, { exact: true }).boundingBox();
  expect(chevronBox, "chevron box").not.toBeNull();
  expect(titleBox, "title box").not.toBeNull();
  // Chevron is vertically centered in the row, and sits past the title.
  const rowMid = rowBox!.y + rowBox!.height / 2;
  const chevronMid = chevronBox!.y + chevronBox!.height / 2;
  expect(Math.abs(rowMid - chevronMid)).toBeLessThanOrEqual(4);
  expect(chevronBox!.x).toBeGreaterThan(titleBox!.x + titleBox!.width);

  const clickX = listBox!.x + listBox!.width - 8;
  const clickY = rowMid;
  expect(clickX, "click is inside the row").toBeGreaterThanOrEqual(rowBox!.x);
  expect(clickX).toBeLessThanOrEqual(rowBox!.x + rowBox!.width);
  expect(clickX, "click is away from the title").toBeGreaterThan(
    titleBox!.x + titleBox!.width
  );

  const hrefAtPoint = await page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y);
    return hit?.closest("a")?.getAttribute("href") ?? null;
  }, { x: clickX, y: clickY });
  expect(hrefAtPoint, "right edge of the list is the row link").toBe(expectedHref);

  await page.mouse.click(clickX, clickY);
  await page.waitForURL(
    (url) => url.pathname === expectedHref,
    { timeout: 30_000 }
  );
  expect(new URL(page.url()).pathname).toBe(expectedHref);
}

test.describe("organization and roster link rows", () => {
  test("org list rows are full-width click targets", { tag: [TAG.ORG, TAG.WB_CHROME] }, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const adminId = await playwrightAdminId();
    const name = uniq("PW Link Row");
    const org = await prisma.organization.create({
      data: {
        name,
        status: "active",
        timezone: "America/Denver",
        createdByOperatorId: TEST_ADMIN.email,
        members: {
          create: { adminUserId: adminId, roles: ["owner", "admin"] },
        },
      },
    });

    await page.goto("/admin/organization");
    const staffRow = page.getByTestId(`org-staff-link-${org.id}`);
    const staffList = page.getByTestId("org-staff-index").getByRole("list");
    await expect(staffRow).toContainText("Active · Owner, Admin");
    await expect(staffRow).not.toContainText("active.");
    await expectFullWidthCardLink(
      page,
      staffList,
      staffRow,
      `/admin/organization/${org.id}`,
      name
    );

    await page.goto("/admin/orgs");
    const operatorRow = page.getByRole("link", { name });
    const operatorList = page.getByRole("list").filter({ has: operatorRow });
    await expect(operatorRow).toContainText("Active");
    await expect(operatorRow).not.toContainText("active");
    await expectFullWidthCardLink(
      page,
      operatorList,
      operatorRow,
      `/admin/orgs/${org.id}`,
      name
    );
  });

  test("student roster rows keep their click target", { tag: [TAG.ORG, TAG.WB_CHROME] }, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const adminId = await playwrightAdminId();
    const name = uniq("PW Roster Row");
    const student = await prisma.student.create({
      data: { name, adminUserId: adminId },
    });

    await page.goto("/admin/students");
    const row = page.getByRole("link", { name });
    const list = page.getByRole("list").filter({ has: row });
    await expectFullWidthCardLink(
      page,
      list,
      row,
      `/admin/students/${student.id}`,
      name
    );
  });
});
