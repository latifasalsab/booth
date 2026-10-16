/**
 * Photo -> strokes that reflect THIS person. buildPortrait(analysis, settings) combines, from the cached analysis:
 * silhouette (head and shoulders, hair or head covering), face boundary (hairline / head-covering opening), the lower
 * face outline, brows, eyes, irises, nose and lips from MediaPipe landmarks (light smoothing, width varies with local
 * edge strength), glasses (lib/glasses.ts), hair and fold strokes (lib/hairStrokes.ts) and, at Max, extra edge strokes
 * inside the face. Without landmarks it falls back to the plain edge pipeline; without segmentation it adds edge
 * strokes inside an enlarged face region ("basic mode"). Output is ordered and joined into ONE continuous path.
 */
import { buildRelief, type Analysis } from "./analysis";
import { contours, dropNearDuplicates, pixelLength, splitAtBorder } from "./contours";
import { detectGlasses, glassesStrokes, type GlassesMode, type LensMode } from "./glasses";
import { cleanedPerson, headMetrics } from "./head";
import { hairStrokes } from "./hairStrokes";
import { FACE_OVAL, IRISES, LEFT_EYE, LEFT_EYEBROW, LIPS_INNER, LIPS_OUTER, NOSE_BASE, NOSE_BRIDGE, RIGHT_EYE, RIGHT_EYEBROW } from "./landmarkIndices";
import { clamp, cleanMask, thin, trace } from "./raster";
import { buildLine, chaikin, orderStrokes, orderTagged, simplify, strokeLength, type LinePath, type Pt, type Stroke, type TStroke } from "./strokePath";

export type Detail = "simple" | "detailed" | "max";
export type { GlassesMode };
export interface Landmark {
  x: number;
  y: number;
}
/** Layer visibility (EDIT > Layers). "tonal" is the layered relief base (plateaus + tonal relief). */
export interface Layers {
  silhouette: boolean;
  face: boolean;
  glasses: boolean;
  hair: boolean;
  tonal: boolean;
}
export const DEFAULT_LAYERS: Layers = { silhouette: true, face: true, glasses: true, hair: true, tonal: true };
export interface PortraitSettings {
  detail: Detail;
  glasses: GlassesMode;
  layers: Layers;
}
export const DEFAULT_SETTINGS: PortraitSettings = { detail: "detailed", glasses: "auto", layers: DEFAULT_LAYERS };
export const MODE_NOTE = "Detailed mode unavailable, using basic mode";

export interface PortraitInfo {
  glasses: boolean;
  glassesScore: number;
  /** How the frames were built: traced from pixels, fitted with a curve, or the landmark ellipse fallback. */
  glassesMode: LensMode | "none";
  glassesDebug: { trace: Pt[][]; fits: Pt[][] } | null;
  hairStrokes: number;
  extraStrokes: number;
  model: "ok" | "fallback";
  counts: Record<string, number>;
}
export interface Portrait {
  ok: boolean;
  strokes: TStroke[];
  path: LinePath;
  base: HTMLCanvasElement | null;
  info: PortraitInfo;
}

// stroke widths in working pixels (768 px wide)
const W_SILHOUETTE = 9;
const W_FEATURE = 6;
const W_EXTRA = 5;
const W_HAIR = 3.5;

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Chaikin for closed loops (wraps around), returned closed. */
function smoothClosed(pts: Pt[], iterations = 1): Stroke {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    const out: Pt[] = [];
    for (let i = 0; i < p.length; i++) out.push(lerp(p[i], p[(i + 1) % p.length], 0.25), lerp(p[i], p[(i + 1) % p.length], 0.75));
    p = out;
  }
  return [...p, p[0]];
}

const hasLandmarks = (an: Analysis): Landmark[] | null => (an.landmarks && an.landmarks.length >= 468 ? an.landmarks : null);

