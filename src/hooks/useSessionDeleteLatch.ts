"use client";

import { useState, useTransition, type TransitionStartFunction } from "react";

/**
 * `useTransition`'s pending flag drops when the async delete resolves, before
 * `router.push` / `router.refresh` replaces the control. `deleted` stays set
 * so Yes and Cancel cannot fire a second delete in that window.
 */
export function useSessionDeleteLatch(): {
  deleting: boolean;
  deleted: boolean;
  /** True while the delete is in flight or has already committed. */
  locked: boolean;
  startDeleteTransition: TransitionStartFunction;
  markDeleted: () => void;
} {
  const [deleting, startDeleteTransition] = useTransition();
  const [deleted, setDeleted] = useState(false);
  return {
    deleting,
    deleted,
    locked: deleting || deleted,
    startDeleteTransition,
    markDeleted: () => setDeleted(true),
  };
}
