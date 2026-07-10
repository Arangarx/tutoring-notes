import { ErrorStateCard } from "@/components/ErrorStateCard";

export default function AdminNotFound() {
  return (
    <ErrorStateCard
      title="Not found"
      message="This item does not exist or may have been deleted."
      linkHref="/admin/students"
      linkLabel="Back to Students"
    />
  );
}