// ---------------------------------------------------------------- landmark features
function featureStrokes(an: Analysis, lm: Landmark[]): TStroke[] {
  const { W, H } = an;
  const at = (i: number): Pt => ({ x: lm[i].x, y: lm[i].y });
  const magAt = (p: Pt) => {
    const x = Math.round(p.x * W);
    const y = Math.round(p.y * H);
    let m = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m = Math.max(m, an.mag[clamp(y + dy, 0, H - 1) * W + clamp(x + dx, 0, W - 1)]);
    return m;
  };
  /** Width multiplier per point from local edge strength, lightly averaged: brow thickness, eye shape, lip fullness. */
  const widths = (pts: Pt[]) => {
    const raw = pts.map((p) => 0.85 + 0.45 * clamp(magAt(p) / (an.strong * 2.5), 0, 1));
    return raw.map((_, i) => {
      let s = 0;
      let n = 0;
      for (let k = -2; k <= 2; k++) if (i + k >= 0 && i + k < raw.length) { s += raw[i + k]; n++; }
      return clamp(s / n, 0.8, 1.3);
    });
  };
  const mk = (pts: Pt[], kind: TStroke["kind"]): TStroke => ({ pts, kind, w: W_FEATURE, wm: widths(pts) });
  const ring = (idx: number[]) => smoothClosed(idx.map(at), 1);
  const line = (idx: number[]) => chaikin(idx.map(at), 1);
  const out: TStroke[] = [
    mk(ring(LEFT_EYEBROW), "brow"),
    mk(ring(RIGHT_EYEBROW), "brow"),
    mk(ring(LEFT_EYE), "eye"),
    mk(ring(RIGHT_EYE), "eye"),
    mk(line(NOSE_BRIDGE), "nose"),
    mk(line(NOSE_BASE), "nose"),
    mk(ring(LIPS_OUTER), "lips"),
    mk(ring(LIPS_INNER), "lips"),
  ];
  if (lm.length >= 478) {
    for (const [c, edge] of IRISES) {
      const ctr = at(c);
      const r = edge.reduce((s, i) => s + Math.hypot((lm[i].x - ctr.x) * W, (lm[i].y - ctr.y) * H), 0) / edge.length;
      const circle = Array.from({ length: 16 }, (_, k) => {
        const a = (k / 16) * Math.PI * 2;
        return { x: ctr.x + (Math.cos(a) * r * 0.9) / W, y: ctr.y + (Math.sin(a) * r * 0.9) / H };
      });
      out.push(mk(smoothClosed(circle, 1), "eye"));
    }
  }
  return out;
}

const browTop = (lm: Landmark[]) => Math.min(...LEFT_EYEBROW.concat(RIGHT_EYEBROW).map((i) => lm[i].y));

/** Lower part of the face oval (from temple around the chin to the other temple), below the eyebrow line. */
function lowerArc(lm: Landmark[]): Pt[] {
  const by = browTop(lm);
  const pts = FACE_OVAL.map((i) => ({ x: lm[i].x, y: lm[i].y }));
  const n = pts.length;
  const low = pts.map((p) => p.y >= by);
  let start = -1;
  for (let i = 0; i < n; i++) if (low[i] && !low[(i + n - 1) % n]) { start = i; break; }
  if (start < 0) return low.every(Boolean) ? smoothClosed(pts, 1) : [];
  const run: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (!low[i]) break;
    run.push(pts[i]);
  }
  return chaikin(run, 1);
}

function faceOval(an: Analysis, lm: Landmark[], arc: Pt[] | null): TStroke {
  const pts = arc && arc.length > 3 ? arc : smoothClosed(FACE_OVAL.map((i) => ({ x: lm[i].x, y: lm[i].y })), 1);
  void an;
  return { pts, kind: "face", w: W_FEATURE };
}

