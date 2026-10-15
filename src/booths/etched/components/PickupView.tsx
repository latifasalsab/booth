"use client";
/**
 * PRINT: steel pickup screen. The group (label, slot, print) is centered in the viewport. The glossy landscape print
 * starts hidden behind the slot and slides out of the mouth while its images "develop" from the center outward.
 * When the animation ends everything STAYS as is (print and slot visible); Save photo and Again appear below.
 * Geometry mirrors lib/exportPrint.ts; the sheen follows the pointer x (or device tilt) on screen.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { measureFont, savePrint, type FontMetrics } from "../lib/exportPrint";
import SteelButton from "./SteelButton";
import Wordmark from "./Wordmark";

const EJECT_EASE: [number, number, number, number] = [0.3, 0.6, 0.25, 1];
const DEVELOP_EASE: [number, number, number, number] = [0.22, 0.7, 0.3, 1];
const SLOT_HALF = 26; // half the slot height: the print starts at the mouth line
const GAP = 14; // space between slot and print once ejected
const CLOSED = "circle(0% at 50% 50%)";
const OPEN = "circle(75% at 50% 50%)";
/** Paper width: fits the viewport while leaving room for label, slot and the buttons below. */
const PAPER_W = "min(88vw, 960px, calc((100dvh - 270px) * 1.5))";
/** Wordmark cap height = 3.5% of the print height, centered in the bottom band (units: % of print width). */
const CAP_CQW = (1200 * 0.035) / 18;
const WORD_CENTER_CQW = (72 + 958 + 64 + (1200 * 0.035) / 2) / 18;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Props {
  photoUrl: string;
  plate: HTMLCanvasElement;
  bw: boolean;
  onAgain: () => void;
}

export default function PickupView({ photoUrl, plate, bw, onAgain }: Props) {
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const plateUrl = useMemo(() => plate.toDataURL("image/png"), [plate]);
  const printCtl = useAnimationControls();
  const devCtl = useAnimationControls();
  const printRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);
  const [clipOpen, setClipOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fm, setFm] = useState<FontMetrics>({ cap: 0.72, asc: 1.1, desc: 0.3 });

  // Real wordmark metrics so the cap height and vertical centering are exact.
  useEffect(() => {
    let alive = true;
    const wm = wordRef.current?.querySelector(".wordmark");
    if (wm) measureFont(getComputedStyle(wm).fontFamily).then((m) => alive && setFm(m));
    return () => {
      alive = false;
    };
  }, []);

  // Eject + develop. Ends in a stable final state: nothing fades out or resets.
  useEffect(() => {
    let alive = true;
    const el = printRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    const finalY = SLOT_HALF + GAP;
    (async () => {
      if (reducedRef.current) {
        printCtl.set({ y: finalY, opacity: 0 });
        devCtl.set({ clipPath: OPEN });
        await printCtl.start({ opacity: 1, transition: { duration: 0.3 } });
        if (!alive) return;
        setClipOpen(true);
        setDone(true);
        return;
      }
      printCtl.set({ y: -h - 8, opacity: 1 });
      devCtl.set({ clipPath: CLOSED });
      await wait(300);
      if (!alive) return;
      const eject = printCtl.start({ y: finalY, transition: { duration: 1.5, ease: EJECT_EASE } });
      const develop = wait(500).then(() => (alive ? devCtl.start({ clipPath: OPEN, transition: { duration: 1.2, ease: DEVELOP_EASE } }) : undefined));
      await Promise.all([eject, develop]);
      if (!alive) return;
      setClipOpen(true);
      setDone(true);
    })();
    return () => {
      alive = false;
    };
  }, [printCtl, devCtl]);

  // Sheen follows pointer x / device tilt, smoothed; transform only.
  useEffect(() => {
    const el = sheenRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let target = 0;
    let cur = 0;
    let raf = 0;
    const tick = () => {
      cur += (target - cur) * 0.08;
      el.style.transform = `translate3d(${cur.toFixed(2)}%,0,0)`;
      raf = Math.abs(target - cur) > 0.02 ? requestAnimationFrame(tick) : 0;
    };
    const aim = (nx: number) => {
      target = (nx - 0.5) * 80;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => aim(e.clientX / window.innerWidth);
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma != null) aim(Math.min(1, Math.max(0, 0.5 + e.gamma / 60)));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("deviceorientation", onTilt);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("deviceorientation", onTilt);
    };
  }, []);

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

  const wordSize = CAP_CQW / fm.cap;
  const wordTop = WORD_CENTER_CQW - wordSize * ((1 - (fm.asc + fm.desc)) / 2 + fm.asc - fm.cap / 2);

  return (
    <div className="pickup-bg fixed inset-0 z-40 overflow-hidden" style={{ "--paper-w": PAPER_W, "--slot-w": `calc(${PAPER_W} + 32px)` } as CSSProperties}>
      <div className="flex h-full flex-col items-center justify-center">
        <div className="pickup-label font-dot">
          PHOTOS DELIVERED HERE
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
        </div>
        <div className="pickup-slot">
          <span className="pickup-mouth" />
        </div>
        <div
          className="relative"
          style={{
            zIndex: 0,
            width: "calc(var(--paper-w) + 80px)",
            height: `calc(var(--paper-w) / 1.5 + ${SLOT_HALF + GAP + 40}px)`,
            marginTop: -SLOT_HALF,
            overflow: clipOpen ? "visible" : "hidden",
          }}
        >
          <motion.div ref={printRef} initial={{ opacity: 0 }} animate={printCtl} className="print-paper absolute top-0" style={{ left: 40, width: "var(--paper-w)", aspectRatio: "3 / 2" }}>
            <motion.div initial={{ clipPath: CLOSED }} animate={devCtl} className="print-content">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt="Original photo" className="print-photo" style={bw ? { filter: "grayscale(1)" } : undefined} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={plateUrl} alt="Embossed silver plate" className="print-plate" />
            </motion.div>
            <div ref={wordRef} className="print-word" style={{ top: `${wordTop}cqw` }}>
              <Wordmark size="inherit" style={{ fontSize: `${wordSize}cqw`, letterSpacing: ".06em", lineHeight: 1 }} />
            </div>
            <div className="print-finish" aria-hidden />
            <div className="print-sheen-clip" aria-hidden>
              <div ref={sheenRef} className="print-sheen" />
            </div>
          </motion.div>
        </div>
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
