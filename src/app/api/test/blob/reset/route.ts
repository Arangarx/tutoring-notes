import { NextResponse } from "next/server";
import { isBlobHarnessActive, resetHarnessStore } from "@/lib/blob-harness";

export async function POST(): Promise<Response> {
  if (!isBlobHarnessActive()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  resetHarnessStore();
  return NextResponse.json({ ok: true });
}
