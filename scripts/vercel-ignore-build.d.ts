export function isNonBuildAffecting(filePath: string): boolean;

/** True only when every changed file is provably non-build-affecting. */
export function shouldSkipBuild(changedFiles: string[]): boolean;

export function firstBuildAffectingPath(
  changedFiles: string[]
): string | undefined;
