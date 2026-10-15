"use client";
/**
 * About hero: label, wordmark and tagline on the left; on the right an etched plate (PlateCanvas) whose single
 * line draws itself once when it scrolls into view. The portrait is traced from public/about/portrait.jpg when it
 * exists (portraitSrc), otherwise the sample strokes from the idle demo are used. Slight scroll parallax (+-20px).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, useReducedMotion, useScroll, useTransform } from "framer-motion";
import Reveal from "@/components/shared/Reveal";
import { ABOUT_LABEL, ABOUT_TAGLINE } from "../../content/about";
import { cropToPortrait } from "../../hooks/useCamera";
import { useEmbossProgress } from "../../hooks/useEmbossProgress";
import { getFaceStrokesAsync, isClearFace, sampleFaceStrokes } from "../../lib/faceStrokes";
import { createHeightCanvas, paintHeightMap } from "../../lib/heightMap";
import { buildSingleLine, pointAt, type LinePath } from "../../lib/strokePath";
import PlateCanvas, { type PenState } from "../PlateCanvas";
import Wordmark from "../Wordmark";

const DRAW_MS = 4000;

export default function AboutHero({ portraitSrc }: { portraitSrc: string | null }) {
  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const heightCanvas = useMemo(() => (typeof document === "undefined" ? null : createHeightCanvas()), []);
  const versionRef = useRef(0);
  const penRef = useRef<PenState>({ x: 0, y: 0, on: false });
  const pathRef = useRef<LinePath | null>(null);
  const startedRef = useRef(false);
  const [ready, setReady] = useState(false);

  const repaint = useCallback(
    (p: number) => {
      if (!heightCanvas) return;
      paintHeightMap(heightCanvas, pathRef.current, p, [], 9);
      versionRef.current++;
    },
    [heightCanvas],
  );
  const onFrame = useCallback(
    (p: number) => {
      repaint(p);
      if (pathRef.current) {
        const pt = pointAt(pathRef.current, p);
        penRef.current = { x: pt.x, y: pt.y, on: p > 0 && p < 1 };
      }
    },
    [repaint],
  );
  const emboss = useEmbossProgress(onFrame, true);

  // Build the path: traced portrait if available and clear, else the sample face.
  useEffect(() => {
    let alive = true;
    const useSample = () => {
      pathRef.current = buildSingleLine(sampleFaceStrokes());
      repaint(0);
      if (alive) setReady(true);
    };
    if (!portraitSrc) {
      useSample();
      return () => {
        alive = false;
      };
    }
    const img = new Image();
    img.onload = async () => {
      if (!alive) return;
      const strokes = await getFaceStrokesAsync(cropToPortrait(img, img.naturalWidth, img.naturalHeight), "low");
      if (!alive) return;
      if (isClearFace(strokes)) {
        pathRef.current = buildSingleLine(strokes);
        repaint(0);
        setReady(true);
      } else useSample();
    };
    img.onerror = () => alive && useSample();
    img.src = portraitSrc;
    return () => {
      alive = false;
    };
  }, [portraitSrc, repaint]);

  // Draw once when the plate enters the viewport.
  const inView = useInView(stageRef, { once: true, margin: "-20% 0px" });
  useEffect(() => {
    if (!inView || !ready || startedRef.current) return;
    startedRef.current = true;
    emboss.start(reduced ? 900 : DRAW_MS, () => {
      penRef.current = { ...penRef.current, on: false };
    });
  }, [inView, ready, emboss, reduced]);

  const { scrollYProgress } = useScroll({ target: stageRef, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [20, -20]);

  return (
    <section className="mx-auto grid max-w-6xl items-center gap-8 px-5 pb-12 pt-28 lg:min-h-[92dvh] lg:grid-cols-2">
      <div>
        <Reveal>
          <p className="t-label text-muted">{ABOUT_LABEL}</p>
        </Reveal>
        <Reveal delay={0.07} className="mt-4">
          <Wordmark size="inherit" style={{ fontSize: "clamp(52px, 6.4vw, 92px)" }} />
        </Reveal>
        <Reveal delay={0.14}>
          <p className="t-lead mt-6 max-w-md text-ink/90">{ABOUT_TAGLINE}</p>
        </Reveal>
      </div>
      <motion.div ref={stageRef} style={{ y }} className="relative mx-auto h-[min(66dvh,620px)] w-full max-w-[520px]">
        <PlateCanvas
          className="h-full w-full"
          heightCanvas={heightCanvas}
          versionRef={versionRef}
          penRef={penRef}
          metal="silver"
          depth={0.55}
          selection={null}
          editing={false}
        />
      </motion.div>
    </section>
  );
}
