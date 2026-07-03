"use client";

/** Client-side sign-out button for LearnerProfile (child PIN) sessions. */
export function LearnerSignOutButton() {
  async function handleSignOut() {
    await fetch("/api/auth/learner/logout", { method: "POST" });
    window.location.href = "/students/login";
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      data-testid="learner-sign-out"
      className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      Sign out
    </button>
  );
}
