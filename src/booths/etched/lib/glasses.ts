/**
 * Glasses: detection, hybrid frame tracing and curve fitting.
 * Detection (placement) scores the ring of strong edges around each eye (coverage, ring-likeness, density) and needs
 * bridge or temple evidence. Shape: in each lens ROI the frame is extracted as a dark band relative to the local skin
 * median (edge-based fallback for thin or rimless frames), the connected band that rings the eye is thinned to its
 * center line, and that line is regularized with a least-squares rotated superellipse |x/a|^n + |y/b|^n = 1
 * (free center, a, b, rotation, n in [2, 5], Nelder-Mead). Round frames stay round (n near 2), boxy ones stay boxy.
 * A fit is accepted only below a residual threshold, otherwise the traced polyline is smoothed. Lenses are blended at
 * most 20% toward their mirrored counterpart. Bridge and temples follow frame pixels when they exist. If nothing can
 * be traced and glasses are forced, an ellipse from the eye landmarks scaled ~1.9x is used. Thresholds are heuristics.
 */
import type { Analysis } from "./analysis";
import type { Landmark } from "./faceStrokes";
import { EAR_LEFT_SIDE_OF_IMAGE, EAR_RIGHT_SIDE_OF_IMAGE, LEFT_EYE, LEFT_EYEBROW, RIGHT_EYE, RIGHT_EYEBROW } from "./landmarkIndices";
import { clamp, thin } from "./raster";
import { chaikin, type Pt, type TStroke } from "./strokePath";

export type GlassesMode = "auto" | "on" | "off";
export type LensMode = "traced" | "fitted" | "fallback";

export interface LensResult {
  pts: Pt[];
  mode: LensMode;
  /** Superellipse exponent (fitted lenses). */
  n?: number;
  rms?: number;
}
export interface GlassesResult {
  present: boolean;
  score: number;
  left: number;
  right: number;
  bridge: boolean;
  temples: boolean;
  /** Overall shape source: the weakest lens decides (fallback < traced < fitted). */
  mode: LensMode | "none";
  /** Closed lens loops (normalized), image-left first. */
  lenses: LensResult[];
  bridgeLine: Pt[];
  bridgeTraced: boolean;
  /** Temple arms with pixel evidence only. */
  temple: Pt[][];
  /** For the ?debug=1 overlay (normalized): traced center-line points and the final lens curves. */
  debug: { trace: Pt[][]; fits: Pt[][] };
}

const BINS = 24;
const RING_BINS = 72;
const EYE_THRESHOLD = 0.3;
const FIT_MAX_RMS = 0.06; // residual / mean semi-axis
const GLASSES_W = 7;

interface EyeGeom {
  cx: number;
  cy: number;
  ew: number;
  eh: number;
  hx: number;
  hy: number;
  ax: number;
  ay: number;
  lidX: number;
  lidY: number;
  brow: [number, number, number, number];
  tilt: number;
}

function eyeGeom(an: Analysis, lm: Landmark[], eye: number[], brow: number[]): EyeGeom {
  const { W, H } = an;
  const px = (i: number): Pt => ({ x: lm[i].x * W, y: lm[i].y * H });
  const ep = eye.map(px);
  const minx = Math.min(...ep.map((p) => p.x));
  const maxx = Math.max(...ep.map((p) => p.x));
  const miny = Math.min(...ep.map((p) => p.y));
  const maxy = Math.max(...ep.map((p) => p.y));
  const ew = Math.max(8, maxx - minx);
  const eh = Math.max(maxy - miny, 0.25 * ew);
  const bp = brow.map(px);
  let tilt = Math.atan2(ep[8].y - ep[0].y, ep[8].x - ep[0].x);
  if (tilt > Math.PI / 2) tilt -= Math.PI;
  if (tilt < -Math.PI / 2) tilt += Math.PI;
  return {
    cx: (minx + maxx) / 2,
    cy: (miny + maxy) / 2,
    ew,
    eh,
    // ROI: eye bbox about 1.9x wider and 2.4x taller, enlarged a little so the whole lens ring fits
    hx: 1.05 * ew,
    hy: Math.max(1.2 * eh, 0.8 * ew),
    ax: 0.85 * ew,
    ay: 0.65 * ew,
    lidX: 0.62 * ew,
    lidY: Math.max(0.75 * eh, 0.2 * ew) + 3,
    brow: [Math.min(...bp.map((p) => p.x)) - 4, Math.max(...bp.map((p) => p.x)) + 4, Math.min(...bp.map((p) => p.y)) - 4, Math.max(...bp.map((p) => p.y)) + 4],
    tilt,
  };
}

