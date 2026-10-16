/**
 * One-time photo analysis, cached for the lifetime of the photo: face landmarks, person segmentation (class masks
 * upscaled to the 768x960 working size with bilinear resampling + a small blur), a locally contrast-normalized edge map
 * and a blurred luminance map. Changing Detail / Glasses / Hair only recomputes strokes from this object (see faceStrokes.ts).
 * buildRelief() turns the masks into the layered relief base of the height map.
 */
import { detectLandmarks } from "./faceLandmarker";
import type { Landmark } from "./faceStrokes";
import { HH, HW, WORK_H, WORK_W } from "./heightMap";
import { CHIN, FACE_OVAL } from "./landmarkIndices";
import { boxBlur, clamp, percentile } from "./raster";
import { segmentPerson, type ClassMask } from "./segmenter";

/** Soft (0..1) masks at working size. */
export interface Masks {
  person: Float32Array;
  hair: Float32Array;
  body: Float32Array;
  face: Float32Array;
  clothes: Float32Array;
  others: Float32Array;
}

export interface Analysis {
  W: number;
  H: number;
  canvas: HTMLCanvasElement;
  /** Lightly blurred luminance, 0..255 (glasses frame tracing). */
  lum: Float32Array;
  /** Blurred luminance, 0..1 (tonal relief). */
  gray: Float32Array;
  /** Gradient magnitude of the locally contrast-normalized luminance (per pixel). */
  mag: Float32Array;
  /** Edge strength that counts as "strong" on the face (adaptive percentile). */
  strong: number;
  landmarks: Landmark[] | null;
  masks: Masks | null;
  /** Raw class mask from the segmenter (for the debug overlay). */
  classes: ClassMask | null;
  /** Memoized stroke results keyed by parameters. */
  cache: Map<string, unknown>;
}

/** Relief levels: background 0, clothes .08, hair/head covering .14, skin .06 (+ tonal). The gain only makes them readable in the normal map. */
const RELIEF_GAIN = 1.8;

function upsampleMasks(cm: ClassMask, W: number, H: number): Masks {
  const mk = () => new Float32Array(W * H);
  const hair = mk();
  const body = mk();
  const face = mk();
  const clothes = mk();
  const others = mk();
  const chan: (Float32Array | null)[] = [null, hair, body, face, clothes, others];
  const { w: cw, h: ch, data } = cm;
  const add = (c: number, wt: number, i: number) => {
    const a = chan[c];
    if (a) a[i] += wt;
  };
  for (let y = 0; y < H; y++) {
    const sy = clamp((y + 0.5) / H * ch - 0.5, 0, ch - 1.001);
    const y0 = Math.floor(sy);
    const ty = sy - y0;
    for (let x = 0; x < W; x++) {
      const sx = clamp((x + 0.5) / W * cw - 0.5, 0, cw - 1.001);
      const x0 = Math.floor(sx);
      const tx = sx - x0;
      const i = y * W + x;
      add(data[y0 * cw + x0], (1 - tx) * (1 - ty), i);
      add(data[y0 * cw + x0 + 1], tx * (1 - ty), i);
      add(data[(y0 + 1) * cw + x0], (1 - tx) * ty, i);
      add(data[(y0 + 1) * cw + x0 + 1], tx * ty, i);
    }
  }
  const b = (a: Float32Array) => boxBlur(a, W, H, 2);
  const m = { hair: b(hair), body: b(body), face: b(face), clothes: b(clothes), others: b(others) };
  const person = new Float32Array(W * H);
  for (let i = 0; i < person.length; i++) person[i] = m.hair[i] + m.body[i] + m.face[i] + m.clothes[i] + m.others[i];
  return { person, ...m };
}

