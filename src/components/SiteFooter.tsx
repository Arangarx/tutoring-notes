import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border px-6 py-5 text-center text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-[980px] flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <Link href="/features" className="underline underline-offset-2 hover:text-foreground">
          Features
        </Link>
        <span aria-hidden>·</span>
        <Link href="/feedback" className="underline underline-offset-2 hover:text-foreground">
          Feedback
        </Link>
        <span aria-hidden>·</span>
        <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          Privacy
        </Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
          Terms
        </Link>
      </div>
    </footer>
  );
}