/** Is this ROI pixel usable (not eyelid/iris area, not eyebrow)? */
function usable(g: EyeGeom, x: number, y: number): boolean {
  const dx = x - g.cx;
  const dy = y - g.cy;
  if ((dx / g.lidX) ** 2 + (dy / g.lidY) ** 2 < 1) return false;
  return !(x >= g.brow[0] && x <= g.brow[1] && y >= g.brow[2] && y <= g.brow[3]);
}

/** Detection score of the strong-edge ring around an eye. */
function scoreEye(an: Analysis, g: EyeGeom): number {
  const { W, H, mag, strong } = an;
  const bins = new Int32Array(BINS);
  const rho = new Float32Array(BINS);
  const best = new Float32Array(BINS);
  let ringPx = 0;
  let strongPx = 0;
  for (let y = Math.floor(g.cy - g.hy); y <= Math.ceil(g.cy + g.hy); y++)
    for (let x = Math.floor(g.cx - g.hx); x <= Math.ceil(g.cx + g.hx); x++) {
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || !usable(g, x, y)) continue;
      const dx = x - g.cx;
      const dy = y - g.cy;
      const rn = Math.hypot(dx / g.ax, dy / g.ay);
      if (rn < 0.7 || rn > 1.45) continue;
      ringPx++;
      const mg = mag[y * W + x];
      if (mg < strong) continue;
      strongPx++;
      const b = Math.min(BINS - 1, Math.floor(((Math.atan2(dy / g.ay, dx / g.ax) + Math.PI) / (2 * Math.PI)) * BINS));
      bins[b]++;
      if (mg > best[b]) {
        best[b] = mg;
        rho[b] = rn;
      }
    }
  const hit = Array.from(bins, (n) => n >= 2);
  const coverage = hit.filter(Boolean).length / BINS;
  const rs = Array.from(rho).filter((_, i) => hit[i]);
  const mean = rs.reduce((a, b) => a + b, 0) / Math.max(1, rs.length);
  const std = Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rs.length));
  const consistency = clamp(1 - std / Math.max(0.1, mean) / 0.3, 0, 1);
  const density = strongPx / Math.max(1, ringPx);
  let score = coverage * consistency * Math.min(1, density / 0.025);
  if (density > 0.45) score *= 0.4; // textured skin or hair, not a frame
  return score;
}

// ------------------------------------------------------------------ frame tracing
interface Trace {
  ring: Pt[] | null;
  skeleton: Pt[];
  median: number;
}

/** 8-connected component of the candidate mask that best forms a ring (angular coverage x size). */
function ringComponent(cand: Uint8Array, rw: number, rh: number, ccx: number, ccy: number, g: EyeGeom): { mask: Uint8Array; coverage: number } | null {
  const label = new Int32Array(cand.length);
  let next = 0;
  let best: { idx: number[]; coverage: number } | null = null;
  let bestScore = 0;
  for (let s = 0; s < cand.length; s++) {
    if (!cand[s] || label[s]) continue;
    const idx: number[] = [];
    const stack = [s];
    label[s] = ++next;
    while (stack.length) {
      const i = stack.pop() as number;
      idx.push(i);
      const x = i % rw;
      const y = (i / rw) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= rw || yy >= rh) continue;
          const j = yy * rw + xx;
          if (cand[j] && !label[j]) {
            label[j] = next;
            stack.push(j);
          }
        }
    }
    if (idx.length < 25) continue;
    const bins = new Set<number>();
    for (const i of idx) {
      const ang = Math.atan2((((i / rw) | 0) - ccy) / g.ay, ((i % rw) - ccx) / g.ax);
      bins.add(Math.min(BINS - 1, Math.floor(((ang + Math.PI) / (2 * Math.PI)) * BINS)));
    }
    const coverage = bins.size / BINS;
    const score = coverage * Math.log(idx.length + 1);
    if (coverage >= 0.5 && score > bestScore) {
      bestScore = score;
      best = { idx, coverage };
    }
  }
  if (!best) return null;
  const mask = new Uint8Array(cand.length);
  for (const i of best.idx) mask[i] = 1;
  return { mask, coverage: best.coverage };
}

