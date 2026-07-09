"use client";

export type LearnerSignOutButtonProps = {
  /** Inline top-bar link (desktop) vs destructive overflow menu row (touch). */
  variant?: "inline" | "menu";
  /** Called before the logout fetch (e.g. close an open overflow sheet). */
  onSignOutClick?: () => void;
};

/** Client-side sign-out button for LearnerProfile (child PIN) sessions. */
export function LearnerSignOutButton({
  variant = "inline",
  onSignOutClick,
}: LearnerSignOutButtonProps = {}) {
  async function handleSignOut() {
    onSignOutClick?.();
    await fetch("/api/auth/learner/logout", { method: "POST" });
    window.location.href = "/students/login";
  }

  if (variant === "menu") {
    return (
      <button
        type="button"
        onClick={() => void handleSignOut()}
        data-testid="learner-sign-out"
        className="mynk-wb-menu-item mynk-wb-menu-item--destructive"
        aria-label="Sign out of learner account"
      >
        <span>Sign out</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      data-testid="learner-sign-out"
      className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      Sign out
    </button>
  );
}
