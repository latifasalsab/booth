/**
 * Height map painter. Draws the etched line (up to a progress value) and user decorations into a
 * grayscale canvas: black = flat, white = raised. Each stroke is painted in several passes with
 * shrinking width and rising brightness to get a thick, rounded pressed-wire cross-section.
 */
import type { LinePath, Pt } from "./strokePath";

export const HW = 448;
export const HH = 560;

export type DecoKind = "star" | "flower" | "heart" | "snowflake" | "text" | "line";

/** A user-placed decoration. x/y = center (normalized), r = hit radius as a fraction of plate width. */
export interface Deco {
  id: number;
  kind: DecoKind;
  x: number;
  y: number;
  r: number;
  text?: string;
  /** line only: points relative to x/y, normalized */
  rel?: Pt[];
}

const SHAPE_R = 0.12;
const Y_K = HW / HH; // converts width-fraction offsets into y-fraction offsets
const PASSES = 6;
const TEXT_FONT_PX = Math.round(0.15 * HW);

export function createHeightCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = HW;
  c.height = HH;
  c.getContext("2d", { willReadFrequently: true });
  return c;
}

/** Unit-radius polylines (y down) for the icon-style shapes. */
export function unitPolylines(kind: DecoKind): Pt[][] {
  switch (kind) {
    case "star": {
      const p = Array.from({ length: 11 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 1 : 0.42;
        return { x: Math.cos(a) * r, y: Math.sin(a) * r };
      });
      return [p];
    }
    case "heart":
      return [
        Array.from({ length: 49 }, (_, i) => {
          const t = (i / 48) * Math.PI * 2;
          return {
            x: (16 * Math.sin(t) ** 3) / 17,
            y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17,
          };
        }),
      ];
    case "flower":
      return [
        Array.from({ length: 97 }, (_, i) => {
          const t = (i / 96) * Math.PI * 2;
          const r = 0.4 + 0.6 * Math.abs(Math.cos(3 * t));
          return { x: Math.cos(t) * r, y: Math.sin(t) * r };
        }),
        Array.from({ length: 25 }, (_, i) => {
          const t = (i / 24) * Math.PI * 2;
          return { x: Math.cos(t) * 0.16, y: Math.sin(t) * 0.16 };
        }),
      ];
    case "snowflake": {
      const out: Pt[][] = [];
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        const dir = { x: Math.cos(a), y: Math.sin(a) };
        out.push([{ x: 0, y: 0 }, dir]);
        for (const s of [0.5, 0.78]) {
          const base = { x: dir.x * s, y: dir.y * s };
          const l = 0.3 * (1.15 - s * 0.5);
          const b1 = { x: base.x + Math.cos(a + Math.PI / 3) * l, y: base.y + Math.sin(a + Math.PI / 3) * l };
          const b2 = { x: base.x + Math.cos(a - Math.PI / 3) * l, y: base.y + Math.sin(a - Math.PI / 3) * l };
          out.push([b1, base, b2]);
        }
      }
      return out;
    }
    default:
      return [];
  }
}

/** Absolute normalized polylines for a deco (text has none; it is painted as glyph outlines). */
export function decoPolylines(d: Deco): Pt[][] {
  if (d.kind === "line") return d.rel ? [d.rel.map((p) => ({ x: d.x + p.x, y: d.y + p.y }))] : [];
  return unitPolylines(d.kind).map((pl) => pl.map((p) => ({ x: d.x + p.x * SHAPE_R, y: d.y + p.y * SHAPE_R * Y_K })));
}

export function makeDeco(id: number, kind: DecoKind, x: number, y: number, text = "Hello"): Deco {
  const cx = Math.min(0.9, Math.max(0.1, x));
  const cy = Math.min(0.92, Math.max(0.08, y));
  if (kind === "text") {
    const t = text.trim().slice(0, 10) || "Hello";
    return { id, kind, x: cx, y: cy, text: t, r: Math.min(0.42, t.length * 0.045 + 0.04) };
  }
  return { id, kind, x: cx, y: cy, r: SHAPE_R * 1.05 };
}

/** Build a free-line deco from absolute points (recentered on its bounding box). */
export function lineDeco(id: number, abs: Pt[]): Deco {
  const xs = abs.map((p) => p.x);
  const ys = abs.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const rel = abs.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  const r = Math.max(0.05, ...rel.map((p) => Math.hypot(p.x, p.y * (HH / HW)))) + 0.02;
  return { id, kind: "line", x: cx, y: cy, r, rel };
}

/** Topmost deco under a point (distance measured in plate-width units). */
export function hitTest(decos: Deco[], p: Pt): Deco | null {
  for (let i = decos.length - 1; i >= 0; i--) {
    const d = decos[i];
    if (Math.hypot(p.x - d.x, (p.y - d.y) * (HH / HW)) <= d.r) return d;
  }
  return null;
}

type Trace = () => void;

/** Paint one stroke with a rounded cross-section: wide dim pass first, narrow bright pass last. */
function profile(ctx: CanvasRenderingContext2D, thickness: number, level: number, draw: Trace) {
  for (let i = 0; i < PASSES; i++) {
    const k = i / (PASSES - 1);
    const g = Math.round(255 * level * (0.2 + 0.8 * k));
    ctx.strokeStyle = `rgb(${g},${g},${g})`;
    ctx.lineWidth = Math.max(1, thickness * (1 - 0.8 * k));
    draw();
  }
}

function strokePoly(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x * HW, pts[0].y * HH);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * HW, pts[i].y * HH);
  ctx.stroke();
}

function paintPath(ctx: CanvasRenderingContext2D, path: LinePath, progress: number, thickness: number) {
  const target = path.total * Math.min(1, Math.max(0, progress));
  const n = path.pts.length;
  if (target <= 0 || n < 2) return;
  let i = 0;
  while (i < n - 1 && path.cum[i] < target) {
    const flag = path.shallow[i];
    const run: Pt[] = [path.pts[i]];
    while (i < n - 1 && path.shallow[i] === flag && path.cum[i] < target) {
      const a = path.pts[i];
      const b = path.pts[i + 1];
      if (path.cum[i + 1] <= target) {
        run.push(b);
        i++;
      } else {
        const f = (target - path.cum[i]) / (path.cum[i + 1] - path.cum[i]);
        run.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
        i = n;
      }
    }
    if (run.length > 1) profile(ctx, flag ? thickness * 0.45 : thickness, flag ? 0.16 : 1, () => strokePoly(ctx, run));
  }
}

function paintDeco(ctx: CanvasRenderingContext2D, d: Deco, thickness: number) {
  if (d.kind === "text" && d.text) {
    ctx.font = `800 ${TEXT_FONT_PX}px "Arial Black", Impact, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    profile(ctx, thickness * 0.6, 1, () => ctx.strokeText(d.text as string, d.x * HW, d.y * HH));
    return;
  }
  for (const pl of decoPolylines(d)) if (pl.length > 1) profile(ctx, thickness, 1, () => strokePoly(ctx, pl));
}

/** Repaint the whole height map. progress applies to the portrait line only. */
export function paintHeightMap(canvas: HTMLCanvasElement, path: LinePath | null, progress: number, decos: Deco[], thickness: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, HW, HH);
  ctx.globalCompositeOperation = "lighten";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (path) paintPath(ctx, path, progress, thickness);
  for (const d of decos) paintDeco(ctx, d, thickness);
  ctx.globalCompositeOperation = "source-over";
}
