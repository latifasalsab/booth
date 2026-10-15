/**
 * Glasses detection from the cached edge map. Per eye: ROI around the eye landmarks (about 2x wide, taller than the
 * eye), eyelid area and eyebrow box masked out, then the ring of strong edges is scored by angular coverage (how much
 * of a loop is there), radial consistency (is it ring-shaped) and density (enough, but not noise). glasses = both
 * eyes pass AND (bridge edge between the eyes OR temple edges toward the ears). Lens loops come from the detected ring
 * (radius per angle) or, when the loop is open/noisy, from a superellipse fitted to the edge bounding box.
 * The thresholds are heuristics: tune EYE_THRESHOLD against real photos (use ?debug=1).
 */
import type { Analysis } from "./analysis";
import type { Landmark } from "./faceStrokes";
import { EAR_LEFT_SIDE_OF_IMAGE, EAR_RIGHT_SIDE_OF_IMAGE, LEFT_EYE, LEFT_EYEBROW, RIGHT_EYE, RIGHT_EYEBROW } from "./landmarkIndices";
import { clamp } from "./raster";
import type { Pt, TStroke } from "./strokePath";

export type GlassesMode = "auto" | "on" | "off";

export interface GlassesResult {
  present: boolean;
  score: number;
  left: number;
  right: number;
  bridge: boolean;
  temples: boolean;
  /** Closed lens loops (normalized), image-left first. */
  lenses: Pt[][];
  bridgeLine: Pt[];
  temple: { pts: Pt[]; ev: number }[];
}

const BINS = 24;
const EYE_THRESHOLD = 0.3;
const GLASSES_W = 7;

interface EyeInfo {
  score: number;
  lens: Pt[];
  templeEv: number;
  templePts: Pt[];
}

function superellipse(cx: number, cy: number, a: number, b: number, n = 3): Pt[] {
  const pts: Pt[] = [];
  for (let k = 0; k <= 48; k++) {
    const t = (k / 48) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    pts.push({ x: cx + a * Math.sign(c) * Math.abs(c) ** (2 / n), y: cy + b * Math.sign(s) * Math.abs(s) ** (2 / n) });
  }
  return pts;
}

