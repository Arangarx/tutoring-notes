import type { APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const { assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

/** One rectangle snapshot — enough for the in-frame player to leave the loading state. */
export function replayEventsFixture(): string {
  return JSON.stringify({
    schemaVersion: 1,
    startedAt: "2026-10-11T18:00:00.000Z",
    durationMs: 1500,
    events: [
      {
        t: 0,
        type: "snapshot",
        elements: [
          {
            id: "pw-replay-rect",
            type: "rectangle",
            x: 12,
            y: 24,
            width: 48,
            height: 32,
          },
        ],
      },
    ],
  });
}

/**
 * Put a replay event log into the Playwright blob harness and point the
 * session row at it. Caller must already be authenticated as the owning tutor.
 */
export async function uploadReplayEvents(args: {
  request: APIRequestContext;
  adminUserId: string;
  studentId: string;
  whiteboardSessionId: string;
}): Promise<string> {
  const mintRes = await args.request.post("/api/upload/blob", {
    data: {
      type: "blob.generate-client-token",
      payload: {
        pathname: `whiteboard-sessions/${args.adminUserId}/${args.studentId}/pw-replay-events.json`,
        clientPayload: JSON.stringify({
          kind: "whiteboard-events",
          whiteboardSessionId: args.whiteboardSessionId,
          studentId: args.studentId,
        }),
        multipart: false,
      },
    },
  });
  if (!mintRes.ok()) {
    throw new Error(
      `Harness mint failed (${mintRes.status()}): ${await mintRes.text()}`
    );
  }
  const mint = (await mintRes.json()) as {
    putUrl?: string;
    blobUrl?: string;
    putToken?: string;
  };
  if (!mint.putUrl || !mint.blobUrl || !mint.putToken) {
    throw new Error("Harness mint response missing putUrl, blobUrl, or putToken");
  }
  const putRes = await args.request.put(mint.putUrl, {
    data: replayEventsFixture(),
    headers: {
      "content-type": "application/json",
      "x-blob-harness-put-token": mint.putToken,
    },
  });
  if (!putRes.ok()) {
    throw new Error(`Harness PUT failed (${putRes.status()}): ${await putRes.text()}`);
  }

  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    await prisma.whiteboardSession.update({
      where: { id: args.whiteboardSessionId },
      data: { eventsBlobUrl: mint.blobUrl },
    });
  } finally {
    await prisma.$disconnect();
  }
  return mint.blobUrl;
}
