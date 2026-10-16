/**
 * User elements (star, flower, heart, snowflake, text, free line) with a full transform: center, scale, rotation.
 * Coordinates are normalized to the plate; "width-fraction units" (u, v) are isotropic (1 = plate width).
 * Everything the plate and the print show comes from here: polylines/glyphs painted with the pressed-wire profile
 * into the height map, the selection frame with corner handles and rotate handle, hit-testing and clamping.
 */
import { HH, HW, WIDTH_SCALE } from "./dims";
import { clamp } from "./raster";
import type { Pt } from "./strokePath";

export type DecoKind = "star" | "flower" | "heart" | "snowflake" | "text" | "line";
export type FontKey = "anton" | "jakarta" | "doto";
export const FONT_LABEL: Record<FontKey, string> = { anton: "Anton", jakarta: "Jakarta", doto: "Doto" };

export interface Deco {
  id: number;
  kind: DecoKind;
  /** Center (normalized). */
  x: number;
  y: number;
  /** 1 = default size; 0.1 .. 3. */
  scale: number;
  /** Radians. */
  rot: number;
  /** Stroke width in working pixels (768 px wide image). */
  lw: number;
  text?: string;
  font?: FontKey;
  /** Free line: points relative to x/y (normalized). */
  rel?: Pt[];
}

export const SHAPE_R = 0.12;
export const DEFAULT_LW = 7;
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 3;
const Y_K = HW / HH; // width-fraction offset -> normalized y offset
const PASSES = 6;
export const TEXT_FONT_PX = Math.round(0.15 * HW);
const PAD = 0.012;
const HANDLE_OFFSET = 0.05;
const HANDLE_HIT = 0.035;

// ---------------------------------------------------------------- fonts (canvas needs concrete family names)
const families: Record<FontKey, string> = { anton: 'Impact, "Arial Narrow", sans-serif', jakarta: "system-ui, sans-serif", doto: "ui-monospace, monospace" };
const weights: Record<FontKey, number> = { anton: 400, jakarta: 800, doto: 700 };
export function setDecoFonts(f: Partial<Record<FontKey, string>>): void {
  for (const k of Object.keys(f) as FontKey[]) {
    const v = f[k];
    if (v) families[k] = v;
  }
}
export const fontSpec = (d: Deco, px: number): string => `${weights[d.font ?? "anton"]} ${px}px ${families[d.font ?? "anton"]}`;

let measureCtx: CanvasRenderingContext2D | null = null;
function textWidthPx(d: Deco): number {
  const text = d.text ?? "";
  if (typeof document === "undefined") return text.length * TEXT_FONT_PX * 0.6;
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * TEXT_FONT_PX * 0.6;
  measureCtx.font = fontSpec(d, TEXT_FONT_PX);
  return measureCtx.measureText(text).width;
}

// ---------------------------------------------------------------- shapes
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
          return { x: (16 * Math.sin(t) ** 3) / 17, y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 };
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
          out.push([
            { x: base.x + Math.cos(a + Math.PI / 3) * l, y: base.y + Math.sin(a + Math.PI / 3) * l },
            base,
            { x: base.x + Math.cos(a - Math.PI / 3) * l, y: base.y + Math.sin(a - Math.PI / 3) * l },
          ]);
        }
      }
      return out;
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------- transform
/** Local (u, v) in width-fraction units at scale 1 -> normalized plate coordinates. */
export function decoXform(d: Deco): (u: number, v: number) => Pt {
  const c = Math.cos(d.rot);
  const s = Math.sin(d.rot);
  return (u, v) => ({ x: d.x + (u * c - v * s) * d.scale, y: d.y + (u * s + v * c) * d.scale * Y_K });
}

/** Normalized plate point -> local (u, v) at scale 1. */
function toLocal(d: Deco, p: Pt): { u: number; v: number } {
  const dx = p.x - d.x;
  const dy = (p.y - d.y) / Y_K;
  const c = Math.cos(-d.rot);
  const s = Math.sin(-d.rot);
  return { u: (dx * c - dy * s) / d.scale, v: (dx * s + dy * c) / d.scale };
}

/** Half extents (width-fraction units, scale 1, unrotated). */
export function decoLocalBox(d: Deco): { hw: number; hh: number } {
  let hw: number;
  let hh: number;
  if (d.kind === "text") {
    hw = textWidthPx(d) / 2 / HW;
    hh = (TEXT_FONT_PX * 0.6) / HW;
  } else if (d.kind === "line") {
    hw = Math.max(0, ...(d.rel ?? []).map((p) => Math.abs(p.x)));
    hh = Math.max(0, ...(d.rel ?? []).map((p) => Math.abs(p.y))) / Y_K;
  } else {
    const pts = unitPolylines(d.kind).flat();
    hw = Math.max(0.1, ...pts.map((p) => Math.abs(p.x))) * SHAPE_R;
    hh = Math.max(0.1, ...pts.map((p) => Math.abs(p.y))) * SHAPE_R;
  }
  return { hw: Math.max(hw, 0.02), hh: Math.max(hh, 0.02) };
}

export function decoPolylines(d: Deco): Pt[][] {
  const xf = decoXform(d);
  if (d.kind === "line") return d.rel ? [d.rel.map((p) => xf(p.x, p.y / Y_K))] : [];
  return unitPolylines(d.kind).map((pl) => pl.map((p) => xf(p.x * SHAPE_R, p.y * SHAPE_R)));
}

