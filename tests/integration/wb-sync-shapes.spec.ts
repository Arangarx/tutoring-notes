import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  addedIds,
  drawShapeWithTool,
  openTutorAndStudent,
  pageForRole,
  peerOf,
  readSceneElementIds,
  readSceneElementSummary,
  seedWbLiveSyncSession,
  waitForPeerElement,
  type SceneElementSummary,
  type WbShapeToolName,
  type WbSyncRole,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

/**
 * Geometric-shape bidirectional sync.
 *
 * The oracle is the other peer's live scene (`__TN_WB_E2E__.getElements()`):
 * a new element of the tool's type, with non-zero geometry, whose width and
 * height match the author's own scene box within a few pixels. Nothing here
 * is derived from the sync apply path.
 *
 * `toCanonical` drops `frame` / `magicframe` / `selection` and keeps `angle`
 * only when it is non-zero. These tests do not assert on frame or on angle.
 *
 * Allowlist: the new id must be present with the right type. A shape draw may
 * also allocate incidental ids, so this is NOT `added === [id]` (that equality
 * is text-only — see wb-sync-text.spec.ts).
 *
 * Gate: `npx playwright test tests/integration/wb-sync-shapes.spec.ts --project=wb-regression`
 */
const SHAPE_TAGS = [TAG.WB_STROKES, TAG.WB_SYNC] as const;

const SHAPES: readonly WbShapeToolName[] = [
  "rectangle",
  "ellipse",
  "diamond",
  "arrow",
  "line",
];

/** Closed shapes need both axes. A line or arrow is real if either axis has extent. */
function plausibleGeometry(element: SceneElementSummary, type: string): boolean {
  const width = Math.abs(element.width);
  const height = Math.abs(element.height);
  if (type === "line" || type === "arrow") return width >= 1 || height >= 1;
  return width > 1 && height > 1;
}

/**
 * Poll until `role`'s live scene has a new non-deleted element of `type`
 * with plausible geometry. Returns that element. Incidental new ids are ignored.
 */
async function waitForAddedShape(
  page: Page,
  role: WbSyncRole,
  beforeIds: readonly string[],
  type: string
): Promise<SceneElementSummary> {
  let found: SceneElementSummary | undefined;
  await expect
    .poll(
      async () => {
        const summary = await readSceneElementSummary(page, role, { omitDeleted: true });
        const prior = new Set(beforeIds);
        found = summary.find(
          (element) =>
            !prior.has(element.id) &&
            element.type === type &&
            plausibleGeometry(element, type)
        );
        return Boolean(found);
      },
      { timeout: 20_000 }
    )
    .toBe(true);
  if (!found) throw new Error(`${role} scene did not gain a ${type}`);
  return found;
}

test.describe("whiteboard shape-tool live sync", { tag: [...SHAPE_TAGS] }, () => {
  for (const tool of SHAPES) {
    test(
      `${tool} drawn with the tool syncs to the other peer (tutor → student and student → tutor)`,
      { tag: [...SHAPE_TAGS] },
      async ({ browser }) => {
        test.setTimeout(180_000);
        const session = await seedWbLiveSyncSession();
        const peers = await openTutorAndStudent(browser, session);
        try {
          // Second drag sits in a different region so the two shapes do not share a box.
          const drags = {
            tutor: {
              from: { xFrac: 0.28, yFrac: 0.32 },
              to: { xFrac: 0.48, yFrac: 0.58 },
            },
            student: {
              from: { xFrac: 0.54, yFrac: 0.3 },
              to: { xFrac: 0.76, yFrac: 0.62 },
            },
          } as const;

          for (const author of ["tutor", "student"] as const) {
            const peer = peerOf(author);
            await test.step(`${tool} ${author} → ${peer}`, async () => {
              const authorPage = pageForRole(peers, author);
              const peerPage = pageForRole(peers, peer);
              const authorBefore = await readSceneElementIds(authorPage, author);
              const peerBefore = await readSceneElementIds(peerPage, peer);
              const drag = drags[author];

              await drawShapeWithTool(authorPage, author, tool, drag.from, drag.to);

              const authored = await waitForAddedShape(authorPage, author, authorBefore, tool);
              await waitForPeerElement(
                peerPage,
                peer,
                authored.id,
                (element) =>
                  element.type === tool &&
                  element.isDeleted === false &&
                  plausibleGeometry(element, tool)
              );

              const peerSummary = await readSceneElementSummary(peerPage, peer, {
                omitDeleted: true,
              });
              const peerAdded = addedIds(
                peerBefore,
                peerSummary.map((element) => element.id)
              );
              // Allowlist: the new shape id is present. Bound or incidental ids
              // may arrive with it — do not require peerAdded === [id].
              expect(peerAdded, `${tool} id is on the peer`).toContain(authored.id);
              const synced = peerSummary.find((element) => element.id === authored.id);
              expect(synced?.type).toBe(tool);
              expect(plausibleGeometry(synced!, tool)).toBe(true);

              // Re-read both live scenes until the peer box matches the author's.
              // An in-flight update can land a half-size element first; a sync
              // that stays halved or stretched never matches and fails.
              await expect
                .poll(
                  async () => {
                    const authorBox = (
                      await readSceneElementSummary(authorPage, author, { omitDeleted: true })
                    ).find((element) => element.id === authored.id);
                    const peerBox = (
                      await readSceneElementSummary(peerPage, peer, { omitDeleted: true })
                    ).find((element) => element.id === authored.id);
                    if (!authorBox || !peerBox) {
                      return `missing author=${Boolean(authorBox)} peer=${Boolean(peerBox)}`;
                    }
                    const widthDelta = Math.abs(peerBox.width - authorBox.width);
                    const heightDelta = Math.abs(peerBox.height - authorBox.height);
                    if (widthDelta <= 4 && heightDelta <= 4) return "match";
                    return `width author=${authorBox.width} peer=${peerBox.width} height author=${authorBox.height} peer=${peerBox.height}`;
                  },
                  { timeout: 15_000 }
                )
                .toBe("match");
            });
          }
        } finally {
          await peers.close();
        }
      }
    );
  }
});