// ---------------------------------------------------------------- segmentation strokes
const norm = (p: Pt[], an: Analysis): Pt[] => p.map((q) => ({ x: q.x / an.W, y: q.y / an.H }));
/** Simplify (epsilon as a fraction of the image width), then smooth. Pixel polyline in, pixel polyline out. */
const smoothPx = (poly: Pt[], an: Analysis, epsFrac: number, iters: number): Pt[] => chaikin(simplify(poly, epsFrac * an.W), iters);
/** Shoulder line width multiplier: tapers toward the image edge. */
const taper = (x: number) => clamp(0.4 + 0.6 * (Math.min(x, 1 - x) / 0.25), 0.4, 1);

/**
 * Silhouette of the cleaned person mask (closing, hole filling, largest component, strong blur). The head part (above
 * chin + 10% head height) is simplified at about 1.2% of the width and smoothed with 2 Chaikin passes; below that line
 * the shoulders become one smooth, heavily simplified line per side with a tapering width. The pieces form one chain
 * that starts at the top of the head (seq): top -> left side -> left shoulder -> (bottom) -> right shoulder -> right side.
 */
function silhouetteStrokes(an: Analysis): TStroke[] {
  const cached = an.cache.get("silhouette") as TStroke[] | undefined;
  if (cached) return cached;
  const out: TStroke[] = [];
  const field = cleanedPerson(an);
  if (field) {
    const polys = contours(field, an.W, an.H, 0.5, 2)
      .flatMap((p) => splitAtBorder(p, an.W, an.H, 3))
      .filter((p) => pixelLength(p) >= 0.25 * an.H)
      .sort((a, b) => pixelLength(b) - pixelLength(a))
      .slice(0, 1);
    const line = headMetrics(an)?.line ?? Infinity;
    for (let poly of polys) {
      if (Math.hypot(poly[0].x - poly[poly.length - 1].x, poly[0].y - poly[poly.length - 1].y) < 3) {
        const core = poly.slice(0, -1); // closed loop: open it at its lowest point
        let low = 0;
        core.forEach((p, i) => { if (p.y > core[low].y) low = i; });
        poly = [...core.slice(low), ...core.slice(0, low)];
      }
      let i0 = poly.findIndex((p) => p.y < line);
      let i1 = -1;
      poly.forEach((p, i) => { if (p.y < line) i1 = i; });
      if (i0 < 0) { i0 = 0; i1 = poly.length - 1; }
      const headPart = poly.slice(i0, i1 + 1);
      const left = poly.slice(0, i0 + 1);
      const right = poly.slice(i1);
      const add = (pts: Pt[], seq: number, shoulder: boolean) => {
        if (pts.length >= 3) out.push({ pts, kind: "silhouette", w: W_SILHOUETTE, seq, wm: shoulder ? pts.map((p) => taper(p.x)) : undefined });
      };
      const hp = headPart.length >= 4 ? norm(smoothPx(headPart, an, 0.012, 2), an) : [];
      let top = 0;
      hp.forEach((p, i) => { if (p.y < hp[top].y) top = i; });
      add(hp.slice(0, top + 1).reverse(), 0, false); // top -> left junction
      const shoulder = (piece: Pt[]) => (pixelLength(piece) >= 0.03 * an.W ? norm(smoothPx(piece, an, 0.024, 3), an) : []);
      add(shoulder(left).reverse(), 1, true); // junction -> left border
      add(shoulder(right).reverse(), 2, true); // right border -> junction
      add(hp.slice(top).reverse(), 3, false); // right junction -> top
    }
  }
  an.cache.set("silhouette", out);
  return out;
}

