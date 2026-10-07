"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import "./WbMenuScrollCue.css";

/**
 * Scrollable menu body with an explicit "more below" cue.
 * The cue is present only while content remains below the fold.
 */
export function WbMenuScrollCue({ children }: { children: ReactNode }) {
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

  return (
    <div className="mynk-wb-menu-scroll">
      <div
        ref={scrollerRef}
        className="mynk-wb-topbar-overflow-dropdown__scroll"
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