function analyzeEye(an: Analysis, lm: Landmark[], eye: number[], brow: number[], outerIdx: number, earIdx: number): EyeInfo {
  const { W, H, mag, strong } = an;
  const px = (i: number): Pt => ({ x: lm[i].x * W, y: lm[i].y * H });
  const ep = eye.map(px);
  const minx = Math.min(...ep.map((p) => p.x));
  const maxx = Math.max(...ep.map((p) => p.x));
  const miny = Math.min(...ep.map((p) => p.y));
  const maxy = Math.max(...ep.map((p) => p.y));
  const ew = Math.max(8, maxx - minx);
  const eh = Math.max(maxy - miny, 0.25 * ew);
  const cx = (minx + maxx) / 2;
  const cy = (miny + maxy) / 2;
  const hx = 1.0 * ew; // ROI half width (about 2x the eye)
  const hy = Math.max(1.2 * eh, 0.7 * ew); // ROI half height
  const bp = brow.map(px);
  const bx0 = Math.min(...bp.map((p) => p.x)) - 4;
  const bx1 = Math.max(...bp.map((p) => p.x)) + 4;
  const by0 = Math.min(...bp.map((p) => p.y)) - 4;
  const by1 = Math.max(...bp.map((p) => p.y)) + 4;
  const ax = 0.85 * ew;
  const ay = 0.65 * ew;
  const lidX = 0.62 * ew;
  const lidY = Math.max(0.75 * eh, 0.2 * ew) + 3;

  const bins = new Int32Array(BINS);
  const rho = new Float32Array(BINS);
  const best = new Float32Array(BINS);
  let ringPx = 0;
  let strongPx = 0;
  let ex0 = Infinity;
  let ex1 = -Infinity;
  let ey0 = Infinity;
  let ey1 = -Infinity;
  for (let y = Math.floor(cy - hy); y <= Math.ceil(cy + hy); y++)
    for (let x = Math.floor(cx - hx); x <= Math.ceil(cx + hx); x++) {
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const dx = x - cx;
      const dy = y - cy;
      if ((dx / lidX) ** 2 + (dy / lidY) ** 2 < 1) continue; // the eyelid itself
      if (x >= bx0 && x <= bx1 && y >= by0 && y <= by1) continue; // eyebrow
      const rn = Math.hypot(dx / ax, dy / ay);
      if (rn < 0.7 || rn > 1.45) continue;
      ringPx++;
      const mg = mag[y * W + x];
      if (mg < strong) continue;
      strongPx++;
      ex0 = Math.min(ex0, x);
      ex1 = Math.max(ex1, x);
      ey0 = Math.min(ey0, y);
      ey1 = Math.max(ey1, y);
      const b = Math.min(BINS - 1, Math.floor(((Math.atan2(dy / ay, dx / ax) + Math.PI) / (2 * Math.PI)) * BINS));
      bins[b]++;
      if (mg > best[b]) {
        best[b] = mg;
        rho[b] = rn;
      }
    }
  const hit = Array.from(bins, (n) => n >= 2);
  const hits = hit.filter(Boolean).length;
  const coverage = hits / BINS;
  const rs = rho.filter((_, i) => hit[i]);
  const mean = rs.reduce((a, b) => a + b, 0) / Math.max(1, rs.length);
  const std = Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rs.length));
  const consistency = clamp(1 - std / Math.max(0.1, mean) / 0.3, 0, 1);
  const density = strongPx / Math.max(1, ringPx);
  let score = coverage * consistency * Math.min(1, density / 0.025);
  if (density > 0.45) score *= 0.4; // textured skin or hair, not a frame

  // lens loop
  let lens: Pt[];
  if (coverage >= 0.7) {
    const r = Array.from(rho, (v, i) => (hit[i] ? v : 0));
    for (let i = 0; i < BINS; i++)
      if (!hit[i]) {
        let l = 1;
        while (!hit[(i - l + BINS) % BINS] && l < BINS) l++;
        let rr = 1;
        while (!hit[(i + rr) % BINS] && rr < BINS) rr++;
        r[i] = (rho[(i - l + BINS) % BINS] * rr + rho[(i + rr) % BINS] * l) / (l + rr);
      }
    const sm = r.map((_, i) => clamp((r[(i + BINS - 1) % BINS] + r[i] + r[(i + 1) % BINS]) / 3, 0.85, 1.3));
    lens = sm.map((rn, k) => {
      const t = ((k + 0.5) / BINS) * Math.PI * 2 - Math.PI;
      return { x: cx + Math.cos(t) * rn * ax, y: cy + Math.sin(t) * rn * ay };
    });
    lens.push(lens[0]);
  } else {
    let fcx = cx;
    let fcy = cy;
    let a = ax;
    let b = ay;
    if (strongPx >= 15) {
      fcx = clamp((ex0 + ex1) / 2, cx - 0.15 * ew, cx + 0.15 * ew);
      fcy = clamp((ey0 + ey1) / 2, cy - 0.15 * ew, cy + 0.15 * ew);
      a = clamp((ex1 - ex0) / 2, 0.8 * ax, 1.35 * ax);
      b = clamp((ey1 - ey0) / 2, 0.8 * ay, 1.35 * ay);
    }
    lens = superellipse(fcx, fcy, a, b);
  }

  // temple evidence: edges from the outer eye corner toward the ear
  const o = px(outerIdx);
  const e = px(earIdx);
  let ok = 0;
  const N = 20;
  for (let k = 0; k < N; k++) {
    const t = 0.1 + (0.6 * k) / (N - 1);
    const sx = Math.round(o.x + (e.x - o.x) * t);
    const sy = Math.round(o.y + (e.y - o.y) * t);
    let m = 0;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) m = Math.max(m, mag[clamp(sy + dy, 0, H - 1) * W + clamp(sx + dx, 0, W - 1)]);
    if (m >= strong) ok++;
  }
  const lensN = lens.map((p) => ({ x: p.x / W, y: p.y / H }));
  const outerPt = lensN.reduce((best2, p) => ((e.x < cx ? p.x < best2.x : p.x > best2.x) ? p : best2), lensN[0]);
  const earN = { x: e.x / W, y: e.y / H };
  const templePts = [outerPt, { x: outerPt.x + (earN.x - outerPt.x) * 0.4, y: outerPt.y + (earN.y - outerPt.y) * 0.4 }, { x: outerPt.x + (earN.x - outerPt.x) * 0.8, y: outerPt.y + (earN.y - outerPt.y) * 0.8 }];
  return { score, lens: lensN, templeEv: ok / N, templePts };
}