/** Upper part of the face-skin contour (above the eyebrow line): the hairline or head-covering opening, strongly smoothed. */
function boundaryStrokes(an: Analysis, lm: Landmark[], lower: Pt[]): TStroke[] {
  const key = "boundary";
  const cached = an.cache.get(key) as TStroke[] | undefined;
  if (cached) return cached;
  const out: TStroke[] = [];
  if (an.masks) {
    const field = cleanMask(an.masks.face, an.W, an.H, { closeR: 3, blurR: 3, passes: 3 });
    const polys = contours(field, an.W, an.H, 0.5, 2).sort((a, b) => pixelLength(b) - pixelLength(a));
    let poly = polys[0];
    if (poly && pixelLength(poly) >= 0.15 * an.H) {
      const limit = browTop(lm) * an.H + 0.015 * an.H;
      const closed = Math.hypot(poly[0].x - poly[poly.length - 1].x, poly[0].y - poly[poly.length - 1].y) < 3;
      if (closed) {
        const core = poly.slice(0, -1);
        const s = core.findIndex((p) => p.y >= limit);
        if (s > 0) poly = [...core.slice(s), ...core.slice(0, s)];
      }
      const runs: Pt[][] = [];
      let cur: Pt[] = [];
      for (const p of poly) {
        if (p.y < limit) cur.push(p);
        else {
          if (cur.length) runs.push(cur);
          cur = [];
        }
      }
      if (cur.length) runs.push(cur);
      for (const run of runs) {
        if (pixelLength(run) < 0.06 * an.W) continue;
        for (const piece of dropNearDuplicates(norm(smoothPx(run, an, 0.008, 3), an), [lower], 0.012))
          if (piece.length >= 4 && strokeLength(piece) >= 0.03) out.push({ pts: piece, kind: "boundary", w: W_FEATURE });
      }
    }
  }
  an.cache.set(key, out);
  return out;
}

// ---------------------------------------------------------------- edge strokes (fallback and extras)
const AW = 160;
const AH = 200;
const FALLBACK: Record<Detail, { keep: number; pct: number; minLen: number }> = {
  simple: { keep: 12, pct: 0.07, minLen: 18 },
  detailed: { keep: 16, pct: 0.11, minLen: 15 },
  max: { keep: 20, pct: 0.16, minLen: 12 },
};

interface EdgeOptions {
  keep: number;
  pct: number;
  minLen: number;
  minEdge: number;
  normalize: boolean;
  inside: (x: number, y: number) => boolean;
  exclude?: Uint8Array;
}

/** Adaptive edge strokes on a small grid: gradient percentile -> thinning -> tracing -> rank by length and centrality. */
function edgeStrokes(canvas: HTMLCanvasElement, o: EdgeOptions): Stroke[] {
  const c = document.createElement("canvas");
  c.width = AW;
  c.height = AH;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(canvas, 0, 0, AW, AH);
  const data = ctx.getImageData(0, 0, AW, AH).data;
  let g: Float32Array = new Float32Array(AW * AH);
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  if (o.normalize) {
    const sorted = Float32Array.from(g).sort();
    const lo = sorted[Math.floor(sorted.length * 0.02)];
    const hi = sorted[Math.floor(sorted.length * 0.98)];
    const span = Math.max(30, hi - lo);
    for (let i = 0; i < g.length; i++) g[i] = clamp(((g[i] - lo) / span) * 255, 0, 255);
  }
  const blur = (src: Float32Array) => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < AH; y++)
      for (let x = 0; x < AW; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < AW && yy < AH) { s += src[yy * AW + xx]; n++; }
          }
        out[y * AW + x] = s / n;
      }
    return out;
  };
  g = blur(blur(g));
  const mag = new Float32Array(AW * AH);
  const vals: number[] = [];
  for (let y = 1; y < AH - 1; y++)
    for (let x = 1; x < AW - 1; x++) {
      const i = y * AW + x;
      if (!o.inside(x, y) || (o.exclude && o.exclude[i])) continue;
      const gx = (g[i - AW + 1] + 2 * g[i + 1] + g[i + AW + 1] - g[i - AW - 1] - 2 * g[i - 1] - g[i + AW - 1]) / 8;
      const gy = (g[i + AW - 1] + 2 * g[i + AW] + g[i + AW + 1] - g[i - AW - 1] - 2 * g[i - AW] - g[i - AW + 1]) / 8;
      mag[i] = Math.hypot(gx, gy);
      vals.push(mag[i]);
    }
  if (!vals.length) return [];
  vals.sort((a, b) => a - b);
  const thr = Math.max(vals[Math.floor(vals.length * (1 - o.pct))], o.minEdge);
  const bin = new Uint8Array(AW * AH);
  for (let i = 0; i < bin.length; i++) bin[i] = mag[i] >= thr ? 1 : 0;
  const paths = trace(thin(bin, AW, AH), AW, AH);
  const cx = AW * 0.5;
  const cy = AH * 0.48;
  const maxD = Math.hypot(AW * 0.4, AH * 0.45);
  const ranked = paths
    .map((p) => {
      let len = 0;
      for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      const mid = p[p.length >> 1];
      return { p, len, score: len * (1.25 - Math.min(1, Math.hypot(mid.x - cx, mid.y - cy) / maxD)) };
    })
    .filter((s) => s.len >= o.minLen)
    .sort((a, b) => b.score - a.score)
    .slice(0, o.keep);
  const strokes: Stroke[] = [];
  for (const { p } of ranked) {
    const s = chaikin(simplify(p, 1.1), 1).map((q) => ({ x: q.x / AW, y: q.y / AH }));
    if (s.length > 3) strokes.push(s);
  }
  return strokes;
}

