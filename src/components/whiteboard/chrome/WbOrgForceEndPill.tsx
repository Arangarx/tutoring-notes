"use client";

import { Badge } from "@/components/ui/badge";
import "./WbOrgForceEndPill.css";

export function WbOrgForceEndPill({ sentence }: { sentence: string }) {
  return (
    <div className="wb-org-force-end-pill" data-testid="wb-org-force-end-pill">
      <Badge variant="secondary" className="wb-org-force-end-pill__badge">
        <span className="wb-org-force-end-pill__text" data-testid="wb-org-force-end-pill-text">
          {sentence}
        </span>
      </Badge>
    </div>
  );
}
