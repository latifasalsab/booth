"use client";
/**
 * ?debug=1 overlay for the REVIEW step: segmentation classes at 35% alpha, the extracted stroke outlines and a small
 * label "glasses: no|traced|fitted|fallback · hair strokes: N · model: ok/fallback". Glasses debug: traced frame
 * center-line points (yellow dots) and the final lens curves (lime). Never rendered without the flag.
 */
import { useEffect, useRef } from "react";
import type { Analysis } from "../lib/analysis";
import type { Portrait } from "../lib/faceStrokes";
import type { StrokeKind } from "../lib/strokePath";

const CLASS_COLORS: (string | null)[] = [null, "255,159,28", "46,196,182", "255,77,109", "67,97,238", "181,23,158"];
const KIND_COLORS: Record<StrokeKind, string> = {
  silhouette: "#ffffff",
  boundary: "#ffd166",
  face: "#ef476f",
  brow: "#06d6a0",
  eye: "#118ab2",
  glasses: "#d3fb43",
  nose: "#f78c6b",
  lips: "#ff6b9d",
  hair: "#c77dff",
};

export default function DebugOverlay({ an, portrait }: { an: Analysis | null; portrait: Portrait | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const W = 480;
    const H = 600;
    c.width = W;
    c.height = H;
    ctx.clearRect(0, 0, W, H);
    if (an?.classes) {
      const { w, h, data } = an.classes;
      const small = document.createElement("canvas");
      small.width = w;
      small.height = h;
      const sctx = small.getContext("2d");
      if (sctx) {
        const img = sctx.createImageData(w, h);
        for (let i = 0; i < data.length; i++) {
          const col = CLASS_COLORS[data[i]];
          if (!col) continue;
          const [r, g, b] = col.split(",").map(Number);
          img.data[i * 4] = r;
          img.data[i * 4 + 1] = g;
          img.data[i * 4 + 2] = b;
          img.data[i * 4 + 3] = Math.round(255 * 0.35);
        }
        sctx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(small, 0, 0, W, H);
      }
    }
    if (portrait) {
      ctx.lineWidth = 1.6;
      for (const s of portrait.strokes) {
        ctx.strokeStyle = KIND_COLORS[s.kind];
        ctx.beginPath();
        s.pts.forEach((p, i) => (i ? ctx.lineTo(p.x * W, p.y * H) : ctx.moveTo(p.x * W, p.y * H)));
        ctx.stroke();
      }
      const g = portrait.info.glassesDebug;
      if (g && portrait.info.glasses) {
        ctx.fillStyle = "#ffd166";
        for (const set of g.trace) for (const p of set) ctx.fillRect(p.x * W - 1, p.y * H - 1, 2, 2);
        ctx.strokeStyle = "#d3fb43";
        ctx.lineWidth = 2;
        for (const f of g.fits) {
          ctx.beginPath();
          f.forEach((p, i) => (i ? ctx.lineTo(p.x * W, p.y * H) : ctx.moveTo(p.x * W, p.y * H)));
          ctx.stroke();
        }
      }
    }
  }, [an, portrait]);

  const info = portrait?.info;
  return (
    <>
      <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-md bg-black/75 px-2 py-1 font-dot text-[11px] tracking-[.06em] text-white">
        {info ? `glasses: ${info.glasses ? info.glassesMode : "no"} · hair strokes: ${info.hairStrokes} · model: ${info.model === "ok" ? "ok" : "fallback"}` : "analyzing…"}
      </div>
    </>
  );
}