function raster(draw: (ctx: CanvasRenderingContext2D) => void): Uint8Array {
  const c = document.createElement("canvas");
  c.width = AW;
  c.height = AH;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const out = new Uint8Array(AW * AH);
  if (!ctx) return out;
  draw(ctx);
  const d = ctx.getImageData(0, 0, AW, AH).data;
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  return out;
}

/** Edge strokes inside the face oval (or a 1.3x enlarged region when segmentation is missing), away from existing strokes. */
function extraEdges(an: Analysis, lm: Landmark[], existing: TStroke[], keep: number, pct: number, enlarged: boolean): TStroke[] {
  const key = `extra:${keep}:${pct}:${enlarged}:${existing.length}`;
  const ymax = (headMetrics(an)?.line ?? an.H) / an.H; // no edge strokes on the clothes
  const cached = an.cache.get(key) as TStroke[] | undefined;
  if (cached) return cached;
  let poly = FACE_OVAL.map((i) => ({ x: lm[i].x * AW, y: lm[i].y * AH }));
  if (enlarged) {
    const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
    poly = poly.map((p) => ({ x: cx + (p.x - cx) * 1.3, y: cy + (p.y - cy) * 1.3 }));
  }
  const inside = raster((ctx) => {
    ctx.beginPath();
    poly.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  });
  const exclude = raster((ctx) => {
    ctx.lineWidth = 7;
    ctx.lineJoin = "round";
    for (const s of existing) {
      if (s.kind === "silhouette" || s.kind === "hair") continue;
      ctx.beginPath();
      s.pts.forEach((p, k) => (k ? ctx.lineTo(p.x * AW, p.y * AH) : ctx.moveTo(p.x * AW, p.y * AH)));
      ctx.stroke();
    }
  });
  const edges = edgeStrokes(an.canvas, { keep, pct, minLen: 12, minEdge: 3, normalize: true, inside: (x, y) => inside[y * AW + x] === 1 && y / AH < ymax, exclude });
  const out: TStroke[] = edges.map((pts) => ({ pts, kind: enlarged ? "hair" : "face", w: enlarged ? W_HAIR : W_EXTRA }));
  an.cache.set(key, out);
  return out;
}

/** True when the edge fallback found enough structure to look like a face. */
export function isClearFace(strokes: Stroke[]): boolean {
  return strokes.length >= 3 && strokes.reduce((n, s) => n + strokeLength(s), 0) >= 0.8;
}