/** Closed center-line polyline (absolute px) from skeleton pixels, via a robust per-angle median radius. */
function ringFromSkeleton(skel: Uint8Array, rw: number, rh: number, x0: number, y0: number, g: EyeGeom): { ring: Pt[] | null; pts: Pt[] } {
  const px: { rho: number; ang: number; p: Pt }[] = [];
  for (let i = 0; i < skel.length; i++) {
    if (!skel[i]) continue;
    const x = x0 + (i % rw);
    const y = y0 + ((i / rw) | 0);
    const dx = (x - g.cx) / g.ax;
    const dy = (y - g.cy) / g.ay;
    px.push({ rho: Math.hypot(dx, dy), ang: Math.atan2(dy, dx), p: { x, y } });
  }
  if (px.length < 20) return { ring: null, pts: px.map((q) => q.p) };
  const med = [...px].sort((a, b) => a.rho - b.rho)[px.length >> 1].rho;
  const keep = px.filter((q) => Math.abs(q.rho - med) <= 0.3); // drops bridge and temple branches
  const cells: number[][] = Array.from({ length: RING_BINS }, () => []);
  for (const q of keep) cells[Math.min(RING_BINS - 1, Math.floor(((q.ang + Math.PI) / (2 * Math.PI)) * RING_BINS))].push(q.rho);
  const r = cells.map((c) => (c.length ? c.sort((a, b) => a - b)[c.length >> 1] : NaN));
  const filled = r.filter((v) => !isNaN(v)).length;
  if (filled < 0.6 * RING_BINS) return { ring: null, pts: keep.map((q) => q.p) };
  for (let i = 0; i < RING_BINS; i++)
    if (isNaN(r[i])) {
      let l = 1;
      while (isNaN(r[(i - l + RING_BINS) % RING_BINS])) l++;
      let rr = 1;
      while (isNaN(r[(i + rr) % RING_BINS])) rr++;
      r[i] = (r[(i - l + RING_BINS) % RING_BINS] * rr + r[(i + rr) % RING_BINS] * l) / (l + rr);
    }
  const sm = r.map((_, i) => (r[(i + RING_BINS - 1) % RING_BINS] + r[i] + r[(i + 1) % RING_BINS]) / 3);
  const ring = sm.map((rho, k) => {
    const t = ((k + 0.5) / RING_BINS) * Math.PI * 2 - Math.PI;
    return { x: g.cx + Math.cos(t) * rho * g.ax, y: g.cy + Math.sin(t) * rho * g.ay };
  });
  ring.push(ring[0]);
  return { ring, pts: keep.map((q) => q.p) };
}

function traceLens(an: Analysis, g: EyeGeom): Trace {
  const { W, H, lum, mag, strong } = an;
  const x0 = Math.max(1, Math.floor(g.cx - g.hx));
  const x1 = Math.min(W - 2, Math.ceil(g.cx + g.hx));
  const y0 = Math.max(1, Math.floor(g.cy - g.hy));
  const y1 = Math.min(H - 2, Math.ceil(g.cy + g.hy));
  const rw = x1 - x0 + 1;
  const rh = y1 - y0 + 1;
  if (rw < 10 || rh < 10) return { ring: null, skeleton: [], median: 128 };
  // skin median luminance (frames are a minority of the usable ROI)
  const hist = new Uint32Array(256);
  let total = 0;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (usable(g, x, y)) {
        hist[clamp(Math.round(lum[y * W + x]), 0, 255)]++;
        total++;
      }
  let acc = 0;
  let median = 128;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= total / 2) {
      median = v;
      break;
    }
  }
  const T = clamp(0.18 * median, 18, 45);
  const dark = new Uint8Array(rw * rh);
  const edge = new Uint8Array(rw * rh);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!usable(g, x, y)) continue;
      const rn = Math.hypot((x - g.cx) / g.ax, (y - g.cy) / g.ay);
      if (rn < 0.7 || rn > 1.45) continue;
      const i = (y - y0) * rw + (x - x0);
      if (lum[y * W + x] <= median - T) dark[i] = 1;
      if (mag[y * W + x] >= strong) edge[i] = 1;
    }
  const ccx = g.cx - x0;
  const ccy = g.cy - y0;
  // dark band first (thick frames); edge pixels as the fallback for thin or rimless frames
  let comp = ringComponent(dark, rw, rh, ccx, ccy, g);
  if (!comp || comp.coverage < 0.6) {
    const e = ringComponent(edge, rw, rh, ccx, ccy, g);
    if (e && (!comp || e.coverage > comp.coverage)) comp = e;
  }
  if (!comp) return { ring: null, skeleton: [], median };
  const { ring, pts } = ringFromSkeleton(thin(comp.mask, rw, rh), rw, rh, x0, y0, g);
  return { ring, skeleton: pts, median };
}

