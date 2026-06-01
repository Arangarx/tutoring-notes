/**
 * Binding Google-reviewer commitment — auth handled via mortensenapps.com.
 * Copy is orchestrator-proposed; Andrew may reword.
 */
export function AuthMortensenNotice({ id }: { id?: string }) {
  return (
    <p
      id={id}
      className="text-center text-xs leading-relaxed text-muted-foreground"
    >
      Sign-in is securely handled by Mortensen Apps (
      <a
        href="https://www.mortensenapps.com"
        className="text-brand underline-offset-2 hover:underline"
        rel="noopener noreferrer"
        target="_blank"
      >
        mortensenapps.com
      </a>
      ).
    </p>
  );
}
