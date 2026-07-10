import { ErrorStateCard } from "@/components/ErrorStateCard";

export default function NotFound() {
  return (
    <ErrorStateCard
      title="Page not found"
      message="This page does not exist or the link may have expired."
      linkHref="/"
      linkLabel="Back to home"
      withContainer
    />
  );
}
