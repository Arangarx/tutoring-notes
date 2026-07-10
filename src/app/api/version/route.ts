import { NextResponse } from "next/server";

import { getBuildIdentity } from "@/lib/build-identity";

export const dynamic = "force-dynamic";

export async function GET() {
  const { sha, shortSha } = getBuildIdentity();

  return NextResponse.json(
    { sha, shortSha },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
