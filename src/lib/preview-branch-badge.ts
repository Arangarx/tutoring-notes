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
  if (process.env.VERCEL_ENV !== "preview") {
    return null;
  }

  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;

  if (!branch || !sha) {
    return null;
  }

  return {
    branch,
    shortSha: sha.slice(0, 7),
  };
}