// ------------------------------------------------------------------ superellipse fit
interface Fit {
  cx: number;
  cy: number;
  a: number;
  b: number;
  phi: number;
  n: number;
  rms: number;
}

function nelderMead(f: (p: number[]) => number, x0: number[], step: number[], iters = 500): number[] {
  const n = x0.length;
  const pts = [x0.slice(), ...x0.map((_, i) => { const p = x0.slice(); p[i] += step[i]; return p; })];
  const vals = pts.map(f);
  for (let it = 0; it < iters; it++) {
    const order = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b]);
    const P = order.map((i) => pts[i]);
    const V = order.map((i) => vals[i]);
    for (let i = 0; i <= n; i++) { pts[i] = P[i]; vals[i] = V[i]; }
    if (Math.abs(vals[n] - vals[0]) < 1e-10) break;
    const c = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
    const worst = pts[n];
    const refl = c.map((v, j) => v + (v - worst[j]));
    const fr = f(refl);
    if (fr < vals[0]) {
      const exp = c.map((v, j) => v + 2 * (v - worst[j]));
      const fe = f(exp);
      if (fe < fr) { pts[n] = exp; vals[n] = fe; } else { pts[n] = refl; vals[n] = fr; }
    } else if (fr < vals[n - 1]) {
      pts[n] = refl;
      vals[n] = fr;
    } else {
      const con = c.map((v, j) => v + 0.5 * (worst[j] - v));
      const fc = f(con);
      if (fc < vals[n]) { pts[n] = con; vals[n] = fc; }
      else
        for (let i = 1; i <= n; i++) {
          pts[i] = pts[i].map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j]));
          vals[i] = f(pts[i]);
        }
    }
  }
  let bi = 0;
  vals.forEach((v, i) => { if (v < vals[bi]) bi = i; });
  return pts[bi];
}

/** Least-squares rotated superellipse through a closed traced polyline (px). */
export function fitSuperellipse(pts: Pt[]): Fit {
  const m = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / m;
  const my = pts.reduce((s, p) => s + p.y, 0) / m;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  const phi0 = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const c0 = Math.cos(phi0);
  const s0 = Math.sin(phi0);
  let a0 = 1;
  let b0 = 1;
  for (const p of pts) {
    a0 = Math.max(a0, Math.abs((p.x - mx) * c0 + (p.y - my) * s0));
    b0 = Math.max(b0, Math.abs(-(p.x - mx) * s0 + (p.y - my) * c0));
  }
  const err = (p: number[], penalty: boolean) => {
    const n = clamp(p[5], 2, 5);
    const a = Math.exp(p[2]);
    const b = Math.exp(p[3]);
    const c = Math.cos(p[4]);
    const s = Math.sin(p[4]);
    let sum = 0;
    for (const q of pts) {
      const dx = q.x - p[0];
      const dy = q.y - p[1];
      const x = dx * c + dy * s;
      const y = -dx * s + dy * c;
      const fv = Math.pow(Math.pow(Math.abs(x / a), n) + Math.pow(Math.abs(y / b), n), 1 / n);
      const d = Math.hypot(x, y) * (1 - 1 / Math.max(fv, 1e-6));
      sum += d * d;
    }
    const pen = penalty ? (p[5] < 2 ? (2 - p[5]) ** 2 * 100 : p[5] > 5 ? (p[5] - 5) ** 2 * 100 : 0) : 0;
    return sum / m + pen;
  };
  const sol = nelderMead((p) => err(p, true), [mx, my, Math.log(a0), Math.log(b0), phi0, 2.5], [a0 * 0.1, b0 * 0.1, 0.1, 0.1, 0.1, 0.3]);
  return { cx: sol[0], cy: sol[1], a: Math.exp(sol[2]), b: Math.exp(sol[3]), phi: sol[4], n: clamp(sol[5], 2, 5), rms: Math.sqrt(err(sol, false)) };
}

function fitPolyline(f: Fit, count = 72): Pt[] {
  const c = Math.cos(f.phi);
  const s = Math.sin(f.phi);
  const out: Pt[] = [];
  for (let k = 0; k <= count; k++) {
    const t = (k / count) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    const x = f.a * Math.sign(ct) * Math.abs(ct) ** (2 / f.n);
    const y = f.b * Math.sign(st) * Math.abs(st) ** (2 / f.n);
    out.push({ x: f.cx + x * c - y * s, y: f.cy + x * s + y * c });
  }
  return out;
}

