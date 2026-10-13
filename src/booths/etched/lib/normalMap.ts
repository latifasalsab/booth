/**
 * Texture helpers: height map -> tangent-space normal map, and the scratched brushed-metal roughness map.
 * Orientation: canvas row 0 is the top of the plate (three.js flipY maps it to v = 1), so a height that
 * rises downward in the image tilts the normal up (+y). That makes relief look raised and lit from the top-left.
 */
export function heightToNormal(src: HTMLCanvasElement, dst: HTMLCanvasElement, strength: number): void {
  const w = src.width;
  const h = src.height;
  const sctx = src.getContext("2d");
  const dctx = dst.getContext("2d");
  if (!sctx || !dctx) return;
  const s = sctx.getImageData(0, 0, w, h).data;
  const hh = new Float32Array(w * h);
  for (let i = 0; i < hh.length; i++) hh[i] = s[i * 4] / 255;
  const out = dctx.createImageData(w, h);
  const d = out.data;
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = 128;
    d[i * 4 + 1] = 128;
    d[i * 4 + 2] = 255;
    d[i * 4 + 3] = 255;
  }
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const dx = (hh[i - w + 1] + 2 * hh[i + 1] + hh[i + w + 1] - hh[i - w - 1] - 2 * hh[i - 1] - hh[i + w - 1]) * 0.125;
      const dy = (hh[i + w - 1] + 2 * hh[i + w] + hh[i + w + 1] - hh[i - w - 1] - 2 * hh[i - w] - hh[i - w + 1]) * 0.125;
      const nx = -dx * strength;
      const ny = dy * strength;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const o = i * 4;
      d[o] = (nx * inv * 0.5 + 0.5) * 255;
      d[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
      d[o + 2] = (inv * 0.5 + 0.5) * 255;
    }
  dctx.putImageData(out, 0, 0);
}

/** Seeded RNG so the scratches are the same on every load. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roughness lives in the green channel: brushed horizontal streaks plus a few scratches. */
export function makeRoughnessCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const rnd = mulberry32(7);
  ctx.fillStyle = "rgb(98,98,98)";
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 1;
  for (let i = 0; i < 700; i++) {
    const g = 60 + Math.floor(rnd() * 90);
    ctx.strokeStyle = `rgba(${g},${g},${g},.28)`;
    const y = rnd() * h;
    const x0 = rnd() * w * 0.6;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + w * (0.3 + rnd() * 0.7), y + (rnd() - 0.5) * 1.5);
    ctx.stroke();
  }
  for (let i = 0; i < 36; i++) {
    const g = 170 + Math.floor(rnd() * 85);
    ctx.strokeStyle = `rgba(${g},${g},${g},${0.25 + rnd() * 0.35})`;
    ctx.lineWidth = 0.5 + rnd() * 0.7;
    const x = rnd() * w;
    const y = rnd() * h;
    const a = rnd() * Math.PI;
    const l = 20 + rnd() * 120;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  return c;
}