export interface Frame {
  corners: Pt[];
  stem: [Pt, Pt];
  handle: Pt;
}

/** Selection outline (4 corners), rotate handle and its stem, in normalized plate coordinates. */
export function decoFrame(d: Deco): Frame {
  const { hw, hh } = decoLocalBox(d);
  const xf = decoXform(d);
  const pu = hw + PAD / d.scale;
  const pv = hh + PAD / d.scale;
  const top = -pv;
  return {
    corners: [xf(-pu, -pv), xf(pu, -pv), xf(pu, pv), xf(-pu, pv)],
    stem: [xf(0, top), xf(0, top - HANDLE_OFFSET / d.scale)],
    handle: xf(0, top - HANDLE_OFFSET / d.scale),
  };
}

const wdist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, (a.y - b.y) / Y_K);

export function hitHandle(d: Deco, p: Pt): "scale" | "rotate" | null {
  const f = decoFrame(d);
  if (wdist(f.handle, p) <= HANDLE_HIT * 1.2) return "rotate";
  if (f.corners.some((c) => wdist(c, p) <= HANDLE_HIT)) return "scale";
  return null;
}

/** Topmost element under a point (rotated box test). */
export function hitTest(decos: Deco[], p: Pt): Deco | null {
  for (let i = decos.length - 1; i >= 0; i--) {
    const d = decos[i];
    const { hw, hh } = decoLocalBox(d);
    const { u, v } = toLocal(d, p);
    const pad = PAD / d.scale;
    if (Math.abs(u) <= hw + pad && Math.abs(v) <= hh + pad) return d;
  }
  return null;
}

// ---------------------------------------------------------------- limits
export function scaleLimits(d: Deco): { min: number; max: number } {
  const { hw, hh } = decoLocalBox(d);
  return { min: Math.max(MIN_SCALE, 0.012 / Math.max(hw, hh)), max: Math.min(MAX_SCALE, 0.96 / (2 * Math.hypot(hw, hh))) };
}

/** Keeps the element (frame included) inside the plate, with a minimum size so it cannot vanish. */
export function clampDeco(d: Deco): Deco {
  const lim = scaleLimits(d);
  const out = { ...d, scale: clamp(d.scale, lim.min, Math.max(lim.min, lim.max)) };
  const f = decoFrame(out);
  const ex = Math.max(...f.corners.map((c) => Math.abs(c.x - out.x)), Math.abs(f.handle.x - out.x));
  const ey = Math.max(...f.corners.map((c) => Math.abs(c.y - out.y)), Math.abs(f.handle.y - out.y));
  out.x = 2 * ex + 0.02 < 1 ? clamp(out.x, ex + 0.01, 1 - ex - 0.01) : 0.5;
  out.y = 2 * ey + 0.02 < 1 ? clamp(out.y, ey + 0.01, 1 - ey - 0.01) : 0.5;
  return out;
}

export const normAngle = (a: number): number => {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
};

// ---------------------------------------------------------------- creation
export function makeDeco(id: number, kind: DecoKind, x: number, y: number, text = "Hello", font: FontKey = "anton"): Deco {
  const t = text.trim().slice(0, 12) || "Hello";
  return clampDeco({ id, kind, x, y, scale: 1, rot: 0, lw: DEFAULT_LW, text: kind === "text" ? t : undefined, font: kind === "text" ? font : undefined });
}

/** Build a free-line element from absolute points (recentered on its bounding box). */
export function lineDeco(id: number, abs: Pt[], lw = DEFAULT_LW): Deco {
  const xs = abs.map((p) => p.x);
  const ys = abs.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return { id, kind: "line", x: cx, y: cy, scale: 1, rot: 0, lw, rel: abs.map((p) => ({ x: p.x - cx, y: p.y - cy })) };
}

// ---------------------------------------------------------------- painting (pressed-wire profile)
/** Paint one stroke with a rounded cross-section: wide dim pass first, narrow bright pass last. */
export function profile(ctx: CanvasRenderingContext2D, thickness: number, level: number, draw: () => void): void {
  for (let i = 0; i < PASSES; i++) {
    const k = i / (PASSES - 1);
    const g = Math.round(255 * level * (0.2 + 0.8 * k));
    ctx.strokeStyle = `rgb(${g},${g},${g})`;
    ctx.lineWidth = Math.max(1, thickness * (1 - 0.8 * k));
    draw();
  }
}

export function strokePoly(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x * HW, pts[0].y * HH);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * HW, pts[i].y * HH);
  ctx.stroke();
}

/** sizeK scales the stroke width (the Size slider). Text and shapes use the same profile as the portrait line. */
export function paintDeco(ctx: CanvasRenderingContext2D, d: Deco, sizeK: number): void {
  const width = d.lw * WIDTH_SCALE * sizeK;
  if (d.kind === "text" && d.text) {
    ctx.save();
    ctx.translate(d.x * HW, d.y * HH);
    ctx.rotate(d.rot);
    ctx.font = fontSpec(d, TEXT_FONT_PX * d.scale);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    profile(ctx, width * 0.6, 1, () => ctx.strokeText(d.text as string, 0, 0));
    ctx.restore();
    return;
  }
  for (const pl of decoPolylines(d)) if (pl.length > 1) profile(ctx, width, 1, () => strokePoly(ctx, pl));
}
