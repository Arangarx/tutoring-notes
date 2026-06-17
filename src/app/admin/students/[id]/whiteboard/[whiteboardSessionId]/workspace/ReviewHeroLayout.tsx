"use client";

import type { ReactNode } from "react";
import { ReviewConfirmSlot } from "./ReviewConfirmSlot";

type Props = {
  notesColumn: ReactNode;
  boardColumn: ReactNode;
  topBar?: ReactNode;
};

export function ReviewHeroLayout({ notesColumn, boardColumn, topBar }: Props) {
  return (
    <div data-testid="wb-review-hero-layout" className="wb-review-hero-layout">
      {topBar}
      <div className="wb-review-layout wb-review-hero-grid">
        <div className="wb-review-notes-column">
          <ReviewConfirmSlot />
          {notesColumn}
        </div>
        <div className="wb-review-board-column">{boardColumn}</div>
      </div>
    </div>
  );
}