export async function analyzePhoto(canvas: HTMLCanvasElement): Promise<Analysis> {
  const W = WORK_W;
  const H = WORK_H;
  const [landmarks, classes] = await Promise.all([detectLandmarks(canvas), segmentPerson(canvas)]);

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(canvas, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const g0 = new Float32Array(W * H);
  const sq = new Float32Array(W * H);
  const g1 = new Float32Array(W * H);
  for (let i = 0; i < g0.length; i++) {
    const v = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    g0[i] = v;
    sq[i] = v * v;
    g1[i] = v / 255;
  }
  // local contrast normalization, then gradient magnitude
  const mean = boxBlur(g0, W, H, 24);
  const msq = boxBlur(sq, W, H, 24);
  const ln = new Float32Array(W * H);
  for (let i = 0; i < ln.length; i++) ln[i] = (g0[i] - mean[i]) / (Math.sqrt(Math.max(0, msq[i] - mean[i] * mean[i])) + 12);
  const lb = boxBlur(ln, W, H, 1);
  const mag = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = (lb[i - W + 1] + 2 * lb[i + 1] + lb[i + W + 1] - lb[i - W - 1] - 2 * lb[i - 1] - lb[i + W - 1]) / 8;
      const gy = (lb[i + W - 1] + 2 * lb[i + W] + lb[i + W + 1] - lb[i - W - 1] - 2 * lb[i - W] - lb[i - W + 1]) / 8;
      mag[i] = Math.hypot(gx, gy);
    }
  const gray = boxBlur(g1, W, H, 6);
  const lum = boxBlur(g0, W, H, 1);

  // strong-edge threshold from the face region
  let cx = 0.5 * W;
  let cy = 0.48 * H;
  let rx = 0.4 * W;
  let ry = 0.45 * H;
  if (landmarks && landmarks.length >= 468) {
    const xs = FACE_OVAL.map((i) => landmarks[i].x * W);
    const ys = FACE_OVAL.map((i) => landmarks[i].y * H);
    cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    rx = (Math.max(...xs) - Math.min(...xs)) / 2;
    ry = (Math.max(...ys) - Math.min(...ys)) / 2;
  }
  const vals: number[] = [];
  for (let y = 0; y < H; y += 3)
    for (let x = 0; x < W; x += 3) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) vals.push(mag[y * W + x]);
  const strong = Math.max(0.04, percentile(vals, 0.92));

  return {
    W,
    H,
    canvas,
    lum,
    gray,
    mag,
    strong,
    landmarks,
    masks: classes ? upsampleMasks(classes, W, H) : null,
    classes,
    cache: new Map(),
  };
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Layered relief base (grayscale canvas at height-map size) or null when there is nothing to show. */
export function buildRelief(an: Analysis): HTMLCanvasElement | null {
  const cached = an.cache.get("relief");
  if (cached) return cached as HTMLCanvasElement;
  const lm = an.landmarks && an.landmarks.length >= 468 ? an.landmarks : null;
  const m = an.masks;
  if (!m && !lm) return null;
  const { W, H } = an;
  const chin = (lm ? lm[CHIN].y * H : 0.62 * H) + 0.04 * H;
  const feather = 0.02 * H;

  let polyFill: Uint8ClampedArray | null = null;
  if (!m && lm) {
    const pc = document.createElement("canvas");
    pc.width = HW;
    pc.height = HH;
    const pctx = pc.getContext("2d");
    if (pctx) {
      pctx.beginPath();
      FACE_OVAL.forEach((i, k) => (k ? pctx.lineTo(lm[i].x * HW, lm[i].y * HH) : pctx.moveTo(lm[i].x * HW, lm[i].y * HH)));
      pctx.closePath();
      pctx.fill();
      polyFill = pctx.getImageData(0, 0, HW, HH).data;
    }
  }

  let sum = 0;
  let n = 0;
  if (m) for (let i = 0; i < W * H; i += 7) if (m.face[i] > 0.5) { sum += an.gray[i]; n++; }
  const faceMean = n ? sum / n : 0.5;

  const out = new Float32Array(HW * HH);
  for (let y = 0; y < HH; y++) {
    const sy = Math.min(H - 1, Math.round((y * H) / HH));
    for (let x = 0; x < HW; x++) {
      const si = sy * W + Math.min(W - 1, Math.round((x * W) / HW));
      const tonal = clamp((an.gray[si] - faceMean) * 0.22, -0.05, 0.1);
      let h = 0;
      if (m) {
        const headK = smoothstep(chin + feather, chin - feather, sy);
        const cl = m.clothes[si] + m.others[si];
        h = 0.14 * (m.hair[si] + cl * headK) + 0.08 * cl * (1 - headK) + (0.06 + tonal) * m.face[si] + (0.06 + 0.5 * tonal) * m.body[si];
      } else if (polyFill && polyFill[(y * HW + x) * 4 + 3] > 0) h = 0.06 + tonal;
      out[y * HW + x] = h * RELIEF_GAIN;
    }
  }
  const soft = boxBlur(boxBlur(out, HW, HH, 2), HW, HH, 2); // feathered edges
  const c = document.createElement("canvas");
  c.width = HW;
  c.height = HH;
  const cctx = c.getContext("2d");
  if (!cctx) return null;
  const img = cctx.createImageData(HW, HH);
  for (let i = 0; i < soft.length; i++) {
    const v = clamp(soft[i], 0, 1) * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  cctx.putImageData(img, 0, 0);
  an.cache.set("relief", c);
  return c;
}
