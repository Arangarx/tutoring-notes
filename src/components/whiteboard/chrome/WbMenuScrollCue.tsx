"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./WbMenuScrollCue.css";

/** Lifts the last row above the 28px fade plus its label. */
const DEFAULT_FADE_CLEARANCE_PX = 40;

/**
 * Scrollable menu body with an explicit "more below" cue.
 * The cue is present only while content remains below the fold.
 */
export function WbMenuScrollCue({
  children,
  fadeClearancePx = DEFAULT_FADE_CLEARANCE_PX,
}: {
  children: ReactNode;
  /** Bottom padding, in px, that keeps the last row above the fade. */
  fadeClearancePx?: number;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    const content = el.firstElementChild;
    if (content) observer.observe(content);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const scrollStyle = {
    "--mynk-menu-scroll-fade-pad": `${fadeClearancePx}px`,
  } as CSSProperties;

  return (
    <div className="mynk-wb-menu-scroll" style={scrollStyle}>
      <div
        ref={scrollerRef}
        className="mynk-wb-topbar-overflow-dropdown__scroll mynk-wb-menu-scroll__scroller"
      >
        {children}
      </div>
      {moreBelow ? (
        <div className="mynk-wb-menu-scroll__more" data-testid="wb-session-menu-more-below">
          <span className="mynk-wb-menu-scroll__fade" aria-hidden />
          <span className="mynk-wb-menu-scroll__label">
            More below
            <span className="mynk-wb-menu-scroll__chevron" aria-hidden>
              ▾
            </span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
