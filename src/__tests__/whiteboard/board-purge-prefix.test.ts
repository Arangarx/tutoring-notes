/**
 * @jest-environment node
 */

/**
 * Consent wave C4b (docs/handoff/consent-wave-plan.md § 3.3): the purge deletes by prefix only, so the
 * prefix must be exactly the session's own upload namespace. Oracles: the token-mint guard
 * (`isPathUnderWhiteboardSessionPrefix`, the C4a W19 gate) and literal paths the product writes.
 */

jest.mock("@/lib/db", () => ({ __esModule: true, db: {}, withDbRetry: <T,>(fn: () => Promise<T>) => fn() }));

import { boardPurgeCheckpointPrefix, boardPurgeSessionPrefix } from "@/lib/whiteboard/board-purge";
import { isPathUnderWhiteboardSessionPrefix } from "@/lib/whiteboard-scope";

const STU = "stu_1";
const WB = "wb_abc";

describe("board purge prefixes", () => {
  it("the session prefix ends with a slash, so session wb_abc never matches wb_abcd", () => {
    const prefix = boardPurgeSessionPrefix(STU, WB);
    expect(prefix.endsWith("/")).toBe(true);
    expect(`whiteboard-sessions/${STU}/wb_abcd/1-events.json`.startsWith(prefix)).toBe(false);
  });

  it.each([
    `whiteboard-sessions/${STU}/${WB}/1-events.json`,
    `whiteboard-sessions/${STU}/${WB}/1-snapshot.png`,
    `whiteboard-sessions/${STU}/${WB}/assets/pdf-1-page-1.png`,
    `whiteboard-sessions/${STU}/wb_abcd/1-events.json`,
    `whiteboard-sessions/other/${WB}/1-events.json`,
    `whiteboard-sessions/admin_1/${STU}/${WB}-concat.webm`,
    `whiteboard-sessions/admin_1/${STU}/123-events.json`,
    `sessions/${STU}/123-segment.webm`,
  ])("covers exactly what the mint guard lets a client upload for this session: %s", (pathname) => {
    expect(pathname.startsWith(boardPurgeSessionPrefix(STU, WB))).toBe(
      isPathUnderWhiteboardSessionPrefix(pathname, STU, WB)
    );
  });

  it("never matches the concat audio, the create-time placeholder log or an audio segment", () => {
    const prefix = boardPurgeSessionPrefix(STU, WB);
    for (const p of [
      `whiteboard-sessions/admin_1/${STU}/${WB}-concat.webm`,
      `whiteboard-sessions/admin_1/${STU}/123-events.json`,
      `sessions/${STU}/123-segment.webm`,
    ]) {
      expect(p.startsWith(prefix)).toBe(false);
    }
  });

  it("the checkpoint prefix is the legacy checkpoint route's folder for this session only", () => {
    const prefix = boardPurgeCheckpointPrefix(WB);
    expect(`whiteboard-checkpoints/${WB}/1-x.json`.startsWith(prefix)).toBe(true);
    expect(`whiteboard-checkpoints/wb_abcd/1-x.json`.startsWith(prefix)).toBe(false);
  });
});
