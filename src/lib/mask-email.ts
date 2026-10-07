/**
 * Show just enough of an email to recognize it.
 * Shape: first character, then ***, then @, then the domain's first
 * character, then ***, then the TLD. Example: a***@d***.com
 */
export function maskEmailForDisplay(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at >= trimmed.length - 1) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const name = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot + 1) : "";
  const localMask = `${local.charAt(0)}***`;
  const domainMask = name ? `${name.charAt(0)}***` : "***";
  return tld ? `${localMask}@${domainMask}.${tld}` : `${localMask}@${domainMask}`;
}
