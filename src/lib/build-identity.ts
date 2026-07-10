export type BuildIdentity = {
  sha: string;
  shortSha: string;
  branch: string | null;
  vercelEnv: string | undefined;
};

/**
 * Deploy build identity from Vercel-injected git metadata (all Vercel deploys)
 * or a stable local fallback.
 */
export function getBuildIdentity(): BuildIdentity {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? "development";
  const shortSha = sha === "development" ? "development" : sha.slice(0, 7);
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? null;
  const vercelEnv = process.env.VERCEL_ENV;

  return { sha, shortSha, branch, vercelEnv };
}
