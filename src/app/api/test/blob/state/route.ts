import { NextRequest, NextResponse } from "next/server";
import {
  harnessFailDeleteMatching,
  harnessFailNextDeletes,
  harnessStoreDelete,
  harnessStoreList,
  harnessStorePut,
  isBlobHarnessActive,
} from "@/lib/blob-harness";
import { guardPlaywrightTestRoute } from "@/lib/playwright-test-route";

/**
 * Test-only view of the hermetic blob harness store (consent wave C0).
 *
 *   GET    ?prefix=<p>                  -> { objects: [{ key, size }] }   (independent oracle for purge tests)
 *   DELETE ?key=<k>                     -> { existed }                    (test cleanup, not product delete)
 *   POST   { failNextDeletes?, failDeleteMatching?, seed? } -> inject delete faults / seed objects
 *          (`seed: [{ key, text }]` writes objects directly, e.g. legacy
 *          `whiteboard-checkpoints/<sessionId>/…` blobs for purge tests)
 *
 * Gate: `guardPlaywrightTestRoute` (never in production, needs the test secret)
 * AND the blob harness itself active. Reset still goes through `/api/test/blob/reset`.
 */
function gate(req: NextRequest): NextResponse | null {
  const denied = guardPlaywrightTestRoute(req);
  if (denied) return denied;
  if (!isBlobHarnessActive()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const denied = gate(req);
  if (denied) return denied;
  const prefix = req.nextUrl.searchParams.get("prefix") ?? "";
  return NextResponse.json({ objects: harnessStoreList(prefix) });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const denied = gate(req);
  if (denied) return denied;
  const key = req.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }
  return NextResponse.json({ existed: harnessStoreDelete(key) });
}

export async function POST(req: NextRequest): Promise<Response> {
  const denied = gate(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as {
    failNextDeletes?: number;
    failDeleteMatching?: string;
    seed?: { key: string; text: string }[];
  };
  for (const item of body.seed ?? []) {
    harnessStorePut(item.key, Buffer.from(item.text, "utf8"), "application/octet-stream");
  }
  if (typeof body.failNextDeletes === "number") {
    harnessFailNextDeletes(body.failNextDeletes);
  }
  if (typeof body.failDeleteMatching === "string" && body.failDeleteMatching) {
    harnessFailDeleteMatching(body.failDeleteMatching);
  }
  return NextResponse.json({ ok: true });
}
