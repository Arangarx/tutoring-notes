"use client";

import { useEffect, useState } from "react";
import { LocalDateTimeText } from "@/components/LocalDateTimeText";

type ErasureGraceCountdownProps = {
  purgeEligibleAt: string;
  className?: string;
};

export function ErasureGraceCountdown({
  purgeEligibleAt,
  className,
}: ErasureGraceCountdownProps) {
  const [text, setText] = useState("");

  useEffect(() => {
    function formatRemaining() {
      const ms = new Date(purgeEligibleAt).getTime() - Date.now();
      if (ms <= 0) {
        return "Grace ended — permanent deletion pending";
      }
      const totalMinutes = Math.floor(ms / 60_000);
      const days = Math.floor(totalMinutes / (60 * 24));
      const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
      const minutes = totalMinutes % 60;
      if (days > 0) {
        return `${days}d ${hours}h remaining`;
      }
      if (hours > 0) {
        return `${hours}h ${minutes}m remaining`;
      }
      return `${minutes}m remaining`;
    }

    setText(formatRemaining());
    const id = window.setInterval(() => setText(formatRemaining()), 60_000);
    return () => window.clearInterval(id);
  }, [purgeEligibleAt]);

  return (
    <span className={className}>
      {text || "…"}
      <span className="sr-only">
        {" "}
        (permanent deletion after{" "}
        <LocalDateTimeText dateTime={purgeEligibleAt} />)
      </span>
    </span>
  );
}
