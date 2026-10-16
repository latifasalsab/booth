/**
 * Head geometry shared by the silhouette and the hair/fold strokes: the cleaned person mask (closing, hole filling,
 * largest component, Gaussian-like blur at the 768 px working size) and the head metrics in working pixels:
 * top of the head, chin, head height and the "line" (chin + 10% of the head height) below which there are no fold strokes
 * and the silhouette is drawn as smooth shoulders.
 */
import type { Analysis } from "./analysis";
import { CHIN } from "./landmarkIndices";
import { cleanMask } from "./raster";

export interface Head {
  top: number;
  chin: number;
  headH: number;
  line: number;
}

export function cleanedPerson(an: Analysis): Float32Array | null {
  if (!an.masks) return null;
  const cached = an.cache.get("personClean") as Float32Array | undefined;
  if (cached) return cached;
  const f = cleanMask(an.masks.person, an.W, an.H, { closeR: 6, blurR: 3, passes: 3 });
  an.cache.set("personClean", f);
  return f;
}

export function headMetrics(an: Analysis): Head | null {
  const lm = an.landmarks && an.landmarks.length >= 468 ? an.landmarks : null;
  if (!lm) return null;
  const cached = an.cache.get("head") as Head | undefined;
  if (cached) return cached;
  const { W, H } = an;
  const chin = lm[CHIN].y * H;
  let top = -1;
  const f = cleanedPerson(an);
  if (f)
    for (let y = 0; y < H && top < 0; y++) {
      let n = 0;
      for (let x = 0; x < W; x++) if (f[y * W + x] >= 0.5) n++;
      if (n >= 3) top = y;
    }
  if (top < 0) top = lm[10].y * H - 0.1 * (chin - lm[10].y * H);
  const headH = Math.max(0.1 * H, chin - top);
  const res = { top, chin, headH, line: chin + 0.1 * headH };
  an.cache.set("head", res);
  return res;
}
