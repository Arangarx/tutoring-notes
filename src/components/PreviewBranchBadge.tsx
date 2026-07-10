"use client";

import { useEffect, useState } from "react";
import { XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { copyTextToClipboard } from "@/lib/copy-text-to-clipboard";
import { cn } from "@/lib/utils";

const DISMISS_STORAGE_KEY = "preview-branch-badge-dismissed";

type PreviewBranchBadgeProps = {
  branch: string;
  shortSha: string;
};

export function PreviewBranchBadge({ branch, shortSha }: PreviewBranchBadgeProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_STORAGE_KEY) === "1") {
        return;
      }
    } catch {
      // sessionStorage unavailable — still show the badge.
    }
    setVisible(true);
  }, []);

  if (!visible) {
    return null;
  }

  async function handleCopy() {
    try {
      await copyTextToClipboard(`${branch} · ${shortSha}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Prompt cancel or total failure — badge stays usable without a toast.
    }
  }

  function handleDismiss(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    try {
      sessionStorage.setItem(DISMISS_STORAGE_KEY, "1");
    } catch {
      // Best-effort dismiss for the session.
    }
    setVisible(false);
  }

  return (
    <div
      className="pointer-events-none fixed bottom-3 right-3 z-50 flex max-w-[min(calc(100vw-1.5rem),20rem)] items-center gap-0.5"
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={handleCopy}
        title="Click to copy branch + commit"
        className={cn(
          "pointer-events-auto rounded-full focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        )}
      >
        <Badge
          variant="outline"
          className="gap-1 border-border bg-muted/80 font-mono text-[11px] font-normal text-muted-foreground shadow-sm backdrop-blur-sm"
        >
          {copied ? "Copied!" : `${branch} · ${shortSha}`}
        </Badge>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="pointer-events-auto size-6 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss preview branch badge for this session"
        onClick={handleDismiss}
      >
        <XIcon className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}
