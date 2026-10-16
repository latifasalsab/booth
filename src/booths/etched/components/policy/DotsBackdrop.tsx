"use client";
/**
 * Ambient dots backdrop for the Policy page. Parses braille art (lib/brailleDots.ts) into dots and draws them on a
 * fixed, DPR-aware canvas: dots assemble from random offsets (~1.2s), shimmer and drift slowly, grow and tint lime
 * near the pointer, and ripple gently with scroll velocity (lib/scrollState.ts). Capped at 30fps, paused when the
 * tab is hidden, a single static frame with prefers-reduced-motion. intensity (0-1) tones the whole art down. Everything is cleaned up on unmount.
 */
import { useEffect, useRef } from "react";
import { getScrollVelocity } from "@/lib/scrollState";
import { parseBraille } from "../../lib/brailleDots";

const FRAME_MS = 1000 / 30;
const BASE = "201,204,209";
const LIME = "211,251,67";
const INFLUENCE = 120;
const BUCKETS = 8;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export default function DotsBackdrop({ art, intensity = 1 }: { art: string; intensity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const parsed = parseBraille(art);
    const n = parsed.dots.length;
    if (!n) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const d of parsed.dots) {
      minX = Math.min(minX, d.x);
      maxX = Math.max(maxX, d.x);
      minY = Math.min(minY, d.y);
      maxY = Math.max(maxY, d.y);
    }
    const artW = maxX - minX + 1;
    const artH = maxY - minY + 1;

    const ax = new Float32Array(n);
    const ay = new Float32Array(n);
    const ox = new Float32Array(n);
    const oy = new Float32Array(n);
    const dl = new Float32Array(n);
    const ph = new Float32Array(n);
    parsed.dots.forEach((d, i) => {
      ax[i] = d.x - minX;
      ay[i] = d.y - minY;
      ox[i] = (Math.random() * 2 - 1) * 40;
      oy[i] = (Math.random() * 2 - 1) * 40;
      dl[i] = Math.random() * 0.4;
      ph[i] = d.x * 0.05 + d.y * 0.07 + Math.random();
    });
    // Per-frame scratch for bucketed drawing
    const sx = new Float32Array(n);
    const sy = new Float32Array(n);
    const sr = new Float32Array(n);
    const sb = new Uint8Array(n);
    const counts = new Uint32Array(BUCKETS + 2);

    let W = 0;
    let H = 0;
    let dpr = 1;
    let scale = 1;
    let left = 0;
    let top = 0;
    let radius = 1.4;
    let alphaK = 1;
    let stride = 1;
    let px = -9999;
    let py = -9999;
    let ripple = 0;

    const layout = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      const desktop = W >= 1024;
      scale = Math.min(H * 0.86, 900) / artH;
      scale = Math.min(scale, (desktop ? W * 0.6 : W * 0.92) / artW);
      const aw = artW * scale;
      const ah = artH * scale;
      left = desktop ? W - aw - W * 0.04 : (W - aw) / 2;
      top = (H - ah) / 2;
      radius = clamp(scale * 0.45, 1.2, 1.6);
      alphaK = (desktop ? 1 : 0.18 / 0.35) * intensity;
      stride = W < 640 && n > 6000 ? 2 : 1;
    };

    const draw = (t: number, still: boolean) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const dx = still ? 0 : Math.sin(t * 0.12) * 4;
      const dy = still ? 0 : Math.cos(t * 0.09) * 3;
      const target = still ? 0 : Math.min(3, Math.abs(getScrollVelocity()) * 0.12);
      ripple += (target - ripple) * 0.12;
      const aMax = 0.35 * alphaK * 1.5;
      counts.fill(0);
      let m = 0;
      for (let i = 0; i < n; i += stride) {
        const a = still ? 1 : clamp((t - dl[i]) / 0.8, 0, 1);
        const e = 1 - Math.pow(1 - a, 3);
        let x = left + ax[i] * scale + ox[i] * (1 - e) + dx;
        let y = top + ay[i] * scale + oy[i] * (1 - e) + dy;
        if (ripple > 0.01) y += Math.sin(x * 0.03 + y * 0.012 + t * 5) * ripple;
        const shimmer = still ? 0.8 : 0.55 + 0.45 * (0.5 + 0.25 * Math.sin(t * 1.3 + ph[i]) + 0.25 * Math.sin(t * 0.7 + ph[i] * 1.7));
        let infl = 0;
        if (!still && px > -1000) {
          const d = Math.hypot(x - px, y - py);
          if (d < INFLUENCE) {
            const k = 1 - d / INFLUENCE;
            infl = k * k * (3 - 2 * k);
          }
        }
        let b: number;
        if (infl > 0.4) b = (infl - 0.4) / 0.6 < 0.5 ? BUCKETS : BUCKETS + 1;
        else b = Math.min(BUCKETS - 1, Math.floor((0.35 * alphaK * (shimmer + 0.5 * infl) * e) / aMax * BUCKETS));
        if (e < 0.02) continue;
        sx[m] = x;
        sy[m] = y;
        sr[m] = radius * (1 + 0.8 * infl);
        sb[m] = b;
        counts[b]++;
        m++;
      }
      for (let b = 0; b < BUCKETS + 2; b++) {
        if (!counts[b]) continue;
        ctx.fillStyle = b < BUCKETS ? `rgba(${BASE},${(((b + 0.5) / BUCKETS) * aMax).toFixed(3)})` : `rgba(${LIME},${b === BUCKETS ? 0.25 : 0.5})`;
        ctx.beginPath();
        for (let i = 0; i < m; i++) {
          if (sb[i] !== b) continue;
          ctx.moveTo(sx[i] + sr[i], sy[i]);
          ctx.arc(sx[i], sy[i], sr[i], 0, TAU);
        }
        ctx.fill();
      }
    };

    layout();
    const onResize = () => {
      layout();
      if (reduced) draw(0, true);
    };
    window.addEventListener("resize", onResize, { passive: true });

    if (reduced) {
      draw(0, true);
      return () => window.removeEventListener("resize", onResize);
    }

    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
    };
    const onLeave = () => {
      px = py = -9999;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave, { passive: true });

    const t0 = performance.now();
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      last = now;
      draw((now - t0) / 1000, false);
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [art, intensity]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed left-0 top-0 z-0" />;
}