// ---------------------------------------------------------------- the portrait
export function buildPortrait(an: Analysis, s: PortraitSettings): Portrait {
  const lm = hasLandmarks(an);
  const L = s.layers;
  const detailed = s.detail !== "simple";
  const strokes: TStroke[] = [];
  let ok = true;
  let glasses = false;
  let glassesScore = 0;
  let glassesMode: LensMode | "none" = "none";
  let glassesDebug: PortraitInfo["glassesDebug"] = null;
  let hairN = 0;
  let extraN = 0;

  if (L.silhouette) strokes.push(...silhouetteStrokes(an));

  if (!lm) {
    // No landmarks (model failed or no face): plain edge strokes, accepted only if they look like a face.
    const cfg = FALLBACK[s.detail];
    const edges = edgeStrokes(an.canvas, {
      keep: cfg.keep,
      pct: cfg.pct,
      minLen: cfg.minLen,
      minEdge: 9,
      normalize: false,
      inside: (x, y) => ((x / AW - 0.5) / 0.4) ** 2 + ((y / AH - 0.48) / 0.45) ** 2 <= 1,
    });
    ok = isClearFace(edges);
    if (L.face) strokes.push(...edges.map((pts) => ({ pts, kind: "face" as const, w: 8 })));
  } else {
    const lower = lowerArc(lm);
    if (L.face) {
      const boundary = an.masks && detailed ? boundaryStrokes(an, lm, lower) : [];
      strokes.push(...boundary, faceOval(an, lm, boundary.length ? lower : null), ...featureStrokes(an, lm));
    }
    const gl = detectGlasses(an, lm);
    glassesScore = gl.score;
    if (L.glasses && (s.glasses === "on" || (s.glasses === "auto" && detailed && gl.present))) {
      strokes.push(...glassesStrokes(gl));
      glasses = true;
      glassesMode = gl.mode;
      glassesDebug = gl.debug;
    }
    if (L.hair && an.masks && detailed) {
      const hs = hairStrokes(an, s.detail === "max" ? 10 : 6, silhouetteStrokes(an).map((x) => x.pts));
      strokes.push(...hs);
      hairN = hs.length;
    }
    const enlarged = !an.masks;
    if ((s.detail === "max" && L.face) || (enlarged && detailed && L.hair)) {
      const ex = extraEdges(an, lm, strokes, s.detail === "max" ? 14 : 8, s.detail === "max" ? 0.12 : 0.08, enlarged);
      strokes.push(...ex);
      extraN = ex.length;
    }
  }

  const ordered = orderTagged(strokes);
  const counts: Record<string, number> = {};
  for (const st of ordered) counts[st.kind] = (counts[st.kind] ?? 0) + 1;
  return {
    ok,
    strokes: ordered,
    path: buildLine(ordered),
    base: L.tonal ? buildRelief(an) : null,
    info: { glasses, glassesScore, glassesMode, glassesDebug, hairStrokes: hairN, extraStrokes: extraN, model: lm && an.masks ? "ok" : "fallback", counts },
  };
}

// ---------------------------------------------------------------- idle sample
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 36): Stroke =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  });

/** Smooth placeholder face used by the idle loop. */
export function sampleFaceStrokes(): Stroke[] {
  const curve = (...p: [number, number][]) => chaikin(p.map(([x, y]) => ({ x, y })), 3);
  return orderStrokes([
    arc(0.5, 0.5, 0.29, 0.33, 100, 440, 60),
    arc(0.5, 0.46, 0.34, 0.36, 195, 345, 40),
    curve([0.34, 0.4], [0.4, 0.375], [0.46, 0.385]),
    curve([0.54, 0.385], [0.6, 0.375], [0.66, 0.4]),
    arc(0.4, 0.45, 0.055, 0.02, 180, 540, 24),
    arc(0.6, 0.45, 0.055, 0.02, 180, 540, 24),
    curve([0.5, 0.47], [0.475, 0.56], [0.5, 0.585], [0.53, 0.56]),
    curve([0.42, 0.65], [0.5, 0.68], [0.58, 0.65]),
  ]);
}
