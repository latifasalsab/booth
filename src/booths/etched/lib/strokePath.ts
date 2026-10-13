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
}

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

/** Join ordered strokes into one path with short, shallow connectors between them. */
export function buildSingleLine(ordered: Stroke[]): LinePath {
  const pts: Pt[] = [];
  const shallow: boolean[] = [];
  const push = (p: Pt, flag: boolean) => {
    if (pts.length) shallow.push(flag);
    pts.push(p);
  };
  for (const s of ordered) {
    if (s.length < 2) continue;
    if (pts.length) {
      const a = pts[pts.length - 1];
      const n = Math.max(2, Math.ceil(dist(a, s[0]) / 0.05));
      for (let k = 1; k <= n; k++) push(lerp(a, s[0], k / n), true);
    } else push(s[0], false);
    for (let i = 1; i < s.length; i++) push(s[i], false);
  }
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return { pts, shallow, cum, total: cum[cum.length - 1] || 0 };
}

/** Position at fraction t (0..1) along the path. */
export function pointAt(path: LinePath, t: number): Pt {
  if (!path.pts.length) return { x: 0.5, y: 0.5 };
  const target = Math.min(1, Math.max(0, t)) * path.total;
  let i = 0;
  while (i < path.pts.length - 2 && path.cum[i + 1] < target) i++;
  const span = path.cum[i + 1] - path.cum[i] || 1;
  return lerp(path.pts[i], path.pts[Math.min(i + 1, path.pts.length - 1)], (target - path.cum[i]) / span);
}
