/**
 * Photo -> few, bold, firm strokes. Isolated on purpose: getFaceStrokes(canvas) is the only entry point,
 * so a landmark model can replace it without touching the rest of the booth.
 *
 * TODO(MediaPipe): replace the edge pipeline below with MediaPipe Face Landmarker. Build strokes from
 * the face oval, brows, eyes, nose and lips landmark contours and return them as Stroke[] (normalized 0..1).
 */
import { ASPECT, chaikin, orderStrokes, simplify, strokeLength, type Pt, type Stroke } from "./strokePath";

export type Detail = "low" | "medium" | "high";

const AW = 160;
const AH = 200;
const SETTINGS: Record<Detail, { keep: number; pct: number; minLen: number }> = {
  low: { keep: 12, pct: 0.07, minLen: 18 },
  medium: { keep: 16, pct: 0.11, minLen: 15 },
  high: { keep: 20, pct: 0.16, minLen: 12 },
};
/** Minimum edge strength (gray levels per pixel) that counts as a real edge. */
const MIN_EDGE = 9;

function boxBlur(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) {
            s += src[yy * w + xx];
            n++;
          }
        }
      out[y * w + x] = s / n;
    }
  return out;
}

/** Zhang-Suen thinning of a binary image (1 = on). */
function thin(img: Uint8Array, w: number, h: number): Uint8Array {
  const a = img.slice();
  const offs = [-w, -w + 1, 1, w + 1, w, w - 1, -1, -w - 1]; // P2..P9 clockwise from north
  let changed = true;
  for (let iter = 0; changed && iter < 40; iter++) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const del: number[] = [];
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!a[i]) continue;
          const p = offs.map((o) => a[i + o]);
          const b = p.reduce((s, v) => s + v, 0);
          if (b < 2 || b > 6) continue;
          let t = 0;
          for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) t++;
          if (t !== 1) continue;
          const c1 = pass === 0 ? p[0] * p[2] * p[4] : p[0] * p[2] * p[6];
          const c2 = pass === 0 ? p[2] * p[4] * p[6] : p[0] * p[4] * p[6];
          if (c1 === 0 && c2 === 0) del.push(i);
        }
      if (del.length) changed = true;
      del.forEach((i) => (a[i] = 0));
    }
  }
  return a;
}

/** Walk a 1px skeleton into polylines (pixel coordinates). */
function trace(skel: Uint8Array, w: number, h: number): Pt[][] {
  const visited = new Uint8Array(skel.length);
  const nbrs = (i: number): number[] => {
    const x = i % w;
    const y = (i / w) | 0;
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && skel[yy * w + xx]) out.push(yy * w + xx);
      }
    return out;
  };
  const starts: number[] = [];
  const rest: number[] = [];
  for (let i = 0; i < skel.length; i++) if (skel[i]) (nbrs(i).length === 1 ? starts : rest).push(i);
  const paths: Pt[][] = [];
  for (const s of [...starts, ...rest]) {
    if (visited[s]) continue;
    const path: Pt[] = [];
    let cur = s;
    while (cur >= 0) {
      visited[cur] = 1;
      path.push({ x: cur % w, y: (cur / w) | 0 });
      const next = nbrs(cur).filter((n) => !visited[n]);
      // prefer 4-connected neighbors for straighter walks
      next.sort((p, q) => Math.abs(p - cur) % w - Math.abs(q - cur) % w);
      cur = next.length ? next[0] : -1;
    }
    if (path.length > 1) paths.push(path);
  }
  return paths;
}

export function getFaceStrokes(canvas: HTMLCanvasElement, detail: Detail = "low"): Stroke[] {
  const cfg = SETTINGS[detail];
  const c = document.createElement("canvas");
  c.width = AW;
  c.height = AH;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(canvas, 0, 0, AW, AH);
  const data = ctx.getImageData(0, 0, AW, AH).data;
  let g: Float32Array = new Float32Array(AW * AH);
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  g = boxBlur(boxBlur(g, AW, AH), AW, AH);

  // Tight face-oval mask
  const inMask = (x: number, y: number) => ((x / AW - 0.5) / 0.4) ** 2 + ((y / AH - 0.48) / 0.45) ** 2 <= 1;
  const mag = new Float32Array(AW * AH);
  const vals: number[] = [];
  for (let y = 1; y < AH - 1; y++)
    for (let x = 1; x < AW - 1; x++) {
      if (!inMask(x, y)) continue;
      const i = y * AW + x;
      const gx = (g[i - AW + 1] + 2 * g[i + 1] + g[i + AW + 1] - g[i - AW - 1] - 2 * g[i - 1] - g[i + AW - 1]) / 8;
      const gy = (g[i + AW - 1] + 2 * g[i + AW] + g[i + AW + 1] - g[i - AW - 1] - 2 * g[i - AW] - g[i - AW + 1]) / 8;
      mag[i] = Math.hypot(gx, gy);
      vals.push(mag[i]);
    }
  if (!vals.length) return [];
  vals.sort((a, b) => a - b);
  const thr = Math.max(vals[Math.floor(vals.length * (1 - cfg.pct))], MIN_EDGE);

  const bin = new Uint8Array(AW * AH);
  for (let i = 0; i < bin.length; i++) bin[i] = mag[i] >= thr ? 1 : 0;
  const paths = trace(thin(bin, AW, AH), AW, AH);

  // Rank by length and closeness to the face center; drop speckles and short strokes.
  const cx = AW * 0.5;
  const cy = AH * 0.48;
  const maxD = Math.hypot(AW * 0.4, AH * 0.45);
  const ranked = paths
    .map((p) => {
      let len = 0;
      for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      const mid = p[p.length >> 1];
      const d = Math.hypot(mid.x - cx, mid.y - cy) / maxD;
      return { p, len, score: len * (1.25 - Math.min(1, d)) };
    })
    .filter((s) => s.len >= cfg.minLen)
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.keep);

  const strokes: Stroke[] = [];
  for (const { p } of ranked) {
    const s = chaikin(simplify(p, 1.1), 2).map((q) => ({ x: q.x / AW, y: q.y / AH }));
    if (s.length > 3) strokes.push(s);
  }
  return orderStrokes(strokes);
}

/** True when the edge pass found enough structure to look like a face. */
export function isClearFace(strokes: Stroke[]): boolean {
  return strokes.length >= 3 && strokes.reduce((n, s) => n + strokeLength(s), 0) >= 0.8;
}

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

export { ASPECT };
