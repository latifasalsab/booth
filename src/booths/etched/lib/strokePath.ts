/**
 * Stroke geometry helpers: smoothing, simplification, nearest-neighbor ordering and the
 * single continuous line the etch animation follows. Coordinates are normalized to the 4:5 plate (x, y in 0..1).
 */
export interface Pt {
  x: number;
  y: number;
}
export type Stroke = Pt[];

/** One continuous path. shallow[i] marks segment i -> i+1 as a connector (pressed only lightly). */
export interface LinePath {
  pts: Pt[];
  shallow: boolean[];
  cum: number[];
  total: number;
  /** Stroke width of each segment in working pixels (768 px wide image); connectors use CONNECTOR_W. */
  w: number[];
}

export type StrokeKind = "silhouette" | "boundary" | "face" | "brow" | "eye" | "glasses" | "nose" | "lips" | "hair";
/** A stroke with its role and width (working px). wm = optional per-point width multiplier. */
export interface TStroke {
  pts: Pt[];
  kind: StrokeKind;
  w: number;
  wm?: number[];
  /** When every stroke of a kind has seq, they are drawn in this order and direction (no nearest-neighbor). */
  seq?: number;
}
/** Drawing order of the single continuous line. */
export const KIND_ORDER: StrokeKind[] = ["silhouette", "boundary", "face", "brow", "eye", "glasses", "nose", "lips", "hair"];
export const CONNECTOR_W = 7;

/** Plate width / height. Distances multiply x by this so they are isotropic. */
export const ASPECT = 0.8;
export const dist = (a: Pt, b: Pt): number => Math.hypot((a.x - b.x) * ASPECT, a.y - b.y);
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export function strokeLength(s: Stroke): number {
  let n = 0;
  for (let i = 1; i < s.length; i++) n += dist(s[i - 1], s[i]);
  return n;
}

/** Chaikin corner cutting (open polyline, endpoints kept). */
export function chaikin(pts: Pt[], iterations = 2): Pt[] {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    if (p.length < 3) return p;
    const out: Pt[] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      out.push(lerp(p[i], p[i + 1], 0.25), lerp(p[i], p[i + 1], 0.75));
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

/** Douglas-Peucker simplification. */
export function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    let maxD = 0;
    let idx = -1;
    const A = pts[a];
    const B = pts[b];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i].x - A.x) * dy - (pts[i].y - A.y) * dx) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx > -1 && maxD > eps) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Nearest-neighbor ordering, starting at the top-most stroke; strokes may be reversed. */
export function orderStrokes(strokes: Stroke[]): Stroke[] {
  const left = strokes.filter((s) => s.length > 1).map((s) => s.slice());
  if (!left.length) return [];
  const topIdx = left.reduce((best, s, i) => (Math.min(s[0].y, s[s.length - 1].y) < Math.min(left[best][0].y, left[best][left[best].length - 1].y) ? i : best), 0);
  const first = left.splice(topIdx, 1)[0];
  if (first[0].y > first[first.length - 1].y) first.reverse();
  const out: Stroke[] = [first];
  while (left.length) {
    const end = out[out.length - 1][out[out.length - 1].length - 1];
    let bi = 0;
    let bd = Infinity;
    let rev = false;
    left.forEach((s, i) => {
      const d0 = dist(end, s[0]);
      const d1 = dist(end, s[s.length - 1]);
      if (d0 < bd) [bd, bi, rev] = [d0, i, false];
      if (d1 < bd) [bd, bi, rev] = [d1, i, true];
    });
    const next = left.splice(bi, 1)[0];
    if (rev) next.reverse();
    out.push(next);
  }
  return out;
}

const isClosed = (pts: Pt[]): boolean => pts.length > 3 && dist(pts[0], pts[pts.length - 1]) < 0.006;

