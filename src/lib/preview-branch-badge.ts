import { getBuildIdentity } from "@/lib/build-identity";

export type PreviewBranchBadgeData = {
  branch: string;
  shortSha: string;
};

/**
 * Preview-only branch badge payload. Returns null unless Vercel marks the
 * deployment as preview — production, development, and local builds never
 * receive badge props.
 */
export function getPreviewBranchBadgeData(): PreviewBranchBadgeData | null {
  const { sha, shortSha, branch, vercelEnv } = getBuildIdentity();

  if (vercelEnv !== "preview") {
    return null;
  }

  if (!branch || sha === "development") {
    return null;
  }

  return { branch, shortSha };
}
