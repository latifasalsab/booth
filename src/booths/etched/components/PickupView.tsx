"use client";
/**
 * PRINT: steel pickup screen. The group (label, slot, print) is centered in the viewport. The landscape print starts
 * fully hidden INSIDE the black mouth of the slot and slides down out of it: slot at the bottom, paper above it but
 * clipped at the mouth's vertical center line and to the slot's inner width (nothing can render outside the slot; no
 * overlay gradients or wrapper shadows). It comes to rest 6px below the mouth's lower edge. The images are revealed by a
 * top-to-bottom wipe synchronized with the paper (faint 2px print-head line, brightness 70% -> 100%). The paper's subtle
 * shadow and the faint sheen fade in only AFTER the paper has fully emerged. When the animation ends everything STAYS as
 * is; Save photo and Again appear below. Calm easing, no bounce.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { animate, motion, useAnimationControls, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useReadyGate } from "@/components/shared/TransitionProvider";
import { measureFont, savePrint, type FontMetrics } from "../lib/exportPrint";
import SteelButton from "./SteelButton";
import Wordmark from "./Wordmark";

const SLIDE_EASE: [number, number, number, number] = [0.3, 0.6, 0.25, 1];
const WIPE_EASE: [number, number, number, number] = [0.3, 0.55, 0.25, 1];
const SLOT_HALF = 26; // half the slot height: the mouth's center line
const REST_Y = 15 + 6; // below the center line: half the mouth (15px) + 6px
/** Paper width: fits the viewport while leaving room for label, slot and the buttons below. */
const PAPER_W = "min(calc(100vw - 80px), 960px, calc((100dvh - 270px) * 1.5))";
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
  // hold the transition reveal until both images are decoded
  const decoded = useMemo(
    () => (typeof window === "undefined" ? true : Promise.all([photoUrl, plateUrl].map((u) => { const i = new Image(); i.src = u; return i.decode().catch(() => undefined); }))),
    [photoUrl, plateUrl],
  );
  useReadyGate(decoded);
  const printCtl = useAnimationControls();
  const reveal = useMotionValue(0); // 0..1: how much of the print has been printed (top to bottom)
  const clipPath = useTransform(reveal, (v) => `inset(0 0 ${((1 - v) * 100).toFixed(2)}% 0)`);
  const imageFilter = useTransform(reveal, (v) => `brightness(${(0.7 + 0.3 * v).toFixed(3)})`);
  const headTop = useTransform(reveal, (v) => `${(v * 100).toFixed(2)}%`);
  const headOpacity = useTransform(reveal, [0, 0.03, 0.97, 1], [0, 1, 1, 0]);
  const printRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);
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

  // Slide out of the mouth + top-to-bottom wipe. Ends in a stable final state: nothing fades out or resets.
  useEffect(() => {
    let alive = true;
    let wipe: { stop: () => void } | null = null;
    const el = printRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    (async () => {
      if (reducedRef.current) {
        reveal.set(1);
        printCtl.set({ y: REST_Y, opacity: 0 });
        await printCtl.start({ opacity: 1, transition: { duration: 0.3 } });
        if (!alive) return;
        setDone(true);
        return;
      }
      reveal.set(0);
      printCtl.set({ y: -h - 8, opacity: 1 }); // fully hidden above the clip line, inside the mouth
      await wait(300);
      if (!alive) return;
      const slide = printCtl.start({ y: REST_Y, transition: { duration: 1.4, ease: SLIDE_EASE } });
      const w = animate(reveal, 1, { duration: 1.8, ease: WIPE_EASE });
      wipe = w;
      await Promise.all([slide, w]);
      if (!alive) return;
      setDone(true);
    })();
    return () => {
      alive = false;
      wipe?.stop();
    };
  }, [printCtl, reveal]);

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
  const clipW = "calc(var(--paper-w) + 24px)"; // the mouth's inner width (slot minus its 11px lips)

  return (
    <div className="pickup-bg fixed inset-0 z-40 overflow-hidden" style={{ "--paper-w": PAPER_W, "--slot-w": "calc(var(--paper-w) + 46px)" } as CSSProperties}>
      <div className="flex h-full flex-col items-center justify-center">
        <div className="pickup-label font-dot">
          PHOTOS DELIVERED HERE
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
        </div>
        {/* slot wrapper: its bottom margin makes room for the paper that hangs below the mouth, so the group stays centered */}
        <div className="relative" style={{ marginBottom: "calc(var(--paper-w) / 1.5 - 5px)" }}>
          <div className="pickup-slot">
            <span className="pickup-mouth" />
          </div>
          {/* clip line = the mouth's vertical center: the paper is only visible below it until it has come out */}
          <div
            className="absolute left-1/2"
            style={{
              zIndex: 2,
              top: SLOT_HALF,
              width: clipW,
              marginLeft: `calc(${clipW} / -2)`,
              height: `calc(var(--paper-w) / 1.5 + ${REST_Y + 40}px)`,
              clipPath: "inset(0 0 -40px 0)", // top = the mouth's center line, sides = the slot's inner width, room below for the shadow
              pointerEvents: "none",
            }}
          >
            <motion.div ref={printRef} initial={{ opacity: 0 }} animate={printCtl} className="print-paper absolute top-0" style={{ left: 12, width: "var(--paper-w)", aspectRatio: "3 / 2", pointerEvents: "auto" }}>
              <div className="print-shadow" data-on={done} aria-hidden />
              <motion.div className="print-ink" style={{ clipPath }}>
                <motion.div className="print-images" style={{ filter: imageFilter }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl} alt="Original photo" className="print-photo" style={bw ? { filter: "grayscale(1)" } : undefined} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={plateUrl} alt="Embossed silver plate" className="print-plate" />
                </motion.div>
                <div ref={wordRef} className="print-word" style={{ top: `${wordTop}cqw` }}>
                  <Wordmark size="inherit" style={{ fontSize: `${wordSize}cqw`, letterSpacing: ".06em", lineHeight: 1 }} />
                </div>
              </motion.div>
              <div className="print-sheen-clip" data-on={done} aria-hidden>
                <div ref={sheenRef} className="print-sheen" />
              </div>
              <motion.div className="print-head" aria-hidden style={{ top: headTop, opacity: headOpacity }} />
            </motion.div>
          </div>
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
