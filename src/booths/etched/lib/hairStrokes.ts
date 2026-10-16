/**
 * Hair and head-covering detail: fabric folds, strands, curls. Inside the hair / clothes / others region of the head
 * (above the chin line plus a margin, away from the face and the silhouette) an adaptive edge detector runs on the
 * locally contrast-normalized gradient (top ~8% by percentile, Canny-style hysteresis), is thinned and traced; the K
 * strongest strokes (length x mean gradient) are kept and lightly smoothed. Thin lines.
 */
import type { Analysis } from "./analysis";
import { dropNearDuplicates } from "./contours";
import { headMetrics } from "./head";
import { dilate, erode, hysteresis, percentile, thin, trace } from "./raster";
import { chaikin, simplify, strokeLength, type Pt, type TStroke } from "./strokePath";

const HAIR_W = 3.5;
const MIN_LEN_HEAD = 0.12; // shortest stroke: 12% of the head height
const JITTER_STD = 0.5; // reject when the spread of turning angles (radians) is higher
const JITTER_FLIPS = 0.45; // or when the turn direction alternates this often

/** Zigzag / jitter score of a half-resolution pixel path: resampled every 4 px, spread and sign flips of the turning angle. */
function jitter(p: Pt[]): { std: number; flips: number } {
  const pts: Pt[] = [p[0]];
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    acc += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    if (acc >= 4) {
      pts.push(p[i]);
      acc = 0;
    }
  }
  const turns: number[] = [];
  for (let i = 2; i < pts.length; i++) {
    const a1 = Math.atan2(pts[i - 1].y - pts[i - 2].y, pts[i - 1].x - pts[i - 2].x);
    const a2 = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    turns.push(d);
  }
  if (turns.length < 6) return { std: 0, flips: 0 };
  const mean = turns.reduce((s, v) => s + v, 0) / turns.length;
  const std = Math.sqrt(turns.reduce((s, v) => s + (v - mean) ** 2, 0) / turns.length);
  let flips = 0;
  for (let i = 1; i < turns.length; i++) if (turns[i] * turns[i - 1] < 0 && Math.abs(turns[i]) > 0.15) flips++;
  return { std, flips: flips / (turns.length - 1) };
}

/** avoid: normalized silhouette polylines; stroke parts closer than about 2% of the width to them are dropped (no doubled lines). */
export function hairStrokes(an: Analysis, K: number, avoid: Pt[][]): TStroke[] {
  const m = an.masks;
  const head = headMetrics(an);
  if (!m || !head || K <= 0) return [];
  const key = `hair:${K}`;
  const cached = an.cache.get(key) as TStroke[] | undefined;
  if (cached) return cached;

  const { W } = an;
  const hw = an.W >> 1;
  const hh = an.H >> 1;
  const lineY = head.line / 2; // half-resolution: nothing on the clothes below chin + 10% head height
  const region = new Uint8Array(hw * hh);
  const faceBin = new Uint8Array(hw * hh);
  const personBin = new Uint8Array(hw * hh);
  const mag2 = new Float32Array(hw * hh);
  for (let y = 0; y < hh; y++)
    for (let x = 0; x < hw; x++) {
      const i = y * hw + x;
      const f = 2 * y * W + 2 * x;
      region[i] = m.hair[f] + m.clothes[f] + m.others[f] >= 0.5 && y < lineY ? 1 : 0;
      faceBin[i] = m.face[f] >= 0.5 ? 1 : 0;
      personBin[i] = m.person[f] >= 0.5 ? 1 : 0;
      mag2[i] = Math.max(an.mag[f], an.mag[f + 1], an.mag[f + W], an.mag[f + W + 1]);
    }
  const faceNear = dilate(faceBin, hw, hh, 3);
  const inner = erode(personBin, hw, hh, 4); // keeps the silhouette's own edge out
  const vals: number[] = [];
  for (let i = 0; i < region.length; i++) {
    if (faceNear[i] || !inner[i]) region[i] = 0;
    else if (region[i]) vals.push(mag2[i]);
  }
  const done = (s: TStroke[]) => {
    an.cache.set(key, s);
    return s;
  };
  if (vals.length < 200) return done([]);
  const hi = percentile(vals, 0.92);
  if (hi < 0.03) return done([]);
  const paths = trace(thin(hysteresis(mag2, region, hw, hh, hi, hi * 0.5), hw, hh), hw, hh);

  const minLen = (MIN_LEN_HEAD * head.headH) / 2;
  const scored = paths
    .map((p) => {
      let len = 0;
      let g = 0;
      for (let i = 0; i < p.length; i++) {
        if (i) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
        g += mag2[p[i].y * hw + p[i].x];
      }
      return { p, len, score: len * (g / p.length) };
    })
    .filter((s) => s.len >= minLen)
    .filter((s) => {
      const j = jitter(s.p);
      return j.std <= JITTER_STD && j.flips <= JITTER_FLIPS;
    })
    .sort((a, b) => b.score - a.score);

  const strokes: TStroke[] = [];
  for (const { p } of scored) {
    if (strokes.length >= K) break;
    const pts = chaikin(simplify(p, 1.2), 3).map((q) => ({ x: (q.x + 0.5) / hw, y: (q.y + 0.5) / hh }));
    for (const piece of dropNearDuplicates(pts, avoid, 0.02 * 0.8)) {
      if (piece.length > 3 && strokeLength(piece) >= (MIN_LEN_HEAD * head.headH) / an.H) strokes.push({ pts: piece, kind: "hair", w: HAIR_W });
    }
  }
  return done(strokes.slice(0, K));
}
