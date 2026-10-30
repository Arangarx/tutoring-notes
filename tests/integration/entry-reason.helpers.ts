/**
 * Shared oracle for org UX W4: a disabled (or limited) Start / Open room / Join
 * control shows its reason where a person looks for it.
 *
 * Semantic, not pixel-exact (visual-layout-oracles.mdc):
 *   - the reason is visible and not clipped,
 *   - it is wired to the control with aria-describedby (not tooltip-only),
 *   - it sits directly under the control and starts at the control's left edge.
 */
import { expect, type Locator } from "@playwright/test";

/** Slack for subpixel rounding and fonts. */
const TOLERANCE_PX = 4;

export async function expectReasonUnderControl(
  control: Locator,
  reason: Locator,
  expectedText: string | RegExp
): Promise<void> {
  await expect(reason).toBeVisible();
  await expect(reason).toHaveText(expectedText);

  // Linked to the control for assistive tech: the control points at this exact line.
  const reasonId = await reason.getAttribute("id");
  expect(reasonId, "reason line needs an id").toBeTruthy();
  await expect(control).toHaveAttribute("aria-describedby", reasonId as string);

  // Directly under the control, left edges aligned.
  const controlBox = await control.boundingBox();
  const reasonBox = await reason.boundingBox();
  expect(controlBox, "control box").not.toBeNull();
  expect(reasonBox, "reason box").not.toBeNull();
  expect(reasonBox!.y).toBeGreaterThanOrEqual(controlBox!.y + controlBox!.height - TOLERANCE_PX);
  expect(Math.abs(reasonBox!.x - controlBox!.x)).toBeLessThanOrEqual(TOLERANCE_PX);
  // The reason does not run off the right edge of the viewport (not clipped).
  const viewport = control.page().viewportSize();
  if (viewport) {
    expect(reasonBox!.x + reasonBox!.width).toBeLessThanOrEqual(viewport.width + TOLERANCE_PX);
  }
}
