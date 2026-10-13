"use client";
/**
 * Fixed, centered pill navbar shared by every booth page. Collapsed: logo mark, wordmark, live clock, menu button.
 * Expanded: stacked links, sound toggle, time label, placeholder socials. Motion is calm: a quick downward
 * reveal (no spring, no width morph). Esc or an outside click closes it.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import TransitionLink from "./TransitionLink";
import { GRAIN_URI } from "./GrainBackground";
import { useClock } from "@/hooks/useClock";
import { useSound } from "@/hooks/SoundContext";
import type { NavItem } from "@/types";

interface Props {
  slug: string;
  name: string;
  nav: NavItem[];
  wordmark: ReactNode;
}

function LogoMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden className="shrink-0 text-ink">
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 15.5c1.6-4.4 7.4-4.4 9 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="9" r="1.2" fill="currentColor" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ opacity: open ? 0 : 1, transition: "opacity 120ms" }}>
        <path d="M5 9h14M5 15h14" />
      </g>
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ opacity: open ? 1 : 0, transition: "opacity 120ms" }}>
        <path d="M6 6l12 12M18 6L6 18" />
      </g>
    </svg>
  );
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />
      {on ? <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
    </svg>
  );
}

export default function Navbar({ name, nav, wordmark }: Props) {
  const [open, setOpen] = useState(false);
  const [tz, setTz] = useState("");
  const pathname = usePathname();
  const time = useClock();
  const { enabled, toggle } = useSound();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const off = -new Date().getTimezoneOffset() / 60;
    setTz(`UTC${off >= 0 ? "+" : "-"}${Math.abs(off)}`);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3"
      style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
    >
      <div ref={ref} className="nav-pill pointer-events-auto relative w-full max-w-[340px]">
        <span aria-hidden className="pointer-events-none absolute inset-0 opacity-[.12] mix-blend-overlay" style={{ backgroundImage: GRAIN_URI }} />
        <div className="relative flex h-12 items-center gap-2 pl-3 pr-1.5">
          <LogoMark />
          <span className="flex items-start gap-0.5 leading-none">
            {wordmark}
            <sup className="font-ui text-[8px] leading-none text-ink/70">®</sup>
          </span>
          <span className="ml-auto font-dot text-[13px] tabular-nums text-ink/80" aria-label="Local time">
            {time ?? "00:00:00"}
          </span>
          <button
            type="button"
            className="nav-btn grid h-9 w-9 place-items-center rounded-full border border-line/15 bg-line/[.06] text-ink"
            aria-expanded={open}
            aria-controls="booth-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            <MenuIcon open={open} />
          </button>
        </div>

        <div id="booth-menu" className="nav-panel relative" data-open={open}>
          <div className="nav-inner">
            <nav aria-label={`${name} navigation`} className="px-4 pb-2 pt-3">
              <ul className="flex flex-col">
                {nav.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <TransitionLink
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className="nav-link flex items-center gap-3 py-1 font-display text-[44px] leading-[1.05] text-ink"
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-accent" : "bg-transparent"}`} />
                        <span className="nav-label">{item.label}</span>
                      </TransitionLink>
                    </li>
                  );
                })}
              </ul>
              <TransitionLink href="/" onClick={() => setOpen(false)} className="nav-link mt-2 inline-block pl-5 font-ui text-[12px] text-muted">
                <span className="nav-label">All booths</span>
              </TransitionLink>
            </nav>
            <div className="mx-4 border-t border-line/10" />
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <button
                type="button"
                onClick={toggle}
                aria-pressed={enabled}
                className="nav-btn flex items-center gap-2 rounded-full border border-line/15 px-3 py-1.5 font-dot text-[12px] text-ink"
              >
                <SpeakerIcon on={enabled} />
                Sound {enabled ? "on" : "off"}
                <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-accent" : "bg-muted/50"}`} />
              </button>
              <span className="font-dot text-[12px] text-muted">Local {tz}</span>
            </div>
            <div className="flex gap-2 px-4 pb-4">
              {["IG", "X", "YT"].map((s) => (
                <button key={s} type="button" disabled aria-label={`${s} (placeholder)`} className="rounded-full border border-line/10 px-2.5 py-1 font-dot text-[11px] text-muted/70">
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
