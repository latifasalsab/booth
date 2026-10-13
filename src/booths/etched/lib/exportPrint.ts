/**
 * Renders the landscape print (3:2, 1800x1200) to a canvas and downloads it as PNG.
 * Layout matches PickupView: original photo left, embossed plate right (transparent edges, canvas shadows),
 * the Etched Booth wordmark underneath. No grain or vignette.
 */
export const PRINT_W = 1800;
export const PRINT_H = 1200;

export interface PrintOptions {
  photoUrl: string;
  plate: HTMLCanvasElement;
  bw: boolean;
  /** Computed font-family of the on-screen wordmark, so the canvas uses the same face. */
  fontFamily: string;
}

const ITEM_W = 640;
const ITEM_H = 800;
const ITEM_Y = 130;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load photo"));
    img.src = url;
  });
}

function toGray(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = ITEM_W;
  c.height = ITEM_H;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.drawImage(img, 0, 0, ITEM_W, ITEM_H);
  const data = ctx.getImageData(0, 0, ITEM_W, ITEM_H);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

export async function renderPrint(o: PrintOptions): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas");
  c.width = PRINT_W;
  c.height = PRINT_H;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#f5f5f3";
  ctx.fillRect(0, 0, PRINT_W, PRINT_H);

  const img = await loadImage(o.photoUrl);
  const photo: CanvasImageSource = o.bw ? toGray(img) : img;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.25)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.drawImage(photo, 200, ITEM_Y, ITEM_W, ITEM_H);
  ctx.restore();

  // Plate: wide soft shadow, then a tight contact shadow.
  for (const [color, blur, dy] of [["rgba(0,0,0,.38)", 36, 18], ["rgba(0,0,0,.4)", 4, 2]] as const) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetY = dy;
    ctx.drawImage(o.plate, 960, ITEM_Y, ITEM_W, ITEM_H);
    ctx.restore();
  }

  // Wordmark: embossed silver
  const size = 94;
  try {
    await document.fonts.load(`${size}px ${o.fontFamily}`);
  } catch {
    /* fall back to whatever is loaded */
  }
  ctx.font = `${size}px ${o.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cy = 1040;
  const grad = ctx.createLinearGradient(0, cy - size / 2, 0, cy + size / 2);
  [[0, "#ffffff"], [0.22, "#e9eaed"], [0.48, "#9a9ea6"], [0.52, "#6d717a"], [0.78, "#c9ccd2"], [1, "#8d9099"]].forEach(([s, col]) =>
    grad.addColorStop(s as number, col as string),
  );
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = grad;
  ctx.fillText("Etched Booth", PRINT_W / 2, cy);
  ctx.restore();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(20,20,24,.5)";
  ctx.strokeText("Etched Booth", PRINT_W / 2, cy);
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
