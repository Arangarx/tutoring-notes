/**
 * Playwright + selective-gate tag registry.
 *
 * Filter examples:
 *   npx playwright test --project=wb-regression --grep @wb-graph
 *   npm run test:wb-playwright:tags -- @wb-graph @wb-recording
 *   npm run test:wb-affected -- --base origin/v1-redesign
 *
 * Every new integration/regression test MUST add at least one domain tag
 * (see `.cursor/rules/playwright-on-fix.mdc` + `test-selection.mdc`).
 */
export const TAG = {
  /** Umbrella — all hermetic tutor+student relay specs (full wb-regression). */
  WB_SYNC: "@wb-sync",
  /** Stroke draw / move / page isolation. */
  WB_STROKES: "@wb-strokes",
  /** Pan/zoom, follow oracle, viewport center. */
  WB_VIEWPORT: "@wb-viewport",
  /** Native image + PDF viewport fit. */
  WB_ASSETS: "@wb-assets",
  /** Join, welcome push, exit/rejoin, sync roster. */
  WB_PRESENCE: "@wb-presence",
  /** GraphEmbeddable persist + graphStateJson sync. */
  WB_GRAPH: "@wb-graph",
  /** Recording FSM / autopause banner copy. */
  WB_RECORDING: "@wb-recording",
  /** Topbar, rails, flyouts, student chrome layout. */
  WB_CHROME: "@wb-chrome",
  /** Live A/V mesh, leave/reconnect (WebRTC harness). */
  WB_AV: "@wb-av",
} as const;

export type WbTestTag = (typeof TAG)[keyof typeof TAG];

/** When a tag is selected, also run these (err-on-caution adjacency). */
export const TAG_ADJACENCY: Readonly<Record<WbTestTag, readonly WbTestTag[]>> = {
  [TAG.WB_SYNC]: [],
  [TAG.WB_STROKES]: [TAG.WB_SYNC],
  [TAG.WB_VIEWPORT]: [TAG.WB_SYNC, TAG.WB_STROKES],
  [TAG.WB_ASSETS]: [TAG.WB_SYNC, TAG.WB_STROKES],
  [TAG.WB_PRESENCE]: [TAG.WB_SYNC, TAG.WB_AV],
  [TAG.WB_GRAPH]: [TAG.WB_SYNC, TAG.WB_STROKES],
  [TAG.WB_RECORDING]: [TAG.WB_SYNC, TAG.WB_PRESENCE],
  [TAG.WB_CHROME]: [TAG.WB_SYNC],
  [TAG.WB_AV]: [TAG.WB_SYNC, TAG.WB_PRESENCE],
};

export function expandTags(selected: Iterable<WbTestTag>): WbTestTag[] {
  const out = new Set<WbTestTag>();
  for (const tag of selected) {
    out.add(tag);
    for (const adj of TAG_ADJACENCY[tag] ?? []) {
      out.add(adj);
    }
  }
  return [...out].sort();
}

export function tagsToGrepPattern(tags: readonly WbTestTag[]): string {
  if (tags.length === 0) return "";
  return tags.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}
