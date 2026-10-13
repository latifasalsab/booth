"use client";
/**
 * PRINT: steel pickup screen. The landscape print slides out of the center slot, the slot recedes and the print
 * settles in the middle. Left = original photo (optional B&W), right = embossed plate with no box behind it,
 * under them only the wordmark. Buttons: Save photo (PNG via exportPrint) and Again.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { savePrint } from "../lib/exportPrint";
import SteelButton from "./SteelButton";
import Wordmark from "./Wordmark";

const EASE = [0.2, 0.8, 0.2, 1] as const;
const GAP = 34;
const PAPER_W = "min(88vw, 880px, 60dvh)";
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Props {
  photoUrl: string;
  plate: HTMLCanvasElement;
  bw: boolean;
  onAgain: () => void;
}

export default function PickupView({ photoUrl, plate, bw, onAgain }: Props) {
  const reduced = useReducedMotion();
  const plateUrl = useMemo(() => plate.toDataURL("image/png"), [plate]);
  const printCtl = useAnimationControls();
  const slotCtl = useAnimationControls();
  const printRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const [settled, setSettled] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    const el = printRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    (async () => {
      if (reduced) {
        printCtl.set({ y: -h / 2, opacity: 0 });
        setSettled(true);
        await Promise.all([printCtl.start({ opacity: 1, transition: { duration: 0.3 } }), slotCtl.start({ opacity: 0, transition: { duration: 0.3 } })]);
        if (alive) setDone(true);
        return;
      }
      printCtl.set({ y: -h - 4, opacity: 1 });
      await wait(400);
      if (!alive) return;
      await printCtl.start({ y: GAP, transition: { duration: 1.5, ease: [0.3, 0.6, 0.25, 1] } });
      if (!alive) return;
      await wait(250);
      if (!alive) return;
      setSettled(true);
      await Promise.all([
        printCtl.start({ y: -h / 2, transition: { duration: 0.7, ease: EASE } }),
        slotCtl.start({ opacity: 0, scale: 0.96, transition: { duration: 0.5 } }),
      ]);
      if (alive) setDone(true);
    })();
    return () => {
      alive = false;
    };
  }, [reduced, printCtl, slotCtl]);

  const onSave = async () => {
    setSaving(true);
    try {
      const wm = wordRef.current?.querySelector(".wordmark");
      const fontFamily = wm ? getComputedStyle(wm).fontFamily : "Impact, sans-serif";
      await savePrint({ photoUrl, plate, bw, fontFamily });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="pickup-bg fixed inset-0 z-40 overflow-hidden"
      style={{ "--paper-w": PAPER_W, "--slot-w": `calc(${PAPER_W} + 32px)` } as CSSProperties}
    >
      <div className="absolute inset-x-0 top-1/2 h-[60dvh]" style={{ overflow: settled ? "visible" : "hidden", zIndex: settled ? 20 : 0 }}>
        <motion.div
          ref={printRef}
          initial={{ opacity: 0 }}
          animate={printCtl}
          className="print-paper absolute top-0"
          style={{ left: "50%", width: "var(--paper-w)", marginLeft: "calc(var(--paper-w) / -2)", aspectRatio: "3 / 2" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="Original photo" className="print-photo" style={bw ? { filter: "grayscale(1)" } : undefined} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={plateUrl} alt="Embossed silver plate" className="print-plate" />
          <div ref={wordRef} className="print-word">
            <Wordmark size="inherit" style={{ fontSize: "5.2cqw" }} />
          </div>
        </motion.div>
      </div>

      <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
        <motion.div animate={slotCtl} className="relative">
          <div className="pickup-label font-dot" aria-hidden={false}>
            PHOTOS DELIVERED HERE
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M6 13l6 6 6-6" />
            </svg>
          </div>
          <div className="pickup-slot">
            <span className="pickup-mouth" />
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: done ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-x-0 z-30 flex justify-center gap-3 px-4"
        style={{ bottom: "max(24px, env(safe-area-inset-bottom))", pointerEvents: done ? "auto" : "none" }}
      >
        <SteelButton led disabled={!done || saving} onClick={onSave}>
          {saving ? "Saving…" : "Save photo"}
        </SteelButton>
        <SteelButton variant="ghost" disabled={!done} onClick={onAgain}>
          Again
        </SteelButton>
      </motion.div>
    </div>
  );
}
