"use client";

/** Three-bar inline meter — matches session shell mock top-bar mic button. */
export function WbInlineMicMeter({ level }: { level: number }) {
  const bars = [
    { min: 0.05, h: "b1" },
    { min: 0.25, h: "b2" },
    { min: 0.55, h: "b3" },
  ] as const;
  return (
    <div className="mynk-wb-mic-meter" aria-hidden>
      {bars.map(({ min, h }) => (
        <div
          key={h}
          className={`mynk-wb-mic-bar mynk-wb-mic-bar--${h}${level >= min ? " mynk-wb-mic-bar--active" : ""}`}
        />
      ))}
    </div>
  );
}
