"use client";

import { copyTextToClipboard } from "@/lib/copy-text-to-clipboard";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ShareLinkRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await copyTextToClipboard(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Prompt cancel or total failure — no toast here; parent is minimal.
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input readOnly value={url} className="min-h-11 font-mono text-xs sm:flex-1" aria-label="Share link URL" />
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy"}
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <a href={url} target="_blank" rel="noreferrer">
            Open
          </a>
        </Button>
      </div>
    </div>
  );
}
