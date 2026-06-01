"use client";

/** Client-side sign-out button for AccountHolder sessions. */
export function AccountSignOutButton() {
  async function handleSignOut() {
    await fetch("/api/auth/account-holder/logout", { method: "POST" });
    window.location.href = "/account/login";
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      Sign out
    </button>
  );
}
