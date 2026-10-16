/**
 * Height map painter. Draws layered relief, the etched line (up to a progress value) and user decorations into a
 * grayscale canvas: black = flat, white = raised. Each stroke is painted in several passes with
 * shrinking width and rising brightness to get a thick, rounded pressed-wire cross-section.
 */
import { HH, HW, WIDTH_SCALE } from "./dims";
import { type Deco, paintDeco, profile } from "./elements";
import { clamp } from "./raster";
import type { LinePath } from "./strokePath";

export { HH, HW, WIDTH_SCALE, WORK_H, WORK_W } from "./dims";
export * from "./elements";

export function createHeightCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = HW;
  c.height = HH;
  c.getContext("2d", { willReadFrequently: true });
  return c;
}

/**
 * Composes the height map from layers: relief base (clothes / hair plateau / skin, from analysis.buildRelief) +
 * the etched line (incremental, so the animation only draws new segments) + user decorations. Segment widths come
 * from the path (working px); sizeK scales them (Size slider).
 */
export class HeightPainter {
  path: LinePath | null = null;
  private base: HTMLCanvasElement | null = null;
  private strokes: HTMLCanvasElement | null = null;
  private dirty = true;
  private drawn = 0;
  private seg = 0;
  private sizeK = 1;

  setBase(c: HTMLCanvasElement | null) {
    this.base = c;
  }
  setPath(p: LinePath | null) {
    this.path = p;
    this.dirty = true;
  }
  setSizeK(k: number) {
    if (Math.abs(k - this.sizeK) > 1e-6) {
      this.sizeK = k;
      this.dirty = true;
    }
  }

  private strokeCtx(): CanvasRenderingContext2D | null {
    if (!this.strokes) {
      this.strokes = document.createElement("canvas");
      this.strokes.width = HW;
      this.strokes.height = HH;
      this.dirty = true;
    }
    const ctx = this.strokes.getContext("2d");
    if (ctx && this.dirty) {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, HW, HH);
      this.dirty = false;
      this.drawn = 0;
      this.seg = 0;
    }
    return ctx;
  }

  private drawTo(progress: number) {
    const path = this.path;
    if (!path || path.pts.length < 2) return;
    let ctx = this.strokeCtx();
    if (!ctx) return;
    const total = path.total * clamp(progress, 0, 1);
    if (total < this.drawn - 1e-9) {
      this.dirty = true;
      ctx = this.strokeCtx();
      if (!ctx) return;
    }
    if (total <= this.drawn) return;
    ctx.globalCompositeOperation = "lighten";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const n = path.pts.length;
    let i = this.seg;
    while (i < n - 2 && path.cum[i + 1] <= this.drawn) i++;
    for (; i < n - 1 && path.cum[i] < total; i++) {
      const len = path.cum[i + 1] - path.cum[i];
      if (len <= 0) continue;
      const t0 = Math.max(0, (this.drawn - path.cum[i]) / len);
      const t1 = Math.min(1, (total - path.cum[i]) / len);
      const a = path.pts[i];
      const b = path.pts[i + 1];
      const x0 = (a.x + (b.x - a.x) * t0) * HW;
      const y0 = (a.y + (b.y - a.y) * t0) * HH;
      const x1 = (a.x + (b.x - a.x) * t1) * HW;
      const y1 = (a.y + (b.y - a.y) * t1) * HH;
      const shallow = path.shallow[i];
      const width = path.w[i] * WIDTH_SCALE * this.sizeK * (shallow ? 0.45 : 1);
      profile(ctx, width, shallow ? 0.16 : 1, () => {
        ctx?.beginPath();
        ctx?.moveTo(x0, y0);
        ctx?.lineTo(x1, y1);
        ctx?.stroke();
      });
      this.seg = i;
    }
    this.drawn = total;
  }

  /** Repaint target: base layer, etched line up to progress (0..1), then the user's elements (widths follow Size). */
  paint(target: HTMLCanvasElement, progress: number, decos: Deco[]) {
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, HW, HH);
    if (this.base) ctx.drawImage(this.base, 0, 0);
    this.drawTo(progress);
    ctx.globalCompositeOperation = "lighten";
    if (this.strokes && this.path) ctx.drawImage(this.strokes, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const d of decos) paintDeco(ctx, d, this.sizeK);
    ctx.globalCompositeOperation = "source-over";
  }
}
