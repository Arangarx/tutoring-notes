import type { Metadata } from "next";

import { productionCanonicalMetadata } from "@/lib/seo/canonical-host";

export const metadata: Metadata = {
  title: "Feedback — Tutoring Notes",
  description: "Send feedback about Tutoring Notes.",
  ...productionCanonicalMetadata("/feedback"),
};

export default function FeedbackLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
