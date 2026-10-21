"use client";
/**
 * The steel kiosk card: corner screws, LED step indicator, status label, sound toggle, LCD display area,
 * footer keys, engraved serial plate and speaker grille. Steps render a KioskDisplay and a KioskFooter inside it.
 */
import type { ReactNode } from "react";
import { useSound } from "@/hooks/SoundContext";
import Grille from "./Grille";
import Led from "./Led";
import Screw from "./Screw";
import ScrollArea from "./ScrollArea";

const STEP_NAMES = ["Idle", "Camera", "Countdown", "Review", "Etch", "Edit"];

export function KioskDisplay({ children }: { children: ReactNode }) {
  return (
    <div className="kiosk-lcd">
      <ScrollArea>{children}</ScrollArea>
    </div>
  );
}

export function KioskFooter({ children }: { children: ReactNode }) {
  return <div className="kiosk-foot">{children}</div>;
}

interface Props {
  stepIndex: number;
  label: string;
  /** false while the models warm up: the idle LED stays dark until it turns lime. */
  ready?: boolean;
  children: ReactNode;
}

export default function KioskPanel({ stepIndex, label, ready = true, children }: Props) {
  const { enabled, toggle } = useSound();
  return (
    <div className="kiosk-screen relative flex h-full flex-col">
      <Screw className="left-2.5 top-2.5" angle={20} />
      <Screw className="right-2.5 top-2.5" angle={75} />
      <Screw className="bottom-2.5 left-2.5" angle={140} />
      <Screw className="bottom-2.5 right-2.5" angle={50} />

      <header className="kiosk-head">
        <div className="flex items-center gap-2" role="list" aria-label={`Step ${stepIndex + 1} of ${STEP_NAMES.length}: ${STEP_NAMES[stepIndex]}`}>
          {STEP_NAMES.map((n, i) => (
            <Led key={n} on={i === stepIndex && (i !== 0 || ready)} label={n} />
          ))}
        </div>
        <span className="min-w-0 truncate font-dot text-[11px] tracking-[.14em]" aria-live="polite">
          {label}
        </span>
        <button type="button" onClick={toggle} aria-pressed={enabled} className="kiosk-sound font-dot text-[11px] tracking-[.1em]">
          SOUND {enabled ? "ON" : "OFF"}
        </button>
      </header>
      <div className="groove-line" />
      {children}
      <div className="groove-line" />
      <div className="kiosk-base">
        <span className="serial font-dot">ETB-001 · MK I</span>
        <Grille />
      </div>
    </div>
  );
}
