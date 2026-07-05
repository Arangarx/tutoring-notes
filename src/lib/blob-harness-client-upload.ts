"use client";

/**
 * Client-direct upload via harness mint + same-origin PUT (no Vercel egress).
 */

function isBlobHarnessClientActive(): boolean {
  return (
    process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST === "1" &&
    process.env.NEXT_PUBLIC_BLOB_HARNESS_LOCAL === "1"
  );
}

export function shouldUseBlobHarnessClientUpload(): boolean {
  return isBlobHarnessClientActive();
}

type HarnessMintJson = {
  harness?: boolean;
  putUrl?: string;
  blobUrl?: string;
  pathname?: string;
  clientToken?: string;
};

export async function uploadViaBlobHarness(args: {
  pathname: string;
  blob: Blob;
  contentType: string;
  handleUploadUrl: string;
  clientPayload: string;
}): Promise<{ url: string; pathname: string }> {
  const mintRes = await fetch(args.handleUploadUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "blob.generate-client-token",
      payload: {
        pathname: args.pathname,
        clientPayload: args.clientPayload,
        multipart: false,
      },
    }),
  });
  if (!mintRes.ok) {
    const text = await mintRes.text().catch(() => "");
    throw new Error(`Harness mint failed (${mintRes.status}): ${text}`);
  }
  const mint = (await mintRes.json()) as HarnessMintJson;
  if (!mint.harness || !mint.putUrl || !mint.blobUrl) {
    throw new Error("Harness mint response missing putUrl/blobUrl");
  }
  const putRes = await fetch(mint.putUrl, {
    method: "PUT",
    headers: { "content-type": args.contentType },
    body: args.blob,
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => "");
    throw new Error(`Harness PUT failed (${putRes.status}): ${text}`);
  }
  return { url: mint.blobUrl, pathname: mint.pathname ?? args.pathname };
}
