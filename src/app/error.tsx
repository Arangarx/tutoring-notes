"use client";

import { ErrorStateCard } from "@/components/ErrorStateCard";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorStateCard
      title="Something went wrong"
      message="An unexpected error occurred. You can try again or go back to the home page."
      linkHref="/"
      linkLabel="Home"
      withContainer
      onRetry={reset}
    />
  );
}
