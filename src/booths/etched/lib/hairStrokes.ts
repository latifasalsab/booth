/**
 * Hair and head-covering detail: fabric folds, strands, curls. Inside the hair / clothes / others region of the head
 * (above the chin line plus a margin, away from the face and the silhouette) an adaptive edge detector runs on the
 * locally contrast-normalized gradient (top ~8% by percentile, Canny-style hysteresis), is thinned and traced; the K
 * strongest strokes (length x mean gradient) are kept and lightly smoothed. Thin lines.
 */
import type { Analysis } from "./analysis";
import { CHIN } from "./landmarkIndices";
import { dilate, erode, hysteresis, percentile, thin, trace } from "./raster";
import { chaikin, simplify, type TStroke } from "./strokePath";

const HAIR_W = 3.5;

export function hairStrokes(an: Analysis, K: number): TStroke[] {
  const m = an.masks;
  const lm = an.landmarks;
  if (!m || !lm || K <= 0) return [];
  const key = `hair:${K}`;
  const cached = an.cache.get(key) as TStroke[] | undefined;
  if (cached) return cached;

  const { W } = an;
  const hw = an.W >> 1;
  const hh = an.H >> 1;
  const chinY = (lm[CHIN].y * an.H + 0.05 * an.H) / 2;
  const region = new Uint8Array(hw * hh);
  const faceBin = new Uint8Array(hw * hh);
  const personBin = new Uint8Array(hw * hh);
  const mag2 = new Float32Array(hw * hh);
  for (let y = 0; y < hh; y++)
    for (let x = 0; x < hw; x++) {
      const i = y * hw + x;
      const f = 2 * y * W + 2 * x;
      region[i] = m.hair[f] + m.clothes[f] + m.others[f] >= 0.5 && y < chinY ? 1 : 0;
      faceBin[i] = m.face[f] >= 0.5 ? 1 : 0;
      personBin[i] = m.person[f] >= 0.5 ? 1 : 0;
      mag2[i] = Math.max(an.mag[f], an.mag[f + 1], an.mag[f + W], an.mag[f + W + 1]);
    }
  const faceNear = dilate(faceBin, hw, hh, 3);
  const inner = erode(personBin, hw, hh, 3); // keeps the silhouette's own edge out
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
    .filter((s) => s.len >= 14)
    .sort((a, b) => b.score - a.score)
    .slice(0, K);

  const strokes: TStroke[] = [];
  for (const { p } of scored) {
    const pts = chaikin(simplify(p, 1.0), 1).map((q) => ({ x: (q.x + 0.5) / hw, y: (q.y + 0.5) / hh }));
    if (pts.length > 3) strokes.push({ pts, kind: "hair", w: HAIR_W });
  }
  return done(strokes);
}
