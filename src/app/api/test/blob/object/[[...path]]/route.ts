import { NextResponse } from "next/server";
import {
  consumeHarnessPutToken,
  harnessStorePut,
  isBlobHarnessActive,
  serveHarnessObject,
} from "@/lib/blob-harness";

const HARNESS_PUT_TOKEN_HEADER = "x-blob-harness-put-token";
function isHarnessRoute(): boolean {
  return isBlobHarnessActive();
}

function objectKeyFromParams(path: string[] | undefined): string | null {
  if (!path?.length) return null;
  return path.map((p) => decodeURIComponent(p)).join("/");
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ path?: string[] }> }
): Promise<Response> {
  if (!isHarnessRoute()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { path } = await ctx.params;
  const key = objectKeyFromParams(path);
  if (!key) {
    return NextResponse.json({ error: "Missing object key" }, { status: 400 });
  }
  return serveHarnessObject(key, req);
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ path?: string[] }> }
): Promise<Response> {
  if (!isHarnessRoute()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { path } = await ctx.params;
  const key = objectKeyFromParams(path);
  if (!key) {
    return NextResponse.json({ error: "Missing object key" }, { status: 400 });
  }
  const putToken = req.headers.get(HARNESS_PUT_TOKEN_HEADER);
  if (!consumeHarnessPutToken(key, putToken)) {
    return NextResponse.json({ error: "Harness PUT requires mint token" }, { status: 403 });
  }
  const buf = Buffer.from(await req.arrayBuffer());
  const contentType =
    req.headers.get("content-type")?.split(";")[0]?.trim() ??
    "application/octet-stream";
  harnessStorePut(key, buf, contentType);
  return new NextResponse(null, { status: 201 });
}

export async function HEAD(
  req: Request,
  ctx: { params: Promise<{ path?: string[] }> }
): Promise<Response> {
  const getRes = await GET(req, ctx);
  return new Response(null, {
    status: getRes.status,
    headers: getRes.headers,
  });
}
