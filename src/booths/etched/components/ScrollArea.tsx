"use client";
/**
 * Scroll container for the kiosk display: slim steel scrollbar, edge fades that follow the scroll position
 * (bottom fade while more is below, top fade once scrolled), and a floating "SCROLL" hint pill that shows while
 * content overflows and hides after the first scroll or at the end. A ResizeObserver keeps it accurate when
 * content changes; the component remounts per step, so the hint comes back on every new step.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export default function ScrollArea({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const hadOverflow = useRef(false);
  const [s, setS] = useState({ overflow: false, top: true, bottom: true });
  const [scrolled, setScrolled] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const overflow = el.scrollHeight - el.clientHeight > 4;
    const next = { overflow, top: el.scrollTop <= 2, bottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 2 };
    setS((p) => (p.overflow === next.overflow && p.top === next.top && p.bottom === next.bottom ? p : next));
    if (overflow && !hadOverflow.current) setScrolled(false);
    hadOverflow.current = overflow;
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [measure]);

  const fade = { "--fade-t": s.overflow && !s.top ? "22px" : "0px", "--fade-b": s.overflow && !s.bottom ? "26px" : "0px" } as CSSProperties;
  const showHint = s.overflow && !s.bottom && !scrolled;

  return (
    <div className="scroll-wrap">
      <div
        ref={ref}
        className="lcd-scroll scroll-fade"
        style={fade}
        onScroll={() => {
          measure();
          if ((ref.current?.scrollTop ?? 0) > 6) setScrolled(true);
        }}
        {...(s.overflow ? { tabIndex: 0, role: "region", "aria-label": "Scrollable controls" } : {})}
      >
        <div className="scroll-content">{children}</div>
      </div>
      <div className="scroll-hint font-dot" data-show={showHint} aria-hidden>
        <span className="scroll-pill">
          SCROLL
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </div>
    </div>
  );
}
