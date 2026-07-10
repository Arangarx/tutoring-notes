"use client";

import { ErrorStateCard } from "@/components/ErrorStateCard";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorStateCard
      title="Something went wrong"
      message="An unexpected error occurred in the admin area."
      linkHref="/admin/students"
      linkLabel="Students"
      onRetry={reset}
    />
  );
}
