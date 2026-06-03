"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { copyTextToClipboard } from "@/lib/copy-text-to-clipboard";

/**
 * Prominent, copyable `username@familyid` child login handle (IAC-7).
 */
export function CopyableLearnerHandle({
  loginHandle,
  label = "Login handle",
  className,
}: {
  loginHandle: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await copyTextToClipboard(loginHandle);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Prompt cancel or total failure — no toast here.
    }
  }

  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded border border-border bg-muted px-3 py-2 font-mono text-sm font-medium text-foreground">
          {loginHandle}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={handleCopy}
        >
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
