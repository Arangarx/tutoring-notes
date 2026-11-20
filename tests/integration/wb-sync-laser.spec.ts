import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  dragLaserWhileHeld,
  openTutorAndStudent,
  pageForRole,
  peerOf,
  poisonAndRestoreLaserTrail,
  readLaserTrailPaints,
  readSceneElementSummary,
  seedWbLiveSyncSession,
  type LaserTrailPaint,
  type WbSyncRole,
} from "./whiteboard-live-sync.helpers";
import { WB_LASER_STUDENT_HEX, WB_LASER_TUTOR_HEX } from "../../src/styles/token-values";
import { TAG } from "../test-tags";

/**
 * Laser-pointer bidirectional sync.
 *
 * A laser drag is ephemeral: Excalidraw paints the other peer's trail as an
 * SVG path under `.SVGLayer`, colored from that peer's collaborator
 * `pointer.laserColor`. It is not a scene element. The oracle is the other
 * peer's painted path: fill attribute and computed fill both match the
 * author's token (`WB_LASER_TUTOR_HEX` / `WB_LASER_STUDENT_HEX`).
 *
 * The trail decays after pointer-up, so the oracle runs while the drag is held.
 * `__WBX_FORCE_LIVE_SCENE__` cannot poison a trail (there is no scene element).
 * The red-proof rewrites the path fill in the page, shows the color oracle
 * fail, and writes the token back — in one turn, before the next animation frame.
 *
 * Gate: `npx playwright test tests/integration/wb-sync-laser.spec.ts --project=wb-regression`
 */
const LASER_TAGS = [TAG.WB_STROKES, TAG.WB_SYNC] as const;

const LASER_DRAG = {
  tutor: {
    from: { xFrac: 0.26, yFrac: 0.32 },
    to: { xFrac: 0.48, yFrac: 0.58 },
  },
  student: {
    from: { xFrac: 0.26, yFrac: 0.56 },
    to: { xFrac: 0.48, yFrac: 0.76 },
  },
} as const;

const EXPECTED_TRAIL: Record<WbSyncRole, string> = {
  tutor: WB_LASER_TUTOR_HEX,
  student: WB_LASER_STUDENT_HEX,
};

function colorChannels(input: string): [number, number, number] | null {
  const raw = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{6})$/.exec(raw);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(raw);
  if (!rgb) return null;
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
}

function sameColor(actual: string, expected: string): boolean {
  const a = colorChannels(actual);
  const b = colorChannels(expected);
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** Rendered trail: Excalidraw's fill attribute and the computed paint both match. */
function trailRenderedIn(paints: readonly LaserTrailPaint[], expected: string): boolean {
  return paints.some(
    (paint) => sameColor(paint.fillAttr, expected) && sameColor(paint.computedFill, expected)
  );
}

/**
 * Show the color oracle can fail, then put the token fill back.
 * All three reads happen in one page turn so the trail renderer cannot
 * overwrite the poisoned attribute between them.
 */
async function proveTrailColorOracleCanFail(
  page: Page,
  role: WbSyncRole,
  expected: string
): Promise<void> {
  const stages = await poisonAndRestoreLaserTrail(page, role, "#010101");
  expect(trailRenderedIn(stages.before, expected), "trail is the author's color before poison").toBe(
    true
  );
  expect(
    trailRenderedIn(stages.poisoned, expected),
    "red-proof: a rewritten fill must not match the token"
  ).toBe(false);
  expect(trailRenderedIn(stages.restored, expected), "restored fill matches the token").toBe(true);
}

test.describe("whiteboard laser-pointer live sync", { tag: [...LASER_TAGS] }, () => {
  test(
    "laser drag paints the author's token color on the other peer (tutor → student and student → tutor)",
    { tag: [...LASER_TAGS] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        let proved = false;
        for (const author of ["tutor", "student"] as const) {
          const peer = peerOf(author);
          const expected = EXPECTED_TRAIL[author];
          await test.step(`laser ${author} → ${peer} (${expected})`, async () => {
            const authorPage = pageForRole(peers, author);
            const peerPage = pageForRole(peers, peer);
            const peerBefore = (await readSceneElementSummary(peerPage, peer)).map(
              (element) => element.id
            );
            const drag = LASER_DRAG[author];
            await dragLaserWhileHeld(authorPage, author, drag.from, drag.to, async () => {
              await expect
                .poll(
                  async () => {
                    const paints = await readLaserTrailPaints(peerPage, peer);
                    if (trailRenderedIn(paints, expected)) return "match";
                    const seen = paints
                      .map((paint) => `${paint.fillAttr}|${paint.computedFill}`)
                      .join(", ");
                    return seen.length > 0 ? `seen ${seen}` : "no trail";
                  },
                  { timeout: 15_000 }
                )
                .toBe("match");
              if (!proved) {
                await proveTrailColorOracleCanFail(peerPage, peer, expected);
                proved = true;
              }
            });
            const peerAfter = await readSceneElementSummary(peerPage, peer);
            expect(
              peerAfter.some((element) => element.type === "laser"),
              "laser trail is not a scene element"
            ).toBe(false);
            expect(peerAfter.map((element) => element.id)).toEqual(peerBefore);
          });
        }
      } finally {
        await peers.close();
      }
    }
  );
});
