/**
 * Marching squares on a scalar field (for example a soft person mask) plus polyline helpers.
 * contours() returns polylines in pixel coordinates; closed loops repeat their first point at the end.
 */
import { dist, type Pt } from "./strokePath";

export function contours(field: Float32Array, w: number, h: number, level: number, stride = 2): Pt[][] {
  const gw = Math.floor((w - 1) / stride) + 1;
  const gh = Math.floor((h - 1) / stride) + 1;
  const v = (i: number, j: number) => field[Math.min(h - 1, j * stride) * w + Math.min(w - 1, i * stride)];
  const adj = new Map<number, number[]>();
  const add = (a: number, b: number) => {
    const l = adj.get(a);
    if (l) l.push(b);
    else adj.set(a, [b]);
  };
  const link = (a: number, b: number) => {
    add(a, b);
    add(b, a);
  };
  for (let j = 0; j < gh - 1; j++)
    for (let i = 0; i < gw - 1; i++) {
      const tl = v(i, j);
      const tr = v(i + 1, j);
      const br = v(i + 1, j + 1);
      const bl = v(i, j + 1);
      const code = (tl >= level ? 8 : 0) + (tr >= level ? 4 : 0) + (br >= level ? 2 : 0) + (bl >= level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      // edge keys: even = horizontal edge starting at node (i,j), odd = vertical edge
      const T = (j * gw + i) * 2;
      const B = ((j + 1) * gw + i) * 2;
      const L = (j * gw + i) * 2 + 1;
      const R = (j * gw + i + 1) * 2 + 1;
      const mid = (tl + tr + br + bl) / 4 >= level;
      switch (code) {
        case 1: case 14: link(L, B); break;
        case 2: case 13: link(B, R); break;
        case 3: case 12: link(L, R); break;
        case 4: case 11: link(T, R); break;
        case 6: case 9: link(T, B); break;
        case 7: case 8: link(L, T); break;
        case 5:
          if (mid) { link(L, T); link(B, R); } else { link(T, R); link(L, B); }
          break;
        case 10:
          if (mid) { link(T, R); link(L, B); } else { link(L, T); link(B, R); }
          break;
      }
    }
  const pos = (key: number): Pt => {
    const idx = key >> 1;
    const i = idx % gw;
    const j = (idx / gw) | 0;
    if (key & 1) {
      const a = v(i, j);
      const b = v(i, j + 1);
      return { x: i * stride, y: (j + (b === a ? 0.5 : (level - a) / (b - a))) * stride };
    }
    const a = v(i, j);
    const b = v(i + 1, j);
    return { x: (i + (b === a ? 0.5 : (level - a) / (b - a))) * stride, y: j * stride };
  };
  const visited = new Set<number>();
  const out: Pt[][] = [];
  const walk = (start: number) => {
    const keys = [start];
    visited.add(start);
    let cur = start;
    for (;;) {
      const nb = adj.get(cur) ?? [];
      const next = nb.find((n) => !visited.has(n));
      if (next === undefined) {
        if (keys.length > 2 && nb.includes(start)) keys.push(start);
        break;
      }
      visited.add(next);
      keys.push(next);
      cur = next;
    }
    out.push(keys.map(pos));
  };
  for (const [k, nb] of adj) if (nb.length === 1 && !visited.has(k)) walk(k);
  for (const k of adj.keys()) if (!visited.has(k)) walk(k);
  return out;
}

export function pixelLength(poly: Pt[]): number {
  let n = 0;
  for (let i = 1; i < poly.length; i++) n += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
  return n;
}

/** Cut a polyline wherever it runs within margin px of the image border; pieces shorter than minPts are dropped. */
export function splitAtBorder(poly: Pt[], w: number, h: number, margin = 3, minPts = 8): Pt[][] {
  const pieces: Pt[][] = [];
  let cur: Pt[] = [];
  const flush = () => {
    if (cur.length >= minPts) pieces.push(cur);
    cur = [];
  };
  for (const p of poly) {
    if (p.x < margin || p.y < margin || p.x > w - 1 - margin || p.y > h - 1 - margin) flush();
    else cur.push(p);
  }
  flush();
  return pieces;
}

/** Split a normalized polyline into runs of points farther than thr from every point of the other polylines. */
export function dropNearDuplicates(poly: Pt[], others: Pt[][], thr: number): Pt[][] {
  const ref = others.flatMap((o) => o.filter((_, i) => i % 2 === 0));
  const runs: Pt[][] = [];
  let cur: Pt[] = [];
  for (const p of poly) {
    if (ref.some((q) => dist(p, q) < thr)) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length) runs.push(cur);
  return runs;
}
