"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { WbIconLock } from "@/components/whiteboard/chrome/wb-icons";
import "./WbViewLockedIndicator.css";

export type WbViewLockedIndicatorProps = {
  /** Existing follow-off path. Independent view; the camera is no longer locked. */
  onUnlock: () => void;
};

/** On-canvas pill while a student's view is locked to the tutor. */
export function WbViewLockedIndicator({ onUnlock }: WbViewLockedIndicatorProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Badge asChild variant="secondary">
        <button
          type="button"
          className="wb-view-locked-indicator"
          data-testid="wb-view-locked-indicator"
          onClick={() => setOpen(true)}
        >
          <WbIconLock size={12} />
          Locked to tutor&apos;s view
        </button>
      </Badge>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent data-testid="wb-view-locked-unlock-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Unlock your view?</AlertDialogTitle>
            <AlertDialogDescription>
              You will pan and zoom on your own. Follow tutor view stays off
              until you turn it back on.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="wb-view-locked-unlock-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="wb-view-locked-unlock-confirm"
              onClick={() => onUnlock()}
            >
              Unlock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