export function detectGlasses(an: Analysis, lm: Landmark[]): GlassesResult {
  const cached = an.cache.get("glasses") as GlassesResult | undefined;
  if (cached) return cached;
  // image-left eye = MediaPipe's RIGHT eye
  const L = analyzeEye(an, lm, RIGHT_EYE, RIGHT_EYEBROW, 33, EAR_LEFT_SIDE_OF_IMAGE);
  const R = analyzeEye(an, lm, LEFT_EYE, LEFT_EYEBROW, 263, EAR_RIGHT_SIDE_OF_IMAGE);

  // bridge: a short horizontal edge between the inner eye corners
  const { W, H } = an;
  const a = { x: lm[133].x * W, y: lm[133].y * H };
  const b = { x: lm[362].x * W, y: lm[362].y * H };
  const ew = Math.max(8, Math.abs(lm[133].x - lm[33].x) * W);
  const by = (a.y + b.y) / 2 - 0.1 * ew;
  let cols = 0;
  let total = 0;
  for (let x = Math.ceil(a.x); x <= Math.floor(b.x); x++) {
    total++;
    for (let y = Math.round(by - 0.14 * ew); y <= Math.round(by + 0.14 * ew); y++)
      if (an.mag[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)] >= an.strong) {
        cols++;
        break;
      }
  }
  const bridge = total > 4 && cols / total >= 0.55;
  const temples = L.templeEv >= 0.45 || R.templeEv >= 0.45;
  const present = L.score >= EYE_THRESHOLD && R.score >= EYE_THRESHOLD && (bridge || temples);

  const lensL = L.lens;
  const lensR = R.lens;
  const pL = lensL.reduce((p, q) => (q.x > p.x ? q : p), lensL[0]);
  const pR = lensR.reduce((p, q) => (q.x < p.x ? q : p), lensR[0]);
  const lensH = Math.max(...lensL.map((p) => p.y)) - Math.min(...lensL.map((p) => p.y));
  const mid = { x: (pL.x + pR.x) / 2, y: (pL.y + pR.y) / 2 - 0.14 * lensH };
  const bridgeLine = Array.from({ length: 7 }, (_, k) => {
    const t = k / 6;
    return { x: (1 - t) ** 2 * pL.x + 2 * (1 - t) * t * mid.x + t * t * pR.x, y: (1 - t) ** 2 * pL.y + 2 * (1 - t) * t * mid.y + t * t * pR.y };
  });

  const res: GlassesResult = {
    present,
    score: Math.min(L.score, R.score),
    left: L.score,
    right: R.score,
    bridge,
    temples,
    lenses: [lensL, lensR],
    bridgeLine,
    temple: [
      { pts: L.templePts, ev: L.templeEv },
      { pts: R.templePts, ev: R.templeEv },
    ],
  };
  an.cache.set("glasses", res);
  return res;
}

/** Frame strokes: lens loops, bridge, temple arms (arms only where there is edge evidence, or always when forced). */
export function glassesStrokes(r: GlassesResult, forced: boolean): TStroke[] {
  const out: TStroke[] = r.lenses.map((pts) => ({ pts, kind: "glasses", w: GLASSES_W }));
  out.push({ pts: r.bridgeLine, kind: "glasses", w: GLASSES_W });
  for (const t of r.temple) if (forced || t.ev >= 0.35) out.push({ pts: t.pts, kind: "glasses", w: GLASSES_W });
  return out;
}