/** Ellipse from the eye landmarks scaled by about 1.9x (minimum aspect 0.7), tilted like the eye. */
function fallbackFit(g: EyeGeom): Fit {
  const a = 0.95 * g.ew;
  return { cx: g.cx, cy: g.cy, a, b: Math.max(0.95 * g.eh, 0.7 * a), phi: g.tilt, n: 2, rms: 0 };
}

function closedChaikin(pts: Pt[], iterations: number): Pt[] {
  let p = pts.slice(0, -1);
  for (let it = 0; it < iterations; it++) {
    const out: Pt[] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    p = out;
  }
  return [...p, p[0]];
}

// ------------------------------------------------------------------ detection + shapes
export function detectGlasses(an: Analysis, lm: Landmark[]): GlassesResult {
  const cached = an.cache.get("glasses") as GlassesResult | undefined;
  if (cached) return cached;
  const { W, H, mag, strong, lum } = an;
  // image-left eye = MediaPipe's RIGHT eye
  const gs = [eyeGeom(an, lm, RIGHT_EYE, RIGHT_EYEBROW), eyeGeom(an, lm, LEFT_EYE, LEFT_EYEBROW)];
  const scores = gs.map((g) => scoreEye(an, g));
  const traces = gs.map((g) => traceLens(an, g));

  type Built = { mode: LensMode; fit?: Fit; pts?: Pt[] };
  const built: Built[] = traces.map((t, i) => {
    if (t.ring) {
      const fit = fitSuperellipse(t.ring);
      if (fit.rms / ((fit.a + fit.b) / 2) < FIT_MAX_RMS) return { mode: "fitted", fit };
      return { mode: "traced", pts: closedChaikin(t.ring, 3) };
    }
    return { mode: "fallback", fit: fallbackFit(gs[i]) };
  });
  // at most 20% blend toward the mirrored counterpart (noise reduction), never forced symmetry
  if (built[0].mode === "fitted" && built[1].mode === "fitted" && built[0].fit && built[1].fit) {
    const mx = lm[168].x * W;
    const mir = (f: Fit): Fit => ({ ...f, cx: 2 * mx - f.cx, phi: -f.phi });
    const blend = (own: Fit, other: Fit): Fit => {
      const o = mir(other);
      const k = 0.2;
      return { cx: own.cx * (1 - k) + o.cx * k, cy: own.cy * (1 - k) + o.cy * k, a: own.a * (1 - k) + o.a * k, b: own.b * (1 - k) + o.b * k, phi: own.phi * (1 - k) + o.phi * k, n: own.n * (1 - k) + o.n * k, rms: own.rms };
    };
    const f0 = built[0].fit;
    const f1 = built[1].fit;
    built[0].fit = blend(f0, f1);
    built[1].fit = blend(f1, f0);
  }
  const lensPx: Pt[][] = built.map((b) => (b.fit ? fitPolyline(b.fit) : (b.pts as Pt[])));

  // frame pixel test for bridge and temples
  const med = (traces[0].median + traces[1].median) / 2;
  const T = clamp(0.18 * med, 18, 45);
  const isFrame = (x: number, y: number) => {
    const xi = clamp(Math.round(x), 0, W - 1);
    const yi = clamp(Math.round(y), 0, H - 1);
    return lum[yi * W + xi] <= med - T || mag[yi * W + xi] >= strong;
  };

  // bridge between the lenses: per-column frame pixels, or a slightly arched segment
  const pL = lensPx[0].reduce((p, q) => (q.x > p.x ? q : p));
  const pR = lensPx[1].reduce((p, q) => (q.x < p.x ? q : p));
  const bandH = 0.2 * ((gs[0].ew + gs[1].ew) / 2);
  const yc = (pL.y + pR.y) / 2;
  const ys: (number | null)[] = [];
  let cols = 0;
  for (let x = Math.ceil(pL.x); x <= Math.floor(pR.x); x++) {
    let sum = 0;
    let c = 0;
    for (let y = Math.round(yc - bandH); y <= Math.round(yc + bandH); y++)
      if (isFrame(x, y)) {
        sum += y;
        c++;
      }
    ys.push(c ? sum / c : null);
    if (c) cols++;
  }
  const bridgeTraced = ys.length > 4 && cols / ys.length >= 0.5;
  let bridgePx: Pt[];
  if (bridgeTraced) {
    const known = ys.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
    const filled = ys.map((v, i) => {
      if (v !== null) return v;
      const l = [...known].reverse().find((k) => k < i);
      const r = known.find((k) => k > i);
      if (l === undefined || r === undefined) return yc;
      return (ys[l] as number) + (((ys[r] as number) - (ys[l] as number)) * (i - l)) / (r - l);
    });
    const mid = filled.filter((_, i) => i % 3 === 0).map((y, k) => ({ x: Math.ceil(pL.x) + k * 3, y }));
    bridgePx = [pL, ...mid.slice(1, -1), pR];
    bridgePx = chaikin(bridgePx, 2);
  } else {
    const lensH = Math.max(...lensPx[0].map((p) => p.y)) - Math.min(...lensPx[0].map((p) => p.y));
    const m = { x: (pL.x + pR.x) / 2, y: yc - 0.14 * lensH };
    bridgePx = Array.from({ length: 7 }, (_, k) => {
      const t = k / 6;
      return { x: (1 - t) ** 2 * pL.x + 2 * (1 - t) * t * m.x + t * t * pR.x, y: (1 - t) ** 2 * pL.y + 2 * (1 - t) * t * m.y + t * t * pR.y };
    });
  }

  // temples: only where frame pixels continue from the lens toward the ear
  const ears = [EAR_LEFT_SIDE_OF_IMAGE, EAR_RIGHT_SIDE_OF_IMAGE].map((i) => ({ x: lm[i].x * W, y: lm[i].y * H }));
  const templePx: Pt[][] = [];
  let edgeEv = 0;
  lensPx.forEach((lens, side) => {
    const ear = ears[side];
    const p0 = lens.reduce((p, q) => (side === 0 ? (q.x < p.x ? q : p) : q.x > p.x ? q : p));
    const dx = ear.x - p0.x;
    const dy = ear.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const N = 24;
    const hits: Pt[] = [p0];
    let gap = 0;
    let used = 0;
    let found = 0;
    for (let k = 1; k <= N; k++) {
      const t = (0.7 * k) / N;
      const sx = p0.x + dx * t;
      const sy = p0.y + dy * t;
      let sum = 0;
      let c = 0;
      for (let o = -3; o <= 3; o++) if (isFrame(sx + nx * o, sy + ny * o)) { sum += o; c++; }
      if (c) {
        hits.push({ x: sx + nx * (sum / c), y: sy + ny * (sum / c) });
        found++;
        gap = 0;
      } else if (++gap > 2) break;
      used = k;
    }
    edgeEv = Math.max(edgeEv, used ? found / used : 0);
    if (found >= 8 && found / Math.max(1, used) >= 0.5) templePx.push(chaikin(hits, 2));
  });

  const present = scores[0] >= EYE_THRESHOLD && scores[1] >= EYE_THRESHOLD && (bridgeTraced || edgeEv >= 0.45);
  const norm = (p: Pt[]) => p.map((q) => ({ x: q.x / W, y: q.y / H }));
  const lenses: LensResult[] = built.map((b, i) => ({ pts: norm(lensPx[i]), mode: b.mode, n: b.fit?.n, rms: b.fit?.rms }));
  const mode: LensMode = lenses.some((l) => l.mode === "fallback") ? "fallback" : lenses.some((l) => l.mode === "traced") ? "traced" : "fitted";
  const res: GlassesResult = {
    present,
    score: Math.min(scores[0], scores[1]),
    left: scores[0],
    right: scores[1],
    bridge: bridgeTraced,
    temples: templePx.length > 0,
    mode,
    lenses,
    bridgeLine: norm(bridgePx),
    bridgeTraced,
    temple: templePx.map(norm),
    debug: { trace: traces.map((t) => norm(t.skeleton)), fits: lenses.map((l) => l.pts) },
  };
  an.cache.set("glasses", res);
  return res;
}

/** Frame strokes: lens loops, bridge, and temple arms that have pixel evidence. */
export function glassesStrokes(r: GlassesResult): TStroke[] {
  const out: TStroke[] = r.lenses.map((l) => ({ pts: l.pts, kind: "glasses", w: GLASSES_W }));
  out.push({ pts: r.bridgeLine, kind: "glasses", w: GLASSES_W });
  for (const t of r.temple) if (t.length > 2) out.push({ pts: t, kind: "glasses", w: GLASSES_W });
  return out;
}
