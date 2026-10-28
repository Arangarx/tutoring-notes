import type { ReactNode } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export type StudentSessionDisclosureSection = {
  value: string;
  testId: string;
  title: string;
  content: ReactNode;
};

/**
 * Collapsed-by-default session disclosures. Composes the canonical Accordion;
 * a section mounts its list only after the tutor expands it.
 */
export function StudentSessionDisclosures({
  sections,
}: {
  sections: readonly StudentSessionDisclosureSection[];
}) {
  if (sections.length === 0) return null;

  return (
    <Accordion type="multiple">
      {sections.map((section) => (
        <AccordionItem key={section.value} value={section.value}>
          <AccordionTrigger data-testid={section.testId}>{section.title}</AccordionTrigger>
          <AccordionContent>{section.content}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
