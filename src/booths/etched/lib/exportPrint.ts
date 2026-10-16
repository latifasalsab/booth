/**
 * Renders the landscape print (3:2, 1800x1200) to a canvas and downloads it as PNG. Layout mirrors PickupView:
 * 4% margins, two equal columns (photo left, embossed plate right, plate transparent with canvas shadows), a small
 * wordmark centered in the bottom band, and a static glossy finish (soft sheen, edge highlight, paper curl).
 * Keep the geometry in sync with the .print-* rules in theme.css.
 */
export const PRINT_W = 1800;
export const PRINT_H = 1200;

const MARGIN = Math.round(PRINT_W * 0.04); // 72
const GAP = 64;
const COL_W = (PRINT_W - 2 * MARGIN - GAP) / 2; // 796
const COL2_X = MARGIN + COL_W + GAP;
const CAP_H = PRINT_H * 0.035; // wordmark cap height: 3.5% of the print height
const SPACE = 64; // equal spacing above and below the wordmark
const IMG_Y = MARGIN;
const IMG_H = PRINT_H - IMG_Y - SPACE - CAP_H - SPACE; // 958
/** Baseline of the wordmark (bottom of the capitals). */
const WORD_BASE = IMG_Y + IMG_H + SPACE + CAP_H;

export interface PrintOptions {
  photoUrl: string;
  plate: HTMLCanvasElement;
  bw: boolean;
  /** Computed font-family of the on-screen wordmark, so the canvas uses the same face. */
  fontFamily: string;
}

/** Font metrics as fractions of the font size. */
export interface FontMetrics {
  cap: number;
  asc: number;
  desc: number;
}

export async function measureFont(family: string, size = 100): Promise<FontMetrics> {
  const fallback = { cap: 0.72, asc: 1.1, desc: 0.3 };
  try {
    await document.fonts.load(`${size}px ${family}`, "E");
  } catch {
    /* use whatever is loaded */
  }
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return fallback;
  ctx.font = `${size}px ${family}`;
  const m = ctx.measureText("E");
  const cap = m.actualBoundingBoxAscent / size;
  if (!cap || !isFinite(cap)) return fallback;
  return {
    cap,
    asc: m.fontBoundingBoxAscent ? m.fontBoundingBoxAscent / size : fallback.asc,
    desc: m.fontBoundingBoxDescent ? m.fontBoundingBoxDescent / size : fallback.desc,
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load photo"));
    img.src = url;
  });
}

/** Photo cropped like CSS object-fit: cover (object-position 50% 35%), optionally grayscale. */
function photoColumn(img: HTMLImageElement, bw: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = COL_W;
  c.height = IMG_H;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const target = COL_W / IMG_H;
  let cw = img.naturalWidth;
  let ch = img.naturalHeight;
  if (cw / ch > target) cw = ch * target;
  else ch = cw / target;
  ctx.drawImage(img, (img.naturalWidth - cw) / 2, (img.naturalHeight - ch) * 0.35, cw, ch, 0, 0, COL_W, IMG_H);
  if (bw) {
    const data = ctx.getImageData(0, 0, COL_W, IMG_H);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    ctx.putImageData(data, 0, 0);
  }
  return c;
}

async function drawWordmark(ctx: CanvasRenderingContext2D, family: string) {
  const text = "Etched Booth";
  const fm = await measureFont(family);
  const size = CAP_H / fm.cap;
  ctx.font = `${size}px ${family}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const spacing = size * 0.06;
  const chars = Array.from(text);
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  const each = (fn: (ch: string, x: number) => void) => {
    let x = PRINT_W / 2 - total / 2;
    chars.forEach((ch, i) => {
      fn(ch, x);
      x += widths[i] + spacing;
    });
  };
  const grad = ctx.createLinearGradient(0, WORD_BASE - CAP_H, 0, WORD_BASE);
  [[0, "#ffffff"], [0.22, "#e9eaed"], [0.48, "#9a9ea6"], [0.52, "#6d717a"], [0.78, "#c9ccd2"], [1, "#8d9099"]].forEach(([s, col]) =>
    grad.addColorStop(s as number, col as string),
  );
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.4)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = grad;
  each((ch, x) => ctx.fillText(ch, x, WORD_BASE));
  ctx.restore();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(20,20,24,.5)";
  each((ch, x) => ctx.strokeText(ch, x, WORD_BASE));
}

/** Static glossy finish: paper curl shadow, inner edge highlight, soft diagonal sheen (alpha <= .18). */
function drawFinish(ctx: CanvasRenderingContext2D) {
  const edge = (x0: number, y0: number, x1: number, y1: number, a: number, rect: [number, number, number, number]) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(...rect);
  };
  edge(0, 0, 63, 0, 0.05, [0, 0, 63, PRINT_H]);
  edge(PRINT_W, 0, PRINT_W - 63, 0, 0.06, [PRINT_W - 63, 0, 63, PRINT_H]);
  edge(0, 0, 0, 48, 0.035, [0, 0, PRINT_W, 48]);
  edge(0, PRINT_H, 0, PRINT_H - 57, 0.05, [0, PRINT_H - 57, PRINT_W, 57]);

  ctx.strokeStyle = "rgba(255,255,255,.7)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, PRINT_W - 2, PRINT_H - 2);

  const a = (115 * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const L = Math.abs(PRINT_W * Math.sin(a)) + Math.abs(PRINT_H * Math.cos(a));
  const cx = PRINT_W / 2;
  const cy = PRINT_H / 2;
  const g = ctx.createLinearGradient(cx - (dx * L) / 2, cy - (dy * L) / 2, cx + (dx * L) / 2, cy + (dy * L) / 2);
  g.addColorStop(0.15, "rgba(255,255,255,0)");
  g.addColorStop(0.25, "rgba(255,255,255,.18)");
  g.addColorStop(0.35, "rgba(255,255,255,0)");
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PRINT_W, PRINT_H);
  ctx.restore();
}

export async function renderPrint(o: PrintOptions): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas");
  c.width = PRINT_W;
  c.height = PRINT_H;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#f8f6f1";
  ctx.fillRect(0, 0, PRINT_W, PRINT_H);

  const img = await loadImage(o.photoUrl);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.25)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.drawImage(photoColumn(img, o.bw), MARGIN, IMG_Y);
  ctx.restore();

  // Plate fitted into the second column: wide soft shadow, then a tight contact shadow.
  const k = Math.min(COL_W / o.plate.width, IMG_H / o.plate.height);
  const pw = o.plate.width * k;
  const ph = o.plate.height * k;
  const px = COL2_X + (COL_W - pw) / 2;
  const py = IMG_Y + (IMG_H - ph) / 2;
  for (const [color, blur, dy] of [["rgba(0,0,0,.38)", 36, 18], ["rgba(0,0,0,.4)", 4, 2]] as const) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetY = dy;
    ctx.drawImage(o.plate, px, py, pw, ph);
    ctx.restore();
  }

  await drawWordmark(ctx, o.fontFamily);
  drawFinish(ctx);
  return c;
}

export async function savePrint(o: PrintOptions): Promise<void> {
  const canvas = await renderPrint(o);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "etched-booth.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
