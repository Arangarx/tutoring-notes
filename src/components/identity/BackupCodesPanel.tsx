"use client";

import { useState } from "react";

const DEFAULT_FILE_HEADER = "Mynk 2FA Backup Codes — store these in a safe place.\n\n";

export function downloadBackupCodeFile(codes: string[], header = DEFAULT_FILE_HEADER) {
  const blob = new Blob([header + codes.join("\n") + "\n"], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mynk-2fa-backup-codes.txt";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The one backup-code reveal. Setup, authenticator rotation, regeneration,
 * and method change all use this. Callers pass the title and description.
 */
export function BackupCodesPanel({
  codes,
  title,
  description,
  fileHeader = DEFAULT_FILE_HEADER,
}: {
  codes: string[];
  title: string;
  description: string;
  fileHeader?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-md border border-yellow-300 bg-yellow-50 p-4 dark:bg-yellow-900/20">
      <h2 className="mb-1 text-base font-semibold text-yellow-800 dark:text-yellow-200">{title}</h2>
      <p className="mb-3 text-sm text-yellow-700 dark:text-yellow-300">{description}</p>
      <div className="grid grid-cols-2 gap-1">
        {codes.map((code) => (
          <code
            key={code}
            className="select-all rounded border bg-white px-2 py-1 font-mono text-xs dark:bg-black/30"
          >
            {code}
          </code>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
        >
          {copied ? "Copied!" : "Copy codes"}
        </button>
        <button
          type="button"
          onClick={() => downloadBackupCodeFile(codes, fileHeader)}
          className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
        >
          Download .txt
        </button>
      </div>
    </div>
  );
}
