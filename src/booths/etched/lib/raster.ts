/** Small raster helpers shared by the stroke pipeline: blur, percentile, morphology, hysteresis, thinning, tracing. */
import type { Pt } from "./strokePath";

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** Separable box blur (running mean, edges clamped). */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return src.slice();
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[row + clamp(k, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / n;
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += tmp[clamp(k, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / n;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

export function percentile(values: ArrayLike<number>, p: number): number {
  const a = Float32Array.from(values as ArrayLike<number>).sort();
  return a.length ? a[clamp(Math.floor(a.length * p), 0, a.length - 1)] : 0;
}

const toFloat = (m: Uint8Array): Float32Array => Float32Array.from(m);

export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const b = boxBlur(toFloat(mask), w, h, r);
  return Uint8Array.from(b, (v) => (v > 0.0001 ? 1 : 0));
}

export function erode(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const b = boxBlur(toFloat(mask), w, h, r);
  return Uint8Array.from(b, (v) => (v > 0.9999 ? 1 : 0));
}

/** Canny-style hysteresis: keep pixels >= lo that connect (8-neighborhood) to a pixel >= hi, inside region. */
export function hysteresis(mag: Float32Array, region: Uint8Array, w: number, h: number, hi: number, lo: number): Uint8Array {
  const out = new Uint8Array(mag.length);
  const stack: number[] = [];
  for (let i = 0; i < mag.length; i++) if (region[i] && mag[i] >= hi) {
    out[i] = 1;
    stack.push(i);
  }
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (!out[j] && region[j] && mag[j] >= lo) {
          out[j] = 1;
          stack.push(j);
        }
      }
  }
  return out;
}

/** Zhang-Suen thinning of a binary image (1 = on). */
export function thin(img: Uint8Array, w: number, h: number): Uint8Array {
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
export function trace(skel: Uint8Array, w: number, h: number): Pt[][] {
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
      next.sort((p, q) => (Math.abs(p - cur) % w) - (Math.abs(q - cur) % w)); // prefer 4-connected steps
      cur = next.length ? next[0] : -1;
    }
    if (path.length > 1) paths.push(path);
  }
  return paths;
}

/** Background (0) pixels that cannot reach the image border (4-neighborhood) become 1. */
export function fillHoles(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = mask.slice();
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!mask[i] && !seen[i]) {
      seen[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  for (let i = 0; i < out.length; i++) if (!out[i] && !seen[i]) out[i] = 1;
  return out;
}

/** Keeps only the largest 8-connected component. */
export function largestComponent(mask: Uint8Array, w: number, h: number): Uint8Array {
  const label = new Int32Array(mask.length);
  let next = 0;
  let bestLabel = 0;
  let bestSize = 0;
  const stack: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s]) continue;
    next++;
    let size = 0;
    label[s] = next;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop() as number;
      size++;
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (mask[j] && !label[j]) {
            label[j] = next;
            stack.push(j);
          }
        }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = next;
    }
  }
  return Uint8Array.from(label, (l) => (l === bestLabel && l !== 0 ? 1 : 0));
}

/**
 * Cleans a soft mask: threshold, morphological closing (box radius closeR), hole filling, largest component only,
 * then a Gaussian-like blur (3 box passes of radius blurR, sigma about 3.5 px for blurR = 3). Contour the result at 0.5.
 */
export function cleanMask(soft: Float32Array, w: number, h: number, o: { closeR: number; blurR: number; passes?: number; level?: number }): Float32Array {
  let m: Uint8Array = Uint8Array.from(soft, (v) => (v >= (o.level ?? 0.5) ? 1 : 0));
  if (o.closeR > 0) m = erode(dilate(m, w, h, o.closeR), w, h, o.closeR);
  m = largestComponent(fillHoles(m, w, h), w, h);
  let f: Float32Array = Float32Array.from(m);
  for (let i = 0; i < (o.passes ?? 3); i++) f = boxBlur(f, w, h, o.blurR);
  return f;
}
