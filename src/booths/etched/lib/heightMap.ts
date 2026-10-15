/**
 * Height map painter. Draws layered relief, the etched line (up to a progress value) and user decorations into a
 * grayscale canvas: black = flat, white = raised. Each stroke is painted in several passes with
 * shrinking width and rising brightness to get a thick, rounded pressed-wire cross-section.
 */
import { clamp } from "./raster";
import type { LinePath, Pt } from "./strokePath";

export const HW = 448;
export const HH = 560;
/** Analysis (working) size. Stroke widths are specified in working pixels and scaled to the height canvas. */
export const WORK_W = 768;
export const WORK_H = 960;
export const WIDTH_SCALE = HW / WORK_W;

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

/**
 * Composes the height map from layers: relief base (clothes / hair plateau / skin, from analysis.buildRelief) +
 * the etched line (incremental, so the animation only draws new segments) + user decorations. Segment widths come
 * from the path (working px); sizeK scales them (Size slider).
 */
export class HeightPainter {
  path: LinePath | null = null;
  private base: HTMLCanvasElement | null = null;
  private strokes: HTMLCanvasElement | null = null;
  private dirty = true;
  private drawn = 0;
  private seg = 0;
  private sizeK = 1;

  setBase(c: HTMLCanvasElement | null) {
    this.base = c;
  }
  setPath(p: LinePath | null) {
    this.path = p;
    this.dirty = true;
  }
  setSizeK(k: number) {
    if (Math.abs(k - this.sizeK) > 1e-6) {
      this.sizeK = k;
      this.dirty = true;
    }
  }

  private strokeCtx(): CanvasRenderingContext2D | null {
    if (!this.strokes) {
      this.strokes = document.createElement("canvas");
      this.strokes.width = HW;
      this.strokes.height = HH;
      this.dirty = true;
    }
    const ctx = this.strokes.getContext("2d");
    if (ctx && this.dirty) {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, HW, HH);
      this.dirty = false;
      this.drawn = 0;
      this.seg = 0;
    }
    return ctx;
  }

  private drawTo(progress: number) {
    const path = this.path;
    if (!path || path.pts.length < 2) return;
    let ctx = this.strokeCtx();
    if (!ctx) return;
    const total = path.total * clamp(progress, 0, 1);
    if (total < this.drawn - 1e-9) {
      this.dirty = true;
      ctx = this.strokeCtx();
      if (!ctx) return;
    }
    if (total <= this.drawn) return;
    ctx.globalCompositeOperation = "lighten";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const n = path.pts.length;
    let i = this.seg;
    while (i < n - 2 && path.cum[i + 1] <= this.drawn) i++;
    for (; i < n - 1 && path.cum[i] < total; i++) {
      const len = path.cum[i + 1] - path.cum[i];
      if (len <= 0) continue;
      const t0 = Math.max(0, (this.drawn - path.cum[i]) / len);
      const t1 = Math.min(1, (total - path.cum[i]) / len);
      const a = path.pts[i];
      const b = path.pts[i + 1];
      const x0 = (a.x + (b.x - a.x) * t0) * HW;
      const y0 = (a.y + (b.y - a.y) * t0) * HH;
      const x1 = (a.x + (b.x - a.x) * t1) * HW;
      const y1 = (a.y + (b.y - a.y) * t1) * HH;
      const shallow = path.shallow[i];
      const width = path.w[i] * WIDTH_SCALE * this.sizeK * (shallow ? 0.45 : 1);
      profile(ctx, width, shallow ? 0.16 : 1, () => {
        ctx?.beginPath();
        ctx?.moveTo(x0, y0);
        ctx?.lineTo(x1, y1);
        ctx?.stroke();
      });
      this.seg = i;
    }
    this.drawn = total;
  }

  /** Repaint target: base layer, etched line up to progress (0..1), then decorations (decoWidth in canvas px). */
  paint(target: HTMLCanvasElement, progress: number, decos: Deco[], decoWidth: number) {
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, HW, HH);
    if (this.base) ctx.drawImage(this.base, 0, 0);
    this.drawTo(progress);
    ctx.globalCompositeOperation = "lighten";
    if (this.strokes && this.path) ctx.drawImage(this.strokes, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const d of decos) paintDeco(ctx, d, decoWidth);
    ctx.globalCompositeOperation = "source-over";
  }
}
