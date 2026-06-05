"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Live second-by-second countdown for rate-limit / lockout UX.
 * Pattern adapted from src/app/students/login/page.tsx (learner PIN lockout).
 */
export function useRetryAfterCountdown() {
  const [retryAfterSec, setRetryAfterSec] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearCountdown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRetryAfterSec(null);
  }, []);

  const startCountdown = useCallback(
    (seconds: number) => {
      clearCountdown();
      const secs = Math.max(1, seconds);
      setRetryAfterSec(secs);
      intervalRef.current = setInterval(() => {
        setRetryAfterSec((prev) => {
          if (prev === null || prev <= 1) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [clearCountdown]
  );

  useEffect(() => () => clearCountdown(), [clearCountdown]);

  const isRateLimited = retryAfterSec !== null && retryAfterSec > 0;

  return { retryAfterSec, isRateLimited, startCountdown, clearCountdown };
}
