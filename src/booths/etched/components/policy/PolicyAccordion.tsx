"use client";
/**
 * Accessible accordion: real buttons with aria-expanded/aria-controls, several panels can be open,
 * Arrow Up/Down/Home/End move between headers. Panels animate their height in 250ms (ease-out) via CSS.
 */
import { useRef, useState, type KeyboardEvent } from "react";

interface Section {
  id: string;
  heading: string;
  body: string;
}

export default function PolicyAccordion({ sections }: { sections: Section[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(sections.slice(0, 1).map((s) => s.id)));
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = sections.length - 1;
    const target = e.key === "ArrowDown" ? (i === last ? 0 : i + 1) : e.key === "ArrowUp" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (target < 0) return;
    e.preventDefault();
    buttons.current[target]?.focus();
  };

  return (
    <div className="divide-y divide-line/10 border-y border-line/10">
      {sections.map((s, i) => {
        const isOpen = open.has(s.id);
        return (
          <div key={s.id}>
            <h3>
              <button
                ref={(el) => {
                  buttons.current[i] = el;
                }}
                id={`acc-${s.id}`}
                type="button"
                className="acc-btn"
                aria-expanded={isOpen}
                aria-controls={`acc-panel-${s.id}`}
                onClick={() => toggle(s.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
              >
                <span className="acc-title font-display text-[clamp(24px,3vw,32px)] leading-none">{s.heading}</span>
                <span className="acc-plus" data-open={isOpen} aria-hidden />
              </button>
            </h3>
            <div id={`acc-panel-${s.id}`} role="region" aria-labelledby={`acc-${s.id}`} className="acc-panel" data-open={isOpen}>
              <div className="acc-inner">
                <p className="pb-5 pr-10 leading-relaxed text-ink/70">{s.body}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