/** Order strokes by KIND_ORDER; inside a kind, nearest-neighbor from the pen position (closed loops may start anywhere). */
export function orderTagged(strokes: TStroke[]): TStroke[] {
  const out: TStroke[] = [];
  let cur: Pt = { x: 0.5, y: 0 };
  for (const kind of KIND_ORDER) {
    const group = strokes.filter((s) => s.kind === kind && s.pts.length > 1).map((s) => ({ ...s, pts: s.pts.slice(), wm: s.wm?.slice() }));
    if (group.length > 1 && group.every((s) => s.seq !== undefined)) {
      group.sort((a, b) => (a.seq as number) - (b.seq as number));
      for (const s of group) out.push(s);
      cur = group[group.length - 1].pts[group[group.length - 1].pts.length - 1];
      continue;
    }
    while (group.length) {
      let bi = 0;
      let bj = 0;
      let bd = Infinity;
      let rev = false;
      group.forEach((s, i) => {
        if (isClosed(s.pts)) {
          s.pts.forEach((p, j) => {
            const d = dist(cur, p);
            if (d < bd) [bd, bi, bj, rev] = [d, i, j, false];
          });
        } else {
          const d0 = dist(cur, s.pts[0]);
          const d1 = dist(cur, s.pts[s.pts.length - 1]);
          if (d0 < bd) [bd, bi, bj, rev] = [d0, i, 0, false];
          if (d1 < bd) [bd, bi, bj, rev] = [d1, i, 0, true];
        }
      });
      const s = group.splice(bi, 1)[0];
      if (bj > 0 && isClosed(s.pts)) {
        const core = s.pts.slice(0, -1);
        s.pts = [...core.slice(bj), ...core.slice(0, bj)];
        s.pts.push(s.pts[0]);
        if (s.wm) {
          const wc = s.wm.slice(0, -1);
          s.wm = [...wc.slice(bj), ...wc.slice(0, bj)];
          s.wm.push(s.wm[0]);
        }
      }
      if (rev) {
        s.pts.reverse();
        s.wm?.reverse();
      }
      out.push(s);
      cur = s.pts[s.pts.length - 1];
    }
  }
  return out;
}

/** Join ordered strokes into one path with short, shallow connectors between them. */
export function buildLine(ordered: TStroke[]): LinePath {
  const pts: Pt[] = [];
  const shallow: boolean[] = [];
  const w: number[] = [];
  const push = (p: Pt, flag: boolean, width: number) => {
    if (pts.length) {
      shallow.push(flag);
      w.push(width);
    }
    pts.push(p);
  };
  for (const s of ordered) {
    if (s.pts.length < 2) continue;
    if (pts.length) {
      const a = pts[pts.length - 1];
      const n = Math.max(2, Math.ceil(dist(a, s.pts[0]) / 0.05));
      for (let k = 1; k <= n; k++) push(lerp(a, s.pts[0], k / n), true, CONNECTOR_W);
    } else push(s.pts[0], false, 0);
    for (let i = 1; i < s.pts.length; i++) push(s.pts[i], false, s.w * (s.wm ? (s.wm[i - 1] + s.wm[i]) / 2 : 1));
  }
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return { pts, shallow, cum, total: cum[cum.length - 1] || 0, w };
}

/** Plain strokes (no roles) joined into one path with a uniform width. */
export function buildSingleLine(ordered: Stroke[], width = 9): LinePath {
  return buildLine(ordered.map((pts) => ({ pts, kind: "face" as const, w: width })));
}

/** Etch duration: 5 s for short paths up to 8 s for long, detailed ones. */
export function etchDuration(path: LinePath): number {
  return clampMs(5000 + (path.total - 5) * 500);
}
const clampMs = (v: number) => Math.min(8000, Math.max(5000, v));

/** Position at fraction t (0..1) along the path. */
export function pointAt(path: LinePath, t: number): Pt {
  if (!path.pts.length) return { x: 0.5, y: 0.5 };
  const target = Math.min(1, Math.max(0, t)) * path.total;
  let i = 0;
  while (i < path.pts.length - 2 && path.cum[i + 1] < target) i++;
  const span = path.cum[i + 1] - path.cum[i] || 1;
  return lerp(path.pts[i], path.pts[Math.min(i + 1, path.pts.length - 1)], (target - path.cum[i]) / span);
}
