export type ReviewSurfaceState = "hero" | "replay";

export function isReviewSurfaceState(value: string): value is ReviewSurfaceState {
  return value === "hero" || value === "replay";
}
